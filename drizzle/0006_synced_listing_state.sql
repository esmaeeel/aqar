CREATE TABLE IF NOT EXISTS `synced_listing_state` (
  `space_id` text PRIMARY KEY NOT NULL,
  `archived_json` text DEFAULT '[]' NOT NULL,
  `favorites_json` text DEFAULT '[]' NOT NULL,
  `viewed_ids_json` text DEFAULT '[]' NOT NULL,
  `updated_at_ms` integer NOT NULL
);
