import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";

test("AI candidates are editable, checked for duplicates, and saved as drafts with examples", async () => {
  const directory=mkdtempSync(join(tmpdir(),"nihon-ai-workflow-"));
  const path=join(directory,"test.sqlite");
  const sqlite=new DatabaseSync(path);
  for(const name of ["001_init.sql","002_legacy_import.sql","003_ai_studio.sql"]) {
    sqlite.exec(readFileSync(resolve("src/db/migrations",name),"utf8"));
  }
  sqlite.close();
  const prevDb=process.env.DB_PATH;
  const prevKey=process.env.OPENAI_API_KEY;
  const prevLimit=process.env.NIHON_AI_DAILY_LIMIT;
  process.env.DB_PATH=path;
  process.env.OPENAI_API_KEY="test-only-in-memory-not-real";
  process.env.NIHON_AI_DAILY_LIMIT="2";
  const sample={
    word:"駅", reading:"えき", romanization:"eki",
    partOfSpeech:"noun",jlptLevel:"N5" as const,
    meaningVi:"nhà ga",meaningEn:"station",
    exampleJa:"駅はどこですか。",exampleVi:"Nhà ga ở đâu?",
  };
  try {
    const {generateJob, getGenerationJob, editCandidate, acceptCandidate, rejectCandidate,
      remainingGenerationQuota} = await import("../src/modules/ai/service");
    const {getVocabulary} = await import("../src/modules/vocabulary/service");
    const fake = {generate:async()=>({items:[sample],inputTokens:80,outputTokens:130})};
    const jobId=await generateJob({
      topic:"Nhà ga",jlptLevel:"N5",count:1,notes:"",
    },fake);
    const job=getGenerationJob(jobId)!;
    assert.equal(job.status,"ready_for_review");
    assert.equal(job.candidates.length,1);
    const candidate=job.candidates[0];
    assert.equal(candidate.duplicateId,null);
    editCandidate(candidate.id,{...sample,meaningVi:"nhà ga tàu điện"});
    const entryId=acceptCandidate(candidate.id);
    assert.ok(entryId);
    const entry=getVocabulary(entryId,true)!;
    assert.equal(entry.status,"draft");
    assert.equal(entry.senses.find(s=>s.language==="vi")?.meaning,"nhà ga tàu điện");
    assert.equal(getGenerationJob(jobId)!.candidates[0].status,"accepted");
    assert.throws(()=>acceptCandidate(candidate.id),/AI_CANDIDATE_NOT_PENDING/);
    const check=new DatabaseSync(path,{readOnly:true});
    const ex=check.prepare("SELECT * FROM vocabulary_examples WHERE entry_id=?").get(entryId) as {sentence:string,translation_vi:string};
    assert.equal(ex.sentence,"駅はどこですか。");
    assert.equal(ex.translation_vi,"Nhà ga ở đâu?");
    check.close();

    const duplicateJob=await generateJob({topic:"Nhà ga",jlptLevel:"N5",count:1,notes:""},fake);
    const duplicate=getGenerationJob(duplicateJob)!.candidates[0];
    assert.equal(duplicate.duplicateId,entryId);
    assert.throws(()=>acceptCandidate(duplicate.id),/AI_CANDIDATE_DUPLICATE/);
    rejectCandidate(duplicate.id);
    assert.equal(getGenerationJob(duplicateJob)!.candidates[0].status,"rejected");
    assert.equal(remainingGenerationQuota(),0);
    await assert.rejects(
      generateJob({topic:"Nhà ga",jlptLevel:"N5",count:1,notes:""},fake),
      /AI_DAILY_QUOTA_REACHED/
    );
  } finally {
    if(prevDb===undefined) delete process.env.DB_PATH; else process.env.DB_PATH=prevDb;
    if(prevKey===undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY=prevKey;
    if(prevLimit===undefined) delete process.env.NIHON_AI_DAILY_LIMIT; else process.env.NIHON_AI_DAILY_LIMIT=prevLimit;
    rmSync(directory,{recursive:true,force:true});
  }
});

test("AI generator records safe failure state without exposing provider details",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"nihon-ai-fail-"));
  const path=join(directory,"test.sqlite");
  const sqlite=new DatabaseSync(path);
  for(const name of ["001_init.sql","002_legacy_import.sql","003_ai_studio.sql"]) {
    sqlite.exec(readFileSync(resolve("src/db/migrations",name),"utf8"));
  }
  sqlite.close();
  const prevDb=process.env.DB_PATH, prevKey=process.env.OPENAI_API_KEY;
  process.env.DB_PATH=path;process.env.OPENAI_API_KEY="test-only-not-real";
  try {
    const {generateJob,getGenerationJob}=await import("../src/modules/ai/service");
    const id=await generateJob({topic:"Gia đình",jlptLevel:"N5",count:2,notes:""},{
      generate:async()=>{throw new Error("a sensitive remote response with secret details");},
    });
    const job=getGenerationJob(id)!;
    assert.equal(job.status,"failed");
    assert.equal(job.error,"AI_REQUEST_FAILED");
    assert.equal(job.candidates.length,0);
  } finally {
    if(prevDb===undefined) delete process.env.DB_PATH;else process.env.DB_PATH=prevDb;
    if(prevKey===undefined) delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=prevKey;
    rmSync(directory,{recursive:true,force:true});
  }
});
