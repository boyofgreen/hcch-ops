CREATE TABLE `ciders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ciders_name_unique` ON `ciders` (`name`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`tabc_license` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_name_unique` ON `locations` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `locations_slug_unique` ON `locations` (`slug`);--> statement-breakpoint
CREATE TABLE `monthly_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`location_id` integer NOT NULL,
	`cider_id` integer NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`bottles_on_hand` integer DEFAULT 0 NOT NULL,
	`kegs_on_hand` integer DEFAULT 0 NOT NULL,
	`togo_bottles` integer DEFAULT 0 NOT NULL,
	`togo_kegs` integer DEFAULT 0 NOT NULL,
	`retail_bottles` integer DEFAULT 0 NOT NULL,
	`retail_kegs` integer DEFAULT 0 NOT NULL,
	`transfers_in_bottles` integer DEFAULT 0 NOT NULL,
	`transfers_in_kegs` integer DEFAULT 0 NOT NULL,
	`transfers_out_bottles` integer DEFAULT 0 NOT NULL,
	`transfers_out_kegs` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cider_id`) REFERENCES `ciders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_entries_unique` ON `monthly_entries` (`location_id`,`cider_id`,`year`,`month`);--> statement-breakpoint
CREATE INDEX `monthly_entries_loc_month` ON `monthly_entries` (`location_id`,`year`,`month`);