#!/usr/bin/env bash
# Nightly backup of the Vaultwarden data folder. Run from this folder, e.g. from cron:
#   15 3 * * *  cd /path/to/deploy/vaultwarden && ./backup.sh >> backup.log 2>&1
#
# The database copy is made with SQLite's online backup (through Python, which every Linux and
# Raspberry Pi OS install has), so Vaultwarden can keep running.
# Vault items stay encrypted with each person's master password, but the backup also holds the
# server's signing keys: treat it as secret. Copy backups off this machine (another drive, or
# encrypted cloud storage); a backup on the same disk doesn't survive the disk dying.
set -euo pipefail

DATA=./data
OUT=${BACKUP_DIR:-./backups}
KEEP_DAYS=${KEEP_DAYS:-30}
STAMP=$(date +%Y-%m-%d_%H%M)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

command -v python3 >/dev/null || { echo "This needs python3 (sudo apt install python3)." >&2; exit 1; }
[ -f "$DATA/db.sqlite3" ] || { echo "No $DATA/db.sqlite3: is Vaultwarden set up in this folder?" >&2; exit 1; }

mkdir -p "$OUT"
python3 - "$DATA/db.sqlite3" "$WORK/db.sqlite3" <<'PY'
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
ok = dst.execute("PRAGMA integrity_check").fetchone()[0]
src.close(); dst.close()
if ok != "ok":
    sys.exit(f"Backup copy failed its integrity check: {ok}")
PY
for item in attachments sends config.json rsa_key.pem rsa_key.pub.pem; do
  [ -e "$DATA/$item" ] && cp -a "$DATA/$item" "$WORK/"
done
tar -czf "$OUT/vaultwarden-$STAMP.tar.gz" -C "$WORK" .
chmod 600 "$OUT/vaultwarden-$STAMP.tar.gz"
find "$OUT" -name 'vaultwarden-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backed up to $OUT/vaultwarden-$STAMP.tar.gz"
