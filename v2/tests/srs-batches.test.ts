import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Quick-start takes successive batches of 20 and never creates duplicate study cards", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nihon-srs-batch-"));
  const filename = join(directory, "batch.sqlite");
  const setup = new DatabaseSync(filename);
  for (const file of ["001_init.sql","002_legacy_import.sql","003_ai_studio.sql","004_srs_learning.sql"]) {
    setup.exec(readFileSync(resolve("src/db/migrations",file),"utf8"));
  }
  const insert = setup.prepare(`INSERT INTO vocabulary_entries(
    id,language,word,reading,normalized_key,status,source,created_at,updated_at
  ) VALUES (?,'ja',?,?,?,'published','demo',?,?)`);
  for(let n=0;n<22;n++){
    const id=randomUUID(), word="ことば"+n, reading="ことば";
    insert.run(id, word, reading, word+"|"+reading+"|",
      new Date(2026,0,1,0,0,n).toISOString(),new Date().toISOString());
  }
  setup.close();
  const previous=process.env.DB_PATH;
  process.env.DB_PATH=filename;
  try {
    const {enrollQuickStart,getReviewProgress}=await import("../src/modules/learning/service");
    const guest="guest:"+randomUUID();
    assert.equal(enrollQuickStart(guest).newCards,20);
    assert.equal(enrollQuickStart(guest).newCards,2);
    assert.equal(enrollQuickStart(guest).newCards,0);
    const progress=getReviewProgress(guest);
    assert.equal(progress.totalTracked,22);
    assert.equal(progress.byStatus.new,22);
    assert.equal(progress.dueNow,22);
  } finally {
    if(previous===undefined)delete process.env.DB_PATH;
    else process.env.DB_PATH=previous;
    rmSync(directory,{recursive:true,force:true});
  }
});
