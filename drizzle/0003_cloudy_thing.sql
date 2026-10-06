CREATE TABLE `portfolio_pins` (
	`user_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`user_id`, `submission_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portfolio_position` ON `portfolio_pins` (`user_id`,`position`);--> statement-breakpoint
CREATE TABLE `transcript_highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`transcript_id` text NOT NULL,
	`turn_index` integer,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`caption` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transcript_id`) REFERENCES `transcripts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `highlight_submission` ON `transcript_highlights` (`submission_id`);--> statement-breakpoint
ALTER TABLE `attempts` ADD `requirements` text;--> statement-breakpoint
ALTER TABLE `challenges` ADD `requirements` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `requirement_id` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `evidence` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `video_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `learnings` text DEFAULT '' NOT NULL;