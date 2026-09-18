CREATE TABLE `prompt_events` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_id` text NOT NULL,
	`version_id` text,
	`action` text NOT NULL,
	`slot` text,
	`payload` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `prompt_events_prompt` ON `prompt_events` (`prompt_id`);--> statement-breakpoint
CREATE TABLE `prompt_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_id` text NOT NULL,
	`version_no` integer NOT NULL,
	`spec` text NOT NULL,
	`rendered` text NOT NULL,
	`checks` text NOT NULL,
	`source` text NOT NULL,
	`slot` text,
	`studio_version` text NOT NULL,
	`provider` text,
	`model` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`cached_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`latency_ms` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `prompt_versions_prompt` ON `prompt_versions` (`prompt_id`,`version_no`);--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`purpose` text NOT NULL,
	`subtype` text,
	`language` text DEFAULT 'ko' NOT NULL,
	`goal` text NOT NULL,
	`current_version_id` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `prompts_user_updated` ON `prompts` (`user_id`,`updated_at`);