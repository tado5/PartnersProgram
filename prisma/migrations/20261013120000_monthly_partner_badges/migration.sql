ALTER TABLE `companies`
  ADD COLUMN `bronze_monthly_turnover_eur` DECIMAL(10,2) NULL,
  ADD COLUMN `silver_monthly_turnover_eur` DECIMAL(10,2) NULL,
  ADD COLUMN `gold_monthly_turnover_eur` DECIMAL(10,2) NULL,
  ADD CONSTRAINT `companies_monthly_badges_positive_chk`
    CHECK (
      (`bronze_monthly_turnover_eur` IS NULL OR `bronze_monthly_turnover_eur` > 0) AND
      (`silver_monthly_turnover_eur` IS NULL OR `silver_monthly_turnover_eur` > 0) AND
      (`gold_monthly_turnover_eur` IS NULL OR `gold_monthly_turnover_eur` > 0)
    ),
  ADD CONSTRAINT `companies_monthly_badges_order_chk`
    CHECK (
      (`bronze_monthly_turnover_eur` IS NULL OR `silver_monthly_turnover_eur` IS NULL OR `bronze_monthly_turnover_eur` < `silver_monthly_turnover_eur`) AND
      (`bronze_monthly_turnover_eur` IS NULL OR `gold_monthly_turnover_eur` IS NULL OR `bronze_monthly_turnover_eur` < `gold_monthly_turnover_eur`) AND
      (`silver_monthly_turnover_eur` IS NULL OR `gold_monthly_turnover_eur` IS NULL OR `silver_monthly_turnover_eur` < `gold_monthly_turnover_eur`)
    );

CREATE TABLE `partner_badge_awards` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `company_id` BIGINT UNSIGNED NOT NULL,
  `partner_id` BIGINT UNSIGNED NOT NULL,
  `period_start` DATE NOT NULL,
  `tier` ENUM('bronze', 'silver', 'gold') NOT NULL,
  `monthly_turnover` DECIMAL(14,2) NOT NULL,
  `threshold_eur` DECIMAL(10,2) NOT NULL,
  `awarded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `partner_badge_awards_company_partner_period_uq` (`company_id`, `partner_id`, `period_start`),
  KEY `partner_badge_awards_company_period_tier_idx` (`company_id`, `period_start`, `tier`),
  CONSTRAINT `partner_badge_awards_turnover_chk`
    CHECK (`monthly_turnover` > 0 AND `threshold_eur` > 0 AND `monthly_turnover` >= `threshold_eur`),
  CONSTRAINT `partner_badge_awards_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `partner_badge_awards_company_id_partner_id_fkey`
    FOREIGN KEY (`company_id`, `partner_id`) REFERENCES `partners` (`company_id`, `id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
