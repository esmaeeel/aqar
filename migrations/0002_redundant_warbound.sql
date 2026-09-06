CREATE TABLE `trial_searches` (
	`token` text PRIMARY KEY NOT NULL,
	`started_at_ms` integer NOT NULL,
	`expires_at_ms` integer NOT NULL
);
