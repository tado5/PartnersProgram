CREATE TABLE `deployment_operations` (
  `id` VARCHAR(80) NOT NULL,
  `completed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
