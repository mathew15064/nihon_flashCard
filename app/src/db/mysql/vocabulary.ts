import { randomUUID } from "node:crypto";
import { and, eq, like, or } from "drizzle-orm";
import type { openMySQL } from "./connector";
import { vocabularyEntries, vocabularySenses } from "./schema";
import { type VocabularyInput } from "@/modules/vocabulary/schema";
import { normalizedKey } from "@/modules/vocabulary/normalize";

type Db=ReturnType<typeof openMySQL>["db"];
export function mysqlVocabulary(db:Db){
  const attachSenses=async(rows:(typeof vocabularyEntries.$inferSelect)[])=>Promise.all(
    rows.map(async row=>({
      ...row,senses:await db.select().from(vocabularySenses)
        .where(eq(vocabularySenses.entryId,row.id)).orderBy(vocabularySenses.sortOrder),
    })),
  );
  const list=async(options:{
    search?:string;jlpt?:string;page?:number;limit?:number;includeDrafts?:boolean
  }={})=>{
    const page=options.page||1,limit=options.limit||30,search=options.search?.trim()||"";
    const conditions=[
      ...(options.includeDrafts?[]:[eq(vocabularyEntries.status,"published")]),
      ...(options.jlpt?[eq(vocabularyEntries.jlptLevel,options.jlpt)]:[]),
      ...(search?[or(like(vocabularyEntries.word,"%"+search+"%"),
        like(vocabularyEntries.reading,"%"+search+"%"))!]:[]),
    ];
    const rows=await db.select().from(vocabularyEntries)
      .where(conditions.length?and(...conditions):undefined)
      .orderBy(vocabularyEntries.createdAt)
      .limit(limit).offset((page-1)*limit);
    return {items:await attachSenses(rows),page,limit};
  };
  const get=async(id:string,includeDrafts=false)=>{
    const rows=await db.select().from(vocabularyEntries).where(and(
      eq(vocabularyEntries.id,id),
      ...(includeDrafts?[]:[eq(vocabularyEntries.status,"published")]),
    )).limit(1);
    return rows.length?(await attachSenses(rows))[0]:null;
  };
  const createDraft=async(input:VocabularyInput)=>{
    const key=normalizedKey(input);
    const existing=await db.select({id:vocabularyEntries.id}).from(vocabularyEntries)
      .where(and(eq(vocabularyEntries.language,input.language),
        eq(vocabularyEntries.normalizedKey,key))).limit(1);
    if(existing.length)return {created:false as const,item:(await get(existing[0]!.id,true))!};
    const id=randomUUID(),now=new Date().toISOString();
    await db.transaction(async tx=>{
      await tx.insert(vocabularyEntries).values({
        id,language:input.language,word:input.word,reading:input.reading,
        romanization:input.romanization??null,
        partOfSpeech:input.partOfSpeech??null,jlptLevel:input.jlptLevel??null,
        normalizedKey:key,status:"draft",source:input.source,
        sourceRef:input.sourceRef??null,createdAt:now,updatedAt:now,
      });
      await tx.insert(vocabularySenses).values({
        id:randomUUID(),entryId:id,language:"vi",meaning:input.meaningVi,sortOrder:0,
      });
      if(input.meaningEn)await tx.insert(vocabularySenses).values({
        id:randomUUID(),entryId:id,language:"en",meaning:input.meaningEn,sortOrder:1,
      });
    });
    return {created:true as const,item:(await get(id,true))!};
  };
  const publish=async(id:string)=>{
    const item=await get(id,true);
    if(!item)throw new Error("VOCABULARY_NOT_FOUND");
    if(item.status!=="draft")throw new Error("VOCABULARY_NOT_DRAFT");
    if(!item.senses.some(s=>s.language==="vi"&&s.meaning.trim()))
      throw new Error("VOCABULARY_NEEDS_VI_MEANING");
    await db.update(vocabularyEntries).set({status:"published",updatedAt:new Date().toISOString()})
      .where(and(eq(vocabularyEntries.id,id),eq(vocabularyEntries.status,"draft")));
    return (await get(id,true))!;
  };
  return {list,get,createDraft,publish};
}
