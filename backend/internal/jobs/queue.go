// Package jobs implements a durable, database backed work queue. Jobs survive
// restarts, are claimed atomically and are retried with a bounded attempt
// count.
package jobs

import (
	"context"
	cryptorand "crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"time"

	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/models"
)

// Job types handled by the application.
const (
	TypeDescribeImage  = "ai.describe_image"
	TypeSummarizeText  = "ai.summarize_text"
	TypeBuildThumbnail = "media.thumbnail"
	TypeCleanupOrphans = "cleanup.orphans"
)

// Queue persists and hands out work.
type Queue struct {
	db  *gorm.DB
	log *slog.Logger
}

// NewQueue builds a queue.
func NewQueue(db *gorm.DB, log *slog.Logger) *Queue {
	return &Queue{db: db, log: log}
}

// Enqueue schedules a job. When a job of the same type and target is already
// pending it is reused instead of piling up duplicates.
func (q *Queue) Enqueue(jobType string, userID, targetID uint, payload any, delay time.Duration) (*models.Job, error) {
	if delay < 0 {
		delay = 0
	}
	body := ""
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		body = string(b)
	}

	now := time.Now().UTC()
	var existing models.Job
	err := q.db.Where(
		"type = ? AND target_id = ? AND user_id = ? AND status IN ?",
		jobType, targetID, userID, []string{models.JobPending, models.JobProcessing},
	).First(&existing).Error
	if err == nil {
		return &existing, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	job := models.Job{
		UserID:      userID,
		Type:        jobType,
		TargetID:    targetID,
		Status:      models.JobPending,
		MaxAttempts: 3,
		RunAfter:    now.Add(delay),
		PayloadJSON: body,
	}
	if err := q.db.Create(&job).Error; err != nil {
		return nil, err
	}
	return &job, nil
}

// EnqueueUnique schedules a job unless one already exists for the same
// target, which is used when a user re-saves an entry.
func (q *Queue) EnqueueUnique(jobType string, userID, targetID uint, payload any) (*models.Job, error) {
	return q.Enqueue(jobType, userID, targetID, payload, 0)
}

// Claim atomically takes up to n due jobs and marks them as running.
func (q *Queue) Claim(workerID string, n int) ([]models.Job, error) {
	var claimed []models.Job
	// The claim is marked with a token that is unique to this call, so the
	// rows that are read back are exactly the rows this call took.
	token := claimToken(workerID)
	err := q.db.Transaction(func(tx *gorm.DB) error {
		now := time.Now().UTC()
		var rows []models.Job
		if err := tx.Where("status = ? AND run_after <= ?", models.JobPending, now).
			Order("run_after ASC, id ASC").Limit(n).Find(&rows).Error; err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}
		ids := make([]uint, 0, len(rows))
		for _, r := range rows {
			ids = append(ids, r.ID)
		}
		// The guard on the status is what makes the update the claim: a row
		// that another worker took in the meantime is no longer pending and
		// is left alone.
		if err := tx.Model(&models.Job{}).
			Where("id IN ? AND status = ?", ids, models.JobPending).
			Updates(map[string]any{
				"status":     models.JobProcessing,
				"locked_at":  now,
				"locked_by":  token,
				"attempts":   gorm.Expr("attempts + 1"),
				"updated_at": now,
			}).Error; err != nil {
			return err
		}
		if err := tx.Where("id IN ? AND locked_by = ?", ids, token).Find(&claimed).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return claimed, nil
}

// claimToken marks a claim with a value that is unique to the call, so that
// two workers which selected the same job at the same time do not both
// believe they own it.
func claimToken(workerID string) string {
	var b [8]byte
	if _, err := cryptorand.Read(b[:]); err != nil {
		return workerID
	}
	id := workerID
	if len(id) > 40 {
		id = id[:40]
	}
	return id + ":" + hex.EncodeToString(b[:])
}

// Complete marks a job as done.
func (q *Queue) Complete(id uint) error {
	return q.db.Model(&models.Job{}).Where("id = ?", id).Updates(map[string]any{
		"status":     models.JobCompleted,
		"locked_at":  nil,
		"last_error": "",
		"updated_at": time.Now().UTC(),
	}).Error
}

// Fail records a failure. When attempts remain the job is scheduled again
// with an exponential backoff, otherwise it is marked as failed.
func (q *Queue) Fail(id uint, cause error) error {
	var job models.Job
	if err := q.db.First(&job, id).Error; err != nil {
		return err
	}
	msg := ""
	if cause != nil {
		msg = cause.Error()
	}
	if len(msg) > 2000 {
		msg = msg[:2000]
	}
	now := time.Now().UTC()
	updates := map[string]any{
		"last_error": msg,
		"updated_at": now,
	}
	if job.Attempts >= job.MaxAttempts {
		updates["status"] = models.JobFailed
		updates["locked_at"] = nil
	} else {
		updates["status"] = models.JobPending
		updates["locked_at"] = nil
		updates["run_after"] = now.Add(backoff(job.Attempts))
	}
	return q.db.Model(&models.Job{}).Where("id = ?", id).Updates(updates).Error
}

func backoff(attempts int) time.Duration {
	base := time.Duration(1<<uint(attempts)) * 15 * time.Second
	if base > 30*time.Minute {
		base = 30 * time.Minute
	}
	// Add jitter so a burst of failures does not retry in lockstep.
	jitter := time.Duration(rand.Int63n(int64(base/4) + 1))
	return base + jitter
}

// RecoverStale requeues jobs that were interrupted by a restart.
func (q *Queue) RecoverStale(olderThan time.Duration) (int64, error) {
	cutoff := time.Now().UTC().Add(-olderThan)
	result := q.db.Model(&models.Job{}).
		Where("status = ? AND (locked_at IS NULL OR locked_at < ?)", models.JobProcessing, cutoff).
		Updates(map[string]any{
			"status":     models.JobPending,
			"locked_at":  nil,
			"locked_by":  "",
			"run_after":  time.Now().UTC(),
			"updated_at": time.Now().UTC(),
		})
	return result.RowsAffected, result.Error
}

// PendingCount reports how many jobs are waiting.
func (q *Queue) PendingCount() (int64, error) {
	var n int64
	err := q.db.Model(&models.Job{}).Where("status = ?", models.JobPending).Count(&n).Error
	return n, err
}

// Handler processes a claimed job.
type Handler func(ctx context.Context, job models.Job) error

// Worker consumes jobs from a queue.
type Worker struct {
	queue    *Queue
	log      *slog.Logger
	handlers map[string]Handler
	workers  int
	interval time.Duration
	id       string
}

// NewWorker builds a worker.
func NewWorker(queue *Queue, log *slog.Logger, workers int, interval time.Duration) *Worker {
	if workers <= 0 {
		workers = 1
	}
	if interval <= 0 {
		interval = 2 * time.Second
	}
	return &Worker{
		queue:    queue,
		log:      log,
		handlers: map[string]Handler{},
		workers:  workers,
		interval: interval,
		id:       fmt.Sprintf("worker-%d", time.Now().UnixNano()),
	}
}

// Register installs a handler for a job type.
func (w *Worker) Register(jobType string, h Handler) { w.handlers[jobType] = h }

// Start runs the worker until the context is cancelled.
func (w *Worker) Start(ctx context.Context) {
	if n, err := w.queue.RecoverStale(5 * time.Minute); err == nil && n > 0 {
		w.log.Info("requeued stale jobs", "count", n)
	}
	for i := 0; i < w.workers; i++ {
		go w.loop(ctx)
	}
}

func (w *Worker) loop(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.drain(ctx)
		}
	}
}

func (w *Worker) drain(ctx context.Context) {
	for {
		claimed, err := w.queue.Claim(w.id, 4)
		if err != nil {
			w.log.Error("claim jobs", "error", err)
			return
		}
		if len(claimed) == 0 {
			return
		}
		for _, job := range claimed {
			w.run(ctx, job)
		}
	}
}

func (w *Worker) run(ctx context.Context, job models.Job) {
	handler, ok := w.handlers[job.Type]
	if !ok {
		w.log.Warn("no handler for job type", "type", job.Type, "job", job.ID)
		w.queue.Fail(job.ID, fmt.Errorf("no handler registered for %s", job.Type))
		return
	}
	jobCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	start := time.Now()
	err := handler(jobCtx, job)
	if err != nil {
		w.log.Warn("job failed", "type", job.Type, "job", job.ID, "attempts", job.Attempts, "error", err)
		w.queue.Fail(job.ID, err)
		return
	}
	if err := w.queue.Complete(job.ID); err != nil {
		w.log.Error("complete job", "job", job.ID, "error", err)
	}
	w.log.Debug("job done", "type", job.Type, "job", job.ID, "duration", time.Since(start))
}
