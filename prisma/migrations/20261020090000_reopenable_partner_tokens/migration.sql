ALTER TABLE `partner_tokens`
  ADD COLUMN `token_encrypted` VARCHAR(255) NULL,
  ADD COLUMN `active_type` ENUM('qr', 'nfc') NULL;

-- Existing tokens are test data. Retain the newest active token of each type.
UPDATE `partner_tokens` AS older
JOIN `partner_tokens` AS newer
  ON newer.company_id = older.company_id
  AND newer.partner_id = older.partner_id
  AND newer.type = older.type
  AND newer.is_active = 1
  AND (newer.created_at > older.created_at OR (newer.created_at = older.created_at AND newer.id > older.id))
SET older.is_active = 0,
    older.deactivated_at = CURRENT_TIMESTAMP(3),
    older.deactivation_reason = 'Migrácia testovacích údajov: ponechaný najnovší prístup rovnakého typu.'
WHERE older.is_active = 1;

UPDATE `partner_tokens` SET `active_type` = IF(`is_active` = 1, `type`, NULL);

CREATE UNIQUE INDEX `partner_tokens_one_active_type_uq`
  ON `partner_tokens` (`company_id`, `partner_id`, `active_type`);

CREATE TRIGGER `partner_tokens_active_type_insert`
BEFORE INSERT ON `partner_tokens`
FOR EACH ROW SET NEW.active_type = IF(NEW.is_active = 1, NEW.type, NULL);

CREATE TRIGGER `partner_tokens_active_type_update`
BEFORE UPDATE ON `partner_tokens`
FOR EACH ROW SET NEW.active_type = IF(NEW.is_active = 1, NEW.type, NULL);
