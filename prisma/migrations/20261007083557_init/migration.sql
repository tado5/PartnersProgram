-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('admin', 'seller') NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `must_change_password` BOOLEAN NOT NULL DEFAULT true,
    `failed_login_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `password_changed_at` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_uq`(`email`),
    INDEX `users_role_is_active_idx`(`role`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partners` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `code` CHAR(8) NOT NULL,
    `type` ENUM('installer', 'company', 'referrer') NOT NULL,
    `display_name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(191) NULL,
    `contact_person` VARCHAR(100) NULL,
    `ico` CHAR(8) NULL,
    `internal_note` VARCHAR(1000) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `deactivated_at` DATETIME(3) NULL,
    `created_by_user_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `partners_code_uq`(`code`),
    INDEX `partners_is_active_type_idx`(`is_active`, `type`),
    INDEX `partners_display_name_idx`(`display_name`),
    INDEX `partners_phone_idx`(`phone`),
    INDEX `partners_ico_idx`(`ico`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_tokens` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `partner_id` BIGINT UNSIGNED NOT NULL,
    `type` ENUM('qr', 'nfc') NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `token_hint` CHAR(6) NOT NULL,
    `label` VARCHAR(80) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by_user_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deactivated_at` DATETIME(3) NULL,
    `deactivated_by_user_id` BIGINT UNSIGNED NULL,
    `deactivation_reason` VARCHAR(255) NULL,
    `last_used_at` DATETIME(3) NULL,

    UNIQUE INDEX `partner_tokens_token_hash_uq`(`token_hash`),
    INDEX `partner_tokens_partner_active_idx`(`partner_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchases` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `partner_id` BIGINT UNSIGNED NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `points` INTEGER UNSIGNED NOT NULL,
    `partner_present` BOOLEAN NOT NULL,
    `note` VARCHAR(500) NULL,
    `purchased_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` ENUM('qr', 'nfc', 'manual') NOT NULL,
    `token_id` BIGINT UNSIGNED NULL,
    `idempotency_key` CHAR(36) NULL,
    `created_by_user_id` BIGINT UNSIGNED NOT NULL,
    `updated_by_user_id` BIGINT UNSIGNED NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `deleted_by_user_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `purchases_idempotency_key_uq`(`idempotency_key`),
    INDEX `purchases_partner_deleted_date_idx`(`partner_id`, `is_deleted`, `purchased_at`),
    INDEX `purchases_purchased_at_idx`(`purchased_at`),
    INDEX `purchases_created_by_date_idx`(`created_by_user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NULL,
    `action` VARCHAR(64) NOT NULL,
    `entity_type` VARCHAR(32) NOT NULL,
    `entity_id` BIGINT UNSIGNED NULL,
    `partner_id` BIGINT UNSIGNED NULL,
    `old_values` JSON NULL,
    `new_values` JSON NULL,
    `reason` VARCHAR(255) NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_entity_date_idx`(`entity_type`, `entity_id`, `created_at`),
    INDEX `audit_logs_partner_date_idx`(`partner_id`, `created_at`),
    INDEX `audit_logs_user_date_idx`(`user_id`, `created_at`),
    INDEX `audit_logs_action_date_idx`(`action`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `partners`
    ADD CONSTRAINT `partners_code_format_chk`
        CHECK (`code` REGEXP '^EP-[2-9A-HJKMNP-TV-Z]{5}$'),
    ADD CONSTRAINT `partners_display_name_length_chk`
        CHECK (CHAR_LENGTH(`display_name`) BETWEEN 2 AND 100),
    ADD CONSTRAINT `partners_ico_format_chk`
        CHECK (`ico` IS NULL OR `ico` REGEXP '^[0-9]{8}$');

ALTER TABLE `purchases`
    ADD CONSTRAINT `purchases_amount_range_chk`
        CHECK (`amount` > 0 AND `amount` <= 999999.99),
    ADD CONSTRAINT `purchases_points_amount_chk`
        CHECK (`points` = FLOOR(`amount`)),
    ADD CONSTRAINT `purchases_deleted_state_chk`
        CHECK (
            (`is_deleted` = 0 AND `deleted_at` IS NULL)
            OR (`is_deleted` = 1 AND `deleted_at` IS NOT NULL)
        );

ALTER TABLE `audit_logs`
    ADD CONSTRAINT `audit_logs_old_values_json_chk`
        CHECK (`old_values` IS NULL OR JSON_VALID(`old_values`)),
    ADD CONSTRAINT `audit_logs_new_values_json_chk`
        CHECK (`new_values` IS NULL OR JSON_VALID(`new_values`));

CREATE TRIGGER `audit_logs_before_update`
    BEFORE UPDATE ON `audit_logs`
    FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs are immutable';

CREATE TRIGGER `audit_logs_before_delete`
    BEFORE DELETE ON `audit_logs`
    FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs are immutable';

-- AddForeignKey
ALTER TABLE `partners` ADD CONSTRAINT `partners_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_tokens` ADD CONSTRAINT `partner_tokens_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_tokens` ADD CONSTRAINT `partner_tokens_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_tokens` ADD CONSTRAINT `partner_tokens_deactivated_by_user_id_fkey` FOREIGN KEY (`deactivated_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_token_id_fkey` FOREIGN KEY (`token_id`) REFERENCES `partner_tokens`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_deleted_by_user_id_fkey` FOREIGN KEY (`deleted_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
