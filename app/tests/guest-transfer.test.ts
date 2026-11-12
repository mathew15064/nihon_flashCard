import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";

test("Explicit guest-to-learner transfer is idempotent and keeps review events",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"nihon-guest-claim-"));
  const file=join(dir,"transfer.sqlite");
  const db=new DatabaseSync(file);
  for(const name of ["001_init.sql","002_legacy_import.sql","003_ai_studio.sql",
    "004_srs_learning.sql","005_learner_accounts.sql","006_auth_sessions.sql"]){
    db.exec(readFileSync(resolve("src/db/migrations",name),"utf8"));
  }
  const now="2026-11-11T10:00:00.000Z";
  const entry=randomUUID(),second=randomUUID(),deck=randomUUID();
  const guest="guest:"+randomUUID(),learner="learner:"+randomUUID();
  const insertEntry=db.prepare("INSERT INTO vocabulary_entries(id,language,word,reading,normalized_key,status,source,created_at,updated_at) VALUES (?,'ja',?,?,?,'published','demo',?,?)");
  insertEntry.run(entry,"学校","がっこう","学校|がっこう|",now,now);
  insertEntry.run(second,"図書館","としょかん","図書館|としょかん|",now,now);
  db.prepare("INSERT INTO decks(id,name,visibility,created_at) VALUES (?,'Library','public',?)").run(deck,now);
  const learnerCard=randomUUID(),guestCard=randomUUID(),guestOnlyCard=randomUUID();
  const insert=db.prepare("INSERT INTO review_cards(id,user_id,entry_id,status,next_review_at,streak,times_reviewed,correct_count,wrong_count,last_reviewed_at) VALUES (?,?,?,'learning',?,1,?,?,0,?)");
  insert.run(learnerCard,learner,entry,"2026-11-12T12:00:00.000Z",2,2,now);
  insert.run(guestCard,guest,entry,"2026-11-13T12:00:00.000Z",3,3,"2026-11-11T12:00:00.000Z");
  insert.run(guestOnlyCard,guest,second,"2026-11-12T12:00:00.000Z",1,1,now);
  const events=db.prepare("INSERT INTO review_events(id,card_id,result,reviewed_at,request_id) VALUES (?,?, 'correct', ?, ?)");
  events.run(randomUUID(),learnerCard,now,randomUUID());
  events.run(randomUUID(),guestCard,now,randomUUID());
  events.run(randomUUID(),guestOnlyCard,now,randomUUID());
  db.prepare("INSERT INTO user_deck_enrollments(user_id,deck_id,enrolled_at) VALUES (?,?,?)").run(guest,deck,now);
  db.close();
  const previous=process.env.DB_PATH;
  process.env.DB_PATH=file;
  try{
    const {transferGuestProgress}=await import("../src/modules/learning/transfer");
    const result=transferGuestProgress(guest,learner);
    assert.deepEqual(result,{claimed:true,cardsMoved:1,mergedCards:1});
    assert.deepEqual(transferGuestProgress(guest,learner),
      {claimed:false,cardsMoved:0,mergedCards:0});
    assert.throws(()=>transferGuestProgress(guest,"learner:"+randomUUID()),/GUEST_ALREADY_CLAIMED/);
    const check=new DatabaseSync(file,{readOnly:true});
    const cards=check.prepare("SELECT * FROM review_cards WHERE user_id=? ORDER BY entry_id").all(learner) as
      {id:string;times_reviewed:number;correct_count:number}[];
    assert.equal(cards.length,2);
    const merged=cards.find(c=>c.id===learnerCard)!;
    assert.equal(merged.times_reviewed,5);
    assert.equal(merged.correct_count,5);
    assert.equal((check.prepare("SELECT COUNT(*) AS n FROM review_events WHERE card_id=?").get(learnerCard) as {n:number}).n,2);
    assert.equal((check.prepare("SELECT COUNT(*) AS n FROM review_cards WHERE user_id=?").get(guest) as {n:number}).n,0);
    assert.equal((check.prepare("SELECT COUNT(*) AS n FROM user_deck_enrollments WHERE user_id=?").get(learner) as {n:number}).n,1);
    check.close();
  }finally{
    if(previous===undefined)delete process.env.DB_PATH;else process.env.DB_PATH=previous;
    rmSync(dir,{recursive:true,force:true});
  }
});
