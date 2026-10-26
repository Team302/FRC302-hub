-- Equipment: the team's tools, laptops, spares and safety gear, where they live, and who has them.
-- One row can stand for a bin of identical things (quantity > 1); loans take some of them out.
-- An item's available count is quantity minus the quantity on its open loans (returned_at IS NULL).
CREATE TABLE equipment (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  asset_tag  TEXT,                       -- optional sticker number; unique (ignoring case) when set
  category   TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('tool', 'power_tool', 'electronics', 'computer', 'robot_spare', 'safety', 'other')),
  location   TEXT NOT NULL DEFAULT '',
  condition  TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('good', 'needs_repair', 'broken', 'lost', 'retired')),
  quantity   INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  notes      TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX equipment_asset_tag ON equipment (asset_tag COLLATE NOCASE) WHERE asset_tag IS NOT NULL;

-- People are deactivated, never deleted, so borrower_id stays valid; the loan history goes with
-- the item when a lead deletes it (the audit log keeps the lend/return lines).
CREATE TABLE equipment_loans (
  id               TEXT PRIMARY KEY,
  equipment_id     TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  borrower_id      TEXT NOT NULL REFERENCES users(id),
  quantity         INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  lent_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  lent_at          TEXT NOT NULL DEFAULT (datetime('now')),
  due_on           TEXT,                 -- YYYY-MM-DD, optional
  returned_at      TEXT,
  returned_to      TEXT REFERENCES users(id) ON DELETE SET NULL,
  return_condition TEXT CHECK (return_condition IS NULL OR return_condition IN ('good', 'needs_repair', 'broken', 'lost')),
  notes            TEXT NOT NULL DEFAULT '',
  return_notes     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX equipment_loans_open ON equipment_loans (equipment_id) WHERE returned_at IS NULL;
CREATE INDEX equipment_loans_borrower ON equipment_loans (borrower_id) WHERE returned_at IS NULL;

-- Overdue reminders go out at most once per loan per day (like reminder_log).
CREATE TABLE equipment_reminder_log (
  loan_id TEXT NOT NULL REFERENCES equipment_loans(id) ON DELETE CASCADE,
  day     TEXT NOT NULL,
  PRIMARY KEY (loan_id, day)
);
