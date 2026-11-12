CREATE TABLE `topics` (
  `id` varchar(64) NOT NULL,
  `slug` varchar(191) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text,
  `created_at` varchar(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_topics_slug` (`slug`)
) ENGINE=InnoDB;
--> statement-breakpoint
ALTER TABLE `decks`
  ADD COLUMN `topic_id` varchar(64) NULL,
  ADD COLUMN `lesson_key` varchar(64) NULL,
  ADD UNIQUE KEY `uq_decks_lesson_key` (`lesson_key`),
  ADD KEY `idx_decks_topic` (`topic_id`),
  ADD CONSTRAINT `fk_decks_topic` FOREIGN KEY (`topic_id`) REFERENCES `topics` (`id`) ON DELETE RESTRICT;
