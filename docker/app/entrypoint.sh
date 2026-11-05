#!/bin/sh

set -eu

load_secret() {
  secret_file="$1"
  if [ -z "$secret_file" ] || [ ! -r "$secret_file" ]; then
    printf '%s\n' "Required runtime secret file is missing or unreadable." >&2
    exit 1
  fi
  cat "$secret_file"
}

if [ -n "${DATABASE_URL_FILE:-}" ]; then
  DATABASE_URL="$(load_secret "$DATABASE_URL_FILE")"
  export DATABASE_URL
fi

if [ -n "${MIGRATE_DATABASE_URL_FILE:-}" ]; then
  MIGRATE_DATABASE_URL="$(load_secret "$MIGRATE_DATABASE_URL_FILE")"
  export MIGRATE_DATABASE_URL
fi

if [ -n "${AUTH_SECRET_FILE:-}" ]; then
  AUTH_SECRET="$(load_secret "$AUTH_SECRET_FILE")"
  export AUTH_SECRET
fi

if [ -n "${TOKEN_ENCRYPTION_KEY_FILE:-}" ]; then
  TOKEN_ENCRYPTION_KEY="$(load_secret "$TOKEN_ENCRYPTION_KEY_FILE")"
  export TOKEN_ENCRYPTION_KEY
fi

if [ -n "${BADGE_CRON_SECRET_FILE:-}" ]; then
  BADGE_CRON_SECRET="$(load_secret "$BADGE_CRON_SECRET_FILE")"
  export BADGE_CRON_SECRET
fi

exec "$@"
