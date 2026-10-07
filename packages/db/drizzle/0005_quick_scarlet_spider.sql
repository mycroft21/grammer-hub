CREATE TABLE `prompt_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`purpose` text,
	`subtype` text,
	`ticket_key` text,
	`runtime` text,
	`language` text,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`checks_passed` integer,
	`checks_total` integer,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`cached_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`latency_ms` integer,
	`studio_version` text NOT NULL,
	`prompt_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `prompt_runs_user_created` ON `prompt_runs` (`user_id`,`created_at`);