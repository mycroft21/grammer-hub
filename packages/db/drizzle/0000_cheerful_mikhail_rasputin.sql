CREATE TABLE `correction_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`level` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`profile_version_id` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`cached_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`ttfb_ms` integer,
	`latency_ms` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`error_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `correction_runs_created` ON `correction_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`text_nfc` text,
	`text_masked` text,
	`mask_map` text,
	`text_hash` text NOT NULL,
	`lang` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `feedback_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`suggestion_id` text,
	`action` text NOT NULL,
	`final_text` text,
	`chosen_index` integer,
	`rejected_indexes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `correction_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `feedback_events_run` ON `feedback_events` (`run_id`);--> statement-breakpoint
CREATE TABLE `personal_dictionary` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`term` text NOT NULL,
	`note` text,
	`mask` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `profile_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`hash` text NOT NULL,
	`activated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `run_finals` (
	`run_id` text PRIMARY KEY NOT NULL,
	`final_text` text NOT NULL,
	`copied_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `correction_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `situation_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`audience` text NOT NULL,
	`channel` text NOT NULL,
	`lang` text NOT NULL,
	`honorific` text NOT NULL,
	`formality` integer NOT NULL,
	`length` text NOT NULL,
	`intent` text NOT NULL,
	`tone` text NOT NULL,
	`notes` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `style_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`text` text NOT NULL,
	`scope` text DEFAULT '{}' NOT NULL,
	`alpha` real DEFAULT 1 NOT NULL,
	`beta` real DEFAULT 1 NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`evidence_ids` text DEFAULT '[]' NOT NULL,
	`created_by` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `style_rules_user_status` ON `style_rules` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`start` integer,
	`end` integer,
	`original` text,
	`replacement` text NOT NULL,
	`category` text,
	`severity` text,
	`reason` text,
	`rule_ref` text,
	`confidence` real,
	`alt_index` integer,
	`alt_label` text,
	`resolve_method` text,
	`dropped` integer DEFAULT false NOT NULL,
	`drop_reason` text,
	FOREIGN KEY (`run_id`) REFERENCES `correction_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `suggestions_run` ON `suggestions` (`run_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);