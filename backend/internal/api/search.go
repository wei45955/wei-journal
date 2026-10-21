package api

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/wei/journal/backend/internal/auth"
	"github.com/wei/journal/backend/internal/httpx"
	"github.com/wei/journal/backend/internal/models"
	"github.com/wei/journal/backend/internal/search"
)

// searchHit is one matching location inside the archive.
type searchHit struct {
	EntryID uint    `json:"entryId"`
	MediaID *uint   `json:"mediaId"`
	Kind    string  `json:"kind"`
	Field   string  `json:"field"`
	Score   float64 `json:"score"`
	Snippet string  `json:"snippet"`
}

// handleSearch runs a query across the whole archive.
func (s *Server) handleSearch(c *gin.Context) {
	user := auth.CurrentUser(c)
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		httpx.ValidationError(c, "please check the highlighted fields", map[string]string{
			"q": "a search term is required",
		})
		return
	}
	limit := httpx.QueryInt(c, "limit", 30)
	if limit < 1 || limit > 100 {
		limit = 30
	}
	offset := httpx.QueryInt(c, "offset", 0)
	if offset < 0 {
		offset = 0
	}

	results, err := s.search.Search(user.ID, search.QueryOptions{
		Query:  query,
		Limit:  limit*3 + 20,
		Offset: offset,
	})
	if err != nil {
		httpx.Internal(c, s.log, err, "search")
		return
	}

	kindFilter := c.Query("type")
	if kindFilter != "" && kindFilter != "all" {
		filtered := results[:0]
		for _, r := range results {
			if r.Kind == kindFilter {
				filtered = append(filtered, r)
			}
		}
		results = filtered
	}
	if from := c.Query("from"); from != "" {
		results = s.filterResultsByDate(user.ID, results, from, "")
	}
	if to := c.Query("to"); to != "" {
		results = s.filterResultsByDate(user.ID, results, "", to)
	}

	// Group the hits by entry, keeping the strongest match first.
	type grouped struct {
		entryID uint
		hits    []searchHit
	}
	order := []uint{}
	byEntry := map[uint][]searchHit{}
	for _, r := range results {
		hit := searchHit{
			EntryID: r.EntryID,
			MediaID: r.MediaID,
			Kind:    r.Kind,
			Field:   r.Field,
			Score:   r.Score,
			Snippet: r.Snippet,
		}
		if _, ok := byEntry[r.EntryID]; !ok {
			order = append(order, r.EntryID)
		}
		byEntry[r.EntryID] = append(byEntry[r.EntryID], hit)
	}
	if len(order) > limit {
		order = order[:limit]
	}

	entries, err := s.loadEntriesByID(user.ID, order)
	if err != nil {
		httpx.Internal(c, s.log, err, "load search results")
		return
	}

	out := make([]gin.H, 0, len(order))
	for _, id := range order {
		entry, ok := entries[id]
		if !ok {
			continue
		}
		hits := byEntry[id]
		sort.SliceStable(hits, func(i, j int) bool { return hits[i].Score > hits[j].Score })
		out = append(out, gin.H{"entry": entry, "matches": hits})
	}
	httpx.WithMeta(c, out, httpx.Meta{Limit: limit, HasMore: len(order) == limit})
}

// filterResultsByDate restricts hits to entries whose event date falls in
// the given range.
func (s *Server) filterResultsByDate(userID uint, results []search.Result, from, to string) []search.Result {
	if len(results) == 0 {
		return results
	}
	ids := make([]uint, 0, len(results))
	for _, r := range results {
		ids = append(ids, r.EntryID)
	}
	var rows []struct {
		ID        uint
		EventDate string
	}
	q := s.handle.DB().Model(&models.Entry{}).Select("id, event_date").
		Where("user_id = ? AND id IN ?", userID, ids)
	if from != "" {
		q = q.Where("event_date >= ?", from)
	}
	if to != "" {
		q = q.Where("event_date <= ?", to)
	}
	if err := q.Find(&rows).Error; err != nil {
		return results
	}
	allowed := map[uint]bool{}
	for _, r := range rows {
		allowed[r.ID] = true
	}
	out := results[:0]
	for _, r := range results {
		if allowed[r.EntryID] {
			out = append(out, r)
		}
	}
	return out
}

// loadEntriesByID fetches the given entries and builds their payloads.
func (s *Server) loadEntriesByID(userID uint, ids []uint) (map[uint]*EntryDTO, error) {
	out := map[uint]*EntryDTO{}
	if len(ids) == 0 {
		return out, nil
	}
	var entries []models.Entry
	if err := s.handle.DB().Where("user_id = ? AND id IN ?", userID, ids).Find(&entries).Error; err != nil {
		return nil, err
	}
	dtos, err := s.buildEntryDTOs(userID, entries)
	if err != nil {
		return nil, err
	}
	for i := range dtos {
		dto := dtos[i]
		out[dto.ID] = &dto
	}
	return out, nil
}

// handleCalendar returns the activity of a day, month or year.
func (s *Server) handleCalendar(c *gin.Context) {
	user := auth.CurrentUser(c)
	view := c.DefaultQuery("view", "month")
	now := time.Now().UTC()
	anchor := c.Query("date")
	parsed, err := time.Parse("2006-01-02", anchor)
	if err != nil {
		parsed = now
	}

	var start, end time.Time
	switch view {
	case "day":
		start = parsed
		end = parsed.AddDate(0, 0, 1)
	case "year":
		start = time.Date(parsed.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
		end = start.AddDate(1, 0, 0)
	default:
		view = "month"
		start = time.Date(parsed.Year(), parsed.Month(), 1, 0, 0, 0, 0, time.UTC)
		end = start.AddDate(0, 1, 0)
	}

	var rows []struct {
		EventDate string
		Total     int
	}
	err = s.handle.DB().Model(&models.Entry{}).
		Select("event_date, COUNT(*) as total").
		Where("user_id = ? AND event_date >= ? AND event_date < ?", user.ID,
			start.Format("2006-01-02"), end.Format("2006-01-02")).
		Group("event_date").Order("event_date ASC").Scan(&rows).Error
	if err != nil {
		httpx.Internal(c, s.log, err, "calendar")
		return
	}

	counts := map[string]int{}
	total := 0
	for _, r := range rows {
		counts[r.EventDate] = r.Total
		total += r.Total
	}

	days := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		days = append(days, gin.H{"date": r.EventDate, "count": r.Total})
	}

	httpx.OK(c, gin.H{
		"view":  view,
		"start": start.Format("2006-01-02"),
		"end":   end.Add(-24 * time.Hour).Format("2006-01-02"),
		"total": total,
		"days":  days,
	})
}

// handleStats returns the personal statistics of the archive.
func (s *Server) handleStats(c *gin.Context) {
	user := auth.CurrentUser(c)

	var totalEntries int64
	s.handle.DB().Model(&models.Entry{}).Where("user_id = ?", user.ID).Count(&totalEntries)

	var totalWords int64
	s.handle.DB().Model(&models.Entry{}).Where("user_id = ?", user.ID).
		Select("COALESCE(SUM(word_count), 0)").Scan(&totalWords)

	// A Live Photo is one logical item even though it has two files, so the
	// still and the motion component are counted once each in their own
	// category and never as separate photos and videos.
	var plainImages int64
	s.handle.DB().Model(&models.MediaAsset{}).
		Where("user_id = ? AND kind = ? AND deleted_at IS NULL", user.ID, models.MediaImage).Count(&plainImages)
	var liveStills int64
	s.handle.DB().Model(&models.MediaAsset{}).
		Where("user_id = ? AND live_role = ? AND deleted_at IS NULL", user.ID, "still").Count(&liveStills)
	var liveMotions int64
	s.handle.DB().Model(&models.MediaAsset{}).
		Where("user_id = ? AND live_role = ? AND deleted_at IS NULL", user.ID, "motion").Count(&liveMotions)
	var videos int64
	s.handle.DB().Model(&models.MediaAsset{}).
		Where("user_id = ? AND kind = ? AND deleted_at IS NULL", user.ID, models.MediaVideo).Count(&videos)
	var audios int64
	s.handle.DB().Model(&models.MediaAsset{}).
		Where("user_id = ? AND kind = ? AND deleted_at IS NULL", user.ID, models.MediaAudio).Count(&audios)
	var files int64
	s.handle.DB().Model(&models.MediaAsset{}).
		Where("user_id = ? AND kind IN ? AND deleted_at IS NULL", user.ID,
			[]string{models.MediaFile, models.MediaDocumentType}).Count(&files)

	// Days and years are counted in the zone the reader lives in. An
	// account that follows the device sends that zone along, because only
	// the browser knows it.
	zone := time.UTC
	if settings, err := s.loadSettings(user.ID); err == nil {
		name := strings.TrimSpace(settings.Timezone)
		if name != "" && name != "auto" {
			if loc, err := time.LoadLocation(name); err == nil {
				zone = loc
			}
		}
	}
	if name := strings.TrimSpace(c.Query("tz")); name != "" {
		if loc, err := time.LoadLocation(name); err == nil {
			zone = loc
		}
	}
	now := time.Now().In(zone)

	var dates []string
	s.handle.DB().Model(&models.Entry{}).Where("user_id = ?", user.ID).
		Distinct().Order("event_date ASC").Pluck("event_date", &dates)

	activeDays := len(dates)
	current, longest := computeStreaks(dates, now)

	firstDate, lastDate := "", ""
	if len(dates) > 0 {
		firstDate = dates[0]
		lastDate = dates[len(dates)-1]
	}

	year := now.Year()
	var entriesThisYear int64
	s.handle.DB().Model(&models.Entry{}).
		Where("user_id = ? AND event_date >= ? AND event_date <= ?", user.ID,
			fmt.Sprintf("%04d-01-01", year), fmt.Sprintf("%04d-12-31", year)).
		Count(&entriesThisYear)

	httpx.OK(c, gin.H{
		"totalEntries":    totalEntries,
		"totalPhotos":     plainImages + liveStills,
		"totalVideos":     videos + liveMotions,
		"totalAudios":     audios,
		"totalFiles":      files,
		"totalWords":      totalWords,
		"activeDays":      activeDays,
		"currentStreak":   current,
		"longestStreak":   longest,
		"firstEntryDate":  firstDate,
		"lastEntryDate":   lastDate,
		"entriesThisYear": entriesThisYear,
		"currentYear":     year,
	})
}

// computeStreaks derives the current and longest run of consecutive days
// that hold at least one entry. `now` carries the zone the reader counts
// days in: a diary written this morning in Shanghai is still yesterday in
// UTC, and that entry must not end the streak. The result is always
// calculated from the stored data rather than from a counter, so deleting
// an entry correctly changes the result.
func computeStreaks(dates []string, now time.Time) (current, longest int) {
	if len(dates) == 0 {
		return 0, 0
	}
	unique := make([]time.Time, 0, len(dates))
	seen := map[string]bool{}
	for _, d := range dates {
		if seen[d] {
			continue
		}
		seen[d] = true
		t, err := time.Parse("2006-01-02", d)
		if err != nil {
			continue
		}
		unique = append(unique, t)
	}
	if len(unique) == 0 {
		return 0, 0
	}
	sort.Slice(unique, func(i, j int) bool { return unique[i].Before(unique[j]) })

	run := 1
	longest = 1
	for i := 1; i < len(unique); i++ {
		if unique[i].Sub(unique[i-1]) == 24*time.Hour {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
	}

	// The current streak is the run that reaches today or yesterday; a
	// longer gap simply means the streak ended, it is never punished.
	// Future-dated entries are ignored here: a plan for next week must not
	// hide the fact that the reader wrote this morning.
	today := now.Format("2006-01-02")
	yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")
	for i := range unique {
		key := unique[i].Format("2006-01-02")
		if key != today && key != yesterday {
			continue
		}
		run := 1
		for j := i; j > 0; j-- {
			if unique[j].Sub(unique[j-1]) != 24*time.Hour {
				break
			}
			run++
		}
		if run > current {
			current = run
		}
	}
	return current, longest
}
