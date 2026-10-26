-- When a task was last submitted for review, so reviews that sit too long can be chased, and a
-- log so the reminder goes out at most once a day per task.
ALTER TABLE items ADD COLUMN review_requested_at TEXT;
UPDATE items SET review_requested_at = updated_at WHERE status = 'review';

CREATE TABLE review_reminder_log (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  day     TEXT NOT NULL,
  PRIMARY KEY (item_id, day)
);

DROP VIEW live_items;
CREATE VIEW live_items AS SELECT * FROM items WHERE deleted_at IS NULL;
