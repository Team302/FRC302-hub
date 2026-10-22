-- Monday-style boards: columns you define, subitems, per-item history, notifications,
-- automations and favorites.

-- ─── Custom columns ──────────────────────────────────────────────────────────
-- Every board still has the built-in Owner / Status / Priority / Due columns (they drive My Work,
-- meetings and reminders, so they stay real columns on `items`). These are the extra ones.
--   status    settings {labels:[{id,label,color}]}      value "label id"
--   people    —                                          value ["usr_…", …]
--   date      —                                          value "YYYY-MM-DD"
--   timeline  —                                          value {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}
--   text      —                                          value "…"
--   number    settings {unit?: "$" | "hrs" | …}           value 12.5
--   checkbox  —                                          value true
--   dropdown  settings {options:[{id,label,color}]}      value ["opt id", …]
--   link      —                                          value {"url":"https://…","text":"…"}
CREATE TABLE board_columns (
  id         TEXT PRIMARY KEY,
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('status', 'people', 'date', 'timeline', 'text', 'number', 'checkbox', 'dropdown', 'link')),
  title      TEXT NOT NULL,
  settings   TEXT NOT NULL DEFAULT '{}',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX board_columns_board ON board_columns (board_id, position);

CREATE TABLE item_values (
  item_id   TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  value     TEXT NOT NULL,              -- JSON
  PRIMARY KEY (item_id, column_id)
);
CREATE INDEX item_values_column ON item_values (column_id);

-- Built-in columns: per-board labels/colours for the five statuses (their meaning is fixed, since
-- "done" drives completion), and which built-ins are hidden on this board.
ALTER TABLE boards ADD COLUMN status_labels TEXT NOT NULL DEFAULT '{}';
ALTER TABLE boards ADD COLUMN hidden_builtins TEXT NOT NULL DEFAULT '[]';

-- ─── Subitems ────────────────────────────────────────────────────────────────
-- One level deep. A subitem lives in its parent's board and group and moves with it.
ALTER TABLE items ADD COLUMN parent_id TEXT REFERENCES items(id) ON DELETE CASCADE;
CREATE INDEX items_parent ON items (parent_id);

-- ─── Per-item history ────────────────────────────────────────────────────────
CREATE TABLE item_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  field      TEXT NOT NULL,             -- 'created', 'status', 'assignee', column title, …
  old_value  TEXT,
  new_value  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX item_events_item ON item_events (item_id, id);

-- ─── Notifications (the bell) ────────────────────────────────────────────────
CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL,             -- assigned | mentioned | update | status | due | automation
  item_id    TEXT REFERENCES items(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX notifications_user ON notifications (user_id, id);

-- ─── Automations ─────────────────────────────────────────────────────────────
-- Recipes, Monday-style: "When status changes to {status}, {action}".
--   trigger  {"type":"status_to","status":"done"}  |  {"type":"item_created"}
--   action   {"type":"move_to_group","group_id":…}  |  {"type":"notify","user_ids":[…]}
--            {"type":"assign","user_id":…}          |  {"type":"set_status","status":…}
CREATE TABLE automations (
  id         TEXT PRIMARY KEY,
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  trigger    TEXT NOT NULL,
  action     TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX automations_board ON automations (board_id);

-- ─── Favorites (sidebar) ─────────────────────────────────────────────────────
CREATE TABLE board_favorites (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, board_id)
);

-- Due-date reminders are sent once per item per day.
CREATE TABLE reminder_log (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  day     TEXT NOT NULL,
  PRIMARY KEY (item_id, day)
);
