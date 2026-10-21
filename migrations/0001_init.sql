-- 302 Hub — initial schema. One database per team; there is no tenant column anywhere.
-- Timestamps are UTC ISO-8601 strings (datetime('now') format) unless the column name says _date.

-- ─── People ──────────────────────────────────────────────────────────────────
-- Deliberately minimal: many members are minors, so no phone, birthday, address or photo is
-- stored. Name and email are what sign-in and assignment need, nothing more.
CREATE TABLE subteams (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT 'gray',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  -- admin: mentors/coaches. lead: student leads and captains. member: everyone else.
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'lead', 'member')),
  subteam_id    TEXT REFERENCES subteams(id) ON DELETE SET NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  clerk_user_id TEXT,
  last_seen_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX users_email ON users (lower(email));
CREATE UNIQUE INDEX users_clerk ON users (clerk_user_id) WHERE clerk_user_id IS NOT NULL;

-- ─── Boards (Monday-style) ───────────────────────────────────────────────────
CREATE TABLE boards (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  subteam_id  TEXT REFERENCES subteams(id) ON DELETE SET NULL,
  color       TEXT NOT NULL DEFAULT 'green',
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE board_groups (
  id         TEXT PRIMARY KEY,
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'gray',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX board_groups_board ON board_groups (board_id, position);

CREATE TABLE items (
  id                TEXT PRIMARY KEY,
  board_id          TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  group_id          TEXT NOT NULL REFERENCES board_groups(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'not_started'
                    CHECK (status IN ('not_started', 'working', 'stuck', 'review', 'done')),
  priority          TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assignee_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_date          TEXT,               -- YYYY-MM-DD
  position          INTEGER NOT NULL DEFAULT 0,
  source_meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL,
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT
);
CREATE INDEX items_board ON items (board_id, group_id, position);
CREATE INDEX items_assignee ON items (assignee_id, status);
CREATE INDEX items_meeting ON items (source_meeting_id);

CREATE TABLE item_updates (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  author_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX item_updates_item ON item_updates (item_id, created_at);

-- ─── Meetings ────────────────────────────────────────────────────────────────
CREATE TABLE meetings (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'general' CHECK (kind IN ('general', 'subteam', 'leadership', 'build', 'mentor')),
  subteam_id     TEXT REFERENCES subteams(id) ON DELETE SET NULL,
  starts_at      TEXT NOT NULL,          -- ISO-8601 with offset, as entered
  duration_min   INTEGER NOT NULL DEFAULT 60,
  location       TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended')),
  facilitator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes          TEXT NOT NULL DEFAULT '',
  decisions      TEXT NOT NULL DEFAULT '',
  started_at     TEXT,
  ended_at       TEXT,
  created_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX meetings_starts ON meetings (starts_at);

CREATE TABLE agenda_items (
  id          TEXT PRIMARY KEY,
  meeting_id  TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  minutes     INTEGER NOT NULL DEFAULT 5,
  position    INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'done', 'skipped')),
  notes       TEXT NOT NULL DEFAULT '',
  started_at  TEXT,
  ended_at    TEXT
);
CREATE INDEX agenda_meeting ON agenda_items (meeting_id, position);

CREATE TABLE attendance (
  meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('present', 'late', 'excused', 'absent')),
  recorded_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  recorded_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (meeting_id, user_id)
);

-- ─── Credential vault ────────────────────────────────────────────────────────
-- Secrets (password, TOTP seed) are AES-256-GCM ciphertext (worker/src/lib/vaultCrypto.js),
-- bound by AAD to this row's id and the column, so a blob copied to another row or column
-- fails to decrypt. Everything else here is plaintext and visible to anyone allowed to SEE the
-- entry; keep secrets out of `notes`.
CREATE TABLE vault_entries (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  url            TEXT NOT NULL DEFAULT '',
  username       TEXT NOT NULL DEFAULT '',
  secret_enc     TEXT,
  totp_enc       TEXT,
  notes          TEXT NOT NULL DEFAULT '',
  -- Minimum role that may see the entry at all and reveal its secret.
  min_role       TEXT NOT NULL DEFAULT 'lead' CHECK (min_role IN ('admin', 'lead', 'member')),
  owner_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  rotated_at     TEXT,
  created_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Audit ───────────────────────────────────────────────────────────────────
-- Append-only from the app's point of view: there is no route that updates or deletes a row.
CREATE TABLE activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  summary    TEXT NOT NULL DEFAULT '',
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX activity_created ON activity (created_at);
CREATE INDEX activity_entity ON activity (entity, entity_id);

-- Fixed-window counters for rate limits (vault reveals).
CREATE TABLE rate_limits (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL,
  window_end TEXT NOT NULL
);

-- Default FRC subteams; rename or delete them in Team → Subteams.
INSERT INTO subteams (id, name, color, position) VALUES
  ('st_mech',  'Mechanical',  'orange', 0),
  ('st_elec',  'Electrical',  'amber',  1),
  ('st_prog',  'Programming', 'blue',   2),
  ('st_cad',   'CAD',         'violet', 3),
  ('st_strat', 'Strategy',    'teal',   4),
  ('st_biz',   'Business',    'green',  5),
  ('st_out',   'Outreach',    'pink',   6);
