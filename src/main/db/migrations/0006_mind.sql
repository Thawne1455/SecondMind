CREATE TABLE `checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`mood` integer,
	`energy` integer,
	`sleep_min` integer,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkins_day_unique` ON `checkins` (`day`);