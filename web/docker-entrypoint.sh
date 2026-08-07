#!/bin/sh
# Installs the embedded database onto the mounted volume on first boot, then
# hands off to the Next.js standalone server. Idempotent: an existing database
# on the volume is left untouched (user data is preserved across restarts).
set -e

DB_FILE="/data/pharmalink.db"

# The volume mount may be owned by root; ensure the dirs exist and are usable.
mkdir -p /data "${UPLOAD_DIR:-/data/uploads}" 2>/dev/null || true

if [ ! -f "$DB_FILE" ]; then
  echo "[entrypoint] first boot — installing database at $DB_FILE"
  cp /app/template.db "$DB_FILE"
else
  echo "[entrypoint] existing database found at $DB_FILE — leaving it as-is"
fi

exec "$@"
