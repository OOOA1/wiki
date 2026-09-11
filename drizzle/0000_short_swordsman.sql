CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`section_id` text NOT NULL,
	`content` text NOT NULL,
	`format` text DEFAULT 'markdown' NOT NULL,
	`excerpt` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`is_example` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_articles_section_status` ON `articles` (`section_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_articles_updated` ON `articles` (`updated_at`);--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`member_id` text NOT NULL,
	`article_id` text NOT NULL,
	PRIMARY KEY(`member_id`, `article_id`),
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`label` text NOT NULL,
	`role` text NOT NULL,
	`max_uses` integer NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invitations_token_hash` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`invitation_id` text
);
--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`format` text NOT NULL,
	`version` integer NOT NULL,
	`author_name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_revisions_article` ON `revisions` (`article_id`);--> statement-breakpoint
CREATE TABLE `sections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`color` text DEFAULT 'purple' NOT NULL,
	`icon` text DEFAULT 'code' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wiki_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`seeded` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`member_id` text NOT NULL,
	`article_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_uploads_article` ON `uploads` (`article_id`);