import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  generationCandidates, generationJobs, vocabularyEntries, vocabularySenses, vocabularyExamples,
} from "@/db/schema";
import { normalizedKey } from "@/modules/vocabulary/normalize";
import { candidateSchema, generationRequestSchema, type GeneratedCandidate, type GenerationRequest } from "./schema";
import { configuredModel, openAIProvider, type AiProvider } from "./provider";

export function generationQuota(): number {
  const configured = Number(process.env.NIHON_AI_DAILY_LIMIT ?? 10);
  return Number.isInteger(configured) && configured >= 1 && configured <= 100 ? configured : 10;
}

export function listGenerationJobs() {
  return db.select().from(generationJobs).orderBy(desc(generationJobs.createdAt)).limit(30).all();
}

export function remainingGenerationQuota(): number {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const used = db.select({ count: sql<number>`count(*)` }).from(generationJobs)
    .where(gte(generationJobs.createdAt, since)).get()?.count ?? 0;
  return Math.max(0, generationQuota() - used);
}

export function getGenerationJob(jobId: string) {
  const job = db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).get();
  if (!job) return null;
  const candidates = db.select().from(generationCandidates)
    .where(eq(generationCandidates.jobId, jobId)).all();
  return {
    ...job,
    candidates: candidates.map(row => ({
      ...row,
      data: candidateSchema.parse(JSON.parse(row.payload) as unknown),
      duplicateId: findDuplicate(candidateSchema.parse(JSON.parse(row.payload) as unknown)),
    })),
  };
}

function findDuplicate(candidate: GeneratedCandidate): string | null {
  const key = normalizedKey(candidate);
  return db.select({id:vocabularyEntries.id}).from(vocabularyEntries)
    .where(and(eq(vocabularyEntries.language, "ja"), eq(vocabularyEntries.normalizedKey, key)))
    .get()?.id ?? null;
}

/** Reserve a bounded generation request synchronously in SQLite before calling the provider. */
function reserveJob(input: GenerationRequest): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  db.transaction(tx => {
    // A process crash must not permanently block the one-at-a-time AI slot.
    const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    tx.update(generationJobs).set({
      status: "failed", completedAt: now, error: "AI_JOB_INTERRUPTED",
    }).where(and(eq(generationJobs.status, "running"), lt(generationJobs.createdAt, staleBefore))).run();
    const used = tx.select({count: sql<number>`count(*)`}).from(generationJobs)
      .where(gte(generationJobs.createdAt, since)).get()?.count ?? 0;
    if (used >= generationQuota()) throw new Error("AI_DAILY_QUOTA_REACHED");
    const running = tx.select({count: sql<number>`count(*)`}).from(generationJobs)
      .where(eq(generationJobs.status, "running")).get()?.count ?? 0;
    if (running >= 1) throw new Error("AI_GENERATION_BUSY");
    tx.insert(generationJobs).values({
      id, provider:"openai", model:configuredModel(), prompt:input.topic,
      paramsJson:JSON.stringify(input), status:"running", requestedCount:input.count,
      createdAt:now,
    }).run();
  });
  return id;
}

export async function generateJob(raw: unknown, provider: AiProvider = openAIProvider()): Promise<string> {
  const input = generationRequestSchema.parse(raw);
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("AI_NOT_CONFIGURED");
  const id = reserveJob(input);
  try {
    const result = await provider.generate(input);
    if (!result.items.length) throw new Error("AI_NO_CANDIDATES");
    db.transaction(tx => {
      for (const item of result.items) {
        tx.insert(generationCandidates).values({
          id:randomUUID(), jobId:id, payload:JSON.stringify(candidateSchema.parse(item)),
          status:"pending",
        }).run();
      }
      tx.update(generationJobs).set({
        status:"ready_for_review", completedAt:new Date().toISOString(),
        inputTokens:result.inputTokens, outputTokens:result.outputTokens,
      }).where(eq(generationJobs.id, id)).run();
    });
    return id;
  } catch (error) {
    // Keep failure codes only, never provider HTTP body, prompts or API keys.
    const code = error instanceof Error && /^[A-Z_]{4,60}$/.test(error.message)
      ? error.message : "AI_REQUEST_FAILED";
    db.update(generationJobs).set({
      status:"failed", completedAt:new Date().toISOString(), error:code,
    }).where(eq(generationJobs.id,id)).run();
    return id;
  }
}

export function editCandidate(candidateId: string, raw: unknown) {
  const data = candidateSchema.parse(raw);
  const candidate = db.select().from(generationCandidates).where(eq(generationCandidates.id,candidateId)).get();
  if (!candidate || candidate.status !== "pending") throw new Error("AI_CANDIDATE_NOT_EDITABLE");
  db.update(generationCandidates).set({payload:JSON.stringify(data)})
    .where(and(eq(generationCandidates.id,candidateId),eq(generationCandidates.status,"pending"))).run();
}

export function rejectCandidate(candidateId: string) {
  const candidate = db.select().from(generationCandidates).where(eq(generationCandidates.id,candidateId)).get();
  if (!candidate || candidate.status !== "pending") throw new Error("AI_CANDIDATE_NOT_PENDING");
  db.update(generationCandidates).set({status:"rejected"})
    .where(and(eq(generationCandidates.id,candidateId),eq(generationCandidates.status,"pending"))).run();
}

/** Candidate acceptance + new vocabulary draft is one SQLite transaction. */
export function acceptCandidate(candidateId: string): string {
  return db.transaction(tx => {
    const candidate = tx.select().from(generationCandidates)
      .where(eq(generationCandidates.id,candidateId)).get();
    if (!candidate || candidate.status !== "pending") throw new Error("AI_CANDIDATE_NOT_PENDING");
    const job = tx.select().from(generationJobs).where(eq(generationJobs.id,candidate.jobId)).get();
    if (!job || job.status !== "ready_for_review") throw new Error("AI_JOB_NOT_READY");
    const data = candidateSchema.parse(JSON.parse(candidate.payload) as unknown);
    const key = normalizedKey(data);
    const existing = tx.select({id:vocabularyEntries.id}).from(vocabularyEntries)
      .where(and(eq(vocabularyEntries.language,"ja"),eq(vocabularyEntries.normalizedKey,key))).get();
    if (existing) throw new Error("AI_CANDIDATE_DUPLICATE");
    const id = randomUUID();
    const now = new Date().toISOString();
    tx.insert(vocabularyEntries).values({
      id,language:"ja",word:data.word,reading:data.reading,normalizedKey:key,
      romanization:data.romanization || null,partOfSpeech:data.partOfSpeech || null,
      jlptLevel:data.jlptLevel==="unknown"?null:data.jlptLevel,
      status:"draft",source:"ai",sourceRef:`generation:${job.id}`,
      createdAt:now,updatedAt:now,
    }).run();
    tx.insert(vocabularySenses).values({
      id:randomUUID(),entryId:id,language:"vi",meaning:data.meaningVi,sortOrder:0,
    }).run();
    if (data.meaningEn) tx.insert(vocabularySenses).values({
      id:randomUUID(),entryId:id,language:"en",meaning:data.meaningEn,sortOrder:1,
    }).run();
    if (data.exampleJa) tx.insert(vocabularyExamples).values({
      id:randomUUID(),entryId:id,sentence:data.exampleJa,
      translationVi:data.exampleVi || null,source:"ai",
    }).run();
    tx.update(generationCandidates).set({status:"accepted",acceptedEntryId:id})
      .where(eq(generationCandidates.id,candidateId)).run();
    return id;
  });
}
