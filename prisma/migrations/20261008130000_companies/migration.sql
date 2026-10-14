-- Deploy with writers stopped and a verified backup. No audit UPDATE or trigger removal.
CREATE TABLE `companies` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(80) NOT NULL,
  `ico` CHAR(8) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `deactivated_at` DATETIME(3) NULL,
  `created_by_user_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `companies_slug_uq` (`slug`),
  INDEX `companies_active_name_idx` (`is_active`, `name`),
  PRIMARY KEY (`id`),
  CONSTRAINT `companies_name_chk` CHECK (CHAR_LENGTH(`name`) BETWEEN 2 AND 100),
  CONSTRAINT `companies_slug_chk` CHECK (`slug` REGEXP BINARY '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT `companies_ico_chk` CHECK (`ico` IS NULL OR `ico` REGEXP '^[0-9]{8}$')
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `companies` (`id`, `name`, `slug`, `updated_at`)
VALUES (1, 'Europodlahy', 'europodlahy', CURRENT_TIMESTAMP(3));

ALTER TABLE `users`
  MODIFY `role` ENUM('admin', 'seller', 'superadmin') NOT NULL,
  ADD COLUMN `company_id` BIGINT UNSIGNED NULL DEFAULT 1,
  DROP INDEX `users_role_is_active_idx`,
  ADD INDEX `users_company_role_active_idx` (`company_id`, `role`, `is_active`);
ALTER TABLE `users` ALTER COLUMN `company_id` DROP DEFAULT;
ALTER TABLE `users` ADD CONSTRAINT `users_role_company_chk`
  CHECK ((`role` = 'superadmin' AND `company_id` IS NULL)
      OR (`role` IN ('admin', 'seller') AND `company_id` IS NOT NULL));

ALTER TABLE `partners` ADD COLUMN `company_id` BIGINT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE `partner_tokens` ADD COLUMN `company_id` BIGINT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE `purchases` ADD COLUMN `company_id` BIGINT UNSIGNED NOT NULL DEFAULT 1;
-- DDL fills the NEW column on historical rows; original audit contents stay untouched.
ALTER TABLE `audit_logs` ADD COLUMN `company_id` BIGINT UNSIGNED NULL DEFAULT 1;
ALTER TABLE `partners` ALTER COLUMN `company_id` DROP DEFAULT;
ALTER TABLE `partner_tokens` ALTER COLUMN `company_id` DROP DEFAULT;
ALTER TABLE `purchases` ALTER COLUMN `company_id` DROP DEFAULT;
ALTER TABLE `audit_logs` ALTER COLUMN `company_id` DROP DEFAULT;

ALTER TABLE `partners`
  ADD UNIQUE INDEX `partners_company_id_uq` (`company_id`, `id`),
  ADD INDEX `partners_company_active_type_idx` (`company_id`, `is_active`, `type`),
  ADD INDEX `partners_company_name_idx` (`company_id`, `display_name`),
  ADD INDEX `partners_company_phone_idx` (`company_id`, `phone`),
  ADD INDEX `partners_company_ico_idx` (`company_id`, `ico`),
  DROP INDEX `partners_is_active_type_idx`,
  DROP INDEX `partners_display_name_idx`,
  DROP INDEX `partners_phone_idx`,
  DROP INDEX `partners_ico_idx`;
ALTER TABLE `partner_tokens`
  ADD UNIQUE INDEX `partner_tokens_company_id_uq` (`company_id`, `id`),
  ADD UNIQUE INDEX `partner_tokens_company_partner_id_uq` (`company_id`, `partner_id`, `id`),
  ADD INDEX `partner_tokens_company_partner_active_idx` (`company_id`, `partner_id`, `is_active`),
  DROP FOREIGN KEY `partner_tokens_partner_id_fkey`,
  DROP INDEX `partner_tokens_partner_active_idx`;
ALTER TABLE `purchases`
  ADD UNIQUE INDEX `purchases_company_id_uq` (`company_id`, `id`),
  ADD UNIQUE INDEX `purchases_company_idempotency_uq` (`company_id`, `idempotency_key`),
  ADD INDEX `purchases_company_partner_deleted_date_idx` (`company_id`, `partner_id`, `is_deleted`, `purchased_at`),
  ADD INDEX `purchases_company_date_idx` (`company_id`, `purchased_at`),
  ADD INDEX `purchases_company_creator_date_idx` (`company_id`, `created_by_user_id`, `created_at`),
  ADD INDEX `purchases_creator_fk_idx` (`created_by_user_id`),
  DROP FOREIGN KEY `purchases_partner_id_fkey`,
  DROP FOREIGN KEY `purchases_token_id_fkey`;
ALTER TABLE `purchases`
  DROP INDEX `purchases_idempotency_key_uq`,
  DROP INDEX `purchases_token_id_fkey`,
  DROP INDEX `purchases_partner_deleted_date_idx`,
  DROP INDEX `purchases_purchased_at_idx`,
  DROP INDEX `purchases_created_by_date_idx`;
ALTER TABLE `audit_logs`
  ADD INDEX `audit_logs_company_entity_date_idx` (`company_id`, `entity_type`, `entity_id`, `created_at`),
  ADD INDEX `audit_logs_company_partner_date_idx` (`company_id`, `partner_id`, `created_at`),
  ADD INDEX `audit_logs_company_user_date_idx` (`company_id`, `user_id`, `created_at`),
  ADD INDEX `audit_logs_company_action_date_idx` (`company_id`, `action`, `created_at`),
  ADD INDEX `audit_logs_user_fk_idx` (`user_id`),
  DROP FOREIGN KEY `audit_logs_partner_id_fkey`,
  ADD CONSTRAINT `audit_logs_partner_company_chk` CHECK (`partner_id` IS NULL OR `company_id` IS NOT NULL);
ALTER TABLE `audit_logs`
  DROP INDEX `audit_logs_entity_date_idx`,
  DROP INDEX `audit_logs_partner_date_idx`,
  DROP INDEX `audit_logs_user_date_idx`,
  DROP INDEX `audit_logs_action_date_idx`;

ALTER TABLE `companies` ADD CONSTRAINT `companies_created_by_user_id_fkey`
  FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `users` ADD CONSTRAINT `users_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `partners` ADD CONSTRAINT `partners_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `partner_tokens`
  ADD CONSTRAINT `partner_tokens_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `partner_tokens_company_id_partner_id_fkey` FOREIGN KEY (`company_id`, `partner_id`) REFERENCES `partners` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `purchases`
  ADD CONSTRAINT `purchases_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `purchases_company_id_partner_id_fkey` FOREIGN KEY (`company_id`, `partner_id`) REFERENCES `partners` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `purchases_company_id_partner_id_token_id_fkey` FOREIGN KEY (`company_id`, `partner_id`, `token_id`) REFERENCES `partner_tokens` (`company_id`, `partner_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `audit_logs`
  ADD CONSTRAINT `audit_logs_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `audit_logs_company_id_partner_id_fkey` FOREIGN KEY (`company_id`, `partner_id`) REFERENCES `partners` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
