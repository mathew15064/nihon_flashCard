import { test } from "node:test";
import assert from "node:assert/strict";
import {
  batchInput,lessonBatchInput,lessonInput,topicInput,publishSelectedInput,emptyInput,
} from "../src/modules/vocabulary/batch-schema";

const lessonId="c880b188-9812-43dc-839b-0324efe75cd1";
const item={word:" 猫 ",reading:" ねこ ",meaningVi:" mèo "};

test("batch bounds and vocabulary validation are strict",()=>{
  const parsed=batchInput.parse({items:[item]});
  assert.equal(parsed.items[0]?.word,"猫");
  assert.equal(parsed.items[0]?.meaningVi,"mèo");
  assert.equal(parsed.items[0]?.language,"ja");
  assert.equal(batchInput.safeParse({items:Array(100).fill(item)}).success,true);
  for(const invalid of [
    {items:[]},{items:Array(101).fill(item)},
    {items:[{...item,meaningVi:" "}]},{items:[{...item,word:"x".repeat(121)}]},
    {items:[{...item,status:"published"}]},{items:[{...item,visibility:"public"}]},
    {items:[{...item,jlptLevel:"N6"}]},{items:[item],publish:true},
    {items:[{...item,sourceRef:"x".repeat(201)}]},
  ])assert.equal(batchInput.safeParse(invalid).success,false);
});

test("MCP batch requires exactly one complete lesson selector",()=>{
  assert.equal(lessonBatchInput.safeParse({lessonId,items:[item]}).success,true);
  assert.equal(lessonBatchInput.safeParse({topicName:" Animals ",lessonName:" Cats ",items:[item]}).success,true);
  for(const invalid of [
    {items:[item]},{topicName:"Animals",items:[item]},
    {lessonId:"invalid",items:[item]},
    {lessonId,topicName:"Animals",lessonName:"Cats",items:[item]},
    {lessonId,items:[item],publish:true},
    {topicName:"x".repeat(101),lessonName:"Cats",items:[item]},
  ])assert.equal(lessonBatchInput.safeParse(invalid).success,false);
});

test("topic and lesson creation cannot request publication",()=>{
  assert.deepEqual(topicInput.parse({name:" Animals "}),{name:"Animals"});
  assert.equal(lessonInput.safeParse({name:"Cats",topicId:lessonId}).success,true);
  assert.equal(lessonInput.safeParse({name:"Cats",topicId:"invalid"}).success,false);
  assert.equal(topicInput.safeParse({name:"Animals",visibility:"public"}).success,false);
  assert.equal(lessonInput.safeParse({name:"Cats",status:"published"}).success,false);
});

test("publishing accepts only bounded UUID selections or an empty body",()=>{
  assert.equal(publishSelectedInput.safeParse({entryIds:[lessonId]}).success,true);
  for(const entryIds of [[],["invalid"],Array(101).fill(lessonId)]){
    assert.equal(publishSelectedInput.safeParse({entryIds}).success,false);
  }
  assert.equal(emptyInput.safeParse({}).success,true);
  assert.equal(emptyInput.safeParse({publish:true}).success,false);
});

import { createBatchService,batchErrorCode } from "../src/db/mysql/batch";

function fixture(){
  const entries=new Map<string,{id:string;status:string}>();
  const linked=new Set<string>();
  const target={visibility:"private",entries:[] as {id:string;status:string}[]};
  let creates=0,publishes=0;
  const service=createBatchService({
    vocab:{
      async createDraft(input){
        creates++;
        const existing=entries.get(input.word);
        if(existing)return {created:false,item:existing};
        const entry={id:lessonId,status:"draft"};
        entries.set(input.word,entry);
        return {created:true,item:entry};
      },
      async get(id){return [...entries.values()].find(entry=>entry.id===id)??null;},
      async publish(id){
        publishes++;
        const entry=[...entries.values()].find(entry=>entry.id===id);
        if(!entry)throw new Error("VOCABULARY_NOT_FOUND");
        entry.status="published";
      },
    },
    decks:{
      async get(){return target;},
      async addEntry(_id,id){
        if(linked.has(id))return false;
        linked.add(id);
        target.entries.push([...entries.values()].find(entry=>entry.id===id)!);
        return true;
      },
    },
  });
  return {service,target,creates:()=>creates,publishes:()=>publishes};
}

test("batch retries deduplicate creation and links; publishing is scoped and idempotent",async()=>{
  const {service,publishes}=fixture();
  assert.deepEqual(await service.addToLesson(lessonId,[item,item]),{
    lessonId,received:2,created:1,duplicates:1,linked:1,alreadyLinked:1,errors:[],
  });
  assert.deepEqual(await service.addToLesson(lessonId,[item]),{
    lessonId,received:1,created:0,duplicates:1,linked:0,alreadyLinked:1,errors:[],
  });
  const other="a880b188-9812-43dc-839b-0324efe75cd1";
  assert.deepEqual(await service.publishSelected(lessonId,[other]),{
    published:0,skipped:0,errors:[{id:other,code:"ENTRY_NOT_IN_LESSON"}],
  });
  assert.equal(publishes(),0);
  assert.deepEqual(await service.publishSelected(lessonId,[lessonId,lessonId]),{
    published:1,skipped:0,errors:[],
  });
  assert.deepEqual(await service.publishAll(lessonId),{published:0,skipped:1,errors:[]});
  assert.equal(publishes(),1);
});

test("public lessons reject batches before creating drafts; errors do not expose SQL",async()=>{
  const {service,target,creates}=fixture();
  target.visibility="public";
  await assert.rejects(service.addToLesson(lessonId,[item]),{message:"CANNOT_ADD_DRAFT_TO_PUBLIC_DECK"});
  assert.equal(creates(),0);
  assert.equal(batchErrorCode(new Error("SQL connection details")),"BATCH_ITEM_FAILED");
  assert.equal(batchErrorCode(new Error("VOCABULARY_NOT_FOUND")),"VOCABULARY_NOT_FOUND");
});

test("duplicate-key races retry lookups and sanitize per-item failures",async()=>{
  let lookups=0;
  const target={visibility:"private",entries:[] as {id:string;status:string}[]};
  const service=createBatchService({
    vocab:{
      async createDraft(input){
        if(input.word==="失敗")throw new Error("database SQL details");
        if(++lookups===1)throw {cause:{code:"ER_DUP_ENTRY"}};
        return {created:false,item:{id:lessonId,status:"published"}};
      },
      async get(){return {id:lessonId,status:"published"};},
      async publish(){throw new Error("unexpected publication");},
    },
    decks:{
      async get(){return target;},
      async addEntry(){
        target.entries.push({id:lessonId,status:"published"});
        throw {errno:1062};
      },
    },
  });
  assert.deepEqual(await service.addToLesson(lessonId,[item,{...item,word:"失敗"}]),{
    lessonId,received:2,created:0,duplicates:1,linked:0,alreadyLinked:1,
    errors:[{index:1,code:"BATCH_ITEM_FAILED"}],
  });
  assert.equal(lookups,2);
  assert.equal(target.entries[0]?.status,"published");
});
