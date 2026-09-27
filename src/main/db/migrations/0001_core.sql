CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target_table` text NOT NULL,
	`target_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`group_id` text,
	`undone_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_log_target_idx` ON `activity_log` (`target_table`,`target_id`);--> statement-breakpoint
CREATE TABLE `dump_attachments` (
	`dump_id` text NOT NULL,
	`media_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`dump_id`, `media_id`),
	FOREIGN KEY (`dump_id`) REFERENCES `dump_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dump_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`job_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `dump_items_queue_idx` ON `dump_items` (`status`,`deleted_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`file_name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`original_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_hash_unique` ON `media` (`hash`);