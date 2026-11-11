import { randomUUID } from "node:crypto";
import { and, asc, eq, isNotNull, lte, notInArray, or, sql, gte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  decks, deckItems, reviewCards, reviewEvents, userDeckEnrollments,
  vocabularyEntries, vocabularySenses,
} from "@/db/schema";
import { scheduleReview, type ReviewResult } from "./scheduler";
import { reviewInputSchema, type ReviewInput } from "./schema";

const MAX_ENROLL_PER_ACTION = 200;
const MAX_QUICK_START = 20;

export type DueCard = {
  id: string;
  entryId: string;
  word: string;
  reading: string;
  meaningVi: string | null;
  jlptLevel: string | null;
  status: string;
  streak: number;
  timesReviewed: number;
  nextReviewAt: string | null;
};

/** Account/guest authorization is performed at the Route Handler boundary. */
function assertGuest(userId: string) {
  if (!/^(guest|learner):[a-f0-9-]{36}$/i.test(userId)) throw new Error("INVALID_LEARNING_IDENTITY");
}

export function enrollDeckForGuest(userId: string, deckId: string) {
  assertGuest(userId);
  const now = new Date().toISOString();
  return db.transaction((tx) => {
    const deck = tx.select().from(decks)
      .where(and(eq(decks.id, deckId), eq(decks.visibility, "public"))).get();
    if (!deck) throw new Error("DECK_NOT_FOUND");
    const entries = tx.select({ id: vocabularyEntries.id }).from(deckItems)
      .innerJoin(vocabularyEntries, eq(deckItems.entryId, vocabularyEntries.id))
      .where(and(eq(deckItems.deckId, deckId), eq(vocabularyEntries.status, "published")))
      .orderBy(asc(deckItems.sortOrder)).limit(MAX_ENROLL_PER_ACTION + 1).all();
    if (entries.length > MAX_ENROLL_PER_ACTION) throw new Error("DECK_TOO_LARGE");
    if (entries.length === 0) throw new Error("EMPTY_DECK");
    tx.insert(userDeckEnrollments).values({
      userId, deckId, enrolledAt: now,
    }).onConflictDoNothing().run();
    let newCards = 0;
    for (const entry of entries) {
      const done = tx.insert(reviewCards).values({
        id: randomUUID(), userId, entryId: entry.id, status: "new",
      }).onConflictDoNothing().run();
      newCards += Number(done.changes);
    }
    return { newCards, totalDeckEntries: entries.length };
  });
}

/** Useful before the first curated deck is available: choose published words only. */
export function enrollQuickStart(userId: string) {
  assertGuest(userId);
  return db.transaction((tx) => {
    // Select the next batch of published words the guest has not enrolled.
    // Repeated clicks progressively cover the whole public vocabulary pool.
    const alreadyTracked = tx.select({ entryId: reviewCards.entryId })
      .from(reviewCards).where(eq(reviewCards.userId, userId));
    const entries = tx.select({ id: vocabularyEntries.id }).from(vocabularyEntries)
      .where(and(eq(vocabularyEntries.status, "published"),
        notInArray(vocabularyEntries.id, alreadyTracked)))
      .orderBy(asc(vocabularyEntries.createdAt), asc(vocabularyEntries.id))
      .limit(MAX_QUICK_START).all();
    let newCards = 0;
    for (const entry of entries) {
      const done = tx.insert(reviewCards).values({
        id: randomUUID(), userId, entryId: entry.id, status: "new",
      }).onConflictDoNothing().run();
      newCards += Number(done.changes);
    }
    return { newCards, selected: entries.length };
  });
}

export function listDueCards(userId: string, limit = 10, now = new Date()): DueCard[] {
  assertGuest(userId);
  const current = now.toISOString();
  const count = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = db.select({
    id: reviewCards.id,
    entryId: vocabularyEntries.id,
    word: vocabularyEntries.word,
    reading: vocabularyEntries.reading,
    jlptLevel: vocabularyEntries.jlptLevel,
    status: reviewCards.status,
    streak: reviewCards.streak,
    timesReviewed: reviewCards.timesReviewed,
    nextReviewAt: reviewCards.nextReviewAt,
  }).from(reviewCards).innerJoin(vocabularyEntries, eq(reviewCards.entryId, vocabularyEntries.id))
    .where(and(
      eq(reviewCards.userId, userId),
      eq(vocabularyEntries.status, "published"),
      or(
        eq(reviewCards.status, "new"),
        and(isNotNull(reviewCards.nextReviewAt), lte(reviewCards.nextReviewAt, current))
      ),
    ))
    // Show overdue reviews ahead of new words.
    .orderBy(sql`CASE WHEN ${reviewCards.status} = 'new' THEN 1 ELSE 0 END`,
      asc(reviewCards.nextReviewAt), asc(vocabularyEntries.word))
    .limit(count).all();
  return rows.map((row) => ({
    ...row,
    meaningVi: db.select({ meaning: vocabularySenses.meaning })
      .from(vocabularySenses)
      .where(and(eq(vocabularySenses.entryId, row.entryId), eq(vocabularySenses.language, "vi")))
      .orderBy(vocabularySenses.sortOrder).limit(1).get()?.meaning ?? null,
  }));
}

export function getReviewProgress(userId: string, now = new Date()) {
  assertGuest(userId);
  const rows = db.select({
    status: reviewCards.status,
    due: reviewCards.nextReviewAt,
    lastReviewedAt: reviewCards.lastReviewedAt,
    timesReviewed: reviewCards.timesReviewed,
  }).from(reviewCards)
    .innerJoin(vocabularyEntries, eq(reviewCards.entryId, vocabularyEntries.id))
    .where(and(eq(reviewCards.userId, userId), eq(vocabularyEntries.status, "published")))
    .all();
  const byStatus: Record<string, number> = { new: 0, learning: 0, review: 0, mastered: 0 };
  let dueNow = 0;
  let nextDueAt: string | null = null;
  const current = now.toISOString();
  for (const card of rows) {
    byStatus[card.status] = (byStatus[card.status] ?? 0) + 1;
    if (card.status === "new" || (card.due && card.due <= current)) dueNow++;
    else if (card.due && (nextDueAt === null || card.due < nextDueAt)) nextDueAt = card.due;
  }
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayReviews = db.select({ total: sql<number>`count(*)` }).from(reviewEvents)
    .innerJoin(reviewCards, eq(reviewEvents.cardId, reviewCards.id))
    .where(and(eq(reviewCards.userId, userId),
      gte(reviewEvents.reviewedAt, todayStart.toISOString()))).get()?.total ?? 0;
  const enrolledDecks = db.select({ total: sql<number>`count(*)` }).from(userDeckEnrollments)
    .where(eq(userDeckEnrollments.userId, userId)).get()?.total ?? 0;
  return {
    totalTracked: rows.length,
    byStatus,
    dueNow,
    nextDueAt,
    todayReviews,
    enrolledDecks,
  };
}

/** One transaction guarantees schedule and event history can never diverge. */
export function recordGuestReview(userId: string, raw: ReviewInput,
  now = new Date()): { idempotent: boolean; card: {
    id: string; status: string; streak: number; timesReviewed: number; nextReviewAt: string | null
  }} {
  assertGuest(userId);
  const input = reviewInputSchema.parse(raw);
  const current = now.toISOString();
  return db.transaction((tx) => {
    const previousEvent = tx.select({
      cardId: reviewEvents.cardId,
      result: reviewEvents.result,
      userId: reviewCards.userId,
    }).from(reviewEvents).innerJoin(reviewCards, eq(reviewEvents.cardId, reviewCards.id))
      .where(eq(reviewEvents.requestId, input.requestId)).get();

    if (previousEvent) {
      if (previousEvent.userId !== userId || previousEvent.cardId !== input.cardId
          || previousEvent.result !== input.result) throw new Error("REVIEW_REQUEST_CONFLICT");
      const card = tx.select().from(reviewCards).where(eq(reviewCards.id, input.cardId)).get();
      if (!card) throw new Error("REVIEW_CARD_NOT_FOUND");
      return { idempotent: true, card: {
        id: card.id, status: card.status, streak: card.streak,
        timesReviewed: card.timesReviewed, nextReviewAt: card.nextReviewAt,
      }};
    }
    const card = tx.select({
      id: reviewCards.id,
      userId: reviewCards.userId,
      status: reviewCards.status,
      streak: reviewCards.streak,
      timesReviewed: reviewCards.timesReviewed,
      correctCount: reviewCards.correctCount,
      wrongCount: reviewCards.wrongCount,
      nextReviewAt: reviewCards.nextReviewAt,
    }).from(reviewCards)
      .innerJoin(vocabularyEntries, eq(reviewCards.entryId, vocabularyEntries.id))
      .where(and(
        eq(reviewCards.id, input.cardId),
        eq(reviewCards.userId, userId),
        eq(vocabularyEntries.status, "published"),
      )).get();
    if (!card) throw new Error("REVIEW_CARD_NOT_FOUND");
    if (card.status !== "new" && (!card.nextReviewAt || card.nextReviewAt > current)) {
      throw new Error("REVIEW_CARD_NOT_DUE");
    }
    const result = scheduleReview(card, input.result as ReviewResult, now);
    tx.update(reviewCards).set({
      status: result.status, streak: result.streak,
      timesReviewed: result.timesReviewed, correctCount: result.correctCount,
      wrongCount: result.wrongCount, lastReviewedAt: result.lastReviewedAt,
      nextReviewAt: result.nextReviewAt,
    }).where(eq(reviewCards.id, card.id)).run();
    tx.insert(reviewEvents).values({
      id: randomUUID(), cardId: card.id, result: input.result,
      reviewedAt: result.lastReviewedAt, requestId: input.requestId,
    }).run();
    return { idempotent: false, card: {
      id: card.id, status: result.status, streak: result.streak,
      timesReviewed: result.timesReviewed, nextReviewAt: result.nextReviewAt,
    }};
  });
}
