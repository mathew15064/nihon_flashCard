import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { importLegacyVocabulary } from "../scripts/legacy-import";

test("imports legacy JSON into drafts, preserves metadata and does not change source", async () => {
  const root = mkdtempSync(join(tmpdir(), "nihon-json-import-"));
  const source = join(root, "vocabulary.json");
  const target = join(root, "nihon.sqlite");
  const original = JSON.stringify([
    {id:"vocabulary_001",word:"学生",reading:"がくせい",meaning:"student",
      meaningVi:"học sinh, sinh viên",lesson:1,category:"noun",
      notes:"check context",examples:[{word:"学生です",meaning:"I am a student"}],
      image:{url:"https://example.invalid/example.jpg"}},
    {id:"vocabulary_002",word:"ねこ",meaning:"cat",meaningVi:"con mèo"},
  ], null, 2);
  try {
    writeFileSync(source, original);
    const db = new DatabaseSync(target);
    db.exec(readFileSync(resolve("src/db/migrations/001_init.sql"), "utf8"));
    db.exec(readFileSync(resolve("src/db/migrations/002_legacy_import.sql"), "utf8"));
    db.close();

    const dry = await importLegacyVocabulary({sourcePath:source,targetPath:target});
    assert.equal(dry.dryRun,true);
    assert.equal(dry.projectedNewEntries,2);

    const applied = await importLegacyVocabulary({sourcePath:source,targetPath:target,apply:true});
    assert.equal(applied.newEntries,2);
    assert.equal(applied.mappedRecords,2);
    assert.equal(readFileSync(source,"utf8"),original);

    const check = new DatabaseSync(target,{readOnly:true});
    const row=check.prepare("SELECT raw_data FROM legacy_import_records WHERE old_id = 'vocabulary_001'").get() as {raw_data:string};
    assert.deepEqual(JSON.parse(row.raw_data).examples,[{word:"学生です",meaning:"I am a student"}]);
    assert.equal(JSON.parse(row.raw_data).image.url,"https://example.invalid/example.jpg");
    assert.equal((check.prepare("SELECT COUNT(*) AS n FROM vocabulary_entries WHERE status='draft'").get() as {n:number}).n,2);
    assert.equal((check.prepare("SELECT COUNT(*) AS n FROM vocabulary_entries WHERE reading='ねこ'").get() as {n:number}).n,1);
    check.close();
    const again = await importLegacyVocabulary({sourcePath:source,targetPath:target});
    assert.equal(again.alreadyImported,2);
  } finally {rmSync(root,{recursive:true,force:true});}
});
