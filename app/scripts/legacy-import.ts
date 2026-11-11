import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve, dirname, join, basename, extname } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { normalizedKey } from "../src/modules/vocabulary/normalize";

type LegacyRow = {
  id: string; data: string; created_at: string | null; updated_at: string | null; jlpt: string | null;
};
type Candidate = {
  id: string;
  rawData: string;
  word: string;
  reading: string;
  romanization: string | null;
  partOfSpeech: string | null;
  jlptLevel: string | null;
  meanings: {language: string; meaning: string}[];
  key: string;
  createdAt: string | null;
  updatedAt: string | null;
};
export type ImportIssue = { id: string; reason: string };
export type LegacyImportReport = {
  dryRun: boolean;
  sourceCount: number;
  validCount: number;
  skippedInvalid: number;
  alreadyImported: number;
  projectedNewEntries: number;
  projectedDuplicateEntries: number;
  newEntries: number;
  mappedRecords: number;
  issues: ImportIssue[];
  backupPath: string | null;
};

export function parseLegacyVocabulary(row: LegacyRow): Candidate | ImportIssue {
  let raw: unknown;
  try { raw = JSON.parse(row.data); }
  catch { return { id: row.id, reason: "INVALID_JSON" }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { id: row.id, reason: "INVALID_CONTENT" };
  }
  const item = raw as Record<string, unknown>;
  if (item.id && item.id !== row.id) return { id: row.id, reason: "MISMATCHED_ID" };
  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const word = text(item.word);
  if (!word) return { id: row.id, reason: "MISSING_WORD" };
  // Only kana-only words are safe to use as their own reading.
  const reading = text(item.reading) || (/^[\u3040-\u30ffー・]+$/u.test(word) ? word : "");
  if (!reading) return { id: row.id, reason: "MISSING_READING" };
  const vi = text(item.meaningVi);
  const en = text(item.meaning);
  if (!vi && !en) return { id: row.id, reason: "MISSING_MEANING" };
  const meanings = [
    ...(vi ? [{ language: "vi", meaning: vi }] : []),
    ...(en ? [{ language: "en", meaning: en }] : []),
  ];
  // Legacy "category" is ambiguous (part-of-speech OR topical category).
  // It stays in raw_data rather than being guessed as a grammatical class.
  const partOfSpeech = text(item.partOfSpeech) || null;
  const level = text(item.jlpt) || text(row.jlpt);
  const jlptLevel = ["N5", "N4", "N3", "N2", "N1"].includes(level) ? level : null;
  const romanization = text(item.romanization) || null;
  return {
    id: row.id, rawData: row.data, word, reading, romanization,
    partOfSpeech, jlptLevel, meanings,
    key: normalizedKey({ word, reading, partOfSpeech }),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function sourceRows(sourcePath: string): LegacyRow[] {
  if (!existsSync(sourcePath)) throw new Error("Source vocabulary file does not exist");
  // Legacy Git repositories contain JSON import sources even when the
  // production SQLite DB is stored on a different machine.
  if (extname(sourcePath).toLowerCase() === ".json") {
    const parsed: unknown = JSON.parse(readFileSync(sourcePath, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("Legacy JSON must be an array of vocabulary objects");
    const seen = new Set<string>();
    return parsed.map((item: unknown, index: number): LegacyRow => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error(`Invalid legacy JSON item at index ${index}`);
      }
      const data = item as Record<string, unknown>;
      if (typeof data.id !== "string" || !data.id.trim() || seen.has(data.id)) {
        throw new Error(`Missing or repeated legacy ID at index ${index}`);
      }
      seen.add(data.id);
      return {
        id: data.id,
        data: JSON.stringify(data),
        created_at: typeof data.createdAt === "string" ? data.createdAt : null,
        updated_at: typeof data.updatedAt === "string" ? data.updatedAt : null,
        jlpt: typeof data.jlpt === "string" ? data.jlpt : null,
      };
    });
  }
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    source.exec("PRAGMA query_only = ON");
    const table = source.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'content'").get();
    if (!table) throw new Error("Source database is not a Nihon v1 database (content table absent)");
    source.exec("BEGIN");
    try {
      const rows = source.prepare(
        "SELECT id, data, created_at, updated_at, jlpt FROM content WHERE content_type = 'vocabulary' ORDER BY id"
      ).all() as LegacyRow[];
      source.exec("COMMIT");
      return rows;
    } catch (error) {
      source.exec("ROLLBACK");
      throw error;
    }
  } finally { source.close(); }
}

function assertTargetSchema(db: DatabaseSync) {
  const names = ["vocabulary_entries", "vocabulary_senses", "legacy_id_map", "legacy_import_records"];
  for (const name of names) {
    const row = db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
    if (!row) throw new Error("Target is missing v2 migration table " + name + ". Run npm run db:migrate.");
  }
}

function isCandidate(value: Candidate | ImportIssue): value is Candidate {
  return "key" in value;
}

/** Source is opened read-only. This function never changes v1, including on --apply. */
export async function importLegacyVocabulary(options: {
  sourcePath: string; targetPath: string; apply?: boolean; allowSkips?: boolean;
}): Promise<LegacyImportReport> {
  if (!options.sourcePath || !options.targetPath) throw new Error("Both --source and --target are required");
  const src = realpathSync(options.sourcePath);
  const targetPath = resolve(options.targetPath);
  if (!existsSync(targetPath)) throw new Error("Initialize target database with db:migrate before running import");
  const dst = realpathSync(targetPath);
  if (src === dst) throw new Error("Source and target database must be different files");
  if (basename(dst) === "app.db") throw new Error("Refusing to write to a legacy app.db as destination");
  const inputRows = sourceRows(src);
  const parsed = inputRows.map(parseLegacyVocabulary);
  const candidates = parsed.filter(isCandidate);
  const issues = parsed.filter((x): x is ImportIssue => !isCandidate(x));
  if (options.apply && issues.length && !options.allowSkips) {
    throw new Error(`Refusing to apply: ${issues.length} invalid legacy records. Inspect dry-run first; --allow-skips is explicit.`);
  }

  // Preview opens target read-only. The default command has no write effects.
  const previewDb = new DatabaseSync(dst, { readOnly: true });
  let alreadyImported = 0;
  let projectedNewEntries = 0;
  let projectedDuplicateEntries = 0;
  try {
    assertTargetSchema(previewDb);
    const imported = new Set(
      (previewDb.prepare("SELECT old_id FROM legacy_id_map").all() as {old_id: string}[]).map(r => r.old_id)
    );
    const keys = new Set(
      (previewDb.prepare("SELECT normalized_key FROM vocabulary_entries WHERE language = 'ja'").all() as {normalized_key: string}[])
        .map(r => r.normalized_key)
    );
    for (const row of candidates) {
      if (imported.has(row.id)) { alreadyImported++; continue; }
      if (keys.has(row.key)) { projectedDuplicateEntries++; }
      else { projectedNewEntries++; keys.add(row.key); }
    }
  } finally { previewDb.close(); }
  const report: LegacyImportReport = {
    dryRun: !options.apply, sourceCount: inputRows.length,
    validCount: candidates.length, skippedInvalid: issues.length,
    alreadyImported, projectedNewEntries, projectedDuplicateEntries,
    newEntries: 0, mappedRecords: 0, issues, backupPath: null,
  };
  if (!options.apply) return report;

  const db = new DatabaseSync(dst);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");
    assertTargetSchema(db);

    // Backup target BEFORE transaction, including any existing user drafts.
    // SQLite backup includes WAL state, unlike copying an open app.db file.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = join(dirname(dst), `${basename(dst)}.pre-import-${stamp}-${randomUUID()}.bak`);
    const previousUmask = process.umask(0o077);
    try { await backup(db, backupPath); }
    finally { process.umask(previousUmask); }
    chmodSync(backupPath, 0o600);
    report.backupPath = backupPath;

    const findByKey = db.prepare("SELECT id FROM vocabulary_entries WHERE language = 'ja' AND normalized_key = ?");
    const findMapped = db.prepare("SELECT new_id FROM legacy_id_map WHERE old_id = ?");
    const findRaw = db.prepare("SELECT raw_data FROM legacy_import_records WHERE old_id = ?");
    const insertWord = db.prepare(`INSERT INTO vocabulary_entries (
      id, language, word, reading, romanization, part_of_speech, jlpt_level,
      normalized_key, status, source, source_ref, created_at, updated_at
    ) VALUES (?, 'ja', ?, ?, ?, ?, ?, ?, 'draft', 'import', ?, ?, ?)`);
    const insertSense = db.prepare(
      "INSERT INTO vocabulary_senses (id, entry_id, language, meaning, sort_order) VALUES (?, ?, ?, ?, ?)"
    );
    const insertMapping = db.prepare("INSERT INTO legacy_id_map (old_id, new_id) VALUES (?, ?)");
    const insertRaw = db.prepare(`INSERT INTO legacy_import_records
      (old_id, raw_data, legacy_created_at, legacy_updated_at, imported_at)
      VALUES (?, ?, ?, ?, ?)`);

    db.exec("BEGIN IMMEDIATE");
    try {
      for (const item of candidates) {
        const mapped = findMapped.get(item.id) as {new_id: string} | undefined;
        if (mapped) {
          const original = findRaw.get(item.id) as {raw_data: string} | undefined;
          if (!original || original.raw_data !== item.rawData) {
            throw new Error(`Legacy record ${item.id} changed after import; refusing silent overwrite`);
          }
          continue;
        }
        const existing = findByKey.get(item.key) as {id: string} | undefined;
        const entryId = existing?.id || randomUUID();
        if (!existing) {
          const now = new Date().toISOString();
          insertWord.run(entryId, item.word, item.reading, item.romanization,
            item.partOfSpeech, item.jlptLevel, item.key, `legacy:${item.id}`,
            item.createdAt || now, item.updatedAt || now);
          item.meanings.forEach((sense, index) => {
            insertSense.run(randomUUID(), entryId, sense.language, sense.meaning, index);
          });
          report.newEntries++;
        }
        // Even when an entry already exists, keep the complete original JSON.
        // Never auto-add AI/legacy meanings to an already-published entry.
        insertMapping.run(item.id, entryId);
        insertRaw.run(item.id, item.rawData, item.createdAt, item.updatedAt, new Date().toISOString());
        report.mappedRecords++;
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    report.dryRun = false;
    return report;
  } finally { db.close(); }
}
