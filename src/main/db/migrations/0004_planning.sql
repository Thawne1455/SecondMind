CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`at` integer NOT NULL,
	`rule_json` text,
	`fired_at` integer,
	`missed_at` integer,
	`project_id` text,
	`course_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `reminders_at_idx` ON `reminders` (`at`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`days_json` text NOT NULL,
	`start_time` text NOT NULL,
	`duration_min` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` integer DEFAULT 2 NOT NULL,
	`estimate_min` integer,
	`due_date` text,
	`planned_date` text,
	`postpone_count` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`kind` text DEFAULT 'task' NOT NULL,
	`project_id` text,
	`course_id` text,
	`milestone_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`,`planned_date`);--> statement-breakpoint
CREATE INDEX `tasks_completed_idx` ON `tasks` (`completed_at`);