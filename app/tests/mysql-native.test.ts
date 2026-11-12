import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { migrateFreshMySQL, openMySQL, testMySQLConnection } from "../src/db/mysql/connector";
import { mysqlVocabulary } from "../src/db/mysql/vocabulary";
import { mysqlDecks } from "../src/db/mysql/decks";
import { mysqlLearning } from "../src/db/mysql/learning";
import { mysqlAccounts } from "../src/db/mysql/accounts";
import { mysqlSettings } from "../src/db/mysql/settings";
import { mysqlAI } from "../src/db/mysql/ai";
import {
  reviewCards, reviewEvents, vocabularyEntries,
  vocabularySenses,appSettings,
} from "../src/db/mysql/schema";

test("native MySQL 8.4 schema, Drizzle queries, FK and atomic SRS on real MySQL",{
  skip:!process.env.NIHON_MYSQL_TEST_URL,
},async()=>{
  const url=new URL(process.env.NIHON_MYSQL_TEST_URL!);
  if(url.protocol!=="mysql:"||!url.pathname.startsWith("/nihon_qa"))
    throw new Error("MYSQL_INTEGRATION_REQUIRES_DISPOSABLE_QA_TARGET");
  const connection={
    host:url.hostname,port:Number(url.port||3306),user:decodeURIComponent(url.username),
    password:decodeURIComponent(url.password),database:url.pathname.slice(1),tls:"off" as const,
  };
  const ping=await testMySQLConnection(connection);
  assert.equal(ping.connected,true);
  const initial=await migrateFreshMySQL(connection);
  assert.equal(initial.migrations,2);
  assert.ok(initial.tables>=19,JSON.stringify(initial));
  const repeated=await migrateFreshMySQL(connection);
  assert.equal(repeated.migrations,2);
  const {db,pool}=openMySQL(connection);
  const id=randomUUID();
  const now=new Date().toISOString();
  try{
    const word="𠮟る-日本語";
    await db.transaction(async tx=>{
      await tx.insert(vocabularyEntries).values({
        id,language:"ja",word,reading:"しかる",normalizedKey:"qa:"+id,
        status:"published",source:"manual",createdAt:now,updatedAt:now,
      });
      await tx.insert(vocabularySenses).values({
        id:randomUUID(),entryId:id,language:"vi",meaning:"khiển trách",sortOrder:0,
      });
      await tx.insert(appSettings).values({
        key:"qa-"+id,value:"fixture-only",updatedAt:now,
      });
    });
    const vocabulary=mysqlVocabulary(db);
    const deckService=mysqlDecks(db);
    const newWordText="学ぶ-"+id.slice(0,8);
    const newWord=await vocabulary.createDraft({
      language:"ja",word:newWordText,reading:"まなぶ",meaningVi:"học",
      source:"manual",sourceRef:id,
    });
    assert.equal(newWord.created,true);
    assert.equal(newWord.item.status,"draft");
    assert.ok((await vocabulary.list({search:"学ぶ",includeDrafts:true})).items
      .some(item=>item.id===newWord.item.id));
    await vocabulary.publish(newWord.item.id);
    const newDeck=await deckService.create({name:"MySQL QA "+id});
    assert.equal(newDeck.visibility,"private");
    assert.equal(await deckService.addEntry(newDeck.id,newWord.item.id),true);
    assert.equal(await deckService.addEntry(newDeck.id,newWord.item.id),false);
    await deckService.publish(newDeck.id);
    const publicDeck=await deckService.get(newDeck.id);
    assert.equal(publicDeck?.visibility,"public");
    assert.equal(publicDeck?.entries[0]?.word,newWordText);
    const learning=mysqlLearning(db);
    const guestId="guest:"+randomUUID();
    const enrolled=await learning.enrollDeck(guestId,newDeck.id);
    assert.deepEqual(enrolled,{newCards:1,totalDeckEntries:1});
    assert.deepEqual(await learning.enrollDeck(guestId,newDeck.id),{
      newCards:0,totalDeckEntries:1,
    });
    const due=await learning.due(guestId);
    assert.equal(due.length,1);
    assert.equal(due[0]?.word,newWordText);
    assert.equal((await learning.progress(guestId)).dueNow,1);
    const reviewRequest={cardId:due[0]!.id,result:"correct" as const,requestId:randomUUID()};
    const reviewed=await learning.review(guestId,reviewRequest);
    assert.equal(reviewed.card.timesReviewed,1);
    const repeat=await learning.review(guestId,reviewRequest);
    assert.equal(repeat.idempotent,true);
    assert.equal((await learning.progress(guestId)).todayReviews,1);

    const accounts=mysqlAccounts(db,async()=>true);
    const username="m_"+randomUUID().slice(0,8);
    const password="mysql-learner-password-2026";
    const learner=await accounts.register({
      username,displayName:"MySQL QA learner",
      password,repeatPassword:password,
    });
    assert.ok(learner.id.startsWith("learner:"));
    assert.equal((await accounts.authenticate(username,password))?.id,learner.id);
    assert.equal(await accounts.authenticate(username,"incorrect-credential"),null);
    assert.equal((await accounts.getLearnerById(learner.id))?.displayName,"MySQL QA learner");
    const claimed=await learning.transfer(guestId,learner.id);
    assert.deepEqual(claimed,{claimed:true,cardsMoved:1,mergedCards:0});
    assert.equal((await learning.progress(learner.id)).totalTracked,1);
    assert.equal((await learning.transfer(guestId,learner.id)).claimed,false);
    const newPassword="mysql-learner-new-password-2026";
    await accounts.changePassword(learner.id,{
      currentPassword:password,newPassword,repeatPassword:newPassword,
    });
    assert.equal(await accounts.authenticate(username,password),null);
    assert.equal((await accounts.authenticate(username,newPassword))?.id,learner.id);
    const previousSecret=process.env.AUTH_SECRET;
    process.env.AUTH_SECRET="isolated-mysql-qa-encryption-secret-0123456789012345";
    try{
      const settings=mysqlSettings(db);
      await settings.storeKey("openai_api_key","sk-qa-mysql-privately-saved");
      await settings.write("ai_daily_limit","10");
      assert.equal(await settings.key("openai_api_key"),"sk-qa-mysql-privately-saved");
      const jobs=mysqlAI(db);
      const candidateWord="生成"+id.slice(0,8);
      const provider={generate:async()=>({
        items:[{
          word:candidateWord,reading:"せいせい",romanization:"seisei",
          partOfSpeech:"noun",jlptLevel:"N5" as const,
          meaningVi:"được tạo",meaningEn:"generated",
          exampleJa:"生成しました。",exampleVi:"Đã tạo.",
        }],inputTokens:25,outputTokens:50,
      })};
      const jobId=await jobs.generate({
        topic:"Nihon QA MySQL",jlptLevel:"N5",count:1,notes:"",
      },provider);
      const job=await jobs.getJob(jobId);
      assert.equal(job?.status,"ready_for_review");
      assert.equal(job.candidates.length,1);
      assert.equal((await jobs.accept(job.candidates[0]!.id)).length,36);
      const created=await vocabulary.list({search:candidateWord,includeDrafts:true});
      assert.equal(created.items[0]?.status,"draft");
      assert.equal(created.items[0]?.source,"ai");
      assert.ok((await jobs.remaining())>=0);
      // Simultaneous AI requests must not both reserve the single running slot.
      const slowProvider={
        generate:async()=>{
          await new Promise(resolve=>setTimeout(resolve,250));
          return provider.generate();
        },
      };
      const doubleRequest={
        topic:"MySQL concurrent quota QA",jlptLevel:"N5" as const,count:1,notes:"",
      };
      const concurrent=await Promise.allSettled([
        jobs.generate(doubleRequest,slowProvider),
        jobs.generate(doubleRequest,slowProvider),
      ]);
      assert.equal(concurrent.filter(x=>x.status==="fulfilled").length,1);
      assert.equal(concurrent.filter(x=>x.status==="rejected").length,1);
      assert.match(String((concurrent.find(x=>x.status==="rejected") as
        PromiseRejectedResult).reason),/AI_GENERATION_BUSY/);
    }finally{
      if(previousSecret===undefined)delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET=previousSecret;
    }
    const rows=await db.select().from(vocabularyEntries).where(eq(vocabularyEntries.id,id));
    assert.equal(rows.length,1);
    assert.equal(rows[0]?.word,word);
    const senses=await db.select().from(vocabularySenses).where(eq(vocabularySenses.entryId,id));
    assert.equal(senses[0]?.meaning,"khiển trách");
    const cardId=randomUUID(),requestId=randomUUID();
    await db.transaction(async tx=>{
      await tx.insert(reviewCards).values({
        id:cardId,userId:"guest:"+randomUUID(),entryId:id,status:"new",
      });
      await tx.insert(reviewEvents).values({
        id:randomUUID(),cardId,result:"correct",reviewedAt:now,requestId,
      });
      await tx.update(reviewCards).set({
        status:"learning",streak:1,timesReviewed:1,correctCount:1,
        lastReviewedAt:now,nextReviewAt:now,
      }).where(eq(reviewCards.id,cardId));
    });
    const events=await db.select().from(reviewEvents).where(eq(reviewEvents.cardId,cardId));
    const cards=await db.select().from(reviewCards).where(eq(reviewCards.id,cardId));
    assert.equal(events.length,1);
    assert.equal(cards[0]?.timesReviewed,1);
    assert.equal(cards[0]?.correctCount,1);
    await assert.rejects(async()=>{
      await db.transaction(async tx=>{
        await tx.insert(reviewCards).values({
          id:randomUUID(),userId:"guest:"+randomUUID(),entryId:id,status:"new",
        });
        throw new Error("QA_FORCE_ROLLBACK");
      });
    },/QA_FORCE_ROLLBACK/);
    const after=await db.select().from(reviewCards).where(eq(reviewCards.entryId,id));
    assert.equal(after.length,1);
    await assert.rejects(async()=>{
      await db.insert(reviewEvents).values({
        id:randomUUID(),cardId:randomUUID(),result:"correct",
        reviewedAt:now,requestId:randomUUID(),
      });
    });
    // DB is independent from the Fastify bootstrap SQLite volume.
  }finally{await pool.end();}
});
