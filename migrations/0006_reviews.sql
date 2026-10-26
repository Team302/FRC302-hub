-- Reviews: a reviewer per task, an approve / request-changes step, and an opt-in rule per board
-- that only the reviewer (or a lead or mentor) can mark a task Done.
ALTER TABLE items ADD COLUMN reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN approved_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN approved_at TEXT;
CREATE INDEX items_reviewer ON items (reviewer_id, status) WHERE reviewer_id IS NOT NULL;

ALTER TABLE boards ADD COLUMN require_approval INTEGER NOT NULL DEFAULT 0;
-- New tasks in a group get this reviewer unless one is picked.
ALTER TABLE board_groups ADD COLUMN default_reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- The Reviewer column starts hidden on existing boards; turning on approvals shows it.
UPDATE boards SET hidden_builtins = json_insert(hidden_builtins, '$[#]', 'reviewer')
 WHERE NOT EXISTS (SELECT 1 FROM json_each(boards.hidden_builtins) WHERE value = 'reviewer');

-- Re-create the view so it picks up the new columns on every SQLite version.
DROP VIEW live_items;
CREATE VIEW live_items AS SELECT * FROM items WHERE deleted_at IS NULL;
