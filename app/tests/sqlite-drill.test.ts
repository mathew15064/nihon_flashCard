import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drillNihonBackup, inspectNihonSqlite, verifyRestoredPair } from "../src/lib/sqlite-drill";
import { verifiedSqliteCopy } from "../src/lib/sqlite-snapshot";

const migrations=resolve("src/db/migrations");
function createAppDatabase(path:string):DatabaseSync {
  const db=new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;" +
    "CREATE TABLE schema_migrations(filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);");
  for (const filename of readdirSync(migrations).filter(n=>/^\d+_.*\.sql$/.test(n)).sort()) {
    const sql=readFileSync(join(migrations,filename),"utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations VALUES (?,?,?)")
      .run(filename,createHash("sha256").update(sql).digest("hex"),"2026-11-12T00:00:00.000Z");
  }
  return db;
}

test("read-only backup drill restores Japanese vocab, SRS, sessions, migration checksums and WAL",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"nihon-drill-full-"));
  try{
    const source=join(dir,"nihon.sqlite"),scratch=join(dir,"scratch");
    const {mkdirSync}=await import("node:fs");
    mkdirSync(scratch,{mode:0o700});
    const db=createAppDatabase(source);
    const now="2026-11-12T00:00:00.000Z";
    db.prepare("INSERT INTO vocabulary_entries (id,word,reading,normalized_key,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
      .run("entry-1","日本語","にほんご","qa:nihongo","published",now,now);
    db.prepare("INSERT INTO vocabulary_senses (id,entry_id,language,meaning) VALUES (?,?,?,?)")
      .run("sense-1","entry-1","vi","tiếng Nhật");
    db.prepare("INSERT INTO learner_accounts(id,username,username_key,display_name,password_hash,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .run("account-1","alice_private","alice_private","Alice","hashed-secret-not-for-output","active",now,now);
    db.prepare("INSERT INTO review_cards(id,user_id,entry_id,status,streak,times_reviewed,correct_count,wrong_count,last_reviewed_at,next_review_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run("review-1","learner:account-1","entry-1","review",1,1,1,0,now,now);
    db.prepare("INSERT INTO review_events(id,card_id,result,reviewed_at,request_id) VALUES(?,?,?,?,?)")
      .run("event-1","review-1","correct",now,"req-1");
    db.prepare("INSERT INTO auth_sessions(token_hash,actor_id,expires_at,created_at) VALUES(?,?,?,?)")
      .run("private-token-hash","learner:account-1","2026-12-01T00:00:00.000Z",now);
    // The original connection remains open in WAL mode during the backup.
    assert.equal((db.prepare("PRAGMA journal_mode").get() as {journal_mode:string}).journal_mode,"wal");
    const before=readFileSync(source);
    const report=await drillNihonBackup(source,scratch,migrations);
    const tableCount=db.prepare(
      "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).get() as {n:number};
    assert.deepEqual(report,{
      ok:true,tables:tableCount.n,rows:13,migrations:7,matching:true,
    });
    assert.ok(report.tables>=15);
    assert.deepEqual(readFileSync(source),before);
    assert.deepEqual(readdirSync(scratch),[]);
    assert.equal(statSync(scratch).mode & 0o777,0o700);
    assert.doesNotMatch(JSON.stringify(report),/alice_private|hashed-secret-not-for-output|private-token-hash|日本語/);

    const snapshot=join(dir,"backup.sqlite"),restored=join(dir,"restored.sqlite");
    await verifiedSqliteCopy(source,snapshot);
    await verifiedSqliteCopy(snapshot,restored);
    const digests=verifyRestoredPair(snapshot,restored,migrations);
    assert.equal(digests.migrations,7);
    const actual=new DatabaseSync(restored,{readOnly:true});
    assert.equal(actual.prepare("SELECT word FROM vocabulary_entries WHERE id='entry-1'").get()!.word,"日本語");
    assert.equal(actual.prepare("SELECT count(*) AS n FROM review_events").get()!.n,1);
    assert.equal(actual.prepare("SELECT count(*) AS n FROM auth_sessions").get()!.n,1);
    actual.close();

    const edit=new DatabaseSync(restored);
    edit.prepare("UPDATE vocabulary_senses SET meaning='ALTERED' WHERE id='sense-1'").run();
    edit.close();
    assert.throws(()=>verifyRestoredPair(snapshot,restored,migrations),/DRILL_RESTORED_MISMATCH/);
    assert.throws(()=>verifyRestoredPair(snapshot,snapshot,migrations),/DRILL_SAME_DATABASE/);
    db.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("backup drill rejects mismatched migration checksums, incomplete schema and orphaned FKs",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"nihon-drill-invalid-"));
  try{
    const src=join(dir,"source.sqlite");
    const sql=createAppDatabase(src);
    assert.equal(inspectNihonSqlite(src,migrations).migrations,7);
    sql.prepare("UPDATE schema_migrations SET checksum='bad' WHERE filename='006_auth_sessions.sql'").run();
    assert.throws(()=>inspectNihonSqlite(src,migrations),/DRILL_MIGRATION_CHECKSUM_MISMATCH/);
    sql.prepare("DELETE FROM schema_migrations WHERE filename='006_auth_sessions.sql'").run();
    assert.throws(()=>inspectNihonSqlite(src,migrations),/DRILL_MIGRATIONS_INCOMPLETE/);
    const expected=createHash("sha256").update(readFileSync(join(migrations,"006_auth_sessions.sql"))).digest("hex");
    sql.prepare("INSERT INTO schema_migrations VALUES (?,?,?)")
      .run("006_auth_sessions.sql",expected,"2026-11-12T00:00:00.000Z");
    sql.exec("PRAGMA foreign_keys=OFF");
    sql.prepare("INSERT INTO review_events(id,card_id,result,reviewed_at) VALUES(?,?,?,?)")
      .run("orphan-1","missing-card","wrong","2026-11-12T00:00:00.000Z");
    assert.throws(()=>inspectNihonSqlite(src,migrations),/DRILL_FOREIGN_KEY_FAILED/);
    sql.close();

    const scratch=join(dir,"missing-scratch");
    assert.equal(existsSync(scratch),false);
    await assert.rejects(drillNihonBackup(src,scratch,migrations),/ENOENT/);
    assert.equal(existsSync(scratch),false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
