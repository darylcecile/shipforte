CREATE TABLE `agent_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`client_name` text NOT NULL,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_connection_user` ON `agent_connections` (`user_id`);--> statement-breakpoint
CREATE TABLE `agent_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`connection_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`metadata` text,
	`used_at` integer,
	`result_id` text,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `agent_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `request_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submission_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`request_id` text NOT NULL,
	`input` text NOT NULL,
	`repo_name` text NOT NULL,
	`commit_sha` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`rejected_at` integer,
	`submission_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `agent_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_request` ON `submission_drafts` (`connection_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `draft_user` ON `submission_drafts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`submission_id` text,
	`harness` text NOT NULL,
	`label` text NOT NULL,
	`version` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`agent` text DEFAULT '' NOT NULL,
	`models` text DEFAULT '[]' NOT NULL,
	`usage` text,
	`name` text,
	`format` text,
	`key` text,
	`source_url` text,
	`sha256` text,
	`size` integer DEFAULT 0 NOT NULL,
	`hidden_at` integer,
	`hidden_by` text,
	`moderation_reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`hidden_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transcript_submission` ON `transcripts` (`submission_id`);--> statement-breakpoint
CREATE INDEX `transcript_owner` ON `transcripts` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `oauth_states` ADD `return_to` text DEFAULT '/' NOT NULL;