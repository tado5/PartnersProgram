CREATE TABLE `company_privacy_drafts` (
  `company_id` BIGINT UNSIGNED NOT NULL,
  `controller_name` VARCHAR(150) NOT NULL,
  `controller_address` VARCHAR(500) NOT NULL,
  `controller_ico` VARCHAR(8) NULL,
  `contact_email` VARCHAR(191) NOT NULL,
  `dpo_contact` VARCHAR(500) NULL,
  `body` TEXT NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`company_id`),
  CONSTRAINT `company_privacy_drafts_company_fk` FOREIGN KEY (`company_id`)
    REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `company_privacy_notices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `company_id` BIGINT UNSIGNED NOT NULL,
  `version` INTEGER UNSIGNED NOT NULL,
  `controller_name` VARCHAR(150) NOT NULL,
  `controller_address` VARCHAR(500) NOT NULL,
  `controller_ico` VARCHAR(8) NULL,
  `contact_email` VARCHAR(191) NOT NULL,
  `dpo_contact` VARCHAR(500) NULL,
  `body` TEXT NOT NULL,
  `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `published_by_user_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `company_privacy_notices_company_version_uq` (`company_id`, `version`),
  UNIQUE INDEX `company_privacy_notices_company_id_uq` (`company_id`, `id`),
  CONSTRAINT `company_privacy_notices_company_fk` FOREIGN KEY (`company_id`)
    REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `company_privacy_notices_publisher_fk` FOREIGN KEY (`published_by_user_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `company_privacy_notices_version_chk` CHECK (`version` > 0),
  CONSTRAINT `company_privacy_notices_body_chk` CHECK (CHAR_LENGTH(`body`) BETWEEN 100 AND 20000),
  CONSTRAINT `company_privacy_notices_controller_name_chk` CHECK (CHAR_LENGTH(TRIM(`controller_name`)) > 0),
  CONSTRAINT `company_privacy_notices_controller_address_chk` CHECK (CHAR_LENGTH(TRIM(`controller_address`)) > 0),
  CONSTRAINT `company_privacy_notices_controller_ico_chk` CHECK (`controller_ico` IS NULL OR `controller_ico` REGEXP '^[0-9]{8}$')
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `company_privacy_receipts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `company_id` BIGINT UNSIGNED NOT NULL,
  `partner_id` BIGINT UNSIGNED NOT NULL,
  `notice_id` BIGINT UNSIGNED NOT NULL,
  `provided_at` DATETIME(3) NOT NULL,
  `method` ENUM('in_person', 'printed', 'email') NOT NULL,
  `recorded_by_user_id` BIGINT UNSIGNED NOT NULL,
  `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reason` VARCHAR(500) NULL,
  PRIMARY KEY (`id`),
  INDEX `company_privacy_receipts_partner_recorded_idx` (`company_id`, `partner_id`, `recorded_at`, `id`),
  INDEX `company_privacy_receipts_company_notice_idx` (`company_id`, `notice_id`),
  CONSTRAINT `company_privacy_receipts_company_fk` FOREIGN KEY (`company_id`)
    REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `company_privacy_receipts_partner_fk` FOREIGN KEY (`company_id`, `partner_id`)
    REFERENCES `partners` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `company_privacy_receipts_notice_fk` FOREIGN KEY (`company_id`, `notice_id`)
    REFERENCES `company_privacy_notices` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `company_privacy_receipts_recorder_fk` FOREIGN KEY (`recorded_by_user_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Published notices and delivery history are append-only, including for migration users.
CREATE TRIGGER `company_privacy_notices_no_update`
BEFORE UPDATE ON `company_privacy_notices` FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published privacy notices are immutable';

CREATE TRIGGER `company_privacy_notices_no_delete`
BEFORE DELETE ON `company_privacy_notices` FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published privacy notices are immutable';

CREATE TRIGGER `company_privacy_receipts_no_update`
BEFORE UPDATE ON `company_privacy_receipts` FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Privacy delivery history is immutable';

CREATE TRIGGER `company_privacy_receipts_no_delete`
BEFORE DELETE ON `company_privacy_receipts` FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Privacy delivery history is immutable';
