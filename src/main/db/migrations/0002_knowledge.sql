CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_name_live_idx` ON `collections` (`name`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `note_tags` (
	`note_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`note_id`, `tag_id`),
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_tags_tag_idx` ON `note_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body_md` text DEFAULT '' NOT NULL,
	`collection_id` text,
	`project_id` text,
	`course_id` text,
	`week_id` text,
	`pinned` integer DEFAULT false NOT NULL,
	`ai_excluded` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notes_list_idx` ON `notes` (`deleted_at`,`pinned`,`updated_at`);--> statement-breakpoint
CREATE INDEX `notes_collection_idx` ON `notes` (`collection_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
-- Elle eklendi (drizzle-kit FTS5 bilmez). External content: metin notes'ta, FTS sadece dizin.
-- notes'un açık INTEGER PRIMARY KEY'i yok; VACUUM rowid'leri değiştirebilir. VACUUM sonrası:
-- INSERT INTO notes_fts(notes_fts) VALUES('rebuild');
CREATE VIRTUAL TABLE `notes_fts` USING fts5(
	title, body_md,
	content='notes', content_rowid='rowid',
	tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `notes_fts_ai` AFTER INSERT ON `notes` BEGIN
	INSERT INTO notes_fts(rowid, title, body_md) VALUES (new.rowid, new.title, new.body_md);
END;
--> statement-breakpoint
CREATE TRIGGER `notes_fts_ad` AFTER DELETE ON `notes` BEGIN
	INSERT INTO notes_fts(notes_fts, rowid, title, body_md) VALUES ('delete', old.rowid, old.title, old.body_md);
END;
--> statement-breakpoint
CREATE TRIGGER `notes_fts_au` AFTER UPDATE OF title, body_md ON `notes` BEGIN
	INSERT INTO notes_fts(notes_fts, rowid, title, body_md) VALUES ('delete', old.rowid, old.title, old.body_md);
	INSERT INTO notes_fts(rowid, title, body_md) VALUES (new.rowid, new.title, new.body_md);
END;
