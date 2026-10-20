-- The compression of the uploaded images and the picture that leads an
-- entry in the timeline.
--
-- The compression is done in the browser, so that a photograph taken on a
-- phone reaches the server in a shape every device can read and store. The
-- settings live on the account, so the choice survives a reload and a new
-- device.
--
-- The cover picture is the one shown first in the timeline when an entry
-- carries several photographs.

ALTER TABLE user_settings ADD COLUMN compress_images BOOLEAN NOT NULL DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN image_quality INTEGER NOT NULL DEFAULT 80;
ALTER TABLE user_settings ADD COLUMN image_max_dimension INTEGER NOT NULL DEFAULT 2048;

ALTER TABLE entries ADD COLUMN cover_media_id INTEGER;
CREATE INDEX idx_entries_cover ON entries (cover_media_id);
