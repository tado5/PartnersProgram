#!/bin/bash

set -e

root_password="${MARIADB_ROOT_PASSWORD:?MARIADB_ROOT_PASSWORD is required}"

MYSQL_PWD="${root_password}" mariadb -uroot <<'SQL'
GRANT SELECT, INSERT, UPDATE ON europodlahy.companies TO 'europodlahy_app'@'%';
GRANT SELECT, INSERT, UPDATE ON europodlahy.users TO 'europodlahy_app'@'%';
GRANT SELECT, INSERT, UPDATE ON europodlahy.partners TO 'europodlahy_app'@'%';
GRANT SELECT, INSERT, UPDATE ON europodlahy.partner_tokens TO 'europodlahy_app'@'%';
GRANT SELECT, INSERT, UPDATE ON europodlahy.purchases TO 'europodlahy_app'@'%';
GRANT SELECT, INSERT ON europodlahy.partner_badge_awards TO 'europodlahy_app'@'%';
GRANT SELECT, INSERT ON europodlahy.audit_logs TO 'europodlahy_app'@'%';
SQL
