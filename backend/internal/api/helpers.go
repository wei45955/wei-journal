package api

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"io"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm/clause"

	"github.com/wei/journal/backend/internal/jobs"
)

// Job type aliases used by the handlers.
const (
	jobsDescribeImage  = jobs.TypeDescribeImage
	jobsSummarizeText  = jobs.TypeSummarizeText
	jobsBuildThumbnail = jobs.TypeBuildThumbnail
	jobsCleanupOrphans = jobs.TypeCleanupOrphans
)

// NormalizeTagName folds a tag name into its comparison key so that
// "Travel", "travel " and "TRAVEL" are the same tag. Unicode is preserved,
// which keeps Chinese tag names intact.
func NormalizeTagName(name string) string {
	return strings.ToLower(strings.Join(strings.Fields(name), " "))
}

// sha256Sum returns the digest of the input.
func sha256Sum(b []byte) []byte {
	sum := sha256.Sum256(b)
	return sum[:]
}

// clauseOnConflictDoNothing keeps bulk tag assignment idempotent.
func clauseOnConflictDoNothing() clause.Expression { return clause.OnConflict{DoNothing: true} }

// contextWithTimeout bounds a database probe.
func contextWithTimeout(c *gin.Context, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Request.Context(), d)
}

// decodeJSONBody decodes a JSON response body.
func decodeJSONBody(r io.Reader, target any) error {
	return json.NewDecoder(io.LimitReader(r, 4<<20)).Decode(target)
}

// parseCoordinate converts a pair of decimal strings into floats.
func parseCoordinate(lat, lon string) (float64, float64, bool) {
	a, err := strconv.ParseFloat(strings.TrimSpace(lat), 64)
	if err != nil {
		return 0, 0, false
	}
	b, err := strconv.ParseFloat(strings.TrimSpace(lon), 64)
	if err != nil {
		return 0, 0, false
	}
	return a, b, true
}

// isPrintableTagName rejects names that would be invisible in the interface.
func isPrintableTagName(name string) bool {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return false
	}
	for _, r := range trimmed {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}

// normalizeDrawing keeps only valid JSON for the vector drawing payload. The
// value is echoed back inside API responses, so a malformed one is replaced
// with an empty drawing list instead of breaking the response.
func normalizeDrawing(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "[]"
	}
	if !json.Valid([]byte(trimmed)) {
		return "[]"
	}
	return trimmed
}
