-- BASELINE. These tables predate Drizzle: they were created out-of-band on
-- prod (47 tickets, 143 escalations live at adoption) and mirrored in the old
-- worker/schema.sql. IF NOT EXISTS is deliberate and applies to THIS migration
-- only, so applying it to the existing database is a no-op that just records
-- the baseline in the ledger. Later migrations are generated normally.
--
-- Verified against sqlite_master before adoption: same 5 tables, same columns,
-- same 5 indexes.

CREATE TABLE IF NOT EXISTS `escalations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` text NOT NULL,
	`run_id` text NOT NULL,
	`trigger_kind` text NOT NULL,
	`detail` text NOT NULL,
	`stage` text,
	`to_model` text,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_esc_ticket` ON `escalations` (`ticket_id`,`run_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notifications` (
	`ticket_id` text NOT NULL,
	`seq` integer NOT NULL,
	`source` text NOT NULL,
	`kind` text DEFAULT 'comment' NOT NULL,
	`body` text NOT NULL,
	`author` text,
	`urgent` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	PRIMARY KEY(`ticket_id`, `seq`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_notifications_unread` ON `notifications` (`ticket_id`,`read_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `scripts` (
	`scope` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`code` text NOT NULL,
	`args` text DEFAULT '[]' NOT NULL,
	`status_gates` text DEFAULT '[]' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`scope`, `name`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`repo` text NOT NULL,
	`prompt` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`plan` text,
	`result` text,
	`error` text,
	`branch` text,
	`pr_url` text,
	`run_id` text,
	`workflow` text,
	`wf_instance` text,
	`heal_attempts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tickets_status` ON `tickets` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tickets_repo` ON `tickets` (`repo`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tickets_updated` ON `tickets` (`updated_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `traces` (
	`ticket_id` text NOT NULL,
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`archived_at` text NOT NULL,
	PRIMARY KEY(`ticket_id`, `run_id`)
);
