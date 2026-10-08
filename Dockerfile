# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# SelfBank - everything in a single image: Next.js server, SQLite database and
# the recurring-payment scheduler, one process, one container.
#
# Debian slim rather than Alpine on purpose: better-sqlite3 is a native module,
# and its glibc prebuilt binaries are the well-trodden path. The ~80 MB saved
# by musl is not worth debugging a binding that will not load.
# ---------------------------------------------------------------------------

FROM node:24-bookworm-slim AS deps
WORKDIR /app
# Build tools are a fallback: better-sqlite3 normally installs a prebuilt
# binary, but this lets it compile from source if one is missing for the
# target architecture.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci


FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# AUTH_SECRET is read at request time, never at build time, but the build
# imports the module that validates it. The throwaway value is scoped to this
# one command so it never becomes part of the image's environment.
RUN AUTH_SECRET=build-time-placeholder-value-not-a-secret npm run build


FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/selfbank.db

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 selfbank \
 && useradd --system --uid 1001 --gid selfbank selfbank

# The standalone bundle carries its own minimal node_modules.
COPY --from=builder --chown=selfbank:selfbank /app/.next/standalone ./
COPY --from=builder --chown=selfbank:selfbank /app/.next/static ./.next/static
COPY --from=builder --chown=selfbank:selfbank /app/public ./public

# Next's tracer copies only the prebuilt binding for the platform it ran on.
# Taking the whole package from the deps stage guarantees the binding that
# matches this image is present - and that migrations, which run outside the
# Next bundle, can require it.
# (better-sqlite3 v13 loads a self-contained prebuilt binary and needs no
# further runtime packages of its own.)
COPY --from=deps --chown=selfbank:selfbank /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# Migrations are applied by the entrypoint, before the server accepts traffic.
COPY --chown=selfbank:selfbank drizzle ./drizzle
COPY --chown=selfbank:selfbank scripts ./scripts
COPY --chown=selfbank:selfbank docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

# The database lives on a volume so it survives image rebuilds.
RUN mkdir -p /data && chown selfbank:selfbank /data
VOLUME ["/data"]

USER selfbank
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node", "server.js"]
