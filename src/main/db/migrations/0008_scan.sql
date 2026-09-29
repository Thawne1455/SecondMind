CREATE TABLE `code_todos` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`key` text NOT NULL,
	`path` text NOT NULL,
	`line` integer NOT NULL,
	`tag` text NOT NULL,
	`text` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`resolved_at` integer,
	`task_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`folder_id`) REFERENCES `project_folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `code_todos_folder_key_idx` ON `code_todos` (`folder_id`,`key`);--> statement-breakpoint
CREATE INDEX `code_todos_project_idx` ON `code_todos` (`project_id`,`resolved_at`);--> statement-breakpoint
CREATE TABLE `commits` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`hash` text NOT NULL,
	`message` text NOT NULL,
	`author` text NOT NULL,
	`committed_at` integer NOT NULL,
	`areas_json` text NOT NULL,
	`files_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`folder_id`) REFERENCES `project_folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commits_folder_hash_idx` ON `commits` (`folder_id`,`hash`);--> statement-breakpoint
CREATE INDEX `commits_project_idx` ON `commits` (`project_id`,`committed_at`);--> statement-breakpoint
CREATE TABLE `scan_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text NOT NULL,
	`scanned_at` integer NOT NULL,
	`summary_json` text NOT NULL,
	`inventory_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `project_folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scan_snapshots_folder_idx` ON `scan_snapshots` (`folder_id`,`scanned_at`);