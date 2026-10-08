CREATE TABLE `user_integrations` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`site_url` text NOT NULL,
	`cloud_id` text NOT NULL,
	`scopes` text NOT NULL,
	`access_token_enc` text NOT NULL,
	`access_expires_at` integer NOT NULL,
	`refresh_token_enc` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
