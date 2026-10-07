PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_situation_profiles` (
	`id` text NOT NULL,
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
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_situation_profiles`("id", "user_id", "name", "audience", "channel", "lang", "honorific", "formality", "length", "intent", "tone", "notes", "is_default", "created_at", "updated_at") SELECT "id", "user_id", "name", "audience", "channel", "lang", "honorific", "formality", "length", "intent", "tone", "notes", "is_default", "created_at", "updated_at" FROM `situation_profiles`;--> statement-breakpoint
DROP TABLE `situation_profiles`;--> statement-breakpoint
ALTER TABLE `__new_situation_profiles` RENAME TO `situation_profiles`;--> statement-breakpoint
PRAGMA foreign_keys=ON;