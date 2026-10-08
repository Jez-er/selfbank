#!/bin/sh
# Starts SelfBank: validate configuration, migrate, then hand over to the server.
#
# Migrations run here rather than inside the app so that a failure stops the
# container outright instead of leaving a half-migrated database serving
# requests.
set -eu

fail() {
  echo "[selfbank] $1" >&2
  exit 1
}

# --- configuration -------------------------------------------------------
if [ -z "${AUTH_SECRET:-}" ]; then
  fail "AUTH_SECRET is not set. Generate one with:
  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
fi

if [ "${#AUTH_SECRET}" -lt 32 ]; then
  fail "AUTH_SECRET must be at least 32 characters (got ${#AUTH_SECRET})."
fi

if [ -z "${AUTH_PASSWORD_HASH:-}" ] && [ -z "${AUTH_PASSWORD:-}" ]; then
  fail "Set AUTH_PASSWORD_HASH (preferred; see 'npm run hash-password') or AUTH_PASSWORD."
fi

DB_DIR=$(dirname "${DATABASE_PATH:-/data/selfbank.db}")
if [ ! -w "$DB_DIR" ]; then
  fail "$DB_DIR is not writable. Mount a volume there, e.g. -v selfbank-data:/data"
fi

# --- schema --------------------------------------------------------------
echo "[selfbank] applying migrations to ${DATABASE_PATH:-/data/selfbank.db}"
node scripts/migrate.mjs || fail "migrations failed; refusing to start"

# exec so the server becomes PID 1 and receives SIGTERM directly.
echo "[selfbank] starting server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec "$@"
