// Package httpx contains the shared HTTP response helpers so every endpoint
// speaks the same JSON dialect and never leaks internal details.
package httpx

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// Error codes returned to clients.
const (
	CodeValidation   = "validation_error"
	CodeUnauthorized = "unauthorized"
	CodeForbidden    = "forbidden"
	CodeNotFound     = "not_found"
	CodeConflict     = "conflict"
	CodeRateLimit    = "rate_limited"
	CodeServer       = "internal_error"
	CodePayload      = "payload_too_large"
	// CodeSessionExpired marks a session that is still valid but has been
	// idle for too long. The client can renew it and retry, which is
	// different from a session that is gone for good.
	CodeSessionExpired = "session_expired"
)

// Error is a client safe error carrying a machine readable code.
type Error struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Details map[string]string `json:"details,omitempty"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

// NewError builds a client safe error.
func NewError(code int, errCode, message string) *Error {
	return &Error{Code: errCode, Message: message}
}

// WithDetail attaches a field level detail to the error.
func (e *Error) WithDetail(field, message string) *Error {
	if e.Details == nil {
		e.Details = map[string]string{}
	}
	e.Details[field] = message
	return e
}

type envelope struct {
	Data  any    `json:"data,omitempty"`
	Error *Error `json:"error,omitempty"`
	Meta  *Meta  `json:"meta,omitempty"`
}

// Meta carries pagination and other response metadata.
type Meta struct {
	NextCursor string `json:"nextCursor,omitempty"`
	HasMore    bool   `json:"hasMore"`
	Total      *int64 `json:"total,omitempty"`
	Limit      int    `json:"limit,omitempty"`
}

// OK writes a 200 response with a data payload.
func OK(c *gin.Context, data any) { respond(c, http.StatusOK, data, nil) }

// Created writes a 201 response.
func Created(c *gin.Context, data any) { respond(c, http.StatusCreated, data, nil) }

// NoContent writes a 204 response.
func NoContent(c *gin.Context) { c.Status(http.StatusNoContent) }

// WithMeta writes a 200 response with pagination metadata.
func WithMeta(c *gin.Context, data any, meta Meta) { respond(c, http.StatusOK, data, &meta) }

// Fail writes an error response.
func Fail(c *gin.Context, status int, err *Error) {
	if err == nil {
		err = &Error{Code: CodeServer, Message: "unexpected error"}
	}
	c.AbortWithStatusJSON(status, envelope{Error: err})
}

// ValidationError writes a 400 with field details.
func ValidationError(c *gin.Context, message string, details map[string]string) {
	Fail(c, http.StatusBadRequest, (&Error{Code: CodeValidation, Message: message, Details: details}))
}

// Unauthorized writes a 401.
func Unauthorized(c *gin.Context, message string) {
	if message == "" {
		message = "authentication required"
	}
	Fail(c, http.StatusUnauthorized, &Error{Code: CodeUnauthorized, Message: message})
}

// Forbidden writes a 403.
func Forbidden(c *gin.Context, message string) {
	if message == "" {
		message = "not allowed"
	}
	Fail(c, http.StatusForbidden, &Error{Code: CodeForbidden, Message: message})
}

// NotFound writes a 404.
func NotFound(c *gin.Context, message string) {
	if message == "" {
		message = "not found"
	}
	Fail(c, http.StatusNotFound, &Error{Code: CodeNotFound, Message: message})
}

// Conflict writes a 409.
func Conflict(c *gin.Context, message string) {
	Fail(c, http.StatusConflict, &Error{Code: CodeConflict, Message: message})
}

// Internal logs the underlying error and returns a generic 500.
func Internal(c *gin.Context, log *slog.Logger, err error, context string) {
	log.Error("request failed", "context", context, "error", err.Error())
	Fail(c, http.StatusInternalServerError, &Error{Code: CodeServer, Message: "internal server error"})
}

func respond(c *gin.Context, status int, data any, meta *Meta) {
	c.JSON(status, envelope{Data: data, Meta: meta})
}

// ErrorStatus maps an error to a status code and client error.
func ErrorStatus(err error) (int, *Error) {
	var e *Error
	if errors.As(err, &e) {
		switch e.Code {
		case CodeValidation:
			return http.StatusBadRequest, e
		case CodeUnauthorized:
			return http.StatusUnauthorized, e
		case CodeForbidden:
			return http.StatusForbidden, e
		case CodeNotFound:
			return http.StatusNotFound, e
		case CodeConflict:
			return http.StatusConflict, e
		case CodeRateLimit:
			return http.StatusTooManyRequests, e
		case CodePayload:
			return http.StatusRequestEntityTooLarge, e
		}
	}
	return http.StatusInternalServerError, &Error{Code: CodeServer, Message: "internal server error"}
}

// QueryInt reads a positive integer query parameter.
func QueryInt(c *gin.Context, key string, def int) int {
	raw := c.Query(key)
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return def
	}
	return n
}

// QueryUint reads a positive unsigned integer query parameter.
func QueryUint(c *gin.Context, key string, def uint) uint {
	raw := c.Query(key)
	if raw == "" {
		return def
	}
	n, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return def
	}
	return uint(n)
}

// QueryUintList reads a comma separated list of unsigned integers.
func QueryUintList(c *gin.Context, key string) []uint {
	raw := strings.TrimSpace(c.Query(key))
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]uint, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if n, err := strconv.ParseUint(p, 10, 64); err == nil {
			out = append(out, uint(n))
		}
	}
	return out
}

// PathUint reads a uint path parameter.
func PathUint(c *gin.Context, key string) (uint, bool) {
	n, err := strconv.ParseUint(c.Param(key), 10, 64)
	if err != nil || n == 0 {
		return 0, false
	}
	return uint(n), true
}
