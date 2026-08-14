INSERT INTO `trial_browser_limits` (`browser_id`, `search_limit`, `updated_at_ms`)
VALUES ('d56408b2-63ca-414c-a6b5-db165485d509', 100, unixepoch('now') * 1000)
ON CONFLICT (`browser_id`) DO UPDATE SET
  `search_limit` = excluded.`search_limit`,
  `updated_at_ms` = excluded.`updated_at_ms`;
