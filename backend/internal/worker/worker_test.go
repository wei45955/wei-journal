package worker

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/ai"
	"github.com/wei/journal/backend/internal/db"
	"github.com/wei/journal/backend/internal/indexer"
	"github.com/wei/journal/backend/internal/jobs"
	"github.com/wei/journal/backend/internal/media"
	"github.com/wei/journal/backend/internal/models"
	"github.com/wei/journal/backend/internal/search"
)

// Job types that only exist for the tests.
const (
	testJobAlwaysFails = "test.always_fails"
	testJobSucceeds    = "test.succeeds"
	testJobUnknown     = "test.unknown_type"
)

// env is one isolated worker setup: a private database, a queue and a
// worker with the production handlers installed.
type env struct {
	t       *testing.T
	db      *gorm.DB
	queue   *jobs.Queue
	qw      *jobs.Worker
	worker  *Worker
	storage *media.Storage
	log     *slog.Logger
}

// newEnv builds an isolated worker environment. The provider decides what
// the AI handlers see.
func newEnv(t *testing.T, provider ai.Provider) *env {
	t.Helper()

	dir := t.TempDir()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))

	handle, err := db.Open("sqlite://"+filepath.Join(dir, "worker.db"), log)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = handle.Close() })

	orm := handle.DB()
	storage, err := media.NewStorage(filepath.Join(dir, "uploads"), filepath.Join(dir, "derived"), 8<<20)
	if err != nil {
		t.Fatalf("create storage: %v", err)
	}
	searchService := search.NewService(orm, handle.Dialect)
	idx := indexer.New(orm, searchService)
	queue := jobs.NewQueue(orm, log)

	w := New(Options{
		DB:          orm,
		Logger:      log,
		Storage:     storage,
		Provider:    provider,
		Indexer:     idx,
		VisionModel: "test-vision",
		TextModel:   "test-text",
	})
	qw := jobs.NewWorker(queue, log, 1, 20*time.Millisecond)
	w.Register(qw)

	return &env{
		t:       t,
		db:      orm,
		queue:   queue,
		qw:      qw,
		worker:  w,
		storage: storage,
		log:     log,
	}
}

// start runs the queue worker until the test ends.
func (e *env) start() {
	e.t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	e.t.Cleanup(func() {
		cancel()
		// Give the worker a moment to notice the cancellation so it does
		// not touch the database while it is being closed.
		time.Sleep(60 * time.Millisecond)
	})
	e.qw.Start(ctx)
}

// loadJob reads a job row back from the database.
func (e *env) loadJob(id uint) models.Job {
	e.t.Helper()
	var job models.Job
	if err := e.db.First(&job, id).Error; err != nil {
		e.t.Fatalf("load job %d: %v", id, err)
	}
	return job
}

// waitForJob waits until a job reaches the wanted status.
func (e *env) waitForJob(id uint, want string, timeout time.Duration) models.Job {
	e.t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		job := e.loadJob(id)
		if job.Status == want {
			return job
		}
		if time.Now().After(deadline) {
			e.t.Fatalf("job %d did not reach %q within %s (status %q, attempts %d, last error %q)",
				id, want, timeout, job.Status, job.Attempts, job.LastError)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// makeDue pretends that the exponential backoff of a job has elapsed.
func (e *env) makeDue(id uint) {
	e.t.Helper()
	if err := e.db.Model(&models.Job{}).Where("id = ?", id).
		Update("run_after", time.Now().UTC()).Error; err != nil {
		e.t.Fatalf("make job %d due: %v", id, err)
	}
}

// failingProvider is a model backend that is configured but always fails.
type failingProvider struct{}

func (failingProvider) Name() string    { return "failing" }
func (failingProvider) Available() bool { return true }

func (failingProvider) DescribeImage(ctx context.Context, image []byte, mime string, opts ai.DescribeOptions) (*ai.ImageDescription, error) {
	return nil, errors.New("model backend is down")
}

func (failingProvider) SummarizeText(ctx context.Context, text string, opts ai.SummarizeOptions) (*ai.TextSummary, error) {
	return nil, errors.New("model backend is down")
}

func (failingProvider) PolishText(ctx context.Context, text string, opts ai.PolishOptions) (string, error) {
	return "", errors.New("model backend is down")
}

// TestWorkerRunsARegisteredJobAndCompletesIt checks that a registered
// handler is executed and that the job is marked as completed afterwards.
func TestWorkerRunsARegisteredJobAndCompletesIt(t *testing.T) {
	e := newEnv(t, ai.NewDisabledProvider())

	asset := models.MediaAsset{
		UserID:       1,
		Kind:         models.MediaImage,
		OriginalName: "sunset.png",
		StorageKey:   "sunset-key",
		StoredPath:   "1/ab/cd/sunset.png",
		MimeType:     "image/png",
		Size:         1024,
	}
	if err := e.db.Create(&asset).Error; err != nil {
		t.Fatalf("create media asset: %v", err)
	}

	job, err := e.queue.Enqueue(jobs.TypeDescribeImage, 1, asset.ID, map[string]any{"mediaId": asset.ID}, 0)
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}

	e.start()

	finished := e.waitForJob(job.ID, models.JobCompleted, 5*time.Second)
	if finished.Attempts != 1 {
		t.Errorf("attempts = %d, want 1", finished.Attempts)
	}
	if finished.LastError != "" {
		t.Errorf("last error = %q, want none", finished.LastError)
	}

	// The handler ran for the right job: the derived metadata is attached to
	// the media asset the job pointed at.
	var meta models.AIMetadata
	if err := e.db.Where("media_id = ? AND kind = ?", asset.ID, "image").First(&meta).Error; err != nil {
		t.Fatalf("load ai metadata: %v", err)
	}
	if meta.MediaID == nil || *meta.MediaID != asset.ID {
		t.Errorf("media id = %v, want %d", meta.MediaID, asset.ID)
	}
	if meta.UserID != 1 {
		t.Errorf("user id = %d, want 1", meta.UserID)
	}
	if meta.Status != models.AIUnavailable {
		t.Errorf("ai status = %q, want %q because no model backend is configured", meta.Status, models.AIUnavailable)
	}

	// The user's own data is untouched by the background job.
	var stored models.MediaAsset
	if err := e.db.First(&stored, asset.ID).Error; err != nil {
		t.Fatalf("load media asset: %v", err)
	}
	if stored.StoredPath != asset.StoredPath || stored.DerivedPath != "" || stored.PreviewPath != "" {
		t.Errorf("the media asset was modified by the job: %+v", stored)
	}
}

// TestWorkerPassesTheClaimedJobToTheHandler checks that a handler receives
// exactly the job that was claimed for it.
func TestWorkerPassesTheClaimedJobToTheHandler(t *testing.T) {
	e := newEnv(t, ai.NewDisabledProvider())

	seen := make(chan models.Job, 1)
	e.qw.Register(testJobSucceeds, func(ctx context.Context, job models.Job) error {
		select {
		case seen <- job:
		default:
		}
		return nil
	})

	job, err := e.queue.Enqueue(testJobSucceeds, 5, 99, map[string]any{"hello": "world"}, 0)
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}

	e.start()

	select {
	case handled := <-seen:
		if handled.ID != job.ID {
			t.Errorf("handled job %d, want %d", handled.ID, job.ID)
		}
		if handled.Type != testJobSucceeds {
			t.Errorf("type = %q, want %q", handled.Type, testJobSucceeds)
		}
		if handled.UserID != 5 {
			t.Errorf("user id = %d, want 5", handled.UserID)
		}
		if handled.TargetID != 99 {
			t.Errorf("target id = %d, want 99", handled.TargetID)
		}
		if !strings.Contains(handled.PayloadJSON, "hello") {
			t.Errorf("payload = %q, want it to carry the enqueued payload", handled.PayloadJSON)
		}
		if handled.Attempts != 1 {
			t.Errorf("attempts = %d, want 1", handled.Attempts)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the handler was never called")
	}

	e.waitForJob(job.ID, models.JobCompleted, 5*time.Second)
}

// TestWorkerRetriesAJobThatFails checks that a failing job is retried until
// the attempt limit is reached, that it is then given up on and that the
// worker keeps running afterwards.
func TestWorkerRetriesAJobThatFails(t *testing.T) {
	e := newEnv(t, ai.NewDisabledProvider())

	var (
		mu    sync.Mutex
		calls int
	)
	e.qw.Register(testJobAlwaysFails, func(ctx context.Context, job models.Job) error {
		mu.Lock()
		calls++
		mu.Unlock()
		return errors.New("the handler exploded")
	})

	job, err := e.queue.Enqueue(testJobAlwaysFails, 1, 77, nil, 0)
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	limit := job.MaxAttempts
	if limit <= 0 {
		t.Fatalf("the job has no attempt limit (%d), cannot test the limit", limit)
	}

	e.start()

	deadline := time.Now().Add(10 * time.Second)
	for {
		current := e.loadJob(job.ID)
		if current.Status == models.JobFailed {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("the job was not given up on within the timeout (status %q, attempts %d)",
				current.Status, current.Attempts)
		}
		// Pretend the exponential backoff has already elapsed so the test
		// does not have to wait for the real delay.
		e.makeDue(job.ID)
		time.Sleep(20 * time.Millisecond)
	}

	mu.Lock()
	got := calls
	mu.Unlock()
	if got != limit {
		t.Errorf("the handler ran %d times, want %d", got, limit)
	}

	failed := e.loadJob(job.ID)
	if failed.Attempts != limit {
		t.Errorf("attempts = %d, want %d", failed.Attempts, limit)
	}
	if !strings.Contains(failed.LastError, "the handler exploded") {
		t.Errorf("last error = %q, want the cause of the failure", failed.LastError)
	}

	// The worker did not crash: it still processes the next job.
	ok, err := e.queue.Enqueue(jobs.TypeCleanupOrphans, 1, 78, nil, 0)
	if err != nil {
		t.Fatalf("enqueue the follow up job: %v", err)
	}
	finished := e.waitForJob(ok.ID, models.JobCompleted, 5*time.Second)
	if finished.LastError != "" {
		t.Errorf("last error = %q, want none", finished.LastError)
	}
}

// TestWorkerIgnoresUnknownJobTypes checks that a job without a handler does
// not crash the worker and is not retried in a tight loop.
func TestWorkerIgnoresUnknownJobTypes(t *testing.T) {
	e := newEnv(t, ai.NewDisabledProvider())

	job, err := e.queue.Enqueue(testJobUnknown, 1, 88, nil, 0)
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}

	e.start()

	// The worker marks the job as failed instead of running it. The job is
	// scheduled again with the regular backoff, so it is not picked up in a
	// tight loop.
	deadline := time.Now().Add(5 * time.Second)
	var current models.Job
	for {
		current = e.loadJob(job.ID)
		if current.LastError != "" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the job with an unknown type was never handled")
		}
		time.Sleep(10 * time.Millisecond)
	}

	if !strings.Contains(current.LastError, "no handler registered") {
		t.Errorf("last error = %q, want it to name the missing handler", current.LastError)
	}
	if current.Attempts != 1 {
		t.Errorf("attempts = %d, want 1", current.Attempts)
	}
	if current.Status != models.JobPending {
		t.Errorf("status = %q, want %q because the job is retried with a backoff", current.Status, models.JobPending)
	}
	if !current.RunAfter.After(time.Now().UTC()) {
		t.Errorf("run after = %v, want the retry to be scheduled in the future", current.RunAfter)
	}

	// The worker survived the unknown job type and keeps working.
	ok, err := e.queue.Enqueue(jobs.TypeCleanupOrphans, 1, 89, nil, 0)
	if err != nil {
		t.Fatalf("enqueue the follow up job: %v", err)
	}
	finished := e.waitForJob(ok.ID, models.JobCompleted, 5*time.Second)
	if finished.Attempts != 1 {
		t.Errorf("attempts = %d, want 1", finished.Attempts)
	}
}

// TestAFailingBackgroundJobNeverFailsTheEntrySave checks that a failing
// background job is contained by the worker: the job is given up on, the
// entry it was about is untouched and the worker keeps running.
//
// The guarantee of the product spec, that a failed AI job never makes the
// save of an entry fail, is enforced in the API layer where the entry is
// written. What is observable here is that a job error never escapes the
// worker and never damages the data the job was about.
func TestAFailingBackgroundJobNeverFailsTheEntrySave(t *testing.T) {
	e := newEnv(t, ai.NewDisabledProvider())

	entry := models.Entry{
		UserID:       1,
		Title:        "A day in the city",
		EventTime:    time.Now().UTC(),
		EventDate:    "2026-01-02",
		Timezone:     "UTC",
		DocumentJSON: "{}",
		DrawingJSON:  "{}",
		PlainText:    "the story of the day",
		WordCount:    5,
	}
	if err := e.db.Create(&entry).Error; err != nil {
		t.Fatalf("create entry: %v", err)
	}

	e.qw.Register(testJobAlwaysFails, func(ctx context.Context, job models.Job) error {
		return errors.New("the background job exploded")
	})

	failing, err := e.queue.Enqueue(testJobAlwaysFails, 1, entry.ID, nil, 0)
	if err != nil {
		t.Fatalf("enqueue the failing job: %v", err)
	}
	healthy, err := e.queue.Enqueue(jobs.TypeCleanupOrphans, 1, entry.ID, nil, 0)
	if err != nil {
		t.Fatalf("enqueue the healthy job: %v", err)
	}

	e.start()

	deadline := time.Now().Add(10 * time.Second)
	for {
		current := e.loadJob(failing.ID)
		if current.Status == models.JobFailed {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("the failing job was not given up on within the timeout (status %q, attempts %d)",
				current.Status, current.Attempts)
		}
		e.makeDue(failing.ID)
		time.Sleep(20 * time.Millisecond)
	}

	// The failing job is contained: it is recorded as failed.
	failed := e.loadJob(failing.ID)
	if failed.Status != models.JobFailed {
		t.Errorf("status = %q, want %q", failed.Status, models.JobFailed)
	}
	if !strings.Contains(failed.LastError, "the background job exploded") {
		t.Errorf("last error = %q, want the cause of the failure", failed.LastError)
	}

	// The other job still succeeds, so the worker did not stop.
	e.waitForJob(healthy.ID, models.JobCompleted, 5*time.Second)

	// The entry the job was about is untouched.
	var stored models.Entry
	if err := e.db.First(&stored, entry.ID).Error; err != nil {
		t.Fatalf("load entry: %v", err)
	}
	if stored.Title != entry.Title {
		t.Errorf("title = %q, want %q", stored.Title, entry.Title)
	}
	if stored.PlainText != entry.PlainText {
		t.Errorf("plain text = %q, want %q", stored.PlainText, entry.PlainText)
	}
	if stored.WordCount != entry.WordCount {
		t.Errorf("word count = %d, want %d", stored.WordCount, entry.WordCount)
	}
}

// TestAFailingAIJobLeavesTheEntryUntouched checks the same guarantee for
// the real AI handler: a model backend that fails is recorded on the
// derived metadata, the job is completed and the entry of the user is left
// exactly as it was written.
func TestAFailingAIJobLeavesTheEntryUntouched(t *testing.T) {
	e := newEnv(t, failingProvider{})

	entry := models.Entry{
		UserID:       1,
		Title:        "A day in the city",
		EventTime:    time.Now().UTC(),
		EventDate:    "2026-01-02",
		Timezone:     "UTC",
		DocumentJSON: "{}",
		DrawingJSON:  "{}",
		PlainText:    "the story of the day",
		WordCount:    5,
	}
	if err := e.db.Create(&entry).Error; err != nil {
		t.Fatalf("create entry: %v", err)
	}
	settings := models.UserSettings{UserID: 1, Language: "en", Timezone: "UTC", AIEnabled: true}
	if err := e.db.Create(&settings).Error; err != nil {
		t.Fatalf("create user settings: %v", err)
	}

	job, err := e.queue.Enqueue(jobs.TypeSummarizeText, 1, entry.ID, nil, 0)
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}

	e.start()

	finished := e.waitForJob(job.ID, models.JobCompleted, 5*time.Second)
	if finished.LastError != "" {
		t.Errorf("last error = %q, want none: the model failure must not fail the job", finished.LastError)
	}

	var meta models.AIMetadata
	if err := e.db.Where("entry_id = ? AND kind = ?", entry.ID, "text").First(&meta).Error; err != nil {
		t.Fatalf("load ai metadata: %v", err)
	}
	if meta.Status != models.AIFailed {
		t.Errorf("ai status = %q, want %q", meta.Status, models.AIFailed)
	}
	if !strings.Contains(meta.Error, "model backend is down") {
		t.Errorf("ai error = %q, want the cause of the failure", meta.Error)
	}
	if meta.Summary != "" {
		t.Errorf("summary = %q, want it to be empty", meta.Summary)
	}

	var stored models.Entry
	if err := e.db.First(&stored, entry.ID).Error; err != nil {
		t.Fatalf("load entry: %v", err)
	}
	if stored.PlainText != entry.PlainText || stored.Title != entry.Title {
		t.Errorf("the entry was modified by the failing job: %+v", stored)
	}
}

// TestEncodeListKeepsTheListFormat checks the small helper that stores the
// derived keywords.
func TestEncodeListKeepsTheListFormat(t *testing.T) {
	if got := encodeList(nil); got != "[]" {
		t.Errorf("encodeList(nil) = %q, want %q", got, "[]")
	}
	if got := encodeList([]string{"a", "b"}); got != `["a","b"]` {
		t.Errorf("encodeList = %q, want %q", got, `["a","b"]`)
	}
}
