-- Trash: deleting a task moves it (and its subitems) to the board's trash for 30 days, where it
-- can be restored. Reads go through live_items, which leaves trashed tasks out; the hourly job
-- purges anything trashed more than 30 days ago (files included).
ALTER TABLE items ADD COLUMN deleted_at TEXT;
ALTER TABLE items ADD COLUMN deleted_by TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX items_deleted ON items (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE VIEW live_items AS SELECT * FROM items WHERE deleted_at IS NULL;

-- The Blue Alliance: events imported from TBA keep their event key, so re-importing updates
-- them instead of adding duplicates, and the Season page can show live rank and record.
ALTER TABLE events ADD COLUMN tba_key TEXT;
CREATE UNIQUE INDEX events_tba_key ON events (tba_key) WHERE tba_key IS NOT NULL;
