import { randomUUID } from "node:crypto";
import { and,desc,eq,gte,lt,sql } from "drizzle-orm";
import type { openMySQL } from "./connector";
import {
  appSettings,generationCandidates,generationJobs,vocabularyEntries,
  vocabularySenses,vocabularyExamples,
} from "./schema";
import { candidateSchema,generationRequestSchema,
  type GeneratedCandidate,type GenerationRequest } from "@/modules/ai/schema";
import { openAIProvider,type AiProvider } from "@/modules/ai/provider";
import { normalizedKey } from "@/modules/vocabulary/normalize";
import { mysqlSettings } from "./settings";

type Db=ReturnType<typeof openMySQL>["db"];
export function mysqlAI(db:Db){
  const settings=mysqlSettings(db);
  async function findDuplicate(candidate:GeneratedCandidate){
    const key=normalizedKey(candidate);
    const row=(await db.select({id:vocabularyEntries.id}).from(vocabularyEntries)
      .where(and(eq(vocabularyEntries.language,"ja"),
        eq(vocabularyEntries.normalizedKey,key))).limit(1))[0];
    return row?.id??null;
  }
  const jobs=async()=>db.select().from(generationJobs)
    .orderBy(desc(generationJobs.createdAt)).limit(30);
  const remaining=async()=>{
    const cutoff=new Date(Date.now()-24*3600*1000).toISOString();
    const totals=await db.select({count:sql<number>`count(*)`}).from(generationJobs)
      .where(gte(generationJobs.createdAt,cutoff));
    return Math.max(0,(await settings.dailyLimit())-Number(totals[0]?.count||0));
  };
  const getJob=async(id:string)=>{
    const job=(await db.select().from(generationJobs)
      .where(eq(generationJobs.id,id)).limit(1))[0];
    if(!job)return null;
    const candidates=await db.select().from(generationCandidates)
      .where(eq(generationCandidates.jobId,id));
    return {...job,candidates:await Promise.all(candidates.map(async row=>{
      const data=candidateSchema.parse(JSON.parse(row.payload) as unknown);
      return {...row,data,duplicateId:await findDuplicate(data)};
    }))};
  };
  const reserve=async(input:GenerationRequest)=>{
    const id=randomUUID(),now=new Date().toISOString();
    const cutoff=new Date(Date.now()-24*3600*1000).toISOString();
    const stale=new Date(Date.now()-2*60_000).toISOString();
    await db.transaction(async tx=>{
      const lock=await tx.select({key:appSettings.key}).from(appSettings)
        .where(eq(appSettings.key,"__ai_reservation_lock__")).for("update");
      if(!lock.length)throw new Error("MYSQL_QUOTA_LOCK_MISSING");
      await tx.update(generationJobs).set({
        status:"failed",completedAt:now,error:"AI_JOB_INTERRUPTED",
      }).where(and(eq(generationJobs.status,"running"),
        lt(generationJobs.createdAt,stale)));
      const [{count=0}={}]=await tx.select({count:sql<number>`count(*)`})
        .from(generationJobs).where(gte(generationJobs.createdAt,cutoff));
      if(Number(count)>=await settings.dailyLimit())
        throw new Error("AI_DAILY_QUOTA_REACHED");
      const [{running=0}={}]=await tx.select({running:sql<number>`count(*)`})
        .from(generationJobs).where(eq(generationJobs.status,"running"));
      if(Number(running)>=1)throw new Error("AI_GENERATION_BUSY");
      await tx.insert(generationJobs).values({
        id,provider:"openai",model:await settings.model(),prompt:input.topic,
        paramsJson:JSON.stringify(input),status:"running",
        requestedCount:input.count,createdAt:now,
      });
    });
    return id;
  };
  const generate=async(raw:unknown,override?:AiProvider)=>{
    const input=generationRequestSchema.parse(raw);
    const key=await settings.key("openai_api_key");
    if(!key)throw new Error("AI_NOT_CONFIGURED");
    const id=await reserve(input);
    const provider=override??openAIProvider(fetch,{
      apiKey:()=>settings.key("openai_api_key"),
      model:()=>settings.model(),
    });
    try{
      const result=await provider.generate(input);
      if(!result.items.length)throw new Error("AI_NO_CANDIDATES");
      await db.transaction(async tx=>{
        for(const item of result.items){
          await tx.insert(generationCandidates).values({
            id:randomUUID(),jobId:id,payload:JSON.stringify(candidateSchema.parse(item)),
            status:"pending",
          });
        }
        await tx.update(generationJobs).set({
          status:"ready_for_review",completedAt:new Date().toISOString(),
          inputTokens:result.inputTokens,outputTokens:result.outputTokens,
        }).where(eq(generationJobs.id,id));
      });
      return id;
    }catch(error){
      const code=error instanceof Error&&/^[A-Z_]{4,60}$/.test(error.message)
        ?error.message:"AI_REQUEST_FAILED";
      await db.update(generationJobs).set({
        status:"failed",completedAt:new Date().toISOString(),error:code,
      }).where(eq(generationJobs.id,id));
      return id;
    }
  };
  const edit=async(id:string,raw:unknown)=>{
    const input=candidateSchema.parse(raw);
    const candidate=(await db.select().from(generationCandidates)
      .where(eq(generationCandidates.id,id)).limit(1))[0];
    if(!candidate||candidate.status!=="pending")throw new Error("AI_CANDIDATE_NOT_EDITABLE");
    await db.update(generationCandidates).set({payload:JSON.stringify(input)})
      .where(and(eq(generationCandidates.id,id),eq(generationCandidates.status,"pending")));
  };
  const reject=async(id:string)=>{
    const candidate=(await db.select().from(generationCandidates)
      .where(eq(generationCandidates.id,id)).limit(1))[0];
    if(!candidate||candidate.status!=="pending")throw new Error("AI_CANDIDATE_NOT_PENDING");
    await db.update(generationCandidates).set({status:"rejected"})
      .where(and(eq(generationCandidates.id,id),eq(generationCandidates.status,"pending")));
  };
  const accept=async(id:string)=>db.transaction(async tx=>{
    const candidate=(await tx.select().from(generationCandidates)
      .where(eq(generationCandidates.id,id)).limit(1).for("update"))[0];
    if(!candidate||candidate.status!=="pending")throw new Error("AI_CANDIDATE_NOT_PENDING");
    const job=(await tx.select().from(generationJobs)
      .where(eq(generationJobs.id,candidate.jobId)).limit(1))[0];
    if(!job||job.status!=="ready_for_review")throw new Error("AI_JOB_NOT_READY");
    const data=candidateSchema.parse(JSON.parse(candidate.payload) as unknown);
    const key=normalizedKey(data);
    const duplicates=await tx.select({id:vocabularyEntries.id}).from(vocabularyEntries)
      .where(and(eq(vocabularyEntries.language,"ja"),
        eq(vocabularyEntries.normalizedKey,key))).limit(1);
    if(duplicates.length)throw new Error("AI_CANDIDATE_DUPLICATE");
    const entryId=randomUUID(),now=new Date().toISOString();
    await tx.insert(vocabularyEntries).values({
      id:entryId,language:"ja",word:data.word,reading:data.reading,normalizedKey:key,
      romanization:data.romanization||null,partOfSpeech:data.partOfSpeech||null,
      jlptLevel:data.jlptLevel==="unknown"?null:data.jlptLevel,
      status:"draft",source:"ai",sourceRef:"generation:"+job.id,
      createdAt:now,updatedAt:now,
    });
    await tx.insert(vocabularySenses).values({
      id:randomUUID(),entryId,language:"vi",meaning:data.meaningVi,sortOrder:0,
    });
    if(data.meaningEn)await tx.insert(vocabularySenses).values({
      id:randomUUID(),entryId,language:"en",meaning:data.meaningEn,sortOrder:1,
    });
    if(data.exampleJa)await tx.insert(vocabularyExamples).values({
      id:randomUUID(),entryId,sentence:data.exampleJa,
      translationVi:data.exampleVi||null,source:"ai",
    });
    await tx.update(generationCandidates).set({
      status:"accepted",acceptedEntryId:entryId,
    }).where(eq(generationCandidates.id,id));
    return entryId;
  });
  return {jobs,getJob,remaining,generate,edit,reject,accept};
}
