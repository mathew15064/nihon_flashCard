import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { openMySQL } from "./connector";
import { deckItems, decks, vocabularyEntries } from "./schema";
import { createDeckInput } from "@/modules/decks/schema";
type Db=ReturnType<typeof openMySQL>["db"];

export function mysqlDecks(db:Db){
  const list=async(includePrivate=false)=>db.select().from(decks)
    .where(includePrivate?undefined:eq(decks.visibility,"public")).orderBy(decks.createdAt);
  const get=async(id:string,includePrivate=false)=>{
    const matches=await db.select().from(decks).where(and(eq(decks.id,id),
      ...(includePrivate?[]:[eq(decks.visibility,"public")]))).limit(1);
    const deck=matches[0];
    if(!deck)return null;
    const entries=await db.select({
      id:vocabularyEntries.id,word:vocabularyEntries.word,
      reading:vocabularyEntries.reading,jlptLevel:vocabularyEntries.jlptLevel,
      status:vocabularyEntries.status,
    }).from(deckItems).innerJoin(vocabularyEntries,eq(deckItems.entryId,vocabularyEntries.id))
      .where(and(eq(deckItems.deckId,id),
        ...(includePrivate?[]:[eq(vocabularyEntries.status,"published")])))
      .orderBy(deckItems.sortOrder);
    return {...deck,entries};
  };
  const create=async(raw:{name:string;description?:string})=>{
    const input=createDeckInput.parse(raw);
    const id=randomUUID();
    await db.insert(decks).values({id,name:input.name,description:input.description??null,
      visibility:"private",createdAt:new Date().toISOString()});
    return (await get(id,true))!;
  };
  const addEntry=async(deckId:string,entryId:string)=>db.transaction(async tx=>{
    const d=(await tx.select().from(decks).where(eq(decks.id,deckId)).limit(1))[0];
    const e=(await tx.select().from(vocabularyEntries)
      .where(eq(vocabularyEntries.id,entryId)).limit(1))[0];
    if(!d)throw new Error("DECK_NOT_FOUND");
    if(!e)throw new Error("VOCABULARY_NOT_FOUND");
    if(d.visibility==="public"&&e.status!=="published")
      throw new Error("CANNOT_ADD_DRAFT_TO_PUBLIC_DECK");
    const previous=await tx.select().from(deckItems).where(and(
      eq(deckItems.deckId,deckId),eq(deckItems.entryId,entryId))).limit(1);
    if(previous.length)return false;
    const count=await tx.select({total:sql<number>`count(*)`}).from(deckItems)
      .where(eq(deckItems.deckId,deckId));
    await tx.insert(deckItems).values({deckId,entryId,sortOrder:Number(count[0]?.total||0)});
    return true;
  });
  const publish=async(id:string)=>db.transaction(async tx=>{
    const d=(await tx.select().from(decks).where(eq(decks.id,id)).limit(1))[0];
    if(!d)throw new Error("DECK_NOT_FOUND");
    if(d.visibility!=="private")throw new Error("DECK_ALREADY_PUBLIC");
    const entries=await tx.select({status:vocabularyEntries.status}).from(deckItems)
      .innerJoin(vocabularyEntries,eq(deckItems.entryId,vocabularyEntries.id))
      .where(eq(deckItems.deckId,id));
    if(!entries.length)throw new Error("EMPTY_DECK");
    if(entries.some(x=>x.status!=="published"))throw new Error("DECK_HAS_UNPUBLISHED_ITEMS");
    await tx.update(decks).set({visibility:"public"}).where(eq(decks.id,id));
    return id;
  });
  return {list,get,create,addEntry,publish};
}
