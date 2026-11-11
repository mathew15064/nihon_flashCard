"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/auth";
import { addEntryToDeck, createDeck, publishDeck } from "@/modules/decks/service";
import { createDeckInput, deckIdSchema, entryIdSchema } from "@/modules/decks/schema";

function refresh() {
  revalidatePath("/admin/decks");
  revalidatePath("/decks");
}

export async function createDeckAction(form: FormData) {
  await requireAdmin();
  const input = createDeckInput.parse({ name: form.get("name"), description: form.get("description") || undefined });
  createDeck(input);
  refresh();
}

export async function addEntryAction(form: FormData) {
  await requireAdmin();
  const deckId = deckIdSchema.parse(form.get("deckId"));
  const entryId = entryIdSchema.parse(form.get("entryId"));
  try {
    addEntryToDeck(deckId, entryId);
  } catch (err) {
    const code = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    redirect("/admin/decks?error=" + encodeURIComponent(code));
  }
  refresh();
}

export async function publishDeckAction(form: FormData) {
  await requireAdmin();
  const id = deckIdSchema.parse(form.get("deckId"));
  try { publishDeck(id); } catch (err) {
    const code = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    redirect("/admin/decks?error=" + encodeURIComponent(code));
  }
  refresh();
}
