ALTER TABLE `companies`
  ADD COLUMN `purchase_confirm_above_eur` DECIMAL(10,2) NULL,
  ADD CONSTRAINT `companies_purchase_confirm_above_eur_chk`
    CHECK (`purchase_confirm_above_eur` IS NULL OR `purchase_confirm_above_eur` > 0);
