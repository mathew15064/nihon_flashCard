import { integer, sqliteTable, text, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const vocabularyEntries = sqliteTable("vocabulary_entries", {
  id: text("id").primaryKey(),
  language: text("language").notNull().default("ja"),
  word: text("word").notNull(),
  reading: text("reading").notNull(),
  romanization: text("romanization"),
  partOfSpeech: text("part_of_speech"),
  jlptLevel: text("jlpt_level"),
  normalizedKey: text("normalized_key").notNull(),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  source: text("source").notNull().default("manual"),
  sourceRef: text("source_ref"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [uniqueIndex("uq_vocabulary_normalized").on(t.language, t.normalizedKey), index("idx_vocabulary_status").on(t.status)]);

export const vocabularySenses = sqliteTable("vocabulary_senses", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull().references(() => vocabularyEntries.id, { onDelete: "cascade" }),
  language: text("language").notNull(),
  meaning: text("meaning").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [index("idx_senses_entry").on(t.entryId)]);

export const decks = sqliteTable("decks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  visibility: text("visibility", { enum: ["private", "public"] }).notNull().default("private"),
  createdAt: text("created_at").notNull(),
});

export const deckItems = sqliteTable("deck_items", {
  deckId: text("deck_id").notNull().references(() => decks.id, { onDelete: "cascade" }),
  entryId: text("entry_id").notNull().references(() => vocabularyEntries.id, { onDelete: "restrict" }),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.deckId, t.entryId] })]);

export const generationJobs = sqliteTable("generation_jobs", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  prompt: text("prompt").notNull(),
  status: text("status").notNull(),
  requestedCount: integer("requested_count").notNull(),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
  error: text("error"),
});

export const generationCandidates = sqliteTable("generation_candidates", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => generationJobs.id, { onDelete: "cascade" }),
  payload: text("payload").notNull(),
  status: text("status", { enum: ["pending", "accepted", "rejected"] }).notNull().default("pending"),
});

export const legacyIdMap = sqliteTable("legacy_id_map", {
  oldId: text("old_id").primaryKey(),
  newId: text("new_id").notNull().references(() => vocabularyEntries.id),
});

/** Exact source JSON is retained for audit and future reprocessing. */
export const legacyImportRecords = sqliteTable("legacy_import_records", {
  oldId: text("old_id").primaryKey().references(() => legacyIdMap.oldId),
  rawData: text("raw_data").notNull(),
  legacyCreatedAt: text("legacy_created_at"),
  legacyUpdatedAt: text("legacy_updated_at"),
  importedAt: text("imported_at").notNull(),
}, (t) => [index("idx_legacy_imported_at").on(t.importedAt)]);

export const reviewCards = sqliteTable("review_cards", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  entryId: text("entry_id").notNull().references(() => vocabularyEntries.id),
  status: text("status").notNull().default("new"),
  nextReviewAt: text("next_review_at"),
}, (t) => [uniqueIndex("uq_review_user_entry").on(t.userId, t.entryId)]);

export const reviewEvents = sqliteTable("review_events", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => reviewCards.id),
  result: text("result").notNull(),
  reviewedAt: text("reviewed_at").notNull(),
}, (t) => [index("idx_review_events_card").on(t.cardId)]);
