import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { auditV1Srs } from "../src/lib/legacy-srs-audit";

const migrationNames = [
  "001_init.sql", "002_legacy_import.sql", "003_ai_studio.sql",
  "004_srs_learning.sql", "005_learner_accounts.sql", "006_auth_sessions.sql",
];
function legacyDb(path: string) {
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT, status TEXT);" +
    "CREATE TABLE content(id TEXT PRIMARY KEY, content_type TEXT);" +
    "CREATE TABLE progress(user_id TEXT, card_id TEXT, content_type TEXT, " +
    "status TEXT, times_reviewed INTEGER, correct_count INTEGER, wrong_count INTEGER, " +
    "streak INTEGER, last_reviewed_at TEXT, next_review_at TEXT, PRIMARY KEY(user_id,card_id));" +
    "CREATE TABLE history(id INTEGER PRIMARY KEY, user_id TEXT, card_id TEXT, content_type TEXT, " +
    "reviewed_at TEXT, result TEXT);");
  return db;
}
function targetDb(path: string) {
  const db = new DatabaseSync(path);
  for (const name of migrationNames)
    db.exec(readFileSync(resolve("src/db/migrations", name), "utf8"));
  return db;
}
const timestamp = "2026-11-11T12:00:00.000Z";
function seedVocabulary(source: DatabaseSync, target: DatabaseSync, oldId: string,
                        targetId: string, status = "published") {
  source.prepare("INSERT INTO content(id,content_type) VALUES (?, 'vocabulary')").run(oldId);
  target.prepare("INSERT OR IGNORE INTO vocabulary_entries(id,word,reading,normalized_key,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run(targetId, "日本", "にほん", targetId, status, timestamp, timestamp);
  target.prepare("INSERT INTO legacy_id_map(old_id,new_id) VALUES (?,?)").run(oldId,targetId);
}
function progress(db: DatabaseSync, user: string, card: string, content = "vocabulary",
                  status = "review", reviewed = 2, correct = 1, wrong = 1,
                  streak = 0, last = timestamp, next = timestamp) {
  db.prepare("INSERT INTO progress VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(user,card,content,status,reviewed,correct,wrong,streak,last,next);
}
function history(db: DatabaseSync, user: string, card: string, content = "vocabulary",
                 result = "correct", date = timestamp) {
  db.prepare("INSERT INTO history(user_id,card_id,content_type,reviewed_at,result) VALUES (?,?,?,?,?)")
    .run(user,card,content,date,result);
}

test("v1 SRS audit reports only aggregates, never changes either SQLite database", () => {
  const dir = mkdtempSync(join(tmpdir(),"nihon-audit-clean-"));
  try {
    const src = join(dir,"legacy.sqlite"), dst = join(dir,"fastify.sqlite");
    const oldDb = legacyDb(src), newDb = targetDb(dst);
    oldDb.prepare("INSERT INTO users(id,username,status) VALUES ('legacy-user-1','private_name','active')").run();
    seedVocabulary(oldDb,newDb,"vocabulary_001","new-entry-1");
    progress(oldDb,"legacy-user-1","vocabulary_001");
    history(oldDb,"legacy-user-1","vocabulary_001");
    history(oldDb,"legacy-user-1","vocabulary_001","vocabulary","wrong");
    oldDb.close();newDb.close();
    const beforeSource = readFileSync(src), beforeTarget = readFileSync(dst);

    const report = auditV1Srs(src,dst);
    assert.equal(report.dryRun,true);
    assert.equal(report.ownershipVerified,false);
    assert.equal(report.canApply,false);
    assert.deepEqual(report.blockers,["OWNERSHIP_NOT_VERIFIED"]);
    assert.deepEqual(report.source,{users:1,activeUsers:1});
    assert.equal(report.progress.mapped,1);
    assert.equal(report.history.mapped,2);
    assert.equal(report.progress.unmapped,0);
    assert.equal(report.progress.invalidCounters,0);
    assert.equal(report.progress.duplicateMappedCards,0);
    assert.equal(report.progress.historyCountMismatches,0);
    assert.deepEqual(readFileSync(src),beforeSource);
    assert.deepEqual(readFileSync(dst),beforeTarget);
    assert.doesNotMatch(JSON.stringify(report),/private_name|legacy-user-1|vocabulary_001/);
    assert.throws(()=>auditV1Srs(src,src),/AUDIT_SOURCE_EQUALS_TARGET/);
    assert.throws(()=>auditV1Srs(join(dir,"missing.sqlite"),dst),/ENOENT/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("v1 SRS audit detects unmapped, deduplicated, orphan and invalid rows without import", () => {
  const dir=mkdtempSync(join(tmpdir(),"nihon-audit-issues-"));
  try {
    const src=join(dir,"legacy.sqlite"),dst=join(dir,"fastify.sqlite");
    const oldDb=legacyDb(src), newDb=targetDb(dst);
    oldDb.prepare("INSERT INTO users VALUES ('u1','user1','active')").run();
    oldDb.prepare("INSERT INTO users VALUES ('u2','user2','disabled')").run();
    seedVocabulary(oldDb,newDb,"vocabulary_001","combined-entry", "draft");
    seedVocabulary(oldDb,newDb,"vocabulary_002","combined-entry", "draft");
    oldDb.prepare("INSERT INTO content VALUES ('vocabulary_003','vocabulary')").run();
    oldDb.prepare("INSERT INTO content VALUES ('kanji_001','kanji')").run();
    progress(oldDb,"u1","vocabulary_001");
    progress(oldDb,"u1","vocabulary_002");
    progress(oldDb,"u1","vocabulary_003");
    progress(oldDb,"u2","kanji_001","kanji");
    progress(oldDb,"missing-user","vocabulary_004","vocabulary","bogus",2,5,0,-1,"bad","bad");
    history(oldDb,"u1","vocabulary_001");
    history(oldDb,"u1","vocabulary_003","vocabulary","wrong");
    history(oldDb,"u1","vocabulary_999","vocabulary","invalid","not-a-date");
    history(oldDb,"u2","kanji_001","kanji");
    oldDb.close();newDb.close();
    const report=auditV1Srs(src,dst);
    assert.equal(report.source.users,2);
    assert.equal(report.source.activeUsers,1);
    assert.equal(report.progress.total,5);
    assert.equal(report.progress.vocabulary,4);
    assert.equal(report.progress.mapped,2);
    assert.equal(report.progress.unmapped,2);
    assert.equal(report.progress.duplicateMappedCards,1);
    assert.equal(report.progress.unpublishedMappedCards,2);
    assert.equal(report.progress.missingUser,1);
    assert.equal(report.progress.missingContent,1);
    assert.equal(report.progress.invalidStatus,1);
    assert.equal(report.progress.invalidCounters,1);
    assert.equal(report.progress.invalidDates,1);
    assert.equal(report.progress.unsupported,1);
    assert.equal(report.progress.historyCountMismatches,5);
    assert.equal(report.history.total,4);
    assert.equal(report.history.mapped,1);
    assert.equal(report.history.unmapped,2);
    assert.equal(report.history.unsupported,1);
    assert.equal(report.history.missingContent,1);
    assert.equal(report.history.missingProgress,1);
    assert.equal(report.history.invalidResults,1);
    assert.equal(report.history.invalidDates,1);
    assert.ok(report.blockers.includes("DUPLICATE_MAPPED_REVIEW_CARDS"));
    assert.ok(report.blockers.includes("REVIEW_COUNTER_HISTORY_MISMATCH"));
    assert.ok(report.blockers.includes("INVALID_LEGACY_SRS_VALUES"));
    assert.ok(report.blockers.includes("VOCABULARY_ID_MAP_INCOMPLETE"));
    assert.ok(report.blockers.includes("TARGET_WORDS_NOT_PUBLISHED"));
    assert.equal(report.canApply,false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
