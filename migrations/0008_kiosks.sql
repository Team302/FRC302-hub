-- Shop kiosks: a tablet at the shop door where students tap their name to check in to the meeting
-- that's live. The kiosk URL is the credential (only its SHA-256 is stored); it can list names and
-- record check-ins, nothing else. Leads create and revoke them.
CREATE TABLE kiosks (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  last_used_at TEXT
);

-- How an attendance mark was made: 'self' (the person's own device), 'kiosk:<id>', or NULL (set
-- by whoever ran the meeting).
ALTER TABLE attendance ADD COLUMN via TEXT;
