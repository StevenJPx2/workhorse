CREATE TABLE `issue_events` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`issue_type` text DEFAULT 'task' NOT NULL,
	`url` text,
	`assignee` text,
	`labels` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`worktree_path` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issues_external_source_idx` ON `issues` (`external_id`,`source`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`source` text NOT NULL,
	`source_id` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`read_at` text,
	`acknowledged_at` text,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_source_id_unique` ON `notifications` (`source_id`);
