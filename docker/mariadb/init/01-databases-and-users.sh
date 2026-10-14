#!/bin/bash

set -e

sql_escape() {
  local escaped="${1//\\/\\\\}"
  escaped="${escaped//\'/\'\'}"
  printf '%s' "$escaped"
}

app_password="$(sql_escape "${DB_APP_PASSWORD:?DB_APP_PASSWORD is required}")"
migrate_password="$(sql_escape "${DB_MIGRATE_PASSWORD:?DB_MIGRATE_PASSWORD is required}")"
root_password="${MARIADB_ROOT_PASSWORD:?MARIADB_ROOT_PASSWORD is required}"

attempt=0
until MYSQL_PWD="${root_password}" mariadb -uroot -e "SELECT 1" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    printf '%s\n' "MariaDB did not become ready for account provisioning." >&2
    exit 1
  fi
  sleep 1
done

app_schema_grants="$(
  MYSQL_PWD="${root_password}" mariadb -N -B -uroot -e \
    "SELECT COUNT(*) FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE = CONCAT(QUOTE('europodlahy_app'), '@', QUOTE('%')) AND TABLE_SCHEMA = 'europodlahy';"
)"

MYSQL_PWD="${root_password}" mariadb -uroot <<SQL
CREATE DATABASE IF NOT EXISTS europodlahy
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS europodlahy_test
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS europodlahy_shadow
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'europodlahy_migrate'@'%' IDENTIFIED BY '${migrate_password}';
ALTER USER 'europodlahy_migrate'@'%' IDENTIFIED BY '${migrate_password}';
GRANT ALL PRIVILEGES ON europodlahy.* TO 'europodlahy_migrate'@'%';
GRANT ALL PRIVILEGES ON europodlahy_test.* TO 'europodlahy_migrate'@'%';
GRANT ALL PRIVILEGES ON europodlahy_shadow.* TO 'europodlahy_migrate'@'%';

CREATE USER IF NOT EXISTS 'europodlahy_app'@'%' IDENTIFIED BY '${app_password}';
ALTER USER 'europodlahy_app'@'%' IDENTIFIED BY '${app_password}';
SQL

if [ "${app_schema_grants}" -gt 0 ]; then
  MYSQL_PWD="${root_password}" mariadb -uroot -e \
    "REVOKE ALL PRIVILEGES ON europodlahy.* FROM 'europodlahy_app'@'%';"
fi
