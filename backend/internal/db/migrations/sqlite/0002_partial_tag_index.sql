-- Make the tag name uniqueness index partial.
--
-- Tags are soft deleted, so a name that was used before must be reusable.
-- The index used to cover soft deleted rows as well, which made creating a
-- tag with a recycled name fail with a unique constraint violation.

DROP INDEX idx_tags_user_norm;
CREATE UNIQUE INDEX idx_tags_user_norm ON tags (user_id, normalized_name) WHERE deleted_at IS NULL;
