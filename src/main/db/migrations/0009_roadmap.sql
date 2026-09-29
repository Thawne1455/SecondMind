CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`target_date` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`criteria_json` text DEFAULT '[]' NOT NULL,
	`done_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `milestones_project_idx` ON `milestones` (`project_id`,`sort`);--> statement-breakpoint
CREATE TABLE `playtest_clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`task_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `playtest_clusters_project_idx` ON `playtest_clusters` (`project_id`);--> statement-breakpoint
CREATE TABLE `playtest_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`tester` text NOT NULL,
	`received_on` text NOT NULL,
	`raw_text` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `playtest_feedback_project_idx` ON `playtest_feedback` (`project_id`,`received_on`);--> statement-breakpoint
CREATE TABLE `playtest_points` (
	`id` text PRIMARY KEY NOT NULL,
	`feedback_id` text NOT NULL,
	`text` text NOT NULL,
	`stems` text NOT NULL,
	`cluster_id` text,
	`locked` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`feedback_id`) REFERENCES `playtest_feedback`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playtest_points_feedback_idx` ON `playtest_points` (`feedback_id`);--> statement-breakpoint
CREATE INDEX `playtest_points_cluster_idx` ON `playtest_points` (`cluster_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `kanban_status` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `severity` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `repro_steps` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `milestone_set_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `source` text DEFAULT 'taha' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `source_id` text;--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`,`kanban_status`);--> statement-breakpoint
UPDATE `tasks` SET `kanban_status` = CASE `status` WHEN 'done' THEN 'done' ELSE 'todo' END WHERE `project_id` IS NOT NULL;--> statement-breakpoint
UPDATE `tasks` SET `source` = 'park', `source_id` = (SELECT `p`.`id` FROM `parking` `p` WHERE `p`.`task_id` = `tasks`.`id`) WHERE `id` IN (SELECT `task_id` FROM `parking` WHERE `task_id` IS NOT NULL);--> statement-breakpoint
UPDATE `tasks` SET `source` = 'todo', `source_id` = (SELECT `c`.`id` FROM `code_todos` `c` WHERE `c`.`task_id` = `tasks`.`id` LIMIT 1) WHERE `id` IN (SELECT `task_id` FROM `code_todos` WHERE `task_id` IS NOT NULL);
