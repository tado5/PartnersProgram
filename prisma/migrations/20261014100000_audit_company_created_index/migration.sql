ALTER TABLE `audit_logs`
  ADD INDEX `audit_logs_company_created_idx` (`company_id`, `created_at`, `id`);
