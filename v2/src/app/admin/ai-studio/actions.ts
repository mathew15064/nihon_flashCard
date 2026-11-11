"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { generationRequestSchema, candidateSchema } from "@/modules/ai/schema";
import { acceptCandidate, editCandidate, generateJob, rejectCandidate } from "@/modules/ai/service";

const uuid = z.string().uuid();

function safeCode(error: unknown): string {
  const code = error instanceof Error ? error.message : "AI_OPERATION_FAILED";
  return /^[A-Z_]{4,60}$/.test(code) ? code : "AI_OPERATION_FAILED";
}

export async function startGenerationAction(form: FormData) {
  await requireAdmin();
  let url: string;
  try {
    const request = generationRequestSchema.parse({
      topic: form.get("topic"),
      jlptLevel: form.get("jlptLevel"),
      count: form.get("count"),
      notes: form.get("notes") || "",
    });
    const id = await generateJob(request);
    url = "/admin/ai-studio/" + id;
  } catch (error) {
    url = "/admin/ai-studio?error=" + encodeURIComponent(safeCode(error));
  }
  revalidatePath("/admin/ai-studio");
  redirect(url);
}

function candidateData(form: FormData) {
  return candidateSchema.parse({
    word: form.get("word"), reading: form.get("reading"),
    romanization: form.get("romanization") || "",
    partOfSpeech: form.get("partOfSpeech") || "",
    jlptLevel: form.get("jlptLevel"),
    meaningVi: form.get("meaningVi"), meaningEn: form.get("meaningEn") || "",
    exampleJa: form.get("exampleJa") || "", exampleVi: form.get("exampleVi") || "",
  });
}

async function handleCandidate(form: FormData, mode: "edit" | "accept" | "reject") {
  await requireAdmin();
  const jobId = uuid.parse(form.get("jobId"));
  const candidateId = uuid.parse(form.get("candidateId"));
  let message = mode === "accept" ? "accepted" : mode === "edit" ? "saved" : "rejected";
  try {
    if (mode === "edit") editCandidate(candidateId, candidateData(form));
    if (mode === "accept") acceptCandidate(candidateId);
    if (mode === "reject") rejectCandidate(candidateId);
  } catch (error) { message = "error:" + safeCode(error); }
  revalidatePath("/admin/ai-studio/" + jobId);
  revalidatePath("/admin/vocabulary");
  redirect("/admin/ai-studio/" + jobId + "?result=" + encodeURIComponent(message));
}

export async function editCandidateAction(form: FormData) {
  await handleCandidate(form, "edit");
}
export async function acceptCandidateAction(form: FormData) {
  await handleCandidate(form, "accept");
}
export async function rejectCandidateAction(form: FormData) {
  await handleCandidate(form, "reject");
}
