CREATE TABLE `app_settings` (
	`key` varchar(100) PRIMARY KEY,
	`value` text NOT NULL,
	`updated_at` varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`token_hash` varchar(64) PRIMARY KEY,
	`actor_id` varchar(100) NOT NULL,
	`expires_at` varchar(32) NOT NULL,
	`created_at` varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deck_items` (
	`deck_id` varchar(64) NOT NULL,
	`entry_id` varchar(64) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT PRIMARY KEY(`deck_id`,`entry_id`)
);
--> statement-breakpoint
CREATE TABLE `decks` (
	`id` varchar(64) PRIMARY KEY,
	`name` varchar(100) NOT NULL,
	`description` text,
	`visibility` varchar(16) NOT NULL DEFAULT 'private',
	`created_at` varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generation_candidates` (
	`id` varchar(64) PRIMARY KEY,
	`job_id` varchar(64) NOT NULL,
	`payload` text NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`accepted_entry_id` varchar(64)
);
--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` varchar(64) PRIMARY KEY,
	`provider` varchar(32) NOT NULL,
	`model` varchar(100) NOT NULL,
	`prompt` text NOT NULL,
	`status` varchar(32) NOT NULL,
	`requested_count` int NOT NULL,
	`created_at` varchar(32) NOT NULL,
	`completed_at` varchar(32),
	`error` varchar(120),
	`params_json` text,
	`input_tokens` int,
	`output_tokens` int
);
--> statement-breakpoint
CREATE TABLE `guest_account_merges` (
	`guest_user_id` varchar(64) PRIMARY KEY,
	`learner_user_id` varchar(64) NOT NULL,
	`merged_at` varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learner_accounts` (
	`id` varchar(64) PRIMARY KEY,
	`username` varchar(50) NOT NULL,
	`username_key` varchar(50) NOT NULL,
	`display_name` varchar(120) NOT NULL,
	`password_hash` text NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`created_at` varchar(32) NOT NULL,
	`updated_at` varchar(32) NOT NULL,
	CONSTRAINT `username_key_unique` UNIQUE INDEX(`username_key`)
);
--> statement-breakpoint
CREATE TABLE `learner_login_limits` (
	`username_key` varchar(50) PRIMARY KEY,
	`failures` int NOT NULL DEFAULT 0,
	`locked_until` varchar(32),
	`updated_at` varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learner_signup_events` (
	`id` varchar(64) PRIMARY KEY,
	`created_at` varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `legacy_id_map` (
	`old_id` varchar(191) PRIMARY KEY,
	`new_id` varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `legacy_import_records` (
	`old_id` varchar(191) PRIMARY KEY,
	`raw_data` text NOT NULL,
	`legacy_created_at` varchar(32),
	`legacy_updated_at` varchar(32),
	`imported_at` varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_cards` (
	`id` varchar(64) PRIMARY KEY,
	`user_id` varchar(64) NOT NULL,
	`entry_id` varchar(64) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'new',
	`next_review_at` varchar(32),
	`streak` int NOT NULL DEFAULT 0,
	`times_reviewed` int NOT NULL DEFAULT 0,
	`correct_count` int NOT NULL DEFAULT 0,
	`wrong_count` int NOT NULL DEFAULT 0,
	`last_reviewed_at` varchar(32),
	CONSTRAINT `uq_review_user_entry` UNIQUE INDEX(`user_id`,`entry_id`)
);
--> statement-breakpoint
CREATE TABLE `review_events` (
	`id` varchar(64) PRIMARY KEY,
	`card_id` varchar(64) NOT NULL,
	`result` varchar(16) NOT NULL,
	`reviewed_at` varchar(32) NOT NULL,
	`request_id` varchar(64),
	CONSTRAINT `uq_review_request` UNIQUE INDEX(`request_id`)
);
--> statement-breakpoint
CREATE TABLE `user_deck_enrollments` (
	`user_id` varchar(64) NOT NULL,
	`deck_id` varchar(64) NOT NULL,
	`enrolled_at` varchar(32) NOT NULL,
	CONSTRAINT PRIMARY KEY(`user_id`,`deck_id`)
);
--> statement-breakpoint
CREATE TABLE `vocabulary_entries` (
	`id` varchar(64) PRIMARY KEY,
	`language` varchar(10) NOT NULL DEFAULT 'ja',
	`word` varchar(120) NOT NULL,
	`reading` varchar(120) NOT NULL,
	`romanization` varchar(120),
	`part_of_speech` varchar(80),
	`jlpt_level` varchar(8),
	`normalized_key` varchar(400) COLLATE utf8mb4_bin NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'draft',
	`source` varchar(24) NOT NULL DEFAULT 'manual',
	`source_ref` varchar(200),
	`created_at` varchar(32) NOT NULL,
	`updated_at` varchar(32) NOT NULL,
	CONSTRAINT `uq_vocabulary_normalized` UNIQUE INDEX(`language`,`normalized_key`)
);
--> statement-breakpoint
CREATE TABLE `vocabulary_examples` (
	`id` varchar(64) PRIMARY KEY,
	`entry_id` varchar(64) NOT NULL,
	`sentence` text NOT NULL,
	`translation_vi` text,
	`source` varchar(24) NOT NULL DEFAULT 'manual'
);
--> statement-breakpoint
CREATE TABLE `vocabulary_senses` (
	`id` varchar(64) PRIMARY KEY,
	`entry_id` varchar(64) NOT NULL,
	`language` varchar(10) NOT NULL,
	`meaning` text NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_expiry` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_generation_candidates_job` ON `generation_candidates` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_learner_accounts_status` ON `learner_accounts` (`status`);--> statement-breakpoint
CREATE INDEX `idx_learner_locked_until` ON `learner_login_limits` (`locked_until`);--> statement-breakpoint
CREATE INDEX `idx_signup_events_time` ON `learner_signup_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_legacy_imported_at` ON `legacy_import_records` (`imported_at`);--> statement-breakpoint
CREATE INDEX `idx_review_cards_user_due` ON `review_cards` (`user_id`,`next_review_at`);--> statement-breakpoint
CREATE INDEX `idx_review_events_card` ON `review_events` (`card_id`);--> statement-breakpoint
CREATE INDEX `idx_review_events_reviewed` ON `review_events` (`reviewed_at`);--> statement-breakpoint
CREATE INDEX `idx_enrollments_user` ON `user_deck_enrollments` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_vocabulary_status` ON `vocabulary_entries` (`status`);--> statement-breakpoint
CREATE INDEX `idx_vocabulary_examples_entry` ON `vocabulary_examples` (`entry_id`);--> statement-breakpoint
CREATE INDEX `idx_senses_entry` ON `vocabulary_senses` (`entry_id`);--> statement-breakpoint
ALTER TABLE `deck_items` ADD CONSTRAINT `deck_items_deck_id_decks_id_fkey` FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `deck_items` ADD CONSTRAINT `deck_items_entry_id_vocabulary_entries_id_fkey` FOREIGN KEY (`entry_id`) REFERENCES `vocabulary_entries`(`id`) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE `generation_candidates` ADD CONSTRAINT `generation_candidates_job_id_generation_jobs_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `generation_jobs`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `generation_candidates` ADD CONSTRAINT `generation_candidates_IokOuylCAc34_fkey` FOREIGN KEY (`accepted_entry_id`) REFERENCES `vocabulary_entries`(`id`);--> statement-breakpoint
ALTER TABLE `legacy_id_map` ADD CONSTRAINT `legacy_id_map_new_id_vocabulary_entries_id_fkey` FOREIGN KEY (`new_id`) REFERENCES `vocabulary_entries`(`id`);--> statement-breakpoint
ALTER TABLE `legacy_import_records` ADD CONSTRAINT `legacy_import_records_old_id_legacy_id_map_old_id_fkey` FOREIGN KEY (`old_id`) REFERENCES `legacy_id_map`(`old_id`);--> statement-breakpoint
ALTER TABLE `review_cards` ADD CONSTRAINT `review_cards_entry_id_vocabulary_entries_id_fkey` FOREIGN KEY (`entry_id`) REFERENCES `vocabulary_entries`(`id`);--> statement-breakpoint
ALTER TABLE `review_events` ADD CONSTRAINT `review_events_card_id_review_cards_id_fkey` FOREIGN KEY (`card_id`) REFERENCES `review_cards`(`id`);--> statement-breakpoint
ALTER TABLE `user_deck_enrollments` ADD CONSTRAINT `user_deck_enrollments_deck_id_decks_id_fkey` FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE `vocabulary_examples` ADD CONSTRAINT `vocabulary_examples_entry_id_vocabulary_entries_id_fkey` FOREIGN KEY (`entry_id`) REFERENCES `vocabulary_entries`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `vocabulary_senses` ADD CONSTRAINT `vocabulary_senses_entry_id_vocabulary_entries_id_fkey` FOREIGN KEY (`entry_id`) REFERENCES `vocabulary_entries`(`id`) ON DELETE CASCADE;