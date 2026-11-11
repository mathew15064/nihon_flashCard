"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth";
import { createVocabularyDraft, publishVocabulary } from "@/modules/vocabulary/service";
import { vocabularyInput } from "@/modules/vocabulary/schema";

export async function publishVocabularyAction(form: FormData) {
  await requireAdmin();
  const id = form.get("id");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("INVALID_ID");
  publishVocabulary(id);
  revalidatePath("/admin");
  revalidatePath("/admin/vocabulary");
  revalidatePath("/vocabulary");
}

export async function createVocabularyAction(form: FormData) {
  await requireAdmin();
  const data = vocabularyInput.parse({
    word: form.get("word"),
    reading: form.get("reading"),
    meaningVi: form.get("meaningVi"),
    jlptLevel: form.get("jlptLevel") || null,
  });
  createVocabularyDraft(data);
  revalidatePath("/admin");
  revalidatePath("/admin/vocabulary");
}
