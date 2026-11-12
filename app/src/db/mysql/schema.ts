import { int, varchar, mysqlTable, text, primaryKey, uniqueIndex, index } from "drizzle-orm/mysql-core";

export const vocabularyEntries = mysqlTable("vocabulary_entries", {
  id: varchar("id", {length:64}).primaryKey(),
  language: varchar("language", {length:10}).notNull().default("ja"),
  word: varchar("word", {length:120}).notNull(),
  reading: varchar("reading", {length:120}).notNull(),
  romanization: varchar("romanization", {length:120}),
  partOfSpeech: varchar("part_of_speech", {length:80}),
  jlptLevel: varchar("jlpt_level", {length:8}),
  normalizedKey: varchar("normalized_key", {length:400}).notNull(),
  status: varchar("status", {length:32, enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  source: varchar("source", {length:24}).notNull().default("manual"),
  sourceRef: varchar("source_ref", {length:200}),
  createdAt: varchar("created_at", {length:32}).notNull(),
  updatedAt: varchar("updated_at", {length:32}).notNull(),
}, (t) => [uniqueIndex("uq_vocabulary_normalized").on(t.language, t.normalizedKey), index("idx_vocabulary_status").on(t.status)]);

export const vocabularySenses = mysqlTable("vocabulary_senses", {
  id: varchar("id", {length:64}).primaryKey(),
  entryId: varchar("entry_id", {length:64}).notNull().references(() => vocabularyEntries.id, { onDelete: "cascade" }),
  language: varchar("language", {length:10}).notNull(),
  meaning: text("meaning").notNull(),
  sortOrder: int("sort_order").notNull().default(0),
}, (t) => [index("idx_senses_entry").on(t.entryId)]);

export const topics = mysqlTable("topics", {
  id: varchar("id", {length:64}).primaryKey(),
  slug: varchar("slug", {length:191}).notNull(),
  name: varchar("name", {length:100}).notNull(),
  description: text("description"),
  createdAt: varchar("created_at", {length:32}).notNull(),
}, t => [uniqueIndex("uq_topics_slug").on(t.slug)]);

export const decks = mysqlTable("decks", {
  id: varchar("id", {length:64}).primaryKey(),
  name: varchar("name", {length:100}).notNull(),
  description: text("description"),
  topicId: varchar("topic_id", {length:64}).references(() => topics.id, { onDelete: "restrict" }),
  // Legacy decks retain NULL; new lessons have a scoped, normalized identity.
  lessonKey: varchar("lesson_key", {length:64}),
  visibility: varchar("visibility", {length:16, enum: ["private", "public"] }).notNull().default("private"),
  createdAt: varchar("created_at", {length:32}).notNull(),
}, t => [uniqueIndex("uq_decks_lesson_key").on(t.lessonKey), index("idx_decks_topic").on(t.topicId)]);

export const deckItems = mysqlTable("deck_items", {
  deckId: varchar("deck_id", {length:64}).notNull().references(() => decks.id, { onDelete: "cascade" }),
  entryId: varchar("entry_id", {length:64}).notNull().references(() => vocabularyEntries.id, { onDelete: "restrict" }),
  sortOrder: int("sort_order").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.deckId, t.entryId] })]);

export const generationJobs = mysqlTable("generation_jobs", {
  id: varchar("id", {length:64}).primaryKey(),
  provider: varchar("provider", {length:32}).notNull(),
  model: varchar("model", {length:100}).notNull(),
  prompt: text("prompt").notNull(),
  status: varchar("status", {length:32}).notNull(),
  requestedCount: int("requested_count").notNull(),
  createdAt: varchar("created_at", {length:32}).notNull(),
  completedAt: varchar("completed_at", {length:32}),
  error: varchar("error", {length:120}),
  paramsJson: text("params_json"),
  inputTokens: int("input_tokens"),
  outputTokens: int("output_tokens"),
});

export const generationCandidates = mysqlTable("generation_candidates", {
  id: varchar("id", {length:64}).primaryKey(),
  jobId: varchar("job_id", {length:64}).notNull().references(() => generationJobs.id, { onDelete: "cascade" }),
  payload: text("payload").notNull(),
  status: varchar("status", {length:32, enum: ["pending", "accepted", "rejected"] }).notNull().default("pending"),
  acceptedEntryId: varchar("accepted_entry_id", {length:64}).references(() => vocabularyEntries.id),
}, (t) => [index("idx_generation_candidates_job").on(t.jobId)]);

export const vocabularyExamples = mysqlTable("vocabulary_examples", {
  id: varchar("id", {length:64}).primaryKey(),
  entryId: varchar("entry_id", {length:64}).notNull().references(() => vocabularyEntries.id, { onDelete: "cascade" }),
  sentence: text("sentence").notNull(),
  translationVi: text("translation_vi"),
  source: varchar("source", {length:24}).notNull().default("manual"),
}, (t) => [index("idx_vocabulary_examples_entry").on(t.entryId)]);

export const legacyIdMap = mysqlTable("legacy_id_map", {
  oldId: varchar("old_id", {length:191}).primaryKey(),
  newId: varchar("new_id", {length:64}).notNull().references(() => vocabularyEntries.id),
});

/** Exact source JSON is retained for audit and future reprocessing. */
export const legacyImportRecords = mysqlTable("legacy_import_records", {
  oldId: varchar("old_id", {length:191}).primaryKey().references(() => legacyIdMap.oldId),
  rawData: text("raw_data").notNull(),
  legacyCreatedAt: varchar("legacy_created_at", {length:32}),
  legacyUpdatedAt: varchar("legacy_updated_at", {length:32}),
  importedAt: varchar("imported_at", {length:32}).notNull(),
}, (t) => [index("idx_legacy_imported_at").on(t.importedAt)]);

/** Password-based learner accounts; separate from the environment-based Admin. */
export const learnerAccounts = mysqlTable("learner_accounts", {
  id: varchar("id", {length:64}).primaryKey(),
  username: varchar("username", {length:50}).notNull(),
  usernameKey: varchar("username_key", {length:50}).notNull().unique(),
  displayName: varchar("display_name", {length:120}).notNull(),
  passwordHash: text("password_hash").notNull(),
  status: varchar("status", {length:32, enum:["active","disabled"] }).notNull().default("active"),
  createdAt: varchar("created_at", {length:32}).notNull(),
  updatedAt: varchar("updated_at", {length:32}).notNull(),
}, t=>[index("idx_learner_accounts_status").on(t.status)]);

export const learnerLoginLimits = mysqlTable("learner_login_limits",{
  usernameKey:varchar("username_key", {length:50}).primaryKey(),
  failures:int("failures").notNull().default(0),
  lockedUntil:varchar("locked_until", {length:32}),
  updatedAt:varchar("updated_at", {length:32}).notNull(),
},t=>[index("idx_learner_locked_until").on(t.lockedUntil)]);

export const learnerSignupEvents = mysqlTable("learner_signup_events",{
  id:varchar("id", {length:64}).primaryKey(),
  createdAt:varchar("created_at", {length:32}).notNull(),
},t=>[index("idx_signup_events_time").on(t.createdAt)]);

/** Private installation settings; secret values are encrypted in runtime-config.ts. */
export const appSettings = mysqlTable("app_settings", {
  key: varchar("key", {length:100}).primaryKey(),
  value: text("value").notNull(),
  updatedAt: varchar("updated_at", {length:32}).notNull(),
});

/** Server-side revocable browser sessions: hashed cookie identifiers only. */
export const authSessions = mysqlTable("auth_sessions", {
  tokenHash: varchar("token_hash", {length:64}).primaryKey(),
  actorId: varchar("actor_id", {length:100}).notNull(),
  expiresAt: varchar("expires_at", {length:32}).notNull(),
  createdAt: varchar("created_at", {length:32}).notNull(),
}, t => [index("idx_auth_sessions_expiry").on(t.expiresAt)]);

export const guestAccountMerges = mysqlTable("guest_account_merges",{
  guestUserId:varchar("guest_user_id", {length:64}).primaryKey(),
  learnerUserId:varchar("learner_user_id", {length:64}).notNull(),
  mergedAt:varchar("merged_at", {length:32}).notNull(),
});

export const reviewCards = mysqlTable("review_cards", {
  id: varchar("id", {length:64}).primaryKey(),
  userId: varchar("user_id", {length:64}).notNull(),
  entryId: varchar("entry_id", {length:64}).notNull().references(() => vocabularyEntries.id),
  status: varchar("status", {length:32}).notNull().default("new"),
  nextReviewAt: varchar("next_review_at", {length:32}),
  streak: int("streak").notNull().default(0),
  timesReviewed: int("times_reviewed").notNull().default(0),
  correctCount: int("correct_count").notNull().default(0),
  wrongCount: int("wrong_count").notNull().default(0),
  lastReviewedAt: varchar("last_reviewed_at", {length:32}),
}, (t) => [
  uniqueIndex("uq_review_user_entry").on(t.userId, t.entryId),
  index("idx_review_cards_user_due").on(t.userId, t.nextReviewAt),
]);

export const reviewEvents = mysqlTable("review_events", {
  id: varchar("id", {length:64}).primaryKey(),
  cardId: varchar("card_id", {length:64}).notNull().references(() => reviewCards.id),
  result: varchar("result", {length:16}).notNull(),
  reviewedAt: varchar("reviewed_at", {length:32}).notNull(),
  requestId: varchar("request_id", {length:64}),
}, (t) => [
  index("idx_review_events_card").on(t.cardId),
  index("idx_review_events_reviewed").on(t.reviewedAt),
  uniqueIndex("uq_review_request").on(t.requestId),
]);

export const userDeckEnrollments = mysqlTable("user_deck_enrollments", {
  userId: varchar("user_id", {length:64}).notNull(),
  deckId: varchar("deck_id", {length:64}).notNull().references(() => decks.id, { onDelete: "restrict" }),
  enrolledAt: varchar("enrolled_at", {length:32}).notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.deckId] }),
  index("idx_enrollments_user").on(t.userId),
]);
