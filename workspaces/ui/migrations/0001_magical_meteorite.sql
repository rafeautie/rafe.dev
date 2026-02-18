CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hourly_rate` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active',
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `time_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`description` text,
	`start_time` text NOT NULL,
	`end_time` text,
	`duration_minutes` integer DEFAULT 0,
	`is_billed` integer DEFAULT false,
	`effective_rate` real NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `proj_time_idx` ON `time_entry` (`project_id`);--> statement-breakpoint
CREATE INDEX `billed_status_idx` ON `time_entry` (`is_billed`);