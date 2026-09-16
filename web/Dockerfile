# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# PharmaLink — single self-contained container.
#
# One image runs the whole app: the Next.js "standalone" server plus an embedded
# SQLite database. The database file and uploaded documents live on a mounted
# volume (/data), so they survive restarts. No separate database service.
#
# The schema + (optionally) demo data are baked into a template DB at build time,
# so the container needs NO Prisma CLI at runtime — on first boot it copies the
# template onto the volume; on later boots it reuses the existing database.
#
# Stages: deps -> builder (build app + seed template.db) -> runner (slim runtime)
# ---------------------------------------------------------------------------

FROM node:20-slim AS base
# Prisma's query engine needs OpenSSL at build and run time.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- deps: full install (dev deps needed to build + seed) ------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- migrator: isolated Prisma CLI install for the runtime entrypoint ------
# A separate, from-scratch `npm install` — not a copy from `deps` — so this
# pulls in exactly the CLI's own dependency closure via npm's real resolver.
# Hand-picking node_modules/prisma + node_modules/@prisma alone is NOT
# enough: the CLI's own deps (@prisma/config, effect, c12, ...) live outside
# both of those paths and are easy to under-copy one at a time as each
# missing one surfaces at runtime — this was tested and hit exactly that
# failure before landing on a real `npm install`. Version pinned to match
# package-lock.json's @prisma/client resolution, so the CLI that migrates the
# database is never a different version than the client the app runs.
FROM base AS migrator
WORKDIR /migrator
RUN npm install prisma@6.19.3 --no-save --omit=dev

# --- builder: compile the app and bake the template database ---------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# NEXT_PUBLIC_* is inlined into the client bundle at build time.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
# Publishable logo key. Unset is fine — companies render their monogram.
ARG NEXT_PUBLIC_LOGO_DEV_TOKEN=
ENV NEXT_PUBLIC_LOGO_DEV_TOKEN=$NEXT_PUBLIC_LOGO_DEV_TOKEN
# The build needs a resolvable DATABASE_URL: `.env` is (correctly) excluded from
# the image so no secret is ever baked in, and Prisma fails schema validation
# without it. Bake the template DB FIRST, then build against it — that way any
# build-time Prisma access resolves against a real, schema-complete database.
ENV DATABASE_URL="file:/app/template.db"
# Template SQLite DB: schema always; demo data when SEED=true (default).
# The container copies this onto its volume on first boot.
ARG SEED=true
RUN npx prisma db push --skip-generate \
    && if [ "$SEED" = "true" ]; then npx tsx prisma/seed.ts; fi
RUN npm run build

# --- runner: minimal runtime (standalone server + query engine) ------------
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# The app talks to SQLite on the mounted volume; documents are stored beside it.
ENV DATABASE_URL="file:/data/pharmalink.db" UPLOAD_DIR="/data/uploads"
# The Prisma CLI's own isolated install — needed at runtime ONLY so the
# entrypoint can `db push` an EXISTING database up to the image's schema on
# every boot (see docker-entrypoint.sh). This deliberately gives up the "no
# Prisma CLI at runtime" slimness the original design chose: without it, a
# schema change (new table, new column) ships in the image but is silently
# never applied to the persistent volume, which breaks the app against real
# data the moment new code queries a column that was never added to disk.
#
# Copied FIRST, so the more specific, POST-generate `.prisma`/`@prisma/client`
# copies from `builder` below always win on any overlapping path — a
# generated-client copy from the wrong stage is a broken Prisma client at
# runtime, not a build error, so the order here is load-bearing.
COPY --from=migrator --chown=node:node /migrator/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/prisma/schema.prisma ./prisma/schema.prisma
# Standalone bundle (traced server + minimal node_modules) — its own
# node_modules subset lands on top of the migrator's, which is what should
# win for the app's own runtime packages (next, react, ...).
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Prisma generated client + native query engine — copied explicitly so runtime
# queries work even if Next's file tracing misses the engine binary.
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client
# The pre-seeded template database + the entrypoint that installs it on /data.
COPY --from=builder --chown=node:node /app/template.db ./template.db
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
# Strip any CRLF (in case the script was authored on Windows) so /bin/sh runs it.
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh \
    && mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
