CREATE TABLE `trial_browser_limits` (
	`browser_id` text PRIMARY KEY NOT NULL,
	`search_limit` integer NOT NULL,
	`updated_at_ms` integer NOT NULL
);
