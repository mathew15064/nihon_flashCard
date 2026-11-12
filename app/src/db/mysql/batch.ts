import type { openMySQL } from "./connector";
import { mysqlVocabulary } from "./vocabulary";
import { mysqlDecks } from "./decks";
import { batchItems,publishSelectedInput } from "@/modules/vocabulary/batch-schema";
import { z } from "zod";
import type { VocabularyInput } from "@/modules/vocabulary/schema";

type Db=ReturnType<typeof openMySQL>["db"];
const safeCodes=new Set([
  "LESSON_NOT_FOUND","DECK_NOT_FOUND","VOCABULARY_NOT_FOUND",
  "CANNOT_ADD_DRAFT_TO_PUBLIC_DECK","VOCABULARY_NOT_DRAFT",
  "VOCABULARY_NEEDS_VI_MEANING","ENTRY_NOT_IN_LESSON",
]);
export function batchErrorCode(error:unknown):string{
  if(error instanceof z.ZodError)return "VALIDATION_ERROR";
  return error instanceof Error&&safeCodes.has(error.message)?error.message:"BATCH_ITEM_FAILED";
}
function duplicateKey(error:unknown):boolean{
  // Drizzle wraps driver errors. Never include driver messages or SQL in results.
  let current=error;
  for(let depth=0;depth<4&&current&&typeof current==="object";depth++){
    const value=current as {code?:unknown;errno?:unknown;cause?:unknown};
    if(value.code==="ER_DUP_ENTRY"||value.errno===1062)return true;
    current=value.cause;
  }
  return false;
}
type BatchEntry={id:string;status:string};
type BatchLesson={visibility:string;entries:BatchEntry[]};
type BatchServices={
  vocab:{
    createDraft(input:VocabularyInput):Promise<{created:boolean;item:BatchEntry}>;
    get(id:string,includeDrafts?:boolean):Promise<BatchEntry|null|undefined>;
    publish(id:string):Promise<unknown>;
  };
  decks:{
    get(id:string,includePrivate?:boolean):Promise<BatchLesson|null|undefined>;
    addEntry(lessonId:string,entryId:string):Promise<boolean>;
  };
};
export function mysqlBatch(db:Db){
  return createBatchService({vocab:mysqlVocabulary(db),decks:mysqlDecks(db)});
}
// The service boundary also permits deterministic tests without a live database.
export function createBatchService({vocab,decks}:BatchServices){
  const lesson=async(id:string)=>{
    z.string().uuid().parse(id);
    const value=await decks.get(id,true);
    if(!value)throw new Error("LESSON_NOT_FOUND");
    return value;
  };
  const addToLesson=async(lessonId:string,raw:unknown)=>{
    const items=batchItems.parse(raw);
    const target=await lesson(lessonId);
    if(target.visibility!=="private")throw new Error("CANNOT_ADD_DRAFT_TO_PUBLIC_DECK");
    const result={lessonId,received:items.length,created:0,duplicates:0,linked:0,
      alreadyLinked:0,errors:[] as {index:number;code:string}[]};
    for(const [index,input] of items.entries()){
      try{
        // A concurrent insert can win after createDraft's lookup. Retry the
        // lookup once after its transaction rolls back on the unique key.
        const draft=await vocab.createDraft(input).catch(error=>{
          if(!duplicateKey(error))throw error;
          return vocab.createDraft(input);
        });
        if(draft.created)result.created++;else result.duplicates++;
        let linked:boolean;
        try{linked=await decks.addEntry(lessonId,draft.item.id);}
        catch(error){
          if(!duplicateKey(error))throw error;
          const latest=await lesson(lessonId);
          if(!latest.entries.some(entry=>entry.id===draft.item.id))throw error;
          linked=false;
        }
        if(linked)result.linked++;else result.alreadyLinked++;
      }catch(error){result.errors.push({index,code:batchErrorCode(error)});}
    }
    return result;
  };
  const publishEntries=async(target:Awaited<ReturnType<typeof lesson>>,ids:string[])=>{
    const entries=new Map(target.entries.map(entry=>[entry.id,entry]));
    const result={published:0,skipped:0,errors:[] as {id:string;code:string}[]};
    for(const id of new Set(ids)){
      const entry=entries.get(id);
      if(!entry){result.errors.push({id,code:"ENTRY_NOT_IN_LESSON"});continue;}
      if(entry.status==="published"){result.skipped++;continue;}
      try{await vocab.publish(id);result.published++;}
      catch(error){
        // Concurrent publication is an idempotent success, never republish.
        if(error instanceof Error&&error.message==="VOCABULARY_NOT_DRAFT"&&
          (await vocab.get(id,true))?.status==="published"){result.skipped++;continue;}
        result.errors.push({id,code:batchErrorCode(error)});
      }
    }
    return result;
  };
  const publishSelected=async(lessonId:string,raw:unknown)=>{
    const {entryIds}=publishSelectedInput.parse({entryIds:raw});
    return publishEntries(await lesson(lessonId),entryIds);
  };
  const publishAll=async(lessonId:string)=>{
    const target=await lesson(lessonId);
    return publishEntries(target,target.entries.map(entry=>entry.id));
  };
  return {addToLesson,publishSelected,publishAll};
}
