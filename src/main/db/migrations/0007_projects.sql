CREATE TABLE `parking` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`text` text NOT NULL,
	`source` text DEFAULT 'app' NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`task_id` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `parking_project_idx` ON `parking` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `project_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`area_rules_json` text,
	`bridge_enabled` integer DEFAULT 0 NOT NULL,
	`last_scan_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_folders_path_idx` ON `project_folders` (`path`);--> statement-breakpoint
CREATE INDEX `project_folders_project_idx` ON `project_folders` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`color` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`next_step` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`release_platform` text,
	`last_opened_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_name_live_idx` ON `projects` (`name`) WHERE "projects"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`left_off` text DEFAULT '' NOT NULL,
	`next_step` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'taha' NOT NULL,
	`external_id` text,
	`files_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_project_idx` ON `sessions` (`project_id`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_external_idx` ON `sessions` (`external_id`);