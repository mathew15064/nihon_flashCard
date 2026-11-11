import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { guestAccountMerges, reviewCards, reviewEvents, userDeckEnrollments } from "@/db/schema";

/** Explicit authenticated guest -> learner migration. Never use this for v1 user data. */
export function transferGuestProgress(guestId:string,learnerId:string){
  if(!/^guest:[a-f0-9-]{36}$/i.test(guestId) ||
     !/^learner:[a-f0-9-]{36}$/i.test(learnerId))throw new Error("INVALID_LEARNING_IDENTITY");
  return db.transaction(tx=>{
    const previous=tx.select().from(guestAccountMerges)
      .where(eq(guestAccountMerges.guestUserId,guestId)).get();
    if(previous){
      if(previous.learnerUserId!==learnerId)throw new Error("GUEST_ALREADY_CLAIMED");
      return {claimed:false,cardsMoved:0,mergedCards:0};
    }
    const guestCards=tx.select().from(reviewCards).where(eq(reviewCards.userId,guestId)).all();
    let cardsMoved=0,mergedCards=0;
    for(const guest of guestCards){
      const learner=tx.select().from(reviewCards).where(
        and(eq(reviewCards.userId,learnerId),eq(reviewCards.entryId,guest.entryId))).get();
      if(!learner){
        tx.update(reviewCards).set({userId:learnerId}).where(eq(reviewCards.id,guest.id)).run();
        cardsMoved++;
        continue;
      }
      // Merge review history and accumulate counters, preferring the most recently
      // reviewed card's schedule so neither review stream is silently discarded.
      const recentGuest=Boolean(guest.lastReviewedAt &&
        (!learner.lastReviewedAt || guest.lastReviewedAt>=learner.lastReviewedAt));
      tx.update(reviewCards).set({
        ...(recentGuest?{
          status:guest.status,nextReviewAt:guest.nextReviewAt,streak:guest.streak,
          lastReviewedAt:guest.lastReviewedAt,
        }:{}),
        timesReviewed:learner.timesReviewed+guest.timesReviewed,
        correctCount:learner.correctCount+guest.correctCount,
        wrongCount:learner.wrongCount+guest.wrongCount,
      }).where(eq(reviewCards.id,learner.id)).run();
      tx.update(reviewEvents).set({cardId:learner.id})
        .where(eq(reviewEvents.cardId,guest.id)).run();
      tx.delete(reviewCards).where(eq(reviewCards.id,guest.id)).run();
      mergedCards++;
    }
    const enrollments=tx.select().from(userDeckEnrollments)
      .where(eq(userDeckEnrollments.userId,guestId)).all();
    for(const e of enrollments){
      tx.insert(userDeckEnrollments).values({
        userId:learnerId,deckId:e.deckId,enrolledAt:e.enrolledAt,
      }).onConflictDoNothing().run();
    }
    tx.delete(userDeckEnrollments).where(eq(userDeckEnrollments.userId,guestId)).run();
    tx.insert(guestAccountMerges).values({
      guestUserId:guestId,learnerUserId:learnerId,mergedAt:new Date().toISOString(),
    }).run();
    return {claimed:true,cardsMoved,mergedCards};
  });
}
