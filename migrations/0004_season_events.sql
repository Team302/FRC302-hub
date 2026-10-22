-- Season events: kickoff, competitions, deadlines (bag/ship day, award submissions), outreach days.
-- Shown on Home with a countdown and included in everyone's calendar feed.
CREATE TABLE events (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'competition' CHECK (kind IN ('kickoff', 'competition', 'deadline', 'outreach', 'other')),
  starts_on  TEXT NOT NULL,            -- YYYY-MM-DD
  ends_on    TEXT NOT NULL,            -- YYYY-MM-DD, same as starts_on for one-day events
  location   TEXT NOT NULL DEFAULT '',
  url        TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX events_starts ON events (starts_on);
