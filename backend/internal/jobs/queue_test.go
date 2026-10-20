package jobs

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/db"
	"github.com/wei/journal/backend/internal/models"
)

// newTestQueue opens a private SQLite database for one test and returns a
// queue bound to it. Every test gets its own temporary directory so the
// tests never share state.
func newTestQueue(t *testing.T) (*Queue, *gorm.DB) {
	t.Helper()

	dir := t.TempDir()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))

	handle, err := db.Open("sqlite://"+filepath.Join(dir, "queue.db"), log)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = handle.Close() })

	orm := handle.DB()
	return NewQueue(orm, log), orm
}

// loadJob reads a job row back from the database.
func loadJob(t *testing.T, orm *gorm.DB, id uint) models.Job {
	t.Helper()
	var job models.Job
	if err := orm.First(&job, id).Error; err != nil {
		t.Fatalf("load job %d: %v", id, err)
	}
	return job
}

// countJobs counts the job rows matching a where clause.
func countJobs(t *testing.T, orm *gorm.DB, query string, args ...any) int64 {
	t.Helper()
	var n int64
	if err := orm.Model(&models.Job{}).Where(query, args...).Count(&n).Error; err != nil {
		t.Fatalf("count jobs: %v", err)
	}
	return n
}

// TestEnqueueStoresTheJobWithItsPayload checks that a job survives the write
// with the type, owner, target, status and payload it was created with.
func TestEnqueueStoresTheJobWithItsPayload(t *testing.T) {
	q, orm := newTestQueue(t)

	payload := map[string]any{
		"caption": "sunset over the harbour",
		"tags":    []string{"travel", "evening"},
	}
	job, err := q.Enqueue(TypeDescribeImage, 7, 42, payload, 0)
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	if job == nil {
		t.Fatal("enqueue returned no job")
	}
	if job.ID == 0 {
		t.Fatal("enqueue returned a job without an id")
	}

	stored := loadJob(t, orm, job.ID)
	if stored.Type != TypeDescribeImage {
		t.Errorf("type = %q, want %q", stored.Type, TypeDescribeImage)
	}
	if stored.UserID != 7 {
		t.Errorf("user id = %d, want 7", stored.UserID)
	}
	if stored.TargetID != 42 {
		t.Errorf("target id = %d, want 42", stored.TargetID)
	}
	if stored.Status != models.JobPending {
		t.Errorf("status = %q, want %q", stored.Status, models.JobPending)
	}
	if stored.Attempts != 0 {
		t.Errorf("attempts = %d, want 0", stored.Attempts)
	}
	if stored.MaxAttempts <= 0 {
		t.Errorf("max attempts = %d, want a positive limit", stored.MaxAttempts)
	}

	var got map[string]any
	if err := json.Unmarshal([]byte(stored.PayloadJSON), &got); err != nil {
		t.Fatalf("decode payload %q: %v", stored.PayloadJSON, err)
	}
	if got["caption"] != "sunset over the harbour" {
		t.Errorf("payload caption = %v, want %q", got["caption"], "sunset over the harbour")
	}
	tags, ok := got["tags"].([]any)
	if !ok {
		t.Fatalf("payload tags = %v, want a list", got["tags"])
	}
	if len(tags) != 2 || tags[0] != "travel" || tags[1] != "evening" {
		t.Errorf("payload tags = %v, want [travel evening]", tags)
	}
}

// TestEnqueueUniqueDoesNotDuplicateAJob checks that scheduling the same work
// twice reuses the pending job instead of piling up a second row.
func TestEnqueueUniqueDoesNotDuplicateAJob(t *testing.T) {
	q, orm := newTestQueue(t)

	first, err := q.EnqueueUnique(TypeSummarizeText, 1, 5, map[string]any{"attempt": 1})
	if err != nil {
		t.Fatalf("first enqueue: %v", err)
	}
	second, err := q.EnqueueUnique(TypeSummarizeText, 1, 5, map[string]any{"attempt": 2})
	if err != nil {
		t.Fatalf("second enqueue: %v", err)
	}
	if first.ID != second.ID {
		t.Errorf("the second enqueue created job %d, want the existing job %d", second.ID, first.ID)
	}

	if n := countJobs(t, orm, "type = ? AND user_id = ? AND target_id = ?", TypeSummarizeText, 1, 5); n != 1 {
		t.Errorf("found %d job rows, want exactly 1", n)
	}
	if n := countJobs(t, orm, "status = ?", models.JobPending); n != 1 {
		t.Errorf("found %d pending jobs, want exactly 1", n)
	}

	// The pending job is reused as it is, so the first payload is kept.
	stored := loadJob(t, orm, first.ID)
	if !strings.Contains(stored.PayloadJSON, `"attempt":1`) {
		t.Errorf("payload = %q, want the payload of the first enqueue", stored.PayloadJSON)
	}
}

// TestClaimIsExclusive checks that two workers never receive the same job
// and that a job which is already running is not handed out again.
func TestClaimIsExclusive(t *testing.T) {
	q, orm := newTestQueue(t)

	jobA, err := q.Enqueue(TypeSummarizeText, 1, 100, nil, 0)
	if err != nil {
		t.Fatalf("enqueue first job: %v", err)
	}
	jobB, err := q.Enqueue(TypeSummarizeText, 1, 200, nil, 0)
	if err != nil {
		t.Fatalf("enqueue second job: %v", err)
	}

	claimedA, err := q.Claim("worker-a", 1)
	if err != nil {
		t.Fatalf("claim for worker-a: %v", err)
	}
	if len(claimedA) != 1 {
		t.Fatalf("worker-a claimed %d jobs, want 1", len(claimedA))
	}

	claimedB, err := q.Claim("worker-b", 1)
	if err != nil {
		t.Fatalf("claim for worker-b: %v", err)
	}
	if len(claimedB) != 1 {
		t.Fatalf("worker-b claimed %d jobs, want 1", len(claimedB))
	}

	if claimedA[0].ID == claimedB[0].ID {
		t.Errorf("worker-b received job %d which was already claimed by worker-a", claimedB[0].ID)
	}

	claimed := map[uint]bool{claimedA[0].ID: true, claimedB[0].ID: true}
	if !claimed[jobA.ID] || !claimed[jobB.ID] {
		t.Errorf("the two workers claimed %v, want the jobs %d and %d", claimed, jobA.ID, jobB.ID)
	}

	// Both jobs are running now, so nobody else may take them.
	again, err := q.Claim("worker-c", 5)
	if err != nil {
		t.Fatalf("third claim: %v", err)
	}
	if len(again) != 0 {
		t.Errorf("a third worker claimed %d jobs that are already running", len(again))
	}

	// A finished job is never handed out either.
	if err := q.Complete(claimedA[0].ID); err != nil {
		t.Fatalf("complete: %v", err)
	}
	afterComplete, err := q.Claim("worker-c", 5)
	if err != nil {
		t.Fatalf("claim after complete: %v", err)
	}
	if len(afterComplete) != 0 {
		t.Errorf("claimed %d jobs, want 0: a completed job must not be run again", len(afterComplete))
	}

	if n := countJobs(t, orm, "status = ?", models.JobProcessing); n != 1 {
		t.Errorf("found %d running jobs, want 1", n)
	}
}

// TestClaimSkipsJobsThatAreNotDue checks that a delayed job waits for its
// run_after timestamp before it is handed to a worker.
func TestClaimSkipsJobsThatAreNotDue(t *testing.T) {
	q, _ := newTestQueue(t)

	const delay = 400 * time.Millisecond
	job, err := q.Enqueue(TypeBuildThumbnail, 1, 10, nil, delay)
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}

	early, err := q.Claim("worker-a", 5)
	if err != nil {
		t.Fatalf("early claim: %v", err)
	}
	if len(early) != 0 {
		t.Fatalf("claimed %d jobs before they were due, want 0", len(early))
	}

	deadline := time.Now().Add(5 * time.Second)
	for {
		claimed, err := q.Claim("worker-a", 5)
		if err != nil {
			t.Fatalf("claim: %v", err)
		}
		if len(claimed) > 0 {
			if claimed[0].ID != job.ID {
				t.Errorf("claimed job %d, want %d", claimed[0].ID, job.ID)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the delayed job was not claimed after it became due")
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// TestClaimMarksTheJobAsRunning checks that a claim is persisted, so a
// crashed worker leaves a trace of who held the job.
func TestClaimMarksTheJobAsRunning(t *testing.T) {
	q, orm := newTestQueue(t)

	job, err := q.Enqueue(TypeCleanupOrphans, 3, 9, nil, 0)
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	claimed, err := q.Claim("worker-42", 1)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if len(claimed) != 1 {
		t.Fatalf("claimed %d jobs, want 1", len(claimed))
	}

	stored := loadJob(t, orm, job.ID)
	if stored.Status != models.JobProcessing {
		t.Errorf("status = %q, want %q", stored.Status, models.JobProcessing)
	}
	// The claim is marked with the worker and a token that is unique to the
	// call, so the worker is still recognisable in the record.
	if !strings.HasPrefix(stored.LockedBy, "worker-42:") {
		t.Errorf("locked by = %q, want it to start with %q", stored.LockedBy, "worker-42:")
	}
	if stored.LockedAt == nil {
		t.Error("locked at is nil, want the claim time to be recorded")
	}
	if stored.Attempts != 1 {
		t.Errorf("attempts = %d, want 1", stored.Attempts)
	}
}

// TestCompleteRemovesTheJob checks that a finished job leaves the queue.
func TestCompleteRemovesTheJob(t *testing.T) {
	q, orm := newTestQueue(t)

	job, err := q.Enqueue(TypeDescribeImage, 1, 3, nil, 0)
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	if _, err := q.Claim("worker-a", 1); err != nil {
		t.Fatalf("claim: %v", err)
	}
	if err := q.Complete(job.ID); err != nil {
		t.Fatalf("complete: %v", err)
	}

	stored := loadJob(t, orm, job.ID)
	if stored.Status == models.JobPending || stored.Status == models.JobProcessing {
		t.Errorf("status = %q, want the job to be neither pending nor running", stored.Status)
	}
	if stored.Status != models.JobCompleted {
		t.Errorf("status = %q, want %q", stored.Status, models.JobCompleted)
	}
	if stored.LockedAt != nil {
		t.Errorf("locked at = %v, want it cleared", stored.LockedAt)
	}

	pending, err := q.PendingCount()
	if err != nil {
		t.Fatalf("pending count: %v", err)
	}
	if pending != 0 {
		t.Errorf("pending count = %d, want 0", pending)
	}

	claimed, err := q.Claim("worker-b", 5)
	if err != nil {
		t.Fatalf("claim after complete: %v", err)
	}
	if len(claimed) != 0 {
		t.Errorf("claimed %d jobs after they were completed, want 0", len(claimed))
	}
}

// TestFailSchedulesARetryWithExponentialBackoff checks that a failure puts
// the job back into the queue with a later run time and that the delay grows
// with the number of attempts.
func TestFailSchedulesARetryWithExponentialBackoff(t *testing.T) {
	q, orm := newTestQueue(t)

	job, err := q.Enqueue(TypeSummarizeText, 1, 4, nil, 0)
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	if _, err := q.Claim("worker-a", 1); err != nil {
		t.Fatalf("claim: %v", err)
	}
	before := loadJob(t, orm, job.ID)

	if err := q.Fail(job.ID, errors.New("the model backend refused the request")); err != nil {
		t.Fatalf("fail: %v", err)
	}

	after := loadJob(t, orm, job.ID)
	if after.Status != models.JobPending {
		t.Errorf("status = %q, want %q so the job is retried", after.Status, models.JobPending)
	}
	if after.Attempts != before.Attempts {
		t.Errorf("attempts = %d, want %d", after.Attempts, before.Attempts)
	}
	if after.LockedAt != nil {
		t.Errorf("locked at = %v, want it cleared", after.LockedAt)
	}
	if !strings.Contains(after.LastError, "the model backend refused the request") {
		t.Errorf("last error = %q, want the cause of the failure", after.LastError)
	}
	if !after.RunAfter.After(before.RunAfter) {
		t.Errorf("run after = %v, want a later time than %v", after.RunAfter, before.RunAfter)
	}

	// The helper grows the delay with the attempt count. The jitter is capped
	// at a quarter of the base, so the ranges of two consecutive attempts
	// never overlap and the growth is always visible.
	for attempt := 0; attempt < 3; attempt++ {
		if backoff(attempt) >= backoff(attempt+1) {
			t.Fatalf("backoff(%d) = %s is not smaller than backoff(%d) = %s",
				attempt, backoff(attempt), attempt+1, backoff(attempt+1))
		}
	}

	// The observable delay of the first retry is the smallest backoff.
	firstDelay := time.Until(after.RunAfter)
	if firstDelay < 15*time.Second {
		t.Errorf("the retry is scheduled in %s, want at least the smallest backoff", firstDelay)
	}
	if firstDelay > time.Minute {
		t.Errorf("the retry is scheduled in %s, want less than a minute", firstDelay)
	}

	// A second failure schedules the retry further into the future.
	if err := orm.Model(&models.Job{}).Where("id = ?", job.ID).
		Update("run_after", time.Now().UTC()).Error; err != nil {
		t.Fatalf("make the job due: %v", err)
	}
	claimed, err := q.Claim("worker-a", 1)
	if err != nil {
		t.Fatalf("second claim: %v", err)
	}
	if len(claimed) != 1 {
		t.Fatalf("claimed %d jobs, want 1", len(claimed))
	}
	if err := q.Fail(job.ID, errors.New("the model backend refused the request again")); err != nil {
		t.Fatalf("second fail: %v", err)
	}

	second := loadJob(t, orm, job.ID)
	if second.Attempts != 2 {
		t.Errorf("attempts = %d, want 2", second.Attempts)
	}
	if second.Status != models.JobPending {
		t.Errorf("status = %q, want %q", second.Status, models.JobPending)
	}
	secondDelay := time.Until(second.RunAfter)
	if secondDelay <= firstDelay {
		t.Errorf("the delay did not grow: %s then %s", firstDelay, secondDelay)
	}
	if secondDelay < 30*time.Second {
		t.Errorf("the retry is scheduled in %s, want at least the doubled backoff", secondDelay)
	}
}

// TestFailGivesUpAfterTheAttemptLimit checks that a job which keeps failing
// is marked as failed and is never handed to a worker again.
func TestFailGivesUpAfterTheAttemptLimit(t *testing.T) {
	q, orm := newTestQueue(t)

	job, err := q.Enqueue(TypeSummarizeText, 1, 6, nil, 0)
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	limit := job.MaxAttempts
	if limit <= 0 {
		t.Fatalf("the job has no attempt limit (%d), cannot test the limit", limit)
	}

	for attempt := 1; attempt <= limit; attempt++ {
		// Pretend the exponential backoff has already elapsed.
		if err := orm.Model(&models.Job{}).Where("id = ?", job.ID).
			Update("run_after", time.Now().UTC()).Error; err != nil {
			t.Fatalf("make the job due: %v", err)
		}
		claimed, err := q.Claim("worker-a", 1)
		if err != nil {
			t.Fatalf("claim %d: %v", attempt, err)
		}
		if len(claimed) != 1 {
			t.Fatalf("claim %d returned %d jobs, want 1", attempt, len(claimed))
		}
		if err := q.Fail(job.ID, fmt.Errorf("attempt %d failed", attempt)); err != nil {
			t.Fatalf("fail %d: %v", attempt, err)
		}
	}

	stored := loadJob(t, orm, job.ID)
	if stored.Status != models.JobFailed {
		t.Errorf("status = %q, want %q after %d attempts", stored.Status, models.JobFailed, limit)
	}
	if stored.Attempts != limit {
		t.Errorf("attempts = %d, want %d", stored.Attempts, limit)
	}
	if stored.LockedAt != nil {
		t.Errorf("locked at = %v, want it cleared", stored.LockedAt)
	}
	if stored.LastError == "" {
		t.Error("last error is empty, want the cause of the last failure")
	}

	// A failed job is never claimed again, not even when it is due.
	if err := orm.Model(&models.Job{}).Where("id = ?", job.ID).
		Update("run_after", time.Now().UTC()).Error; err != nil {
		t.Fatalf("make the job due: %v", err)
	}
	claimed, err := q.Claim("worker-a", 5)
	if err != nil {
		t.Fatalf("claim after the limit: %v", err)
	}
	if len(claimed) != 0 {
		t.Errorf("claimed %d jobs, want 0: a failed job must not run again", len(claimed))
	}
}

// TestRecoverStaleRequeuesJobsThatAreStuck checks that jobs abandoned by a
// crashed worker are put back into the queue while jobs that are currently
// being worked on are left alone.
func TestRecoverStaleRequeuesJobsThatAreStuck(t *testing.T) {
	q, orm := newTestQueue(t)

	now := time.Now().UTC()
	old := now.Add(-2 * time.Hour)

	stale := models.Job{
		UserID:      1,
		Type:        TypeSummarizeText,
		TargetID:    11,
		Status:      models.JobProcessing,
		Attempts:    1,
		MaxAttempts: 3,
		RunAfter:    old,
		LockedAt:    &old,
		LockedBy:    "worker-dead",
	}
	if err := orm.Create(&stale).Error; err != nil {
		t.Fatalf("create stale job: %v", err)
	}

	fresh := models.Job{
		UserID:      1,
		Type:        TypeSummarizeText,
		TargetID:    12,
		Status:      models.JobProcessing,
		Attempts:    1,
		MaxAttempts: 3,
		RunAfter:    now,
		LockedAt:    &now,
		LockedBy:    "worker-alive",
	}
	if err := orm.Create(&fresh).Error; err != nil {
		t.Fatalf("create running job: %v", err)
	}

	recovered, err := q.RecoverStale(time.Hour)
	if err != nil {
		t.Fatalf("recover stale: %v", err)
	}
	if recovered != 1 {
		t.Errorf("recovered %d jobs, want 1", recovered)
	}

	restarted := loadJob(t, orm, stale.ID)
	if restarted.Status != models.JobPending {
		t.Errorf("status = %q, want %q", restarted.Status, models.JobPending)
	}
	if restarted.LockedAt != nil {
		t.Errorf("locked at = %v, want it cleared", restarted.LockedAt)
	}
	if restarted.LockedBy != "" {
		t.Errorf("locked by = %q, want it cleared", restarted.LockedBy)
	}
	if restarted.RunAfter.Before(now.Add(-time.Minute)) {
		t.Errorf("run after = %v, want it reset to now", restarted.RunAfter)
	}

	untouched := loadJob(t, orm, fresh.ID)
	if untouched.Status != models.JobProcessing {
		t.Errorf("status = %q, want %q", untouched.Status, models.JobProcessing)
	}
	if untouched.LockedBy != "worker-alive" {
		t.Errorf("locked by = %q, want %q", untouched.LockedBy, "worker-alive")
	}
	if untouched.LockedAt == nil {
		t.Error("locked at is nil, want the running job to keep its lock")
	}
}

// TestPendingCountCountsOnlyPendingWork checks that only waiting jobs are
// counted as pending.
func TestPendingCountCountsOnlyPendingWork(t *testing.T) {
	q, orm := newTestQueue(t)

	first, err := q.Enqueue(TypeSummarizeText, 1, 20, nil, 0)
	if err != nil {
		t.Fatalf("enqueue first job: %v", err)
	}
	second, err := q.Enqueue(TypeSummarizeText, 1, 21, nil, 0)
	if err != nil {
		t.Fatalf("enqueue second job: %v", err)
	}

	pending, err := q.PendingCount()
	if err != nil {
		t.Fatalf("pending count: %v", err)
	}
	if pending != 2 {
		t.Errorf("pending count = %d, want 2", pending)
	}

	// A running job is not pending.
	claimed, err := q.Claim("worker-a", 1)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if len(claimed) != 1 {
		t.Fatalf("claimed %d jobs, want 1", len(claimed))
	}
	if claimed[0].ID != first.ID && claimed[0].ID != second.ID {
		t.Fatalf("claimed job %d, want one of the enqueued jobs %d and %d", claimed[0].ID, first.ID, second.ID)
	}
	pending, err = q.PendingCount()
	if err != nil {
		t.Fatalf("pending count: %v", err)
	}
	if pending != 1 {
		t.Errorf("pending count = %d, want 1 while a job is running", pending)
	}

	// A completed job is not pending either.
	if err := q.Complete(claimed[0].ID); err != nil {
		t.Fatalf("complete: %v", err)
	}
	pending, err = q.PendingCount()
	if err != nil {
		t.Fatalf("pending count: %v", err)
	}
	if pending != 1 {
		t.Errorf("pending count = %d, want 1 after a job was completed", pending)
	}

	// A failed job is not pending either.
	other := loadJob(t, orm, second.ID)
	limit := other.MaxAttempts
	for attempt := 1; attempt <= limit; attempt++ {
		if err := orm.Model(&models.Job{}).Where("id = ?", other.ID).
			Update("run_after", time.Now().UTC()).Error; err != nil {
			t.Fatalf("make the job due: %v", err)
		}
		claimed, err := q.Claim("worker-a", 1)
		if err != nil {
			t.Fatalf("claim %d: %v", attempt, err)
		}
		if len(claimed) != 1 {
			t.Fatalf("claim %d returned %d jobs, want 1", attempt, len(claimed))
		}
		if err := q.Fail(other.ID, fmt.Errorf("attempt %d failed", attempt)); err != nil {
			t.Fatalf("fail %d: %v", attempt, err)
		}
	}
	if status := loadJob(t, orm, other.ID).Status; status != models.JobFailed {
		t.Fatalf("status = %q, want %q", status, models.JobFailed)
	}

	pending, err = q.PendingCount()
	if err != nil {
		t.Fatalf("pending count: %v", err)
	}
	if pending != 0 {
		t.Errorf("pending count = %d, want 0 when nothing waits", pending)
	}
}

// TestTwoWorkersNeverOwnTheSameJob checks that two workers that claim at
// the same time do not both get the same job. The second worker sees the
// job as taken and hands it to the first one.
func TestTwoWorkersNeverOwnTheSameJob(t *testing.T) {
	q, orm := newTestQueue(t)
	for i := 0; i < 5; i++ {
		if _, err := q.Enqueue("media.thumbnail", 1, uint(i+1), nil, 0); err != nil {
			t.Fatalf("enqueue: %v", err)
		}
	}

	first, err := q.Claim("worker-a", 5)
	if err != nil {
		t.Fatalf("first claim: %v", err)
	}
	second, err := q.Claim("worker-b", 5)
	if err != nil {
		t.Fatalf("second claim: %v", err)
	}

	seen := map[uint]bool{}
	for _, job := range first {
		if seen[job.ID] {
			t.Fatalf("the job %d was handed out twice by the same worker", job.ID)
		}
		seen[job.ID] = true
	}
	for _, job := range second {
		if seen[job.ID] {
			t.Fatalf("the job %d was claimed by both workers", job.ID)
		}
		seen[job.ID] = true
	}
	if len(seen) != 5 {
		t.Fatalf("the two workers own %d jobs in total, want 5", len(seen))
	}

	// Every job that was handed out is marked as running.
	for id := range seen {
		stored := loadJob(t, orm, id)
		if stored.Status != models.JobProcessing {
			t.Errorf("the job %d has the status %q, want %q", id, stored.Status, models.JobProcessing)
		}
	}
}

// TestPostgresConcurrentClaimGivesEachJobToOneWorker runs the claim against
// a live PostgreSQL server, because the claim is a read followed by an
// update and only a real server can show that two workers do not both end
// up owning the same job. It is skipped unless a server URL is provided.
func TestPostgresConcurrentClaimGivesEachJobToOneWorker(t *testing.T) {
	dsn := os.Getenv("WJ_TEST_POSTGRES_URL")
	if dsn == "" {
		t.Skip("PostgreSQL is not available in this environment; set WJ_TEST_POSTGRES_URL to run the postgres dialect tests")
	}

	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	handle, err := db.Open(dsn, log)
	if err != nil {
		t.Fatalf("open postgres database: %v", err)
	}
	t.Cleanup(func() { handle.Close() })
	if handle.Dialect != "postgres" {
		t.Fatalf("the test server is on the %q dialect", handle.Dialect)
	}
	q := NewQueue(handle.DB(), log)

	// The rows of the other tests are cleared away.
	if err := handle.DB().Exec("DELETE FROM jobs").Error; err != nil {
		t.Fatalf("clear the jobs table: %v", err)
	}
	for i := 0; i < 10; i++ {
		if _, err := q.Enqueue("media.thumbnail", 1, uint(i+1), nil, 0); err != nil {
			t.Fatalf("enqueue: %v", err)
		}
	}

	var mu sync.Mutex
	seen := map[uint]bool{}
	var wg sync.WaitGroup
	for w := 0; w < 4; w++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			for round := 0; round < 5; round++ {
				claimed, err := q.Claim(fmt.Sprintf("worker-%d", worker), 3)
				if err != nil {
					t.Errorf("claim: %v", err)
					return
				}
				mu.Lock()
				for _, job := range claimed {
					if seen[job.ID] {
						t.Errorf("the job %d was claimed by two workers", job.ID)
					}
					seen[job.ID] = true
				}
				mu.Unlock()
			}
		}(w)
	}
	wg.Wait()

	if len(seen) != 10 {
		t.Fatalf("the workers own %d jobs in total, want 10", len(seen))
	}
}
