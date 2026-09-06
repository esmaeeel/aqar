CREATE INDEX `saved_profiles_user_updated_idx` ON `saved_profiles` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `saved_sets_user_created_idx` ON `saved_result_sets` (`user_id`,`created_at`);
