import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { importLegacyVocabulary } from "../scripts/legacy-import";
import { normalizedKey } from "../src/modules/vocabulary/normalize";

type Row = {id: string; word: string; reading?: string; meaning?: string; meaningVi?: string; notes?: string};
function fixture(rows: Row[]) {
  const root = mkdtempSync(join(tmpdir(), "nihon-v1-import-test-"));
  const sourcePath = join(root, "legacy.sqlite");
  const targetPath = join(root, "nihon.sqlite");
  const src = new DatabaseSync(sourcePath);
  src.exec("CREATE TABLE content(id TEXT PRIMARY KEY, content_type TEXT, data TEXT, created_at TEXT, updated_at TEXT, jlpt TEXT)");
  const insert = src.prepare("INSERT INTO content VALUES (?, 'vocabulary', ?, ?, ?, ?)");
  for (const row of rows) {
    insert.run(row.id, JSON.stringify(row), "2026-09-01T00:00:00Z", "2026-09-01T00:00:00Z", "N5");
  }
  src.close();
  const dst = new DatabaseSync(targetPath);
  dst.exec(readFileSync(resolve("src/db/migrations/001_init.sql"), "utf8"));
  dst.exec(readFileSync(resolve("src/db/migrations/002_legacy_import.sql"), "utf8"));
  dst.close();
  return {root, sourcePath, targetPath, cleanup: () => rmSync(root, {recursive: true, force: true})};
}

test("normalizer normalizes compatibility variants and whitespace", () => {
  assert.equal(normalizedKey({word:" ＡＢＣ ", reading:"えーびーしー"}),
    normalizedKey({word:"abc", reading:"えーびーしー"}));
});

test("legacy migration dry-run is read-only, apply is backed up and idempotent", async () => {
  const f = fixture([
    {id:"vocabulary_001",word:"食べる",reading:"たべる",meaning:"to eat",meaningVi:"ăn",notes:"original"},
    {id:"vocabulary_002",word:"ひらがな",meaning:"hiragana"},
    {id:"vocabulary_003",word:"食べる",reading:"たべる",meaning:"to consume"},
  ]);
  try {
    const sourceHash = createHash("sha256").update(readFileSync(f.sourcePath)).digest("hex");
    const preview = await importLegacyVocabulary({sourcePath:f.sourcePath,targetPath:f.targetPath});
    assert.equal(preview.dryRun,true);
    assert.equal(preview.sourceCount,3);
    assert.equal(preview.validCount,3);
    assert.equal(preview.projectedNewEntries,2);
    assert.equal(preview.projectedDuplicateEntries,1);
    assert.equal(preview.mappedRecords,0);
    let db = new DatabaseSync(f.targetPath, {readOnly:true});
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM vocabulary_entries").get() as {n:number}).n,0);
    db.close();

    const applied = await importLegacyVocabulary({sourcePath:f.sourcePath,targetPath:f.targetPath,apply:true});
    assert.equal(applied.dryRun,false);
    assert.equal(applied.newEntries,2);
    assert.equal(applied.mappedRecords,3);
    assert.ok(applied.backupPath && existsSync(applied.backupPath));
    const backupDb=new DatabaseSync(applied.backupPath!, {readOnly:true});
    assert.equal((backupDb.prepare("SELECT COUNT(*) AS n FROM vocabulary_entries").get() as {n:number}).n,0);
    backupDb.close();

    db=new DatabaseSync(f.targetPath, {readOnly:true});
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM vocabulary_entries").get() as {n:number}).n,2);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM legacy_id_map").get() as {n:number}).n,3);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM legacy_import_records").get() as {n:number}).n,3);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM vocabulary_entries WHERE status = 'published'").get() as {n:number}).n,0);
    const raw = db.prepare("SELECT raw_data FROM legacy_import_records WHERE old_id = ?").get("vocabulary_001") as {raw_data:string};
    assert.equal(JSON.parse(raw.raw_data).notes, "original");
    const senses = db.prepare("SELECT language, meaning FROM vocabulary_senses WHERE entry_id = (SELECT new_id FROM legacy_id_map WHERE old_id = 'vocabulary_001')").all() as {language:string;meaning:string}[];
    assert.deepEqual(senses.map(s=>s.language).sort(), ["en","vi"]);
    db.close();

    const again = await importLegacyVocabulary({sourcePath:f.sourcePath,targetPath:f.targetPath,apply:true});
    assert.equal(again.newEntries,0);
    assert.equal(again.mappedRecords,0);
    assert.equal(again.alreadyImported,3);
    assert.equal(createHash("sha256").update(readFileSync(f.sourcePath)).digest("hex"),sourceHash);
  } finally {f.cleanup();}
});

test("invalid data blocks apply unless explicitly permitted", async () => {
  const f = fixture([
    {id:"vocabulary_001",word:"本",meaning:"book"}, // Kanji without reading cannot be invented.
    {id:"vocabulary_002",word:"水",reading:"みず",meaning:"water"},
  ]);
  try {
    const preview = await importLegacyVocabulary({sourcePath:f.sourcePath,targetPath:f.targetPath});
    assert.equal(preview.skippedInvalid,1);
    assert.deepEqual(preview.issues,[{id:"vocabulary_001",reason:"MISSING_READING"}]);
    await assert.rejects(
      importLegacyVocabulary({sourcePath:f.sourcePath,targetPath:f.targetPath,apply:true}),
      /Refusing to apply/
    );
    const db = new DatabaseSync(f.targetPath, {readOnly:true});
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM vocabulary_entries").get() as {n:number}).n,0);
    db.close();
  } finally {f.cleanup();}
});

test("refuses v1 source and destination resolving to same path", async () => {
  const f = fixture([]);
  try {
    await assert.rejects(
      importLegacyVocabulary({sourcePath:f.sourcePath,targetPath:f.sourcePath,apply:true}),
      /different files/
    );
  } finally {f.cleanup();}
});
