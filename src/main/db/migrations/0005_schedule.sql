CREATE TABLE `schedule_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`start_min` integer NOT NULL,
	`end_min` integer NOT NULL,
	`kind` text NOT NULL,
	`source_id` text NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `schedule_blocks_day_idx` ON `schedule_blocks` (`day`,`start_min`);