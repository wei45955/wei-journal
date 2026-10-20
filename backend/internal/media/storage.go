// Package media stores uploaded files, derives thumbnails and extracts
// technical metadata. Originals are always kept untouched; every derived
// artefact lives in a separate tree.
package media

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

// Storage writes files into two trees: originals and derived assets.
type Storage struct {
	uploadDir  string
	derivedDir string
	maxBytes   int64
}

// NewStorage prepares the storage trees.
func NewStorage(uploadDir, derivedDir string, maxBytes int64) (*Storage, error) {
	for _, dir := range []string{uploadDir, derivedDir} {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return nil, fmt.Errorf("create storage directory %s: %w", dir, err)
		}
	}
	return &Storage{uploadDir: uploadDir, derivedDir: derivedDir, maxBytes: maxBytes}, nil
}

// UploadDir returns the root of the original media tree.
func (s *Storage) UploadDir() string { return s.uploadDir }

// DerivedDir returns the root of the derived asset tree.
func (s *Storage) DerivedDir() string { return s.derivedDir }

// SavedFile describes a file that has been written to disk.
type SavedFile struct {
	StorageKey   string
	StoredPath   string // relative to the upload root
	AbsolutePath string
	Size         int64
	Hash         string
}

// Save writes the content of r into the upload tree under a server generated
// key. The caller never influences the resulting path.
func (s *Storage) Save(userID uint, r io.Reader, ext string) (*SavedFile, error) {
	if !validExtension(ext) {
		return nil, fmt.Errorf("invalid file extension %q", ext)
	}
	key, err := randomKey()
	if err != nil {
		return nil, err
	}
	rel := filepath.Join(fmt.Sprintf("%d", userID), key[:2], key[2:4], key+ext)
	abs := filepath.Join(s.uploadDir, rel)
	if err := os.MkdirAll(filepath.Dir(abs), 0o750); err != nil {
		return nil, err
	}

	f, err := os.OpenFile(abs, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o640)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	hasher := sha256.New()
	limited := io.LimitReader(r, s.maxBytes+1)
	written, err := io.Copy(io.MultiWriter(f, hasher), limited)
	if err != nil {
		os.Remove(abs)
		return nil, err
	}
	if written > s.maxBytes {
		os.Remove(abs)
		return nil, ErrTooLarge
	}
	return &SavedFile{
		StorageKey:   key,
		StoredPath:   filepath.ToSlash(rel),
		AbsolutePath: abs,
		Size:         written,
		Hash:         hex.EncodeToString(hasher.Sum(nil)),
	}, nil
}

// validExtension accepts a short suffix of letters and digits only, so that
// an extension can never move the file into another directory.
func validExtension(ext string) bool {
	if ext == "" {
		return true
	}
	if len(ext) > 12 || !strings.HasPrefix(ext, ".") {
		return false
	}
	for _, r := range ext[1:] {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}

// DerivedPath builds an absolute path inside the derived tree, honouring the
// user id and a server generated name.
func (s *Storage) DerivedPath(userID uint, name string) (string, string, error) {
	if !validName(name) {
		return "", "", fmt.Errorf("invalid derived name %q", name)
	}
	rel := filepath.Join(fmt.Sprintf("%d", userID), name)
	abs := filepath.Join(s.derivedDir, rel)
	if err := os.MkdirAll(filepath.Dir(abs), 0o750); err != nil {
		return "", "", err
	}
	return filepath.ToSlash(rel), abs, nil
}

// validName accepts a single file name without a directory part, so that a
// name can never point outside the derived tree.
func validName(name string) bool {
	if name == "" || name == "." || name == ".." {
		return false
	}
	if strings.ContainsAny(name, `/\`) || strings.Contains(name, "..") {
		return false
	}
	return true
}

// Absolute resolves a stored relative path and guarantees it stays inside the
// upload tree. It rejects traversal attempts.
func (s *Storage) Absolute(storedPath string) (string, error) {
	return s.resolve(s.uploadDir, storedPath)
}

// AbsoluteDerived resolves a derived relative path inside the derived tree.
func (s *Storage) AbsoluteDerived(storedPath string) (string, error) {
	return s.resolve(s.derivedDir, storedPath)
}

func (s *Storage) resolve(root, rel string) (string, error) {
	if rel == "" {
		return "", errors.New("empty path")
	}
	cleaned := filepath.Clean(filepath.FromSlash(rel))
	if filepath.IsAbs(cleaned) || strings.HasPrefix(cleaned, "..") {
		return "", errors.New("invalid path")
	}
	abs := filepath.Join(root, cleaned)
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	absPath, err := filepath.Abs(abs)
	if err != nil {
		return "", err
	}
	if absPath != rootAbs && !strings.HasPrefix(absPath, rootAbs+string(os.PathSeparator)) {
		return "", errors.New("path escapes storage root")
	}
	return absPath, nil
}

// Remove deletes a file and prunes the now empty directories it leaves.
func (s *Storage) Remove(root, rel string) error {
	abs, err := s.resolve(root, rel)
	if err != nil {
		return err
	}
	if err := os.Remove(abs); err != nil && !os.IsNotExist(err) {
		return err
	}
	pruneEmptyDirs(root, filepath.Dir(abs))
	return nil
}

// RemoveUpload deletes an original file.
func (s *Storage) RemoveUpload(rel string) error {
	return s.Remove(s.uploadDir, rel)
}

// RemoveDerived deletes a derived file.
func (s *Storage) RemoveDerived(rel string) error {
	return s.Remove(s.derivedDir, rel)
}

func pruneEmptyDirs(root, dir string) {
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return
	}
	for {
		abs, err := filepath.Abs(dir)
		if err != nil || abs == rootAbs {
			return
		}
		if !strings.HasPrefix(abs, rootAbs+string(os.PathSeparator)) {
			return
		}
		entries, err := os.ReadDir(abs)
		if err != nil || len(entries) > 0 {
			return
		}
		if err := os.Remove(abs); err != nil {
			return
		}
		dir = filepath.Dir(abs)
	}
}

func randomKey() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// ErrTooLarge is returned when an upload exceeds the configured limit.
var ErrTooLarge = errors.New("upload exceeds the maximum allowed size")
