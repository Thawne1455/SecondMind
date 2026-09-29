CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`media_id` text,
	`external_path` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`doc_id` text,
	`task_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assets_project_idx` ON `assets` (`project_id`);--> statement-breakpoint
CREATE TABLE `project_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`parent_id` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`body_md` text DEFAULT '' NOT NULL,
	`source_path` text,
	`kind` text DEFAULT 'page' NOT NULL,
	`ai_open` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_docs_project_idx` ON `project_docs` (`project_id`,`parent_id`,`sort`);--> statement-breakpoint
CREATE TABLE `project_log_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`day` text NOT NULL,
	`kind` text DEFAULT 'note' NOT NULL,
	`body_md` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_log_notes_project_idx` ON `project_log_notes` (`project_id`,`day`);--> statement-breakpoint
CREATE TABLE `project_shots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`media_id` text NOT NULL,
	`taken_on` text NOT NULL,
	`taken_at` integer NOT NULL,
	`source` text NOT NULL,
	`source_path` text,
	`starred` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_shots_media_idx` ON `project_shots` (`project_id`,`media_id`);--> statement-breakpoint
CREATE INDEX `project_shots_day_idx` ON `project_shots` (`project_id`,`taken_on`);--> statement-breakpoint
ALTER TABLE `project_folders` ADD `image_dirs_json` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `count_rules_json` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `shot_media_id` text;--> statement-breakpoint
-- Elle eklendi (drizzle-kit FTS5 bilmez): notes_fts ile aynı düzen. Bağlı dosya sayfalarının metni diskte;
-- onların body_md'si boş kalır, aramaya sadece başlıkları girer. VACUUM sonrası:
-- INSERT INTO project_docs_fts(project_docs_fts) VALUES('rebuild');
CREATE VIRTUAL TABLE `project_docs_fts` USING fts5(
	title, body_md,
	content='project_docs', content_rowid='rowid',
	tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `project_docs_fts_ai` AFTER INSERT ON `project_docs` BEGIN
	INSERT INTO project_docs_fts(rowid, title, body_md) VALUES (new.rowid, new.title, new.body_md);
END;
--> statement-breakpoint
CREATE TRIGGER `project_docs_fts_ad` AFTER DELETE ON `project_docs` BEGIN
	INSERT INTO project_docs_fts(project_docs_fts, rowid, title, body_md) VALUES ('delete', old.rowid, old.title, old.body_md);
END;
--> statement-breakpoint
CREATE TRIGGER `project_docs_fts_au` AFTER UPDATE OF title, body_md ON `project_docs` BEGIN
	INSERT INTO project_docs_fts(project_docs_fts, rowid, title, body_md) VALUES ('delete', old.rowid, old.title, old.body_md);
	INSERT INTO project_docs_fts(rowid, title, body_md) VALUES (new.rowid, new.title, new.body_md);
END;
