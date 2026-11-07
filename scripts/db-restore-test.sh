#!/usr/bin/env bash

set -euo pipefail
umask 077

if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
  printf 'Usage: %s <compressed-backup.sql.gz>\n' "$0" >&2
  exit 2
fi

backup_file="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
gzip -t "$backup_file"

suffix="$(date -u '+%Y%m%d%H%M%S')-$$"
container="europodlahy-restore-test-$suffix"
volume="europodlahy-restore-test-$suffix"

if docker container inspect "$container" >/dev/null 2>&1 ||
  docker volume inspect "$volume" >/dev/null 2>&1; then
  printf '%s\n' "Isolated restore-test resource name already exists; refusing to continue." >&2
  exit 1
fi

password_file=""

cleanup() {
  local exit_code=$?
  trap - EXIT

  if docker container inspect "$container" >/dev/null 2>&1; then
    docker rm --force --volumes "$container" >/dev/null ||
      {
        printf 'Could not remove isolated restore-test container %s\n' "$container" >&2
        exit_code=1
      }
  fi
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    docker volume rm "$volume" >/dev/null ||
      {
        printf 'Could not remove isolated restore-test volume %s\n' "$volume" >&2
        exit_code=1
      }
  fi
  if [ -n "$password_file" ]; then
    rm -f "$password_file" || exit_code=1
  fi
  if docker container inspect "$container" >/dev/null 2>&1 ||
    docker volume inspect "$volume" >/dev/null 2>&1; then
    printf '%s\n' "Isolated restore-test resources remain after cleanup." >&2
    exit_code=1
  fi
  exit "$exit_code"
}
trap cleanup EXIT

password_file="$(mktemp "${TMPDIR:-/tmp}/europodlahy-restore-test-password.XXXXXX")"
chmod 600 "$password_file"
openssl rand -hex 32 >"$password_file"

docker volume create "$volume" >/dev/null
docker run --detach --name "$container" --network none \
  --env MARIADB_ROOT_PASSWORD_FILE=/run/secrets/restore_root_password \
  --env DB_ROOT_PASSWORD_FILE=/run/secrets/restore_root_password \
  --mount "type=bind,source=$password_file,target=/run/secrets/restore_root_password,readonly" \
  --mount "type=volume,source=$volume,target=/var/lib/mysql" \
  mariadb:11.4 >/dev/null

ready=false
for _ in $(seq 1 60); do
  if docker exec "$container" healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  printf '%s\n' "Isolated MariaDB did not become ready; no restore was attempted." >&2
  exit 1
fi

gzip -dc "$backup_file" |
  docker exec --interactive "$container" sh -ec '
    root_password="$(cat "$DB_ROOT_PASSWORD_FILE")"
    MYSQL_PWD="$root_password" exec mariadb -uroot
  '

counts="$(
  docker exec "$container" sh -ec '
    root_password="$(cat "$DB_ROOT_PASSWORD_FILE")"
    MYSQL_PWD="$root_password" mariadb -N -B -uroot -e "
      SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = '\''europodlahy'\'';
      SELECT COUNT(*) FROM europodlahy._prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
    "
  '
)"
table_count="$(printf '%s\n' "$counts" | sed -n '1p')"
migration_count="$(printf '%s\n' "$counts" | sed -n '2p')"

if ! [[ "$table_count" =~ ^[0-9]+$ && "$table_count" -gt 0 &&
  "$migration_count" =~ ^[0-9]+$ && "$migration_count" -gt 0 ]]; then
  printf '%s\n' "Restored database failed table/migration verification." >&2
  exit 1
fi

printf 'Isolated restore passed: %s tables and %s completed migrations.\n' \
  "$table_count" "$migration_count"
