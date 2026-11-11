import { randomUUID } from "node:crypto";
import { and, eq, like, or } from "drizzle-orm";
import { db } from "@/db/client";
import { vocabularyEntries, vocabularySenses } from "@/db/schema";
import { type VocabularyInput } from "./schema";
import { normalizedKey } from "./normalize";

export { normalizedKey } from "./normalize";

function attachSenses(rows: (typeof vocabularyEntries.$inferSelect)[]) {
  return rows.map((row) => ({
    ...row,
    senses: db.select().from(vocabularySenses)
      .where(eq(vocabularySenses.entryId, row.id))
      .orderBy(vocabularySenses.sortOrder).all(),
  }));
}

export function listVocabulary(options: {search?: string; jlpt?: string; page?: number; limit?: number; includeDrafts?: boolean} = {}) {
  const page = options.page || 1;
  const limit = options.limit || 30;
  const search = options.search?.trim() || "";
  const conditions = [
    ...(options.includeDrafts ? [] : [eq(vocabularyEntries.status, "published")]),
    ...(options.jlpt ? [eq(vocabularyEntries.jlptLevel, options.jlpt)] : []),
    ...(search ? [or(like(vocabularyEntries.word, "%" + search + "%"), like(vocabularyEntries.reading, "%" + search + "%"))!] : []),
  ];
  const filter = conditions.length ? and(...conditions) : undefined;
  const rows = db.select().from(vocabularyEntries).where(filter)
    .orderBy(vocabularyEntries.createdAt)
    .limit(limit).offset((page - 1) * limit).all();
  return { items: attachSenses(rows), page, limit };
}

export function getVocabulary(id: string, includeDrafts = false) {
  const row = db.select().from(vocabularyEntries)
    .where(and(eq(vocabularyEntries.id, id), ...(includeDrafts ? [] : [eq(vocabularyEntries.status, "published")])))
    .get();
  return row ? attachSenses([row])[0] : null;
}

export function createVocabularyDraft(input: VocabularyInput) {
  const key = normalizedKey(input);
  const duplicate = db.select().from(vocabularyEntries)
    .where(and(eq(vocabularyEntries.language, input.language), eq(vocabularyEntries.normalizedKey, key))).get();
  if (duplicate) return { created: false as const, item: getVocabulary(duplicate.id, true)! };

  const id = randomUUID();
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.insert(vocabularyEntries).values({
      id, language: input.language, word: input.word,
      reading: input.reading, romanization: input.romanization ?? null,
      partOfSpeech: input.partOfSpeech ?? null, jlptLevel: input.jlptLevel ?? null,
      normalizedKey: key, status: "draft",
      source: input.source, sourceRef: input.sourceRef ?? null,
      createdAt: now, updatedAt: now,
    }).run();
    tx.insert(vocabularySenses).values({
      id: randomUUID(), entryId: id, language: "vi",
      meaning: input.meaningVi, sortOrder: 0,
    }).run();
    if (input.meaningEn) tx.insert(vocabularySenses).values({
      id: randomUUID(), entryId: id, language: "en",
      meaning: input.meaningEn, sortOrder: 1,
    }).run();
  });
  return { created: true as const, item: getVocabulary(id, true)! };
}

/**
 * Publish only an explicitly reviewed draft with a Vietnamese meaning.
 * Imported legacy records are never published by the import tool.
 */
export function publishVocabulary(id: string) {
  const item = getVocabulary(id, true);
  if (!item) throw new Error("VOCABULARY_NOT_FOUND");
  if (item.status !== "draft") throw new Error("VOCABULARY_NOT_DRAFT");
  if (!item.senses.some((sense) => sense.language === "vi" && sense.meaning.trim())) {
    throw new Error("VOCABULARY_NEEDS_VI_MEANING");
  }
  db.update(vocabularyEntries)
    .set({ status: "published", updatedAt: new Date().toISOString() })
    .where(and(eq(vocabularyEntries.id, id), eq(vocabularyEntries.status, "draft"))).run();
  return getVocabulary(id, true)!;
}
