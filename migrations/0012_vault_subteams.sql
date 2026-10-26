-- Vault entries limited to subteams: only people on one of the listed subteams (and mentors) can
-- see or reveal the entry, on top of its min_role. No rows = no subteam limit.
-- A subteam can't be deleted while it guards an entry (no ON DELETE action), because removing
-- the last row would silently open the entry to everyone.
CREATE TABLE vault_entry_subteams (
  entry_id   TEXT NOT NULL REFERENCES vault_entries(id) ON DELETE CASCADE,
  subteam_id TEXT NOT NULL REFERENCES subteams(id),
  PRIMARY KEY (entry_id, subteam_id)
);
CREATE INDEX vault_entry_subteams_subteam ON vault_entry_subteams (subteam_id);
