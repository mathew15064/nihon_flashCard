import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("SRS is private per guest, deck-enrolled, due-gated, transactional and idempotent", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nihon-srs-workflow-"));
  const filename = join(directory, "srs.sqlite");
  const sqlite = new DatabaseSync(filename);
  for (const file of ["001_init.sql","002_legacy_import.sql","003_ai_studio.sql","004_srs_learning.sql"]) {
    sqlite.exec(readFileSync(resolve("src/db/migrations",file),"utf8"));
  }
  const now="2026-11-11T20:00:00.000Z";
  const insertEntry=sqlite.prepare(`INSERT INTO vocabulary_entries(
    id,language,word,reading,normalized_key,status,source,created_at,updated_at
  ) VALUES (?,'ja',?,? ,?,?,'demo',?,?)`);
  const insertSense=sqlite.prepare("INSERT INTO vocabulary_senses(id,entry_id,language,meaning,sort_order) VALUES (?,?,'vi',?,0)");
  function entry(word:string,reading:string,meaning:string,status="published"){
    const id=randomUUID();
    insertEntry.run(id,word,reading,word+"|"+reading+"|",status,now,now);
    insertSense.run(randomUUID(),id,meaning);
    return id;
  }
  const first=entry("本","ほん","sách");
  const second=entry("水","みず","nước");
  entry("学校","がっこう","trường học");
  const hidden=entry("試す","ためす","thử","draft");
  const publicDeck=randomUUID();
  const privateDeck=randomUUID();
  sqlite.prepare("INSERT INTO decks(id,name,visibility,created_at) VALUES (?,'N5', 'public',?)").run(publicDeck,now);
  sqlite.prepare("INSERT INTO decks(id,name,visibility,created_at) VALUES (?,'Secret', 'private',?)").run(privateDeck,now);
  for (const [index,id] of [first,second].entries()) {
    sqlite.prepare("INSERT INTO deck_items(deck_id,entry_id,sort_order) VALUES (?,?,?)").run(publicDeck,id,index);
  }
  sqlite.prepare("INSERT INTO deck_items(deck_id,entry_id,sort_order) VALUES (?,?,0)").run(privateDeck,hidden);
  sqlite.close();

  const oldDb=process.env.DB_PATH;
  process.env.DB_PATH=filename;
  try {
    const {
      enrollDeckForGuest, enrollQuickStart, listDueCards, getReviewProgress, recordGuestReview,
    }=await import("../src/modules/learning/service");
    const guest1="guest:36f7fe8e-4e9f-42f5-ab33-1ca118eeb3a1";
    const guest2="guest:36f7fe8e-4e9f-42f5-ab33-1ca118eeb3a2";
    const clock=new Date("2026-11-12T08:00:00.000Z");

    assert.throws(()=>enrollDeckForGuest(guest1,privateDeck),/DECK_NOT_FOUND/);
    assert.equal(enrollDeckForGuest(guest1,publicDeck).newCards,2);
    assert.equal(enrollDeckForGuest(guest1,publicDeck).newCards,0);
    assert.equal(enrollQuickStart(guest1).newCards,1);
    assert.equal(enrollQuickStart(guest1).selected,0);
    const progress=getReviewProgress(guest1,clock);
    assert.equal(progress.totalTracked,3);
    assert.equal(progress.dueNow,3);
    assert.equal(progress.enrolledDecks,1);
    assert.equal(listDueCards(guest2,10,clock).length,0);

    const queue=listDueCards(guest1,10,clock);
    assert.equal(queue.length,3);
    assert.ok(queue.every(c=>Boolean(c.meaningVi)));
    assert.ok(queue.every(c=>c.word!=="試す"));
    const reviewCard=queue[0];
    const requestId=randomUUID();
    const firstResult=recordGuestReview(guest1,{cardId:reviewCard.id,result:"correct",requestId},clock);
    assert.equal(firstResult.idempotent,false);
    assert.equal(firstResult.card.status,"learning");
    assert.equal(firstResult.card.nextReviewAt,new Date(clock.getTime()+600000).toISOString());
    assert.throws(
      ()=>recordGuestReview(guest1,{cardId:reviewCard.id,result:"correct",requestId:randomUUID()},clock),
      /REVIEW_CARD_NOT_DUE/
    );
    assert.throws(
      ()=>recordGuestReview(guest2,{cardId:reviewCard.id,result:"correct",requestId:randomUUID()},clock),
      /REVIEW_CARD_NOT_FOUND/
    );
    assert.equal(recordGuestReview(guest1,{cardId:reviewCard.id,result:"correct",requestId},clock).idempotent,true);
    assert.throws(
      ()=>recordGuestReview(guest1,{cardId:reviewCard.id,result:"wrong",requestId},clock),
      /REVIEW_REQUEST_CONFLICT/
    );
    assert.equal(listDueCards(guest1,10,clock).length,2);

    const step2=recordGuestReview(guest1,{
      cardId:reviewCard.id,result:"correct",requestId:randomUUID(),
    },new Date(clock.getTime()+600000));
    assert.equal(step2.card.status,"review");
    assert.equal(step2.card.streak,2);
    assert.equal(step2.card.nextReviewAt,
      new Date(clock.getTime()+600000+1440*60000).toISOString());

    const reset=recordGuestReview(guest1,{
      cardId:reviewCard.id,result:"wrong",requestId:randomUUID(),
    },new Date(clock.getTime()+600000+1440*60000));
    assert.equal(reset.card.streak,0);
    assert.equal(reset.card.status,"learning");
    assert.equal(reset.card.timesReviewed,3);
    assert.equal(getReviewProgress(guest1,new Date(clock.getTime()+600000+1440*60000)).todayReviews>=0,true);

    const check=new DatabaseSync(filename,{readOnly:true});
    const events=check.prepare("SELECT COUNT(*) AS n FROM review_events WHERE card_id=?").get(reviewCard.id) as {n:number};
    assert.equal(events.n,3);
    assert.equal((check.prepare("SELECT COUNT(*) AS n FROM review_cards WHERE user_id=?").get(guest2) as {n:number}).n,0);
    check.close();
  } finally {
    if (oldDb === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH=oldDb;
    rmSync(directory,{recursive:true,force:true});
  }
});
