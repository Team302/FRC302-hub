-- Trip rosters on season events: who's going, a waitlist when there's a cap, and a per-person
-- checklist (permission slip, fee, forms). The hub records only that a thing is done, never the
-- form itself: no medical details, no emergency contacts.
ALTER TABLE events ADD COLUMN roster_open INTEGER NOT NULL DEFAULT 0;  -- members can sign up / drop out
ALTER TABLE events ADD COLUMN signup_closes_on TEXT;                   -- YYYY-MM-DD, last day for that; NULL = until it starts
ALTER TABLE events ADD COLUMN capacity INTEGER;                        -- NULL = no limit

CREATE TABLE event_requirements (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  mentor_only INTEGER NOT NULL DEFAULT 0   -- only mentors tick it (anything a parent signs or money)
);
CREATE INDEX event_requirements_event ON event_requirements (event_id, position);

CREATE TABLE event_roster (
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('going', 'waitlist')),
  note       TEXT NOT NULL DEFAULT '',
  added_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_roster_user ON event_roster (user_id);

CREATE TABLE event_checks (
  requirement_id TEXT NOT NULL REFERENCES event_requirements(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checked_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  checked_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (requirement_id, user_id)
);
