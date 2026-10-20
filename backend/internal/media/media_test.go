package media

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// bmffHeader builds a minimal ISO base media file format header for the given
// major brand. The MP4/QuickTime/M4A sniffer keys on "ftyp" plus the brand.
func bmffHeader(brand string) []byte {
	b := make([]byte, 0, 16)
	b = append(b, 0x00, 0x00, 0x00, 0x18)
	b = append(b, []byte("ftyp")...)
	b = append(b, []byte(brand)...)
	b = append(b, 0x00, 0x00, 0x00, 0x00)
	return b
}

// pngHeader is the eight byte PNG signature followed by an IHDR tag.
func pngHeader() []byte {
	return []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 'I', 'H', 'D', 'R'}
}

// jpegHeader is a JFIF style JPEG start of image marker.
func jpegHeader() []byte {
	return []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x00}
}

// gifHeader is a GIF89a header.
func gifHeader() []byte {
	return []byte("GIF89a\x01\x00\x01\x00\x80\x00\x00")
}

// riffHeader builds a RIFF container with the given form type.
func riffHeader(form string) []byte {
	b := make([]byte, 0, 12)
	b = append(b, []byte("RIFF")...)
	b = append(b, 0x24, 0x00, 0x00, 0x00)
	b = append(b, []byte(form)...)
	return b
}

// ebmlHeader builds an EBML (Matroska/WebM) header carrying the given
// DocType.
func ebmlHeader(docType string) []byte {
	b := []byte{0x1A, 0x45, 0xDF, 0xA3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F}
	b = append(b, 0x42, 0x86, 0x81, 0x01)
	b = append(b, 0x42, 0x82, byte(0x80|len(docType)))
	b = append(b, []byte(docType)...)
	return b
}

// newTestStorage builds a storage rooted in a fresh temporary directory.
func newTestStorage(t *testing.T, maxBytes int64) (*Storage, string, string) {
	t.Helper()
	root := t.TempDir()
	uploadDir := filepath.Join(root, "uploads")
	derivedDir := filepath.Join(root, "derived")
	st, err := NewStorage(uploadDir, derivedDir, maxBytes)
	if err != nil {
		t.Fatalf("NewStorage: %v", err)
	}
	return st, uploadDir, derivedDir
}

// countRegularFiles returns the number of non-directory entries below root.
func countRegularFiles(t *testing.T, root string) int {
	t.Helper()
	n := 0
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			n++
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk %s: %v", root, err)
	}
	return n
}

// writeTestPNG encodes a real PNG image of the given size to path.
func writeTestPNG(t *testing.T, path string, w, h int) {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 0x40, A: 0xff})
		}
	}
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create %s: %v", path, err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Sniff
// ---------------------------------------------------------------------------

func TestSniffDetectsTheTypeFromTheContent(t *testing.T) {
	cases := []struct {
		name     string
		head     []byte
		wantMime string
		wantExt  string
		wantKind string
	}{
		{"png", pngHeader(), "image/png", ".png", KindImage},
		{"jpeg", jpegHeader(), "image/jpeg", ".jpg", KindImage},
		{"gif", gifHeader(), "image/gif", ".gif", KindImage},
		{"webp", riffHeader("WEBP"), "image/webp", ".webp", KindImage},
		{"pdf", []byte("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n"), "application/pdf", ".pdf", KindFile},
		{"zip", []byte{0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00}, "application/zip", ".zip", KindFile},
		{"gzip", []byte{0x1F, 0x8B, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03}, "application/gzip", ".gz", KindFile},
		{"mp4", bmffHeader("isom"), "video/mp4", ".mp4", KindVideo},
		{"mov", bmffHeader("qt  "), "video/quicktime", ".mov", KindVideo},
		{"webm", ebmlHeader("webm"), "video/webm", ".webm", KindVideo},
		// Matroska and WebM share the EBML container, and the DocType is
		// what tells them apart.
		{"matroska", ebmlHeader("matroska"), "video/x-matroska", ".mkv", KindVideo},
		{"wav", riffHeader("WAVE"), "audio/wav", ".wav", KindAudio},
		{"mp3", []byte{0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00}, "audio/mpeg", ".mp3", KindAudio},
		{"flac", []byte("fLaC\x00\x00\x00\x22"), "audio/flac", ".flac", KindAudio},
		{"m4a", bmffHeader("M4A "), "audio/mp4", ".m4a", KindAudio},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// The client name is deliberately extensionless: everything must
			// come from the bytes.
			mime, ext, kind := Sniff(tc.head, "upload")
			if mime != tc.wantMime {
				t.Errorf("mime = %q, want %q", mime, tc.wantMime)
			}
			if ext != tc.wantExt {
				t.Errorf("ext = %q, want %q", ext, tc.wantExt)
			}
			if kind != tc.wantKind {
				t.Errorf("kind = %q, want %q", kind, tc.wantKind)
			}
		})
	}
}

func TestSniffIgnoresTheClientFilename(t *testing.T) {
	// The content is a PDF, the client insists it is a PNG.
	mime, ext, kind := Sniff([]byte("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n"), "photo.png")
	if mime != "application/pdf" {
		t.Errorf("mime = %q, want %q", mime, "application/pdf")
	}
	if ext != ".pdf" {
		t.Errorf("ext = %q, want %q (the extension must follow the content)", ext, ".pdf")
	}
	if kind != KindFile {
		t.Errorf("kind = %q, want %q", kind, KindFile)
	}
}

func TestSniffIgnoresTheClientMimeType(t *testing.T) {
	// The only client controlled input the sniffer receives is the file
	// name. For content it recognises, no name may change the answer.
	contents := []struct {
		name string
		head []byte
	}{
		{"png", pngHeader()},
		{"jpeg", jpegHeader()},
		{"gif", gifHeader()},
		{"webp", riffHeader("WEBP")},
		{"pdf", []byte("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n")},
		{"zip", []byte{0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00}},
		{"gzip", []byte{0x1F, 0x8B, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00}},
		{"mp4", bmffHeader("isom")},
		{"mov", bmffHeader("qt  ")},
		{"webm", ebmlHeader("webm")},
		{"wav", riffHeader("WAVE")},
		{"mp3", []byte{0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00}},
		{"flac", []byte("fLaC\x00\x00\x00\x22")},
		{"m4a", bmffHeader("M4A ")},
	}
	names := []string{
		"a.png", "b.pdf", "c.mp4", "d.mp3", "e.txt", "f.gif", "g.wav",
		"no-extension", "photo.jpg", "archive.zip",
	}

	for _, c := range contents {
		t.Run(c.name, func(t *testing.T) {
			wantMime, wantExt, wantKind := Sniff(c.head, "reference-name")
			for _, name := range names {
				mime, ext, kind := Sniff(c.head, name)
				if mime != wantMime {
					t.Errorf("name %q changed the mime type to %q, want %q", name, mime, wantMime)
				}
				// The extension and the kind must not be taken from the name
				// either.
				if ext != wantExt || kind != wantKind {
					t.Errorf("name %q changed the result to (%q, %q), want ext %q kind %q",
						name, ext, kind, wantExt, wantKind)
				}
			}
		})
	}
}

func TestSniffFallsBackForUnknownContent(t *testing.T) {
	head := []byte{0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09}
	mime, ext, kind := Sniff(head, "mystery.dat")
	if mime != "application/octet-stream" {
		t.Errorf("mime = %q, want %q", mime, "application/octet-stream")
	}
	if ext != ".bin" {
		t.Errorf("ext = %q, want the generic %q", ext, ".bin")
	}
	if kind != KindFile {
		t.Errorf("kind = %q, want %q", kind, KindFile)
	}
}

func TestSniffRejectsAnEmptyHead(t *testing.T) {
	// Nothing to inspect: the file must not be classified as any media
	// type, it falls back to the generic one.
	for _, head := range [][]byte{nil, {}} {
		mime, ext, kind := Sniff(head, "upload")
		if mime != "application/octet-stream" {
			t.Errorf("mime = %q, want %q", mime, "application/octet-stream")
		}
		if ext != ".bin" {
			t.Errorf("ext = %q, want the generic %q", ext, ".bin")
		}
		if kind != KindFile {
			t.Errorf("kind = %q, want %q", kind, KindFile)
		}
	}

	// With no content nothing can be recognised, so a name never turns a
	// file into an image, a video or an audio file. Only the plain text
	// family is still recognised by its name.
	want := map[string]string{
		"a.png":    "application/octet-stream",
		"b.mp4":    "application/octet-stream",
		"c.wav":    "application/octet-stream",
		"d.pdf":    "application/octet-stream",
		"e.dat":    "application/octet-stream",
		"noext":    "application/octet-stream",
		"f.tar.gz": "application/octet-stream",
		"g.flac":   "application/octet-stream",
		"h.mp3":    "application/octet-stream",
		"i.txt":    "text/plain",
	}
	for name, wantMime := range want {
		mime, _, _ := Sniff(nil, name)
		if mime != wantMime {
			t.Errorf("name %q: mime = %q, want %q", name, mime, wantMime)
		}
	}
}

// ---------------------------------------------------------------------------
// Storage.Save
// ---------------------------------------------------------------------------

func TestSaveGeneratesAServerSideIdentifier(t *testing.T) {
	st, uploadDir, _ := newTestStorage(t, 1<<20)
	content := []byte("the quick brown fox jumps over the lazy dog")

	// The client supplies a name; the server derives the extension from the
	// content and never stores the name itself.
	clientName := "holiday-photo.png"
	_, ext, _ := Sniff(pngHeader(), clientName)

	saved, err := st.Save(42, bytes.NewReader(content), ext)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}

	hexKey := regexp.MustCompile(`^[0-9a-f]{32}$`)
	if !hexKey.MatchString(saved.StorageKey) {
		t.Errorf("storage key %q is not 32 hex characters", saved.StorageKey)
	}

	wantRel := filepath.ToSlash(filepath.Join("42", saved.StorageKey[:2], saved.StorageKey[2:4], saved.StorageKey+ext))
	if saved.StoredPath != wantRel {
		t.Errorf("stored path = %q, want %q", saved.StoredPath, wantRel)
	}
	if !strings.HasPrefix(saved.StoredPath, "42/") {
		t.Errorf("stored path %q is not below the user id directory", saved.StoredPath)
	}
	for _, fragment := range []string{"holiday", "photo", "holiday-photo"} {
		if strings.Contains(saved.StoredPath, fragment) {
			t.Errorf("stored path %q leaks the client file name fragment %q", saved.StoredPath, fragment)
		}
	}

	wantAbs := filepath.Join(uploadDir, filepath.FromSlash(wantRel))
	if saved.AbsolutePath != wantAbs {
		t.Errorf("absolute path = %q, want %q", saved.AbsolutePath, wantAbs)
	}
	if !strings.HasPrefix(saved.AbsolutePath, uploadDir+string(os.PathSeparator)) {
		t.Errorf("absolute path %q is outside the upload root %q", saved.AbsolutePath, uploadDir)
	}
	if _, err := os.Stat(saved.AbsolutePath); err != nil {
		t.Fatalf("stored file missing: %v", err)
	}

	// The same content stored twice must not be deduplicated by name.
	again, err := st.Save(42, bytes.NewReader(content), ext)
	if err != nil {
		t.Fatalf("Save (second): %v", err)
	}
	if again.StorageKey == saved.StorageKey {
		t.Errorf("two saves of the same content reused the key %q", saved.StorageKey)
	}
	if again.StoredPath == saved.StoredPath {
		t.Errorf("two saves of the same content reused the path %q", saved.StoredPath)
	}
	if again.AbsolutePath == saved.AbsolutePath {
		t.Errorf("two saves of the same content reused the file %q", again.AbsolutePath)
	}
	for _, p := range []string{saved.AbsolutePath, again.AbsolutePath} {
		if _, err := os.Stat(p); err != nil {
			t.Errorf("expected %s to exist: %v", p, err)
		}
	}
}

func TestSaveStoresTheContentByteForByte(t *testing.T) {
	st, _, _ := newTestStorage(t, 1<<20)

	// A payload that is clearly larger than the 512 bytes the API layer
	// reads while sniffing.
	content := make([]byte, 4096)
	for i := range content {
		content[i] = byte(i % 251)
	}

	// Reproduce the API flow: sniff the head, then rewind before saving.
	r := bytes.NewReader(content)
	head := make([]byte, 512)
	n, _ := io.ReadFull(r, head)
	_, ext, _ := Sniff(head[:n], "upload")
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		t.Fatalf("rewind: %v", err)
	}

	saved, err := st.Save(42, r, ext)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if saved.Size != int64(len(content)) {
		t.Errorf("size = %d, want %d", saved.Size, len(content))
	}
	if saved.Size <= 512 {
		t.Errorf("size = %d, the file was truncated to the sniffed head", saved.Size)
	}

	onDisk, err := os.ReadFile(saved.AbsolutePath)
	if err != nil {
		t.Fatalf("read stored file: %v", err)
	}
	if !bytes.Equal(onDisk, content) {
		t.Errorf("stored bytes differ from the supplied content (%d bytes on disk, %d supplied)",
			len(onDisk), len(content))
	}

	sum := sha256.Sum256(content)
	wantHash := hex.EncodeToString(sum[:])
	if saved.Hash != wantHash {
		t.Errorf("hash = %q, want %q", saved.Hash, wantHash)
	}
}

func TestSaveRefusesAFileOverTheLimit(t *testing.T) {
	const limit = 64
	st, uploadDir, _ := newTestStorage(t, limit)

	content := bytes.Repeat([]byte("A"), limit*4)
	saved, err := st.Save(1, bytes.NewReader(content), ".bin")
	if !errors.Is(err, ErrTooLarge) {
		t.Fatalf("err = %v, want %v", err, ErrTooLarge)
	}
	if saved != nil {
		t.Fatalf("saved = %+v, want no file", saved)
	}
	if n := countRegularFiles(t, uploadDir); n != 0 {
		t.Errorf("%d file(s) left behind in the upload root, want none", n)
	}
}

func TestSaveRejectsAPathThatEscapesTheUploadDirectory(t *testing.T) {
	st, uploadDir, derivedDir := newTestStorage(t, 1<<20)

	// A legitimate relative path resolves inside the root.
	abs, err := st.Absolute("42/ab/cd/file.png")
	if err != nil {
		t.Fatalf("Absolute: %v", err)
	}
	want := filepath.Join(uploadDir, "42", "ab", "cd", "file.png")
	if abs != want {
		t.Errorf("Absolute = %q, want %q", abs, want)
	}

	escapes := []string{
		"../escape.txt",
		"..",
		"a/../../escape.txt",
		"subdir/../../../escape.txt",
		"/etc/passwd",
		"/42/../../escape.txt",
	}
	for _, rel := range escapes {
		abs, err := st.Absolute(rel)
		if err != nil {
			// Rejected outright, which is the desired outcome.
			continue
		}
		if abs != uploadDir && !strings.HasPrefix(abs, uploadDir+string(os.PathSeparator)) {
			t.Errorf("Absolute(%q) = %q, which escapes the upload root %q", rel, abs, uploadDir)
		}
	}

	// The classic traversal attempts must be refused, not merely contained.
	for _, rel := range []string{"../escape.txt", "a/../../escape.txt", "/etc/passwd"} {
		if _, err := st.Absolute(rel); err == nil {
			t.Errorf("Absolute(%q) must fail", rel)
		}
	}

	// The same rules apply to the derived tree.
	for _, rel := range []string{"../escape.txt", "a/../../escape.txt", "/etc/passwd"} {
		if _, err := st.AbsoluteDerived(rel); err == nil {
			t.Errorf("AbsoluteDerived(%q) must fail", rel)
		}
	}
	abs, err = st.AbsoluteDerived("42/thumb.jpg")
	if err != nil {
		t.Fatalf("AbsoluteDerived: %v", err)
	}
	if want := filepath.Join(derivedDir, "42", "thumb.jpg"); abs != want {
		t.Errorf("AbsoluteDerived = %q, want %q", abs, want)
	}
}

// ---------------------------------------------------------------------------
// derived assets and removal
// ---------------------------------------------------------------------------

func TestRemoveUploadAndRemoveDerived(t *testing.T) {
	st, uploadDir, derivedDir := newTestStorage(t, 1<<20)

	saved, err := st.Save(42, bytes.NewReader([]byte("payload")), ".png")
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := st.RemoveUpload(saved.StoredPath); err != nil {
		t.Fatalf("RemoveUpload: %v", err)
	}
	if _, err := os.Stat(saved.AbsolutePath); !os.IsNotExist(err) {
		t.Errorf("upload still present after removal (err=%v)", err)
	}
	// The empty directories are pruned, the root stays.
	if _, err := os.Stat(filepath.Join(uploadDir, "42")); !os.IsNotExist(err) {
		t.Errorf("the empty user directory was not pruned (err=%v)", err)
	}
	if info, err := os.Stat(uploadDir); err != nil || !info.IsDir() {
		t.Errorf("the upload root must survive pruning (err=%v)", err)
	}

	// Removing an upload that is already gone is not an error.
	if err := st.RemoveUpload(saved.StoredPath); err != nil {
		t.Errorf("RemoveUpload on a missing file: %v", err)
	}

	rel, abs, err := st.DerivedPath(42, "thumb.jpg")
	if err != nil {
		t.Fatalf("DerivedPath: %v", err)
	}
	if err := os.WriteFile(abs, []byte("thumb"), 0o640); err != nil {
		t.Fatalf("write derived file: %v", err)
	}
	if err := st.RemoveDerived(rel); err != nil {
		t.Fatalf("RemoveDerived: %v", err)
	}
	if _, err := os.Stat(abs); !os.IsNotExist(err) {
		t.Errorf("derived file still present after removal (err=%v)", err)
	}
	if _, err := os.Stat(filepath.Join(derivedDir, "42")); !os.IsNotExist(err) {
		t.Errorf("the empty derived user directory was not pruned (err=%v)", err)
	}
	if info, err := os.Stat(derivedDir); err != nil || !info.IsDir() {
		t.Errorf("the derived root must survive pruning (err=%v)", err)
	}
}

func TestDerivedPathStaysInsideTheDerivedRoot(t *testing.T) {
	st, _, derivedDir := newTestStorage(t, 1<<20)

	// A server generated name lands under <derived root>/<user id>/.
	rel, abs, err := st.DerivedPath(42, "thumb-1a2b3c.jpg")
	if err != nil {
		t.Fatalf("DerivedPath: %v", err)
	}
	if rel != "42/thumb-1a2b3c.jpg" {
		t.Errorf("derived path = %q, want %q", rel, "42/thumb-1a2b3c.jpg")
	}
	if !strings.HasPrefix(abs, derivedDir+string(os.PathSeparator)) {
		t.Errorf("derived path %q is outside the derived root %q", abs, derivedDir)
	}
	if !strings.HasPrefix(abs, filepath.Join(derivedDir, "42")+string(os.PathSeparator)) {
		t.Errorf("derived path %q is outside the user id directory", abs)
	}
	if dir := filepath.Dir(abs); dir == derivedDir {
		t.Errorf("derived path %q is not below the user id directory", abs)
	}

	// The guarded resolver is the one that refuses a name climbing out of
	// the derived root.
	if _, err := st.AbsoluteDerived("../../escape.txt"); err == nil {
		t.Errorf("AbsoluteDerived must refuse a path that climbs out of the derived root")
	}
	if _, err := st.AbsoluteDerived(rel); err != nil {
		t.Errorf("AbsoluteDerived(%q): %v", rel, err)
	}
}

// ---------------------------------------------------------------------------
// image helpers
// ---------------------------------------------------------------------------

func TestInspectImageReadsTheDimensions(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sample.png")
	writeTestPNG(t, path, 37, 23)

	info, err := InspectImage(path)
	if err != nil {
		t.Fatalf("InspectImage: %v", err)
	}
	if info.Width != 37 {
		t.Errorf("width = %d, want 37", info.Width)
	}
	if info.Height != 23 {
		t.Errorf("height = %d, want 23", info.Height)
	}

	// A file that is not an image is reported as an error.
	bogus := filepath.Join(dir, "bogus.png")
	if err := os.WriteFile(bogus, []byte("not an image at all"), 0o640); err != nil {
		t.Fatalf("write bogus: %v", err)
	}
	if _, err := InspectImage(bogus); err == nil {
		t.Errorf("InspectImage on a non image must fail")
	}
}

func TestResizeProducesASmallerImage(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "big.png")
	dst := filepath.Join(dir, "small.jpg")
	writeTestPNG(t, src, 1200, 800)

	const maxDim = 100
	info, err := Resize(src, dst, maxDim)
	if err != nil {
		t.Fatalf("Resize: %v", err)
	}
	if info.Width > maxDim || info.Height > maxDim {
		t.Errorf("resized image is %dx%d, both sides must be at most %d", info.Width, info.Height, maxDim)
	}
	if info.Width != 100 || info.Height != 66 {
		t.Errorf("resized image is %dx%d, want 100x66", info.Width, info.Height)
	}

	// The derivative is a decodable JPEG on disk.
	raw, err := os.ReadFile(dst)
	if err != nil {
		t.Fatalf("read derivative: %v", err)
	}
	if !bytes.HasPrefix(raw, []byte{0xFF, 0xD8, 0xFF}) {
		t.Errorf("the derivative is not a JPEG (starts with %x)", raw[:minInt(3, len(raw))])
	}
	f, err := os.Open(dst)
	if err != nil {
		t.Fatalf("open derivative: %v", err)
	}
	defer f.Close()
	img, err := jpeg.Decode(f)
	if err != nil {
		t.Fatalf("decode derivative: %v", err)
	}
	bounds := img.Bounds()
	if bounds.Dx() != info.Width || bounds.Dy() != info.Height {
		t.Errorf("decoded derivative is %dx%d, want %dx%d", bounds.Dx(), bounds.Dy(), info.Width, info.Height)
	}
}

// minInt returns the smaller of two ints. The package already declares a
// min helper of its own, so this one is named differently.
func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// TestSniffNeverPromotesAFileWithTheClientName checks that a file whose
// content is not a media file stays a file, whatever the client calls it.
// The name comes from the client and says nothing about the content.
func TestSniffNeverPromotesAFileWithTheClientName(t *testing.T) {
	// A document that pretends to be a picture.
	head := []byte("<!doctype html><html><body>not a picture</body></html>")
	for _, name := range []string{
		"photo.jpg", "photo.png", "photo.gif", "photo.webp",
		"clip.mp4", "clip.mov", "clip.webm", "song.mp3", "song.wav", "song.flac",
	} {
		mime, ext, kind := Sniff(head, name)
		if kind != KindFile {
			t.Errorf("the name %q turned a document into a %q", name, kind)
		}
		if mime == "application/octet-stream" && ext != ".bin" {
			t.Errorf("the name %q gave the extension %q, want the generic %q", name, ext, ".bin")
		}
		if strings.HasPrefix(mime, "image/") || strings.HasPrefix(mime, "video/") ||
			strings.HasPrefix(mime, "audio/") {
			t.Errorf("the name %q gave the type %q, which the content does not have", name, mime)
		}
	}
}

// TestSniffTellsWebMAndMatroskaApart checks that the two EBML containers
// are reported with their own type.
func TestSniffTellsWebMAndMatroskaApart(t *testing.T) {
	mime, ext, kind := Sniff(ebmlHeader("webm"), "clip")
	if mime != "video/webm" || ext != ".webm" || kind != KindVideo {
		t.Errorf("the webm file gave (%q, %q, %q)", mime, ext, kind)
	}
	mime, ext, kind = Sniff(ebmlHeader("matroska"), "clip")
	if mime != "video/x-matroska" || ext != ".mkv" || kind != KindVideo {
		t.Errorf("the matroska file gave (%q, %q, %q)", mime, ext, kind)
	}
}

// TestSaveRejectsAnExtensionThatWouldEscapeTheDirectory checks that the
// extension cannot be used to write outside the upload tree.
func TestSaveRejectsAnExtensionThatWouldEscapeTheDirectory(t *testing.T) {
	st, _, _ := newTestStorage(t, 1<<20)
	for _, ext := range []string{"../../etc/passwd", "/etc/passwd", ".jpg/../../x", ".jp g", ".toolongextension"} {
		if _, err := st.Save(42, bytes.NewReader([]byte("x")), ext); err == nil {
			t.Errorf("the extension %q was accepted", ext)
		}
	}
}

// TestDerivedPathRejectsANameWithADirectoryPart checks that the name of a
// derived file cannot point outside the derived tree.
func TestDerivedPathRejectsANameWithADirectoryPart(t *testing.T) {
	st, _, _ := newTestStorage(t, 1<<20)
	for _, name := range []string{"../../escape.jpg", "sub/../../escape.jpg", "sub/dir.jpg", "", ".."} {
		if _, _, err := st.DerivedPath(42, name); err == nil {
			t.Errorf("the name %q was accepted", name)
		}
	}
	if _, _, err := st.DerivedPath(42, "12-thumb.jpg"); err != nil {
		t.Errorf("a plain name was refused: %v", err)
	}
}
