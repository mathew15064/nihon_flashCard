import { DatabaseSync } from "node:sqlite";
import { realpathSync, statSync } from "node:fs";

type Counted = {
  total: number; vocabulary: number; unsupported: number; mapped: number;
  unmapped: number; missingUser: number; missingContent: number;
  contentTypeMismatch: number; invalidDates: number;
};

export type V1SrsAuditReport = {
  dryRun: true;
  source: { users: number; activeUsers: number };
  target: { vocabularyEntries: number; legacyMappings: number; danglingMappings: number };
  progress: Counted & {
    invalidStatus: number; invalidCounters: number; duplicateMappedCards: number;
    unpublishedMappedCards: number; historyCountMismatches: number;
  };
  history: Counted & { missingProgress: number; invalidResults: number };
  blockers: string[];
  ownershipVerified: false;
  canApply: false;
};

type ProgressRow = {
  user_id: string; card_id: string; content_type: string; status: string;
  times_reviewed: number; correct_count: number; wrong_count: number; streak: number;
  last_reviewed_at: string | null; next_review_at: string | null;
  has_user: number; has_content: number; source_content_type: string | null;
};
type HistoryRow = {
  user_id: string; card_id: string; content_type: string; reviewed_at: string;
  result: string; has_user: number; has_content: number;
  source_content_type: string | null; has_progress: number;
};

const states = new Set(["new", "learning", "review", "mastered"]);
const results = new Set(["correct", "wrong"]);
const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const validDate = (value: string | null) => {
  if (value === null) return true;
  if (typeof value !== "string" || !isoDate.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === value.slice(0, 19);
};

function getReadOnlyDb(file: string): { path: string; db: DatabaseSync } {
  const path = realpathSync(file); // Fails for missing files; no implicit SQLite creation.
  if (!statSync(path).isFile()) throw new Error("SOURCE_NOT_A_FILE");
  const db = new DatabaseSync(path, { readOnly: true });
  db.exec("PRAGMA query_only=ON");
  return { path, db };
}

function requireTables(db: DatabaseSync, names: string[]): void {
  const check = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?");
  for (const name of names) {
    if (!check.get(name)) throw new Error("AUDIT_SCHEMA_MISSING_" + name.toUpperCase());
  }
}
function requireHealthy(db: DatabaseSync): void {
  const result = db.prepare("PRAGMA quick_check").get() as { quick_check: string } | undefined;
  if (result?.quick_check !== "ok") throw new Error("AUDIT_SQLITE_INTEGRITY_FAILED");
}
function basicCounts(): Counted {
  return {
    total: 0, vocabulary: 0, unsupported: 0, mapped: 0, unmapped: 0,
    missingUser: 0, missingContent: 0, contentTypeMismatch: 0, invalidDates: 0,
  };
}

/** Read-only inspection. Never creates, upgrades, or updates either database. */
export function auditV1Srs(sourcePath: string, targetPath: string): V1SrsAuditReport {
  if (!sourcePath || !targetPath) throw new Error("AUDIT_REQUIRES_SOURCE_AND_TARGET");
  const src = getReadOnlyDb(sourcePath);
  let target: ReturnType<typeof getReadOnlyDb> | undefined;
  try {
    target = getReadOnlyDb(targetPath);
    if (src.path === target.path) throw new Error("AUDIT_SOURCE_EQUALS_TARGET");
    const sourceDb = src.db;
    const targetDb = target.db;
    // Both transactions provide internally consistent snapshots for counting.
    sourceDb.exec("BEGIN");
    targetDb.exec("BEGIN");
    try {
      requireTables(sourceDb, ["users", "content", "progress", "history"]);
      requireTables(targetDb, ["legacy_id_map", "vocabulary_entries", "review_cards", "review_events", "learner_accounts"]);
      requireHealthy(sourceDb);
      requireHealthy(targetDb);

      const getCount = (db: DatabaseSync, statement: string) =>
        (db.prepare(statement).get() as { n: number }).n;
      const userCount = getCount(sourceDb, "SELECT count(*) AS n FROM users");
      const activeUsers = getCount(sourceDb, "SELECT count(*) AS n FROM users WHERE status='active'");
      const vocabularyEntries = getCount(targetDb, "SELECT count(*) AS n FROM vocabulary_entries");
      const map = new Map<string, { id: string; status: string }>();
      const entries = new Map(
        (targetDb.prepare("SELECT id, status FROM vocabulary_entries").all() as {id: string; status: string}[])
          .map(row => [row.id, row.status])
      );
      let danglingMappings = 0;
      for (const row of targetDb.prepare("SELECT old_id, new_id FROM legacy_id_map").iterate() as Iterable<{old_id:string;new_id:string}>) {
        const status = entries.get(row.new_id);
        if (!status) danglingMappings++;
        else map.set(row.old_id, { id: row.new_id, status });
      }

      const progress: V1SrsAuditReport["progress"] = {
        ...basicCounts(), invalidStatus: 0, invalidCounters: 0,
        duplicateMappedCards: 0, unpublishedMappedCards: 0, historyCountMismatches: 0,
      };
      const duplicateSet = new Set<string>();
      const progressReviewCounts = new Map<string, number>();
      const progressQuery = sourceDb.prepare(
        "SELECT p.*, (u.id IS NOT NULL) AS has_user, (c.id IS NOT NULL) AS has_content, " +
        "c.content_type AS source_content_type FROM progress p " +
        "LEFT JOIN users u ON u.id=p.user_id LEFT JOIN content c ON c.id=p.card_id"
      );
      for (const row of progressQuery.iterate() as Iterable<ProgressRow>) {
        progress.total++;
        progressReviewCounts.set(JSON.stringify([row.user_id, row.card_id]), row.times_reviewed);
        if (!row.has_user) progress.missingUser++;
        if (!row.has_content) progress.missingContent++;
        if (row.has_content && row.source_content_type !== row.content_type) progress.contentTypeMismatch++;
        if (!states.has(row.status)) progress.invalidStatus++;
        const counts = [row.times_reviewed, row.correct_count, row.wrong_count, row.streak];
        if (counts.some(n => !Number.isSafeInteger(n) || n < 0) ||
            row.times_reviewed !== row.correct_count + row.wrong_count ||
            row.streak > row.correct_count) progress.invalidCounters++;
        if (!validDate(row.last_reviewed_at) || !validDate(row.next_review_at)) progress.invalidDates++;
        if (row.content_type !== "vocabulary") { progress.unsupported++; continue; }
        progress.vocabulary++;
        const mapped = map.get(row.card_id);
        if (!mapped) { progress.unmapped++; continue; }
        progress.mapped++;
        if (mapped.status !== "published") progress.unpublishedMappedCards++;
        const key = JSON.stringify([row.user_id, mapped.id]);
        if (duplicateSet.has(key)) progress.duplicateMappedCards++;
        duplicateSet.add(key);
      }

      const history: V1SrsAuditReport["history"] = {
        ...basicCounts(), missingProgress: 0, invalidResults: 0,
      };
      const historyEventCounts = new Map<string, number>();
      const historyQuery = sourceDb.prepare(
        "SELECT h.*, (u.id IS NOT NULL) AS has_user, (c.id IS NOT NULL) AS has_content, " +
        "c.content_type AS source_content_type, (p.card_id IS NOT NULL) AS has_progress " +
        "FROM history h LEFT JOIN users u ON u.id=h.user_id " +
        "LEFT JOIN content c ON c.id=h.card_id " +
        "LEFT JOIN progress p ON p.card_id=h.card_id AND p.user_id=h.user_id"
      );
      for (const row of historyQuery.iterate() as Iterable<HistoryRow>) {
        history.total++;
        const historyKey = JSON.stringify([row.user_id, row.card_id]);
        historyEventCounts.set(historyKey, (historyEventCounts.get(historyKey) ?? 0) + 1);
        if (!row.has_user) history.missingUser++;
        if (!row.has_content) history.missingContent++;
        if (row.has_content && row.source_content_type !== row.content_type) history.contentTypeMismatch++;
        if (!row.has_progress) history.missingProgress++;
        if (!results.has(row.result)) history.invalidResults++;
        if (!validDate(row.reviewed_at)) history.invalidDates++;
        if (row.content_type !== "vocabulary") { history.unsupported++; continue; }
        history.vocabulary++;
        if (map.has(row.card_id)) history.mapped++;
        else history.unmapped++;
      }

      for (const [card, count] of progressReviewCounts) {
        if (historyEventCounts.get(card) !== count) progress.historyCountMismatches++;
      }

      const blockers = ["OWNERSHIP_NOT_VERIFIED"];
      if (progress.unmapped || history.unmapped || danglingMappings) blockers.push("VOCABULARY_ID_MAP_INCOMPLETE");
      if (progress.duplicateMappedCards) blockers.push("DUPLICATE_MAPPED_REVIEW_CARDS");
      if (progress.historyCountMismatches) blockers.push("REVIEW_COUNTER_HISTORY_MISMATCH");
      if (progress.unpublishedMappedCards) blockers.push("TARGET_WORDS_NOT_PUBLISHED");
      if (progress.unsupported || history.unsupported) blockers.push("OTHER_CONTENT_TYPES_UNSUPPORTED");
      if (progress.missingUser || progress.missingContent || progress.contentTypeMismatch ||
          history.missingUser || history.missingContent || history.missingProgress || history.contentTypeMismatch)
        blockers.push("ORPHANED_OR_INCONSISTENT_SOURCE_RECORDS");
      if (progress.invalidStatus || progress.invalidCounters || progress.invalidDates ||
          history.invalidResults || history.invalidDates) blockers.push("INVALID_LEGACY_SRS_VALUES");

      const report: V1SrsAuditReport = {
        dryRun: true, source: { users: userCount, activeUsers },
        target: { vocabularyEntries, legacyMappings: map.size + danglingMappings, danglingMappings },
        progress, history, blockers, ownershipVerified: false, canApply: false,
      };
      targetDb.exec("COMMIT");
      sourceDb.exec("COMMIT");
      return report;
    } catch (error) {
      try { targetDb.exec("ROLLBACK"); } catch { /* preserve original error */ }
      try { sourceDb.exec("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    }
  } finally {
    target?.db.close();
    src.db.close();
  }
}
