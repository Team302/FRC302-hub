-- The built-in vault is gone: team passwords live in a dedicated password manager (Vaultwarden;
-- README → Passwords). This drops the encrypted entries for good. The audit log's past vault
-- lines (who revealed what, when) stay in `activity`.
DROP TABLE IF EXISTS vault_entry_subteams;
DROP TABLE IF EXISTS vault_entries;
