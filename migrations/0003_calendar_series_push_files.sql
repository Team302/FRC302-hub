-- Calendar feeds, recurring meetings, push notifications and task attachments.

-- ─── Calendar feed ───────────────────────────────────────────────────────────
-- Each person can create one private feed URL (meetings they can see + their open tasks with a
-- due date). Only the SHA-256 of the URL's token is stored: a database export can't be turned
-- back into working feed URLs. Making a new URL replaces the old one.
ALTER TABLE users ADD COLUMN calendar_token_hash TEXT;
CREATE UNIQUE INDEX users_calendar_token ON users (calendar_token_hash) WHERE calendar_token_hash IS NOT NULL;

-- ─── Recurring meetings ──────────────────────────────────────────────────────
-- Meetings created together as a weekly series share a series_id. Each one is still its own
-- meeting (own agenda, attendance, notes).
ALTER TABLE meetings ADD COLUMN series_id TEXT;
CREATE INDEX meetings_series ON meetings (series_id);

-- ─── Web Push ────────────────────────────────────────────────────────────────
-- One row per browser/device a person turned notifications on in. endpoint is the push
-- service URL; p256dh and auth are the browser's keys for encrypting the message (RFC 8291).
CREATE TABLE push_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_ok_at  TEXT
);
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

-- ─── Task attachments ────────────────────────────────────────────────────────
-- Files live in R2 (binding FILES) under key = id; this is the index.
CREATE TABLE attachments (
  id           TEXT PRIMARY KEY,
  item_id      TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  uploaded_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX attachments_item ON attachments (item_id, created_at);
