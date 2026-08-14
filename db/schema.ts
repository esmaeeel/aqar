import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const savedProfiles = sqliteTable("saved_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  filtersJson: text("filters_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("saved_profiles_user_updated_idx").on(table.userId, table.updatedAt)]);

export const savedResultSets = sqliteTable("saved_result_sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  propertyType: text("property_type").notNull(),
  resultsJson: text("results_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("saved_sets_user_created_idx").on(table.userId, table.createdAt)]);

export const trialSearches = sqliteTable("trial_searches", {
  token: text("token").primaryKey(),
  browserId: text("browser_id").notNull(),
  startedAtMs: integer("started_at_ms").notNull(),
  expiresAtMs: integer("expires_at_ms").notNull(),
}, table => [index("trial_searches_browser_started_idx").on(table.browserId, table.startedAtMs)]);
