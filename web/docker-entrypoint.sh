#!/bin/sh
# Installs the embedded database onto the mounted volume on first boot; on
# every later boot, syncs an EXISTING database's schema to the image's schema
# before handing off to the Next.js standalone server. ROWS are always
# preserved either way — this only ever adds tables/columns the image's code
# now expects, never drops or renames one (`prisma db push` does the same
# additive-vs-destructive distinction `prisma migrate` would, just without a
# migrations folder, which this project has never used).
#
# Why sync on every boot, not just once: a redeploy ships new code AND a new
# schema together, always, in one image — a boot that starts the new code
# against the volume's un-migrated old schema is a real outage, not a
# hypothetical one (EPIC N7 added five tables and two new Rfq/Quote columns
# that createRfqAction/submitQuoteAction now read on every call).
#
# Why this is safe to run unattended: additive changes apply silently.
# A genuinely destructive change (a dropped/retyped column) makes `prisma db
# push` refuse and exit non-zero without touching anything — `set -e` then
# stops this script before the server starts, the container never reports
# healthy, and remote-deploy.sh's own rollback (see web/deploy/oci/) puts the
# previous image back. A silent, unattended data loss is not an option this
# script has; a failed deploy that pages a human is.
set -e

DB_FILE="/data/pharmalink.db"

# The volume mount may be owned by root; ensure the dirs exist and are usable.
mkdir -p /data "${UPLOAD_DIR:-/data/uploads}" 2>/dev/null || true

if [ ! -f "$DB_FILE" ]; then
  echo "[entrypoint] first boot — installing database at $DB_FILE"
  cp /app/template.db "$DB_FILE"
else
  echo "[entrypoint] existing database found at $DB_FILE — syncing schema, preserving rows"
  # Invoked as a plain node script, not `npx prisma` / `node_modules/.bin/prisma`
  # — the runtime image copies only node_modules/prisma and node_modules/@prisma
  # (see Dockerfile), not the .bin symlink farm the rest of npm ci produces, so
  # there is no `prisma` on PATH to resolve.
  node ./node_modules/prisma/build/index.js db push --skip-generate
fi

exec "$@"
