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
# Standalone bundle (traced server + minimal node_modules).
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
