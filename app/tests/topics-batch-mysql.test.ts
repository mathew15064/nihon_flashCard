import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mysql from "mysql2/promise";

type Entry = { id:string; word:string; status:string; reading:string; meaningVi?:string };
type Tool = { name:string; inputSchema?:{properties?:Record<string,unknown>} };

// HTTP exercises the real MySQL services and authorization boundary together.
// Missing W1–4 routes/tools must fail, never silently skip a feature assertion.
test("MySQL 8.4 topics, 100-word batches, Admin publishing, NoAuth privacy and SRS", {
  skip:!process.env.NIHON_MYSQL_TEST_URL,
}, async t => {
  const source=new URL(process.env.NIHON_MYSQL_TEST_URL!);
  if(source.protocol!=="mysql:" || !/^nihon_qa[a-zA-Z0-9_]*$/.test(source.pathname.slice(1)))
    throw new Error("TOPICS_BATCH_REQUIRES_DISPOSABLE_QA_MYSQL");
  const connection={host:source.hostname,port:Number(source.port||3306),
    user:decodeURIComponent(source.username),password:decodeURIComponent(source.password)};
  const database="nihon_qa_topics_"+randomBytes(7).toString("hex");
  const admin=await mysql.createConnection(connection);
  const dir=mkdtempSync(join(tmpdir(),"nihon-topics-batch-"));
  const keys=["NIHON_DATA_DIR","DB_PATH","AUTH_SECRET","NODE_ENV","PUBLIC_ORIGIN",
    "NIHON_ADMIN_PASSWORD_HASH","NIHON_MCP_TOKEN","NIHON_MCP_READ_TOKEN",
    "NIHON_MCP_NO_AUTH"] as const;
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  let app:Awaited<ReturnType<typeof import("../src/server/app").buildApp>>|undefined;
  try {
    const [version]=await admin.query<mysql.RowDataPacket[]>("SELECT VERSION() AS version");
    assert.match(String(version[0]?.version),/^8\.4\./,"requires real MySQL 8.4");
    await admin.query("CREATE DATABASE `"+database+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");
    for(const key of keys)delete process.env[key];
    process.env.NIHON_DATA_DIR=dir;
    process.env.NODE_ENV="test";
    process.env.NIHON_MCP_NO_AUTH="true";
    const {prepareLocalStorage}=await import("../src/lib/bootstrap-storage");
    prepareLocalStorage();
    const {buildApp}=await import("../src/server/app");
    const {installationCodeForIsolatedTests}=await import("../src/server/installation");
    app=await buildApp({staticAssets:false});
    const origin=await app.listen({host:"127.0.0.1",port:0});
    const request=async(path:string,method="GET",body?:unknown,cookie?:string)=>{
      const response=await fetch(origin+path,{method,headers:{origin,
        ...(cookie?{cookie}:{}),
        ...(body===undefined?{}:{"content-type":"application/json"})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
      return {status:response.status,json:await response.json(),
        cookie:response.headers.get("set-cookie")?.split(";")[0]};
    };
    const ok=async(path:string,method="GET",body?:unknown,cookie?:string)=>{
      const result=await request(path,method,body,cookie);
      assert.ok(result.status>=200&&result.status<300,path+" returned "+result.status);
      assert.equal(result.json.success,true,path+" success envelope");
      return result.json.data;
    };
    const password="qa-topics-admin-password-2026";
    await ok("/api/v1/setup/initialize","POST",{
      setupCode:installationCodeForIsolatedTests(),origin,database:"mysql",
      mysql:{...connection,database,tls:"off"},adminPassword:password,
      repeatPassword:password,enableSignup:true,
    });
    const login=await request("/api/v1/auth/admin/login","POST",{password});
    assert.equal(login.status,200);
    assert.ok(login.cookie);
    const cookie=login.cookie;
    const topic=await ok("/api/v1/admin/topics","POST",{name:"QA 旅行",description:"Du lịch"},cookie);
    const lesson=await ok("/api/v1/admin/lessons","POST",{
      name:"QA 100 words",description:"Một trăm từ",topicId:topic.id,
    },cookie);
    const path="/api/v1/admin/lessons/"+lesson.id;
    const items=Array.from({length:100},(_,i)=>({
      word:"試験語"+String(i).padStart(3,"0"),reading:"しけんご",
      romanization:"shikengo",meaningVi:"Từ kiểm thử "+i,jlptLevel:"N5",
    }));
    const batch=(payload:unknown)=>ok(path+"/batch","POST",payload,cookie);
    await t.test("100 items, exact retry, second batch and cross-lesson dedup",async()=>{
      const first=await batch({items});
      assert.deepEqual(first,{lessonId:lesson.id,received:100,created:100,duplicates:0,
        linked:100,alreadyLinked:0,errors:[]});
      const repeat=await batch({items});
      assert.deepEqual(repeat,{lessonId:lesson.id,received:100,created:0,duplicates:100,
        linked:0,alreadyLinked:100,errors:[]});
      const detail=await ok(path,"GET",undefined,cookie);
      assert.equal(detail.topicId,topic.id);
      assert.equal(detail.entries.length,100);
      assert.equal(new Set(detail.entries.map((e:Entry)=>e.id)).size,100);
      assert.ok(detail.entries.every((e:Entry)=>e.status==="draft"));
      assert.ok(detail.entries.every((e:Entry)=>e.meaningVi?.startsWith("Từ kiểm thử")));
      const second=await ok("/api/v1/admin/lessons","POST",{
        name:"QA second batch",topicId:topic.id,
      },cookie);
      const secondItems=[...items.slice(0,50),...items.slice(50).map((item,i)=>({
        ...item,word:"追加語"+String(i).padStart(3,"0"),
      }))];
      const next=await ok("/api/v1/admin/lessons/"+second.id+"/batch","POST",{items:secondItems},cookie);
      assert.deepEqual(next,{lessonId:second.id,received:100,created:50,duplicates:50,
        linked:100,alreadyLinked:0,errors:[]});
      const secondDetail=await ok("/api/v1/admin/lessons/"+second.id,"GET",undefined,cookie);
      assert.equal(secondDetail.entries.length,100);
      assert.equal(secondDetail.entries.filter((e:Entry)=>detail.entries.some((v:Entry)=>v.id===e.id)).length,50);
      const secondRequest=items.map((item,i)=>({...item,word:"第二便"+String(i).padStart(3,"0")}));
      const extended=await ok("/api/v1/admin/lessons/"+second.id+"/batch","POST",{items:secondRequest},cookie);
      assert.deepEqual(extended,{lessonId:second.id,received:100,created:100,duplicates:0,
        linked:100,alreadyLinked:0,errors:[]});
      assert.equal((await ok("/api/v1/admin/lessons/"+second.id,"GET",undefined,cookie)).entries.length,200,
        "a second batch appends rather than replacing the first");
      const within=await batch({items:[items[0],items[0]]});
      assert.equal(within.created,0);
      assert.equal(within.linked,0);
      assert.equal(within.duplicates,2);
      assert.equal(within.alreadyLinked,2);
      for(const invalid of [[],Array.from({length:101},()=>items[0])]){
        assert.equal((await request(path+"/batch","POST",{items:invalid},cookie)).status,400);
      }
      assert.equal((await ok(path,"GET",undefined,cookie)).entries.length,100);
    });
    await t.test("private topics/lessons and all Admin operations remain protected in NoAuth mode",async()=>{
      assert.equal((await ok("/api/v1/topics")).items.length,0);
      assert.equal((await ok("/api/v1/decks")).items.length,0);
      assert.equal((await request("/api/v1/decks/"+lesson.id)).status,404);
      const privateLessons=await request("/api/v1/topics/"+topic.id+"/lessons");
      assert.ok(privateLessons.status===404 ||
        (privateLessons.status===200&&privateLessons.json.data.items.length===0));
      assert.ok((await ok("/api/v1/admin/topics","GET",undefined,cookie)).items.some((v:{id:string})=>v.id===topic.id));
      assert.ok((await ok("/api/v1/admin/lessons","GET",undefined,cookie)).items.some((v:{id:string})=>v.id===lesson.id));
      for(const [route,method,body] of [
        ["/api/v1/admin/topics","GET",undefined],
        ["/api/v1/admin/topics","POST",{name:"Denied"}],
        ["/api/v1/admin/lessons","GET",undefined],
        ["/api/v1/admin/lessons","POST",{name:"Denied"}],
        [path,"GET",undefined],[path+"/batch","POST",{items:[items[0]]}],
        [path+"/publish-selected","POST",{entryIds:[randomUUID()]}],
        [path+"/publish-all","POST",{}],[path+"/publish","POST",{}],
      ] as const){
        assert.equal((await request(route,method,body)).status,401,route);
      }
      const csrf=await fetch(origin+path+"/publish-all",{method:"POST",
        headers:{cookie,origin:"https://invalid.example","content-type":"application/json"},body:"{}"});
      assert.equal(csrf.status,403);
    });
    await t.test("partial and bulk publish, public lesson discovery and SRS tracking survive retry",async()=>{
      const detail=await ok(path,"GET",undefined,cookie);
      const selected=detail.entries.slice(0,3).map((e:Entry)=>e.id);
      const partial=await ok(path+"/publish-selected","POST",{entryIds:selected},cookie);
      assert.deepEqual(partial,{published:3,skipped:0,errors:[]});
      const again=await ok(path+"/publish-selected","POST",{entryIds:selected},cookie);
      assert.deepEqual(again,{published:0,skipped:3,errors:[]});
      const after=await ok(path,"GET",undefined,cookie);
      assert.equal(after.entries.filter((e:Entry)=>e.status==="published").length,3);
      assert.equal(after.entries.filter((e:Entry)=>e.status==="draft").length,97);
      assert.equal((await request("/api/v1/decks/"+lesson.id)).status,404);
      const foreign=await ok("/api/v1/admin/vocabulary","POST",{
        word:"対象外",reading:"たいしょうがい",meaningVi:"Ngoài bài",
      },cookie);
      const refused=await ok(path+"/publish-selected","POST",{entryIds:[foreign.id]},cookie);
      assert.equal(refused.published,0);
      assert.equal(refused.errors.length,1);
      assert.equal(refused.errors[0].id,foreign.id);
      assert.equal(typeof refused.errors[0].code,"string");
      const bulk=await ok(path+"/publish-all","POST",{},cookie);
      assert.deepEqual(bulk,{published:97,skipped:3,errors:[]});
      await ok(path+"/publish","POST",{},cookie);
      const publicDetail=await ok("/api/v1/decks/"+lesson.id);
      assert.equal(publicDetail.entries.length,100);
      assert.ok(publicDetail.entries.every((e:Entry)=>e.status==="published"));
      assert.ok((await ok("/api/v1/topics")).items.some((v:{id:string})=>v.id===topic.id));
      const lessons=await ok("/api/v1/topics/"+topic.id+"/lessons");
      assert.equal(lessons.items.length,1,"private sibling stays hidden");
      assert.equal(lessons.items[0].id,lesson.id);
      assert.equal(lessons.items[0].topicId,topic.id);
      const guest=await request("/api/v1/me/session");
      assert.ok(guest.cookie);
      const enrollPath="/api/v1/me/decks/"+lesson.id+"/enroll";
      assert.deepEqual(await ok(enrollPath,"POST",{},guest.cookie),{newCards:100,totalDeckEntries:100});
      const due=await ok("/api/v1/me/reviews/due","GET",undefined,guest.cookie);
      const review={cardId:due.items[0].id,result:"correct",requestId:randomUUID()};
      await ok("/api/v1/me/reviews","POST",review,guest.cookie);
      const [before]=await admin.query("SELECT * FROM `"+database+"`.review_cards ORDER BY id");
      const [eventsBefore]=await admin.query("SELECT * FROM `"+database+"`.review_events ORDER BY id");
      assert.deepEqual(await ok(enrollPath,"POST",{},guest.cookie),{newCards:0,totalDeckEntries:100});
      const repeated=await ok("/api/v1/me/reviews","POST",review,guest.cookie);
      assert.equal(repeated.idempotent,true);
      const [afterCards]=await admin.query("SELECT * FROM `"+database+"`.review_cards ORDER BY id");
      const [afterEvents]=await admin.query("SELECT * FROM `"+database+"`.review_events ORDER BY id");
      assert.deepEqual(afterCards,before,"enrollment preserves card IDs, schedule and counters");
      assert.deepEqual(afterEvents,eventsBefore,"review request stays idempotent");
      const progress=await ok("/api/v1/me/progress","GET",undefined,guest.cookie);
      assert.equal(progress.totalTracked,100);
      assert.equal(progress.todayReviews,1);
      const denied=await request(path+"/batch","POST",{items:[{
        word:"公開後追加",reading:"こうかいごついか",meaningVi:"Không được thêm nháp",
      }]},cookie);
      assert.ok((denied.status>=400&&denied.status<500) ||
        (denied.status===200&&denied.json.data.created===0&&denied.json.data.linked===0&&
          denied.json.data.errors.length===1),"public lesson rejects new draft");
      assert.equal((await ok("/api/v1/decks/"+lesson.id)).entries.length,100);
      assert.equal((await ok("/api/v1/admin/vocabulary?search="+encodeURIComponent("公開後追加"),
        "GET",undefined,cookie)).items.length,0,"rejected batch creates no orphan draft");
    });
    await t.test("NoAuth MCP can batch drafts but cannot publish or read private drafts",async()=>{
      let sequence=0;
      const rpc=async(method:string,params?:unknown)=>{
        const response=await fetch(origin+"/mcp",{method:"POST",headers:{
          "content-type":"application/json",accept:"application/json, text/event-stream",
        },body:JSON.stringify({jsonrpc:"2.0",id:++sequence,method,...(params?{params}:{})})});
        assert.equal(response.status,200);
        const text=await response.text();
        const payload=text.startsWith("data:") || text.includes("\ndata:")
          ? text.split("\n").filter(line=>line.startsWith("data:" )).map(line=>JSON.parse(line.slice(5))).at(-1)
          : JSON.parse(text);
        return payload;
      };
      const listed=await rpc("tools/list");
      const tools=listed.result.tools as Tool[];
      assert.ok(tools.every(tool=>!/publish|admin/i.test(tool.name)),"MCP must expose no publishing/Admin tool");
      // Tool names are owned by W3; identify the batch contract by its input fields.
      const batchTool=tools.find(tool=>tool.inputSchema?.properties?.items && tool.inputSchema.properties.lessonId);
      assert.ok(batchTool,"MCP batch tool with items and lessonId must be discoverable");
      const privateLesson=await ok("/api/v1/admin/lessons","POST",{name:"MCP draft QA",topicId:topic.id},cookie);
      const mcpItems=items.map((item,i)=>({...item,word:"連携語"+String(i).padStart(3,"0")}));
      const called=await rpc("tools/call",{name:batchTool.name,arguments:{lessonId:privateLesson.id,items:mcpItems}});
      assert.equal(called.error,undefined);
      assert.notEqual(called.result.isError,true);
      const draft=await ok("/api/v1/admin/lessons/"+privateLesson.id,"GET",undefined,cookie);
      assert.equal(draft.entries.length,100);
      assert.ok(draft.entries.every((e:Entry)=>e.status==="draft"));
      const retry=await rpc("tools/call",{name:batchTool.name,arguments:{lessonId:privateLesson.id,items:mcpItems}});
      assert.notEqual(retry.result?.isError,true);
      assert.equal((await ok("/api/v1/admin/lessons/"+privateLesson.id,"GET",undefined,cookie)).entries.length,100);
      const hidden=await rpc("tools/call",{name:"vocabulary_get",arguments:{id:draft.entries[0].id}});
      assert.ok(!JSON.stringify(hidden).includes(mcpItems[0].word));
      assert.equal((await ok("/api/v1/vocabulary?search="+encodeURIComponent("連携語"))).items.length,0);
      assert.equal((await request("/api/v1/decks/"+privateLesson.id)).status,404);
      await rpc("tools/call",{name:batchTool.name,arguments:{lessonId:lesson.id,items:[{
        word:"連携公開追加",reading:"ついか",meaningVi:"Không thêm nháp vào bài công khai",
      }]}});
      assert.equal((await ok("/api/v1/decks/"+lesson.id)).entries.length,100);
      assert.equal((await ok("/api/v1/admin/vocabulary?search="+encodeURIComponent("連携公開追加"),
        "GET",undefined,cookie)).items.length,0,"MCP cannot add an orphan draft to public lesson");
      const forbidden=await rpc("tools/call",{name:"lesson_publish_all",arguments:{lessonId:privateLesson.id}});
      assert.ok(forbidden.error || forbidden.result?.isError,"unknown publish tool must fail");
      assert.ok((await ok("/api/v1/admin/lessons/"+privateLesson.id,"GET",undefined,cookie)).entries
        .every((e:Entry)=>e.status==="draft"));
    });
  } finally {
    try { await app?.close(); }
    finally {
      try { await admin.query("DROP DATABASE IF EXISTS `"+database+"`"); }
      finally {
        await admin.end();
        for(const key of keys){
          if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
        }
        rmSync(dir,{recursive:true,force:true});
      }
    }
  }
});
