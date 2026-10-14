ALTER TABLE `companies`
  ADD COLUMN `vat_rate_percent` DECIMAL(5,2) NOT NULL DEFAULT 23.00,
  ADD CONSTRAINT `companies_vat_rate_percent_chk`
    CHECK (`vat_rate_percent` >= 0 AND `vat_rate_percent` <= 100);

ALTER TABLE `purchases`
  DROP CONSTRAINT `purchases_points_amount_chk`,
  ADD COLUMN `vat_rate_percent` DECIMAL(5,2) NOT NULL DEFAULT 23.00,
  ADD COLUMN `net_amount` DECIMAL(10,2) NULL;

UPDATE `purchases`
SET `net_amount` = ROUND(`amount` * 100 / (100 + `vat_rate_percent`), 2),
    `points` = FLOOR(ROUND(`amount` * 100 / (100 + `vat_rate_percent`), 2));

ALTER TABLE `purchases`
  MODIFY COLUMN `net_amount` DECIMAL(10,2) NOT NULL,
  ADD CONSTRAINT `purchases_vat_rate_percent_chk`
    CHECK (`vat_rate_percent` >= 0 AND `vat_rate_percent` <= 100),
  ADD CONSTRAINT `purchases_net_amount_chk`
    CHECK (
      `net_amount` > 0 AND
      `net_amount` <= `amount` AND
      `amount` <= 999999.99 AND
      `net_amount` = ROUND(`amount` * 100 / (100 + `vat_rate_percent`), 2)
    ),
  ADD CONSTRAINT `purchases_points_net_amount_chk`
    CHECK (`points` = FLOOR(`net_amount`));

ALTER TABLE `partner_badge_awards`
  ADD COLUMN `calculation_basis` ENUM('gross', 'net') NOT NULL DEFAULT 'gross';
