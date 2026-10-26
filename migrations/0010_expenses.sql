-- Expenses: purchases and reimbursements against a season budget. Money is integer cents.
-- A season is named for its kickoff year: Aug 1 of the year before through Jul 31.
CREATE TABLE budget_categories (
  id           TEXT PRIMARY KEY,
  season       INTEGER NOT NULL,
  name         TEXT NOT NULL,
  budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (budget_cents >= 0),
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (season, name)
);

CREATE TABLE expenses (
  id               TEXT PRIMARY KEY,
  season           INTEGER NOT NULL,
  category_id      TEXT REFERENCES budget_categories(id) ON DELETE SET NULL,
  description      TEXT NOT NULL,
  vendor           TEXT NOT NULL DEFAULT '',
  amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
  spent_on         TEXT NOT NULL,                 -- YYYY-MM-DD
  -- team: paid with the team's card or check. personal: someone paid and is owed it back.
  payment          TEXT NOT NULL CHECK (payment IN ('team', 'personal')),
  status           TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'reimbursed')),
  submitted_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at       TEXT,
  decision_note    TEXT NOT NULL DEFAULT '',
  reimbursed_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  reimbursed_at    TEXT,
  item_id          TEXT REFERENCES items(id) ON DELETE SET NULL,
  receipt_key      TEXT,
  receipt_filename TEXT,
  receipt_type     TEXT,
  receipt_size     INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX expenses_season ON expenses (season, status);
CREATE INDEX expenses_submitter ON expenses (submitted_by, season);
