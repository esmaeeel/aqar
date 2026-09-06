ALTER TABLE `trial_searches` ADD `browser_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE INDEX `trial_searches_browser_started_idx` ON `trial_searches` (`browser_id`,`started_at_ms`);
