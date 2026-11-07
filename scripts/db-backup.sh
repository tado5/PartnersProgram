#!/usr/bin/env bash

set -euo pipefail
umask 077

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backup_dir="${BACKUP_DIR:-$root_dir/.data/backups}"
timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
backup_file="$backup_dir/europodlahy-$timestamp.sql.gz"
temporary_file="$(mktemp "$backup_dir/.europodlahy-$timestamp.XXXXXX")"
trap 'rm -f "$temporary_file"' EXIT

if [ -e "$backup_file" ]; then
  printf '%s\n' "Backup file already exists; refusing to overwrite it." >&2
  exit 1
fi

docker compose -f "$root_dir/docker-compose.prod.yml" exec -T db sh -ec '
  root_password_file="${DB_ROOT_PASSWORD_FILE:-${MARIADB_ROOT_PASSWORD_FILE:?Root secret file is not mounted}}"
  root_password="$(cat "$root_password_file")"
  MYSQL_PWD="$root_password" exec mariadb-dump -uroot \
    --single-transaction --routines --events --triggers --hex-blob \
    --default-character-set=utf8mb4 --databases europodlahy
' | gzip -c >"$temporary_file"

gzip -t "$temporary_file"
if [ ! -s "$temporary_file" ]; then
  printf '%s\n' "Backup output is empty; refusing to publish it." >&2
  exit 1
fi

mv "$temporary_file" "$backup_file"
trap - EXIT
printf 'Database backup created: %s\n' "$backup_file"
