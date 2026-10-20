package media

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/rwcarlsen/goexif/exif"
)

// ExifData holds the technical metadata extracted from an upload.
type ExifData struct {
	Make         string   `json:"make,omitempty"`
	Model        string   `json:"model,omitempty"`
	LensModel    string   `json:"lensModel,omitempty"`
	TakenAt      *string  `json:"takenAt,omitempty"`
	Orientation  int      `json:"orientation,omitempty"`
	ISO          int      `json:"iso,omitempty"`
	FNumber      string   `json:"fNumber,omitempty"`
	ExposureTime string   `json:"exposureTime,omitempty"`
	FocalLength  string   `json:"focalLength,omitempty"`
	Latitude     *float64 `json:"latitude,omitempty"`
	Longitude    *float64 `json:"longitude,omitempty"`
	GPSPresent   bool     `json:"gpsPresent,omitempty"`
}

// ExtractExif reads EXIF metadata from a JPEG or TIFF file. Files without
// usable EXIF simply produce an empty result.
func ExtractExif(path string) (ExifData, error) {
	out := ExifData{}
	f, err := os.Open(path)
	if err != nil {
		return out, nil
	}
	defer f.Close()

	parsed, err := exif.Decode(f)
	if err != nil {
		return out, nil
	}
	out.Make = exifString(parsed, exif.Make)
	out.Model = exifString(parsed, exif.Model)
	out.LensModel = exifString(parsed, exif.LensModel)
	out.Orientation = exifInt(parsed, exif.Orientation)
	out.ISO = exifInt(parsed, exif.ISOSpeedRatings)
	out.FNumber = exifRational(parsed, exif.FNumber)
	out.ExposureTime = exifRational(parsed, exif.ExposureTime)
	out.FocalLength = exifRational(parsed, exif.FocalLength)
	if t, err := parsed.DateTime(); err == nil && !t.IsZero() {
		stamp := t.UTC().Format(time.RFC3339)
		out.TakenAt = &stamp
	}
	if lat, lng, err := parsed.LatLong(); err == nil && (lat != 0 || lng != 0) {
		latCopy, lngCopy := lat, lng
		out.Latitude = &latCopy
		out.Longitude = &lngCopy
		out.GPSPresent = true
	}
	return out, nil
}

// exifString reads a text field.
func exifString(x *exif.Exif, name exif.FieldName) string {
	tag, err := x.Get(name)
	if err != nil {
		return ""
	}
	value, err := tag.StringVal()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(value)
}

// exifInt reads an integer field.
func exifInt(x *exif.Exif, name exif.FieldName) int {
	tag, err := x.Get(name)
	if err != nil {
		return 0
	}
	value, err := tag.Int(0)
	if err != nil {
		return 0
	}
	return value
}

// exifRational reads a rational field and formats it for display.
func exifRational(x *exif.Exif, name exif.FieldName) string {
	tag, err := x.Get(name)
	if err != nil {
		return ""
	}
	rat, err := tag.Rat(0)
	if err != nil {
		return ""
	}
	value, _ := rat.Float64()
	return strconv.FormatFloat(value, 'f', -1, 64)
}

// Marshal serialises the metadata for storage.
func (e ExifData) Marshal() string {
	b, err := json.Marshal(e)
	if err != nil {
		return ""
	}
	return string(b)
}

// isoBMPFFile walks the ISO base media file format box tree of a QuickTime,
// MP4 or HEIC container and returns the payload of every "uuid" box.
func isoBMPFFile(path string) [][]byte {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var out [][]byte
	var walk func(r io.Reader, end int64, depth int)
	walk = func(r io.Reader, end int64, depth int) {
		if depth > 6 {
			return
		}
		for end > 0 {
			header := make([]byte, 8)
			if _, err := io.ReadFull(r, header); err != nil {
				return
			}
			size := int64(binary.BigEndian.Uint32(header[0:4]))
			boxType := string(header[4:8])
			headerLen := int64(8)
			if size == 1 {
				ext := make([]byte, 8)
				if _, err := io.ReadFull(r, ext); err != nil {
					return
				}
				size = int64(binary.BigEndian.Uint64(ext))
				headerLen = 16
			} else if size == 0 {
				return
			}
			if size < headerLen {
				return
			}
			payload := size - headerLen

			if boxType == "uuid" {
				uid := make([]byte, 16)
				if _, err := io.ReadFull(r, uid); err != nil {
					return
				}
				payload -= 16
				data := make([]byte, payload)
				if _, err := io.ReadFull(r, data); err != nil {
					return
				}
				out = append(out, data)
				end -= size
				continue
			}

			container := isContainerBox(boxType)
			if container && payload > 0 {
				walk(io.LimitReader(r, payload), payload, depth+1)
			} else if payload > 0 {
				if _, err := io.CopyN(io.Discard, r, payload); err != nil {
					return
				}
			}
			end -= size
		}
	}
	info, err := f.Stat()
	if err != nil {
		return nil
	}
	walk(f, info.Size(), 0)
	return out
}

func isContainerBox(t string) bool {
	switch t {
	case "moov", "trak", "mdia", "minf", "stbl", "udta", "meta", "ilst",
		"moof", "traf", "mfra", "edts", "dinf", "mvex", "iprp", "ipco", "iinf", "iref":
		return true
	}
	return false
}

// QuickTimeContentIdentifier extracts the Apple content identifier from a
// QuickTime or MP4 file. Paired Live Photo components share this value, which
// lets separately uploaded halves be matched.
func QuickTimeContentIdentifier(path string) string {
	for _, payload := range isoBMPFFile(path) {
		if id, ok := findContentIdentifier(payload); ok {
			return id
		}
	}
	return ""
}

// findContentIdentifier scans a metadata payload for the
// com.apple.quicktime.contentidentifier key.
func findContentIdentifier(payload []byte) (string, bool) {
	const key = "com.apple.quicktime.contentidentifier"
	idx := strings.Index(string(payload), key)
	if idx < 0 {
		return "", false
	}
	rest := payload[idx+len(key):]
	// The value follows in a "data" atom; take the printable run.
	start := 0
	for start < len(rest) && (rest[start] < 0x20 || rest[start] >= 0x7f) {
		start++
	}
	end := start
	for end < len(rest) && rest[end] >= 0x20 && rest[end] < 0x7f {
		end++
	}
	if end > start {
		return string(rest[start:end]), true
	}
	return "", false
}

// ContainerIdentifiers returns the uuid box payloads of a HEIC or MOV file.
func ContainerIdentifiers(path string) []string {
	out := []string{}
	for _, payload := range isoBMPFFile(path) {
		if len(payload) == 0 {
			continue
		}
		out = append(out, hex.EncodeToString(payload[:min(len(payload), 32)]))
	}
	return out
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
