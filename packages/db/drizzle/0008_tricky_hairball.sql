CREATE TABLE `user_workspace_overlays` (
	`user_id` text PRIMARY KEY NOT NULL,
	`overlay` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
