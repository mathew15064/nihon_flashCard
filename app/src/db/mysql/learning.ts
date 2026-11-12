import { randomUUID } from "node:crypto";
import { and,asc,eq,isNotNull,lte,notInArray,or,sql,gte } from "drizzle-orm";
import type { openMySQL } from "./connector";
import {
  decks,deckItems,reviewCards,reviewEvents,userDeckEnrollments,
  vocabularyEntries,vocabularySenses,guestAccountMerges,
} from "./schema";
import { scheduleReview, type ReviewResult } from "@/modules/learning/scheduler";
import { reviewInputSchema, type ReviewInput } from "@/modules/learning/schema";

type Db=ReturnType<typeof openMySQL>["db"];
function checkIdentity(id:string){
  if(!/^(guest|learner):[a-f0-9-]{36}$/i.test(id))
    throw new Error("INVALID_LEARNING_IDENTITY");
}
export function mysqlLearning(db:Db){
  const enrollDeck=async(userId:string,deckId:string)=>{
    checkIdentity(userId);
    const now=new Date().toISOString();
    return db.transaction(async tx=>{
      const deck=(await tx.select().from(decks).where(and(
        eq(decks.id,deckId),eq(decks.visibility,"public")
      )).limit(1))[0];
      if(!deck)throw new Error("DECK_NOT_FOUND");
      const entries=await tx.select({id:vocabularyEntries.id}).from(deckItems)
        .innerJoin(vocabularyEntries,eq(deckItems.entryId,vocabularyEntries.id))
        .where(and(eq(deckItems.deckId,deckId),eq(vocabularyEntries.status,"published")))
        .orderBy(asc(deckItems.sortOrder)).limit(201);
      if(entries.length>200)throw new Error("DECK_TOO_LARGE");
      if(!entries.length)throw new Error("EMPTY_DECK");
      const previous=await tx.select().from(userDeckEnrollments).where(and(
        eq(userDeckEnrollments.userId,userId),eq(userDeckEnrollments.deckId,deckId)
      )).limit(1);
      if(!previous.length)await tx.insert(userDeckEnrollments).values({
        userId,deckId,enrolledAt:now,
      });
      let newCards=0;
      for(const entry of entries){
        const found=await tx.select({id:reviewCards.id}).from(reviewCards)
          .where(and(eq(reviewCards.userId,userId),eq(reviewCards.entryId,entry.id))).limit(1);
        if(found.length)continue;
        await tx.insert(reviewCards).values({
          id:randomUUID(),userId,entryId:entry.id,status:"new",
        });
        newCards++;
      }
      return {newCards,totalDeckEntries:entries.length};
    });
  };
  const enrollQuickStart=async(userId:string)=>{
    checkIdentity(userId);
    return db.transaction(async tx=>{
      const alreadyTracked=tx.select({entryId:reviewCards.entryId}).from(reviewCards)
        .where(eq(reviewCards.userId,userId));
      const entries=await tx.select({id:vocabularyEntries.id}).from(vocabularyEntries)
        .where(and(eq(vocabularyEntries.status,"published"),
          notInArray(vocabularyEntries.id,alreadyTracked)))
        .orderBy(asc(vocabularyEntries.createdAt),asc(vocabularyEntries.id)).limit(20);
      let newCards=0;
      for(const entry of entries){
        await tx.insert(reviewCards).values({
          id:randomUUID(),userId,entryId:entry.id,status:"new",
        });
        newCards++;
      }
      return {newCards,selected:entries.length};
    });
  };
  const due=async(userId:string,limit=10,now=new Date())=>{
    checkIdentity(userId);
    const count=Math.max(1,Math.min(50,Math.floor(limit)));
    const rows=await db.select({
      id:reviewCards.id,entryId:vocabularyEntries.id,
      word:vocabularyEntries.word,reading:vocabularyEntries.reading,
      jlptLevel:vocabularyEntries.jlptLevel,status:reviewCards.status,
      streak:reviewCards.streak,timesReviewed:reviewCards.timesReviewed,
      nextReviewAt:reviewCards.nextReviewAt,
    }).from(reviewCards).innerJoin(vocabularyEntries,eq(reviewCards.entryId,vocabularyEntries.id))
      .where(and(
        eq(reviewCards.userId,userId),eq(vocabularyEntries.status,"published"),
        or(eq(reviewCards.status,"new"),and(isNotNull(reviewCards.nextReviewAt),
          lte(reviewCards.nextReviewAt,now.toISOString()))),
      )).orderBy(sql`CASE WHEN ${reviewCards.status} = 'new' THEN 1 ELSE 0 END`,
        asc(reviewCards.nextReviewAt),asc(vocabularyEntries.word))
      .limit(count);
    return Promise.all(rows.map(async row=>{
      const senses=await db.select({meaning:vocabularySenses.meaning})
        .from(vocabularySenses).where(and(eq(vocabularySenses.entryId,row.entryId),
          eq(vocabularySenses.language,"vi"))).orderBy(vocabularySenses.sortOrder).limit(1);
      return {...row,meaningVi:senses[0]?.meaning??null};
    }));
  };
  const progress=async(userId:string,now=new Date())=>{
    checkIdentity(userId);
    const rows=await db.select({
      status:reviewCards.status,due:reviewCards.nextReviewAt,
      lastReviewedAt:reviewCards.lastReviewedAt,
      timesReviewed:reviewCards.timesReviewed,
    }).from(reviewCards).innerJoin(vocabularyEntries,eq(reviewCards.entryId,vocabularyEntries.id))
      .where(and(eq(reviewCards.userId,userId),eq(vocabularyEntries.status,"published")));
    const byStatus:Record<string,number>={new:0,learning:0,review:0,mastered:0};
    let dueNow=0;
    let nextDueAt:string|null=null;
    const current=now.toISOString();
    for(const card of rows){
      byStatus[card.status]=(byStatus[card.status]??0)+1;
      if(card.status==="new"||(card.due&&card.due<=current))dueNow++;
      else if(card.due&&(nextDueAt===null||card.due<nextDueAt))nextDueAt=card.due;
    }
    const today=new Date(now);today.setUTCHours(0,0,0,0);
    const totals=await db.select({total:sql<number>`count(*)`}).from(reviewEvents)
      .innerJoin(reviewCards,eq(reviewEvents.cardId,reviewCards.id))
      .where(and(eq(reviewCards.userId,userId),
        gte(reviewEvents.reviewedAt,today.toISOString())));
    const decks=await db.select({total:sql<number>`count(*)`})
      .from(userDeckEnrollments).where(eq(userDeckEnrollments.userId,userId));
    return {totalTracked:rows.length,byStatus,dueNow,nextDueAt,
      todayReviews:Number(totals[0]?.total||0),enrolledDecks:Number(decks[0]?.total||0)};
  };
  const review=async(userId:string,raw:ReviewInput,now=new Date())=>{
    checkIdentity(userId);
    const input=reviewInputSchema.parse(raw);
    const current=now.toISOString();
    return db.transaction(async tx=>{
      // Lock the review card before checking the request ID to ensure sequential
      // scheduling under competing HTTP requests across multiple processes.
      const locked=await tx.select({id:reviewCards.id}).from(reviewCards)
        .where(and(eq(reviewCards.id,input.cardId),eq(reviewCards.userId,userId)))
        .for("update");
      if(!locked.length)throw new Error("REVIEW_CARD_NOT_FOUND");
      const previous=await tx.select({
        cardId:reviewEvents.cardId,result:reviewEvents.result,userId:reviewCards.userId,
      }).from(reviewEvents).innerJoin(reviewCards,eq(reviewEvents.cardId,reviewCards.id))
        .where(eq(reviewEvents.requestId,input.requestId)).limit(1);
      const card=(await tx.select().from(reviewCards)
        .where(eq(reviewCards.id,input.cardId)).limit(1))[0];
      if(!card)throw new Error("REVIEW_CARD_NOT_FOUND");
      if(previous.length){
        const event=previous[0]!;
        if(event.userId!==userId||event.cardId!==input.cardId||event.result!==input.result)
          throw new Error("REVIEW_REQUEST_CONFLICT");
        return {idempotent:true,card:{
          id:card.id,status:card.status,streak:card.streak,
          timesReviewed:card.timesReviewed,nextReviewAt:card.nextReviewAt,
        }};
      }
      const entry=(await tx.select({status:vocabularyEntries.status})
        .from(vocabularyEntries).where(eq(vocabularyEntries.id,card.entryId)).limit(1))[0];
      if(entry?.status!=="published")throw new Error("REVIEW_CARD_NOT_FOUND");
      if(card.status!=="new"&&(!card.nextReviewAt||card.nextReviewAt>current))
        throw new Error("REVIEW_CARD_NOT_DUE");
      const result=scheduleReview(card,input.result as ReviewResult,now);
      await tx.update(reviewCards).set({
        status:result.status,streak:result.streak,
        timesReviewed:result.timesReviewed,correctCount:result.correctCount,
        wrongCount:result.wrongCount,lastReviewedAt:result.lastReviewedAt,
        nextReviewAt:result.nextReviewAt,
      }).where(eq(reviewCards.id,card.id));
      await tx.insert(reviewEvents).values({
        id:randomUUID(),cardId:card.id,result:input.result,
        reviewedAt:result.lastReviewedAt,requestId:input.requestId,
      });
      return {idempotent:false,card:{
        id:card.id,status:result.status,streak:result.streak,
        timesReviewed:result.timesReviewed,nextReviewAt:result.nextReviewAt,
      }};
    });
  };
  const transfer=async(guestId:string,learnerId:string)=>{
    if(!/^guest:[a-f0-9-]{36}$/i.test(guestId)||!/^learner:[a-f0-9-]{36}$/i.test(learnerId))
      throw new Error("INVALID_LEARNING_IDENTITY");
    return db.transaction(async tx=>{
      const previous=await tx.select().from(guestAccountMerges)
        .where(eq(guestAccountMerges.guestUserId,guestId)).limit(1);
      if(previous.length){
        if(previous[0]?.learnerUserId!==learnerId)
          throw new Error("GUEST_ALREADY_CLAIMED");
        return {claimed:false,cardsMoved:0,mergedCards:0};
      }
      const guestCards=await tx.select().from(reviewCards)
        .where(eq(reviewCards.userId,guestId)).for("update");
      let cardsMoved=0,mergedCards=0;
      for(const guest of guestCards){
        const learner=(await tx.select().from(reviewCards).where(and(
          eq(reviewCards.userId,learnerId),eq(reviewCards.entryId,guest.entryId)
        )).limit(1).for("update"))[0];
        if(!learner){
          await tx.update(reviewCards).set({userId:learnerId})
            .where(eq(reviewCards.id,guest.id));
          cardsMoved++;continue;
        }
        const recent=Boolean(guest.lastReviewedAt&&
          (!learner.lastReviewedAt||guest.lastReviewedAt>=learner.lastReviewedAt));
        await tx.update(reviewCards).set({
          ...(recent?{
            status:guest.status,nextReviewAt:guest.nextReviewAt,
            streak:guest.streak,lastReviewedAt:guest.lastReviewedAt,
          }:{}),
          timesReviewed:learner.timesReviewed+guest.timesReviewed,
          correctCount:learner.correctCount+guest.correctCount,
          wrongCount:learner.wrongCount+guest.wrongCount,
        }).where(eq(reviewCards.id,learner.id));
        await tx.update(reviewEvents).set({cardId:learner.id})
          .where(eq(reviewEvents.cardId,guest.id));
        await tx.delete(reviewCards).where(eq(reviewCards.id,guest.id));
        mergedCards++;
      }
      const enrollments=await tx.select().from(userDeckEnrollments)
        .where(eq(userDeckEnrollments.userId,guestId));
      for(const row of enrollments){
        const existing=await tx.select().from(userDeckEnrollments).where(and(
          eq(userDeckEnrollments.userId,learnerId),
          eq(userDeckEnrollments.deckId,row.deckId))).limit(1);
        if(!existing.length)await tx.insert(userDeckEnrollments).values({
          userId:learnerId,deckId:row.deckId,enrolledAt:row.enrolledAt,
        });
      }
      await tx.delete(userDeckEnrollments).where(eq(userDeckEnrollments.userId,guestId));
      await tx.insert(guestAccountMerges).values({
        guestUserId:guestId,learnerUserId:learnerId,mergedAt:new Date().toISOString(),
      });
      return {claimed:true,cardsMoved,mergedCards};
    });
  };
  return {enrollDeck,enrollQuickStart,due,progress,review,transfer};
}
