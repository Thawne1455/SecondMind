CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`status` text DEFAULT 'incubating' NOT NULL,
	`incubate_until` integer NOT NULL,
	`decided_at` integer,
	`last_opened_at` integer,
	`project_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ideas_note_id_unique` ON `ideas` (`note_id`);--> statement-breakpoint
CREATE INDEX `ideas_status_idx` ON `ideas` (`status`,`incubate_until`);