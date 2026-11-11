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
  paramsJson: text("params_json"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
});

export const generationCandidates = sqliteTable("generation_candidates", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => generationJobs.id, { onDelete: "cascade" }),
  payload: text("payload").notNull(),
  status: text("status", { enum: ["pending", "accepted", "rejected"] }).notNull().default("pending"),
  acceptedEntryId: text("accepted_entry_id").references(() => vocabularyEntries.id),
}, (t) => [index("idx_generation_candidates_job").on(t.jobId)]);

export const vocabularyExamples = sqliteTable("vocabulary_examples", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull().references(() => vocabularyEntries.id, { onDelete: "cascade" }),
  sentence: text("sentence").notNull(),
  translationVi: text("translation_vi"),
  source: text("source").notNull().default("manual"),
}, (t) => [index("idx_vocabulary_examples_entry").on(t.entryId)]);

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

/** Password-based learner accounts; separate from the environment-based Admin. */
export const learnerAccounts = sqliteTable("learner_accounts", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  usernameKey: text("username_key").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  status: text("status", {enum:["active","disabled"]}).notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, t=>[index("idx_learner_accounts_status").on(t.status)]);

export const learnerLoginLimits = sqliteTable("learner_login_limits",{
  usernameKey:text("username_key").primaryKey(),
  failures:integer("failures").notNull().default(0),
  lockedUntil:text("locked_until"),
  updatedAt:text("updated_at").notNull(),
},t=>[index("idx_learner_locked_until").on(t.lockedUntil)]);

export const learnerSignupEvents = sqliteTable("learner_signup_events",{
  id:text("id").primaryKey(),
  createdAt:text("created_at").notNull(),
},t=>[index("idx_signup_events_time").on(t.createdAt)]);

export const guestAccountMerges = sqliteTable("guest_account_merges",{
  guestUserId:text("guest_user_id").primaryKey(),
  learnerUserId:text("learner_user_id").notNull(),
  mergedAt:text("merged_at").notNull(),
});

export const reviewCards = sqliteTable("review_cards", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  entryId: text("entry_id").notNull().references(() => vocabularyEntries.id),
  status: text("status").notNull().default("new"),
  nextReviewAt: text("next_review_at"),
  streak: integer("streak").notNull().default(0),
  timesReviewed: integer("times_reviewed").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  wrongCount: integer("wrong_count").notNull().default(0),
  lastReviewedAt: text("last_reviewed_at"),
}, (t) => [
  uniqueIndex("uq_review_user_entry").on(t.userId, t.entryId),
  index("idx_review_cards_user_due").on(t.userId, t.nextReviewAt),
]);

export const reviewEvents = sqliteTable("review_events", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => reviewCards.id),
  result: text("result").notNull(),
  reviewedAt: text("reviewed_at").notNull(),
  requestId: text("request_id"),
}, (t) => [
  index("idx_review_events_card").on(t.cardId),
  index("idx_review_events_reviewed").on(t.reviewedAt),
  uniqueIndex("uq_review_request").on(t.requestId),
]);

export const userDeckEnrollments = sqliteTable("user_deck_enrollments", {
  userId: text("user_id").notNull(),
  deckId: text("deck_id").notNull().references(() => decks.id, { onDelete: "restrict" }),
  enrolledAt: text("enrolled_at").notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.deckId] }),
  index("idx_enrollments_user").on(t.userId),
]);
