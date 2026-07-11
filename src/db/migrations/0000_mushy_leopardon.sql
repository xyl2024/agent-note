CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`path` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assets_page_idx` ON `assets` (`page_id`);--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`parent_block_id` text,
	`order` real NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `blocks_page_idx` ON `blocks` (`page_id`,`order`);--> statement-breakpoint
CREATE INDEX `blocks_parent_idx` ON `blocks` (`parent_block_id`,`order`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`title` text DEFAULT 'Untitled' NOT NULL,
	`slug` text NOT NULL,
	`icon_type` text,
	`icon_value` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pages_parent_idx` ON `pages` (`parent_id`);--> statement-breakpoint
CREATE INDEX `pages_updated_idx` ON `pages` (`updated_at`);