import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { decks, deckItems, vocabularyEntries } from "@/db/schema";
import { createDeckInput } from "./schema";

export function listDecks(includePrivate = false) {
  return db.select().from(decks)
    .where(includePrivate ? undefined : eq(decks.visibility, "public"))
    .orderBy(decks.createdAt).all();
}

export function getDeckWithEntries(id: string, includePrivate = false) {
  const deck = db.select().from(decks)
    .where(and(eq(decks.id, id), ...(includePrivate ? [] : [eq(decks.visibility, "public")])))
    .get();
  if (!deck) return null;
  const entries = db.select({
    id: vocabularyEntries.id,
    word: vocabularyEntries.word,
    reading: vocabularyEntries.reading,
    jlptLevel: vocabularyEntries.jlptLevel,
    status: vocabularyEntries.status,
  }).from(deckItems).innerJoin(vocabularyEntries, eq(deckItems.entryId, vocabularyEntries.id))
    .where(and(eq(deckItems.deckId, id),
      ...(includePrivate ? [] : [eq(vocabularyEntries.status, "published")])))
    .orderBy(deckItems.sortOrder).all();
  return { ...deck, entries };
}

export function createDeck(raw: { name: string; description?: string }) {
  const input = createDeckInput.parse(raw);
  const id = randomUUID();
  db.insert(decks).values({
    id, name: input.name, description: input.description ?? null,
    visibility: "private", createdAt: new Date().toISOString(),
  }).run();
  return getDeckWithEntries(id, true)!;
}

export function addEntryToDeck(deckId: string, entryId: string) {
  return db.transaction((tx) => {
    const deck = tx.select().from(decks).where(eq(decks.id, deckId)).get();
    const entry = tx.select().from(vocabularyEntries).where(eq(vocabularyEntries.id, entryId)).get();
    if (!deck) throw new Error("DECK_NOT_FOUND");
    if (!entry) throw new Error("VOCABULARY_NOT_FOUND");
    if (deck.visibility === "public" && entry.status !== "published") {
      throw new Error("CANNOT_ADD_DRAFT_TO_PUBLIC_DECK");
    }
    const previous = tx.select().from(deckItems)
      .where(and(eq(deckItems.deckId, deckId), eq(deckItems.entryId, entryId))).get();
    if (previous) return false;
    const count = tx.select().from(deckItems).where(eq(deckItems.deckId, deckId)).all().length;
    tx.insert(deckItems).values({ deckId, entryId, sortOrder: count }).run();
    return true;
  });
}

export function publishDeck(id: string) {
  return db.transaction((tx) => {
    const deck = tx.select().from(decks).where(eq(decks.id, id)).get();
    if (!deck) throw new Error("DECK_NOT_FOUND");
    if (deck.visibility !== "private") throw new Error("DECK_ALREADY_PUBLIC");
    const items = tx.select({ status: vocabularyEntries.status })
      .from(deckItems).innerJoin(vocabularyEntries, eq(deckItems.entryId, vocabularyEntries.id))
      .where(eq(deckItems.deckId, id)).all();
    if (items.length === 0) throw new Error("EMPTY_DECK");
    if (items.some((item) => item.status !== "published")) throw new Error("DECK_HAS_UNPUBLISHED_ITEMS");
    tx.update(decks).set({ visibility: "public" }).where(eq(decks.id, id)).run();
    return id;
  });
}
