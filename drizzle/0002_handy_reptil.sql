ALTER TABLE `submissions` ADD `visibility` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `published_at` integer;--> statement-breakpoint
UPDATE `submissions` SET `published_at` = `created_at` WHERE `visibility` = 'public';--> statement-breakpoint
CREATE TRIGGER `submission_publication_is_permanent`
BEFORE UPDATE OF `visibility` ON `submissions`
WHEN OLD.`visibility` = 'public' AND NEW.`visibility` <> 'public'
BEGIN
  SELECT RAISE(ABORT, 'Public submissions cannot be made private');
END;
