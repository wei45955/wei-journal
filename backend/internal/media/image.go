package media

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/image/draw"
	"golang.org/x/image/webp"
)

// Media kinds.
const (
	KindImage = "image"
	KindVideo = "video"
	KindAudio = "audio"
	KindFile  = "file"
)

// Thumbnail and preview bounds.
const (
	ThumbMax   = 480
	PreviewMax = 1600
)

// Sniff identifies the media type from the file content. The client supplied
// name is only consulted for a plain text file whose content the sniffer
// cannot place, and it never decides the kind on its own.
func Sniff(head []byte, filename string) (mime, ext, kind string) {
	if isHEIF(head) {
		return "image/heic", ".heic", KindImage
	}
	if isAVIF(head) {
		return "image/avif", ".avif", KindImage
	}
	if isQuickTime(head) {
		return "video/quicktime", ".mov", KindVideo
	}
	if isMP4(head) {
		return "video/mp4", ".mp4", KindVideo
	}
	if isWebM(head) {
		return "video/webm", ".webm", KindVideo
	}
	if isMatroska(head) {
		return "video/x-matroska", ".mkv", KindVideo
	}
	if isEBML(head) {
		// An EBML file whose DocType could not be read is treated as
		// Matroska, the more general of the two containers.
		return "video/x-matroska", ".mkv", KindVideo
	}
	if isFLAC(head) {
		return "audio/flac", ".flac", KindAudio
	}
	if isM4A(head) {
		return "audio/mp4", ".m4a", KindAudio
	}
	if isMP3(head) {
		return "audio/mpeg", ".mp3", KindAudio
	}
	if isWAV(head) {
		return "audio/wav", ".wav", KindAudio
	}
	if isPDF(head) {
		return "application/pdf", ".pdf", KindFile
	}
	if isZIP(head) {
		return "application/zip", ".zip", KindFile
	}
	if isGZIP(head) {
		return "application/gzip", ".gz", KindFile
	}

	switch {
	case bytes.HasPrefix(head, []byte{0xFF, 0xD8, 0xFF}):
		return "image/jpeg", ".jpg", KindImage
	case bytes.HasPrefix(head, []byte{0x89, 'P', 'N', 'G'}):
		return "image/png", ".png", KindImage
	case bytes.HasPrefix(head, []byte("GIF8")):
		return "image/gif", ".gif", KindImage
	case len(head) >= 12 && bytes.Equal(head[0:4], []byte("RIFF")) && bytes.Equal(head[8:12], []byte("WEBP")):
		return "image/webp", ".webp", KindImage
	}

	// Fall back to the generic detector and, failing that, to the extension.
	detected := httpDetect(head)
	switch {
	case strings.HasPrefix(detected, "image/"):
		return detected, extensionFor(detected, ".img"), KindImage
	case strings.HasPrefix(detected, "video/"):
		return detected, extensionFor(detected, ".video"), KindVideo
	case strings.HasPrefix(detected, "audio/"):
		return detected, extensionFor(detected, ".audio"), KindAudio
	case detected == "application/pdf":
		return detected, ".pdf", KindFile
	}

	// The content could not be placed. The name of the file may only pick
	// the type of a plain text file, and it can never turn an unknown file
	// into an image, a video or an audio file: the name comes from the
	// client and says nothing about the content.
	if detected == "text/plain; charset=utf-8" || detected == "application/octet-stream" {
		switch strings.ToLower(filepath.Ext(filename)) {
		case ".txt", ".md":
			return "text/plain", ".txt", KindFile
		case ".csv":
			return "text/csv", ".csv", KindFile
		case ".json":
			return "application/json", ".json", KindFile
		}
	}
	return "application/octet-stream", ".bin", KindFile
}

func httpDetect(head []byte) string {
	if len(head) == 0 {
		return "application/octet-stream"
	}
	return http.DetectContentType(head)
}

func extensionFor(mime, fallback string) string {
	switch mime {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/bmp":
		return ".bmp"
	case "image/heic", "image/heif":
		return ".heic"
	case "video/mp4":
		return ".mp4"
	case "video/quicktime":
		return ".mov"
	case "video/webm":
		return ".webm"
	case "video/x-matroska":
		return ".mkv"
	case "audio/mpeg":
		return ".mp3"
	case "audio/mp4":
		return ".m4a"
	case "audio/wav":
		return ".wav"
	case "audio/flac":
		return ".flac"
	case "application/zip":
		return ".zip"
	case "application/gzip":
		return ".gz"
	case "text/plain":
		return ".txt"
	}
	return fallback
}

func isHEIF(head []byte) bool {
	if len(head) < 12 || !bytes.Equal(head[4:8], []byte("ftyp")) {
		return false
	}
	// The major brand comes first, the compatible brands follow it. A file
	// written by one tool is often branded by another, so every brand in the
	// box is looked at.
	for _, brand := range ftypBrands(head) {
		switch brand {
		case "heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs",
			"mif1", "msf1", "miaf", "mif2":
			return true
		}
	}
	return false
}

// isAVIF reports whether the file is an AV1 image, which is a different
// container that happens to use the same box layout.
func isAVIF(head []byte) bool {
	if len(head) < 12 || !bytes.Equal(head[4:8], []byte("ftyp")) {
		return false
	}
	for _, brand := range ftypBrands(head) {
		if brand == "avif" || brand == "avis" {
			return true
		}
	}
	return false
}

// ftypBrands returns the major brand of the file type box and every brand
// it declares as compatible.
func ftypBrands(head []byte) []string {
	if len(head) < 16 || !bytes.Equal(head[4:8], []byte("ftyp")) {
		return nil
	}
	brands := []string{string(head[8:12])}
	// The size of the box bounds the list of brands, so nothing beyond the
	// box is read.
	limit := len(head)
	if size := int(binary.BigEndian.Uint32(head[0:4])); size >= 16 && size < limit {
		limit = size
	}
	for offset := 16; offset+4 <= limit; offset += 4 {
		brands = append(brands, string(head[offset:offset+4]))
	}
	return brands
}

func isQuickTime(head []byte) bool {
	return len(head) >= 12 && bytes.Equal(head[4:8], []byte("ftyp")) &&
		(string(head[8:12]) == "qt  ")
}

func isMP4(head []byte) bool {
	if len(head) < 12 || !bytes.Equal(head[4:8], []byte("ftyp")) {
		return false
	}
	switch string(head[8:12]) {
	case "isom", "iso2", "mp41", "mp42", "avc1", "dash", "M4V ":
		return true
	}
	return false
}

func isWebM(head []byte) bool {
	return matroskaDocType(head) == "webm"
}

func isMatroska(head []byte) bool {
	return matroskaDocType(head) == "matroska"
}

// matroskaDocType returns the DocType of a Matroska or WebM file. Both use
// the same EBML container, so only the DocType tells them apart.
//
// The element is looked for in the head of the file and only the two known
// values are accepted, so a stray byte sequence cannot change the answer. An
// EBML file whose DocType cannot be read is reported as Matroska, which is
// the more general of the two containers.
func matroskaDocType(head []byte) string {
	if len(head) < 4 || !bytes.Equal(head[0:4], []byte{0x1A, 0x45, 0xDF, 0xA3}) {
		return ""
	}
	idx := bytes.Index(head, []byte{0x42, 0x82})
	if idx < 0 {
		return ""
	}
	rest := head[idx+2:]
	size, n := readVInt(rest)
	if n == 0 || size <= 0 || size > len(rest)-n {
		return ""
	}
	switch docType := string(rest[n : n+size]); docType {
	case "webm":
		return "webm"
	case "matroska":
		return "matroska"
	}
	return ""
}

// readVInt reads an EBML variable length integer and returns its value and
// the number of bytes it occupied.
func readVInt(b []byte) (int, int) {
	if len(b) == 0 {
		return 0, 0
	}
	first := b[0]
	if first == 0 {
		return 0, 0
	}
	mask := byte(0x80)
	length := 1
	for first&mask == 0 {
		mask >>= 1
		length++
		if length > 8 {
			return 0, 0
		}
	}
	if len(b) < length {
		return 0, 0
	}
	value := int64(0)
	for i := 0; i < length; i++ {
		value = value<<8 | int64(b[i])
	}
	// The marker bit is not part of the number.
	value &= (int64(1) << (7 * uint(length))) - 1
	return int(value), length
}

func isFLAC(head []byte) bool { return len(head) >= 4 && bytes.Equal(head[0:4], []byte("fLaC")) }

// isEBML reports the signature of the Matroska and WebM container.
func isEBML(head []byte) bool {
	return len(head) >= 4 && bytes.Equal(head[0:4], []byte{0x1A, 0x45, 0xDF, 0xA3})
}
func isMP3(head []byte) bool {
	if len(head) < 2 {
		return false
	}
	return head[0] == 0xFF && (head[1]&0xE0) == 0xE0
}
func isM4A(head []byte) bool {
	return len(head) >= 12 && bytes.Equal(head[4:8], []byte("ftyp")) &&
		strings.HasPrefix(string(head[8:12]), "M4A")
}
func isWAV(head []byte) bool {
	return len(head) >= 12 && bytes.Equal(head[0:4], []byte("RIFF")) && bytes.Equal(head[8:12], []byte("WAVE"))
}
func isPDF(head []byte) bool  { return bytes.HasPrefix(head, []byte("%PDF-")) }
func isZIP(head []byte) bool  { return bytes.HasPrefix(head, []byte{0x50, 0x4B, 0x03, 0x04}) }
func isGZIP(head []byte) bool { return bytes.HasPrefix(head, []byte{0x1F, 0x8B}) }

// DecodeImage decodes the supported still image formats.
func DecodeImage(r io.Reader) (image.Image, string, error) {
	buf, err := io.ReadAll(io.LimitReader(r, 64<<20))
	if err != nil {
		return nil, "", err
	}
	return decodeImageBytes(buf)
}

func decodeImageBytes(buf []byte) (image.Image, string, error) {
	img, format, err := image.Decode(bytes.NewReader(buf))
	if err == nil {
		return img, format, nil
	}
	// WebP is not registered with the standard library decoder.
	img, err = webp.Decode(bytes.NewReader(buf))
	if err == nil {
		return img, "webp", nil
	}
	return nil, "", err
}

// ImageInfo carries the dimensions of a decoded image.
type ImageInfo struct {
	Width  int
	Height int
}

// InspectImage reads the dimensions of an image without keeping it in memory.
func InspectImage(path string) (ImageInfo, error) {
	f, err := os.Open(path)
	if err != nil {
		return ImageInfo{}, err
	}
	defer f.Close()
	img, _, err := DecodeImage(f)
	if err != nil {
		return ImageInfo{}, err
	}
	b := img.Bounds()
	return ImageInfo{Width: b.Dx(), Height: b.Dy()}, nil
}

// Resize produces a JPEG derivative of the source image, scaled so that the
// longest side is at most maxDim. The file is always written, even when the
// source is already small enough, so the derivative exists on disk.
func Resize(srcPath, dstPath string, maxDim int) (ImageInfo, error) {
	f, err := os.Open(srcPath)
	if err != nil {
		return ImageInfo{}, err
	}
	defer f.Close()

	img, _, err := DecodeImage(f)
	if err != nil {
		return ImageInfo{}, fmt.Errorf("%w: %v", ErrUnsupportedImage, err)
	}
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w == 0 || h == 0 {
		return ImageInfo{}, errors.New("image has no dimensions")
	}
	nw, nh := scaledSize(w, h, maxDim)

	dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Over, nil)

	if err := os.MkdirAll(filepath.Dir(dstPath), 0o750); err != nil {
		return ImageInfo{}, err
	}
	out, err := os.Create(dstPath)
	if err != nil {
		return ImageInfo{}, err
	}
	defer out.Close()
	if err := jpeg.Encode(out, dst, &jpeg.Options{Quality: 82}); err != nil {
		return ImageInfo{}, err
	}
	return ImageInfo{Width: nw, Height: nh}, nil
}

// scaledSize returns the dimensions an image is scaled to so that neither
// side exceeds maxDim. The aspect ratio is preserved.
func scaledSize(w, h, maxDim int) (int, int) {
	if w <= maxDim && h <= maxDim {
		return w, h
	}
	scale := float64(maxDim) / float64(w)
	if h > w {
		scale = float64(maxDim) / float64(h)
	}
	nw := int(float64(w) * scale)
	nh := int(float64(h) * scale)
	if nw < 1 {
		nw = 1
	}
	if nh < 1 {
		nh = 1
	}
	return nw, nh
}

// EncodeScaledJPEG decodes an image and re-encodes it as a JPEG whose longest
// side is at most maxDim. It bounds the payload sent to an external model
// without touching the stored original.
func EncodeScaledJPEG(r io.Reader, maxDim int) ([]byte, error) {
	img, _, err := DecodeImage(r)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnsupportedImage, err)
	}
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w == 0 || h == 0 {
		return nil, errors.New("image has no dimensions")
	}
	nw, nh := scaledSize(w, h, maxDim)
	dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Over, nil)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 80}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ErrUnsupportedImage marks image formats the pure Go decoders cannot read,
// such as HEIC. The original file is still stored and served; only the
// derivatives are skipped.
var ErrUnsupportedImage = errors.New("unsupported image format")

// ensure the standard decoders stay linked in.
var _ = gif.Decode
var _ = png.Decode
var _ = jpeg.Decode
