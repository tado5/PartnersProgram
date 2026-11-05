#!/bin/bash

set -e

sql_escape() {
  local escaped="${1//\\/\\\\}"
  escaped="${escaped//\'/\'\'}"
  printf '%s' "$escaped"
}

app_password_value="$(cat "${DB_APP_PASSWORD_FILE:?DB_APP_PASSWORD_FILE is required}")"
migrate_password_value="$(cat "${DB_MIGRATE_PASSWORD_FILE:?DB_MIGRATE_PASSWORD_FILE is required}")"
root_password="$(cat "${DB_ROOT_PASSWORD_FILE:?DB_ROOT_PASSWORD_FILE is required}")"
app_password="$(sql_escape "$app_password_value")"
migrate_password="$(sql_escape "$migrate_password_value")"

MYSQL_PWD="${root_password}" mariadb -uroot <<SQL
CREATE DATABASE IF NOT EXISTS europodlahy
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'europodlahy_migrate'@'%' IDENTIFIED BY '${migrate_password}';
ALTER USER 'europodlahy_migrate'@'%' IDENTIFIED BY '${migrate_password}';
GRANT ALL PRIVILEGES ON europodlahy.* TO 'europodlahy_migrate'@'%';

CREATE USER IF NOT EXISTS 'europodlahy_app'@'%' IDENTIFIED BY '${app_password}';
ALTER USER 'europodlahy_app'@'%' IDENTIFIED BY '${app_password}';
SQL
