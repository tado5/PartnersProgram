ALTER TABLE `companies`
  ADD COLUMN `logo_data` MEDIUMBLOB NULL,
  ADD COLUMN `logo_version` CHAR(64) NULL;
