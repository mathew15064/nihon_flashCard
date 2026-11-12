import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  AnonymousMcpLessons,MCP_READ_TOOLS,MCP_WRITE_TOOLS,
  mcpNoAuthEnabled,mcpWriteCost,
} from "../src/lib/mcp-access";
import {FixedWindowLimiter} from "../src/server/rate-limit";

test("No Auth requires a second explicit flag in production-mode test builds",()=>{
  assert.equal(mcpNoAuthEnabled({}),false);
  assert.equal(mcpNoAuthEnabled({NIHON_MCP_NO_AUTH:"TRUE",NODE_ENV:"test"}),false);
  assert.equal(mcpNoAuthEnabled({NIHON_MCP_NO_AUTH:"true",NODE_ENV:"test"}),true);
  assert.equal(mcpNoAuthEnabled({NIHON_MCP_NO_AUTH:"true",NODE_ENV:"production"}),false);
  assert.equal(mcpNoAuthEnabled({NIHON_MCP_NO_AUTH:"true",NODE_ENV:"production",
    NIHON_MCP_NO_AUTH_PRODUCTION_TEST_ACK:"TRUE"}),false);
  assert.equal(mcpNoAuthEnabled({NIHON_MCP_NO_AUTH:"true",NODE_ENV:"production",
    NIHON_MCP_NO_AUTH_PRODUCTION_TEST_ACK:"true"}),true);
});

test("MCP registers exactly 5 read and 9 writer tools, without Admin publish",()=>{
  assert.equal(MCP_READ_TOOLS.length,5);
  assert.equal(MCP_WRITE_TOOLS.length,9);
  assert.equal(new Set(MCP_WRITE_TOOLS).size,9);
  const code=readFileSync(new URL("../src/db/mysql/mcp.ts",import.meta.url),"utf8");
  const registrations=[...code.matchAll(/mcp\.registerTool\("([^"]+)"/g)]
    .map(match=>match[1]);
  assert.equal(registrations.length,9);
  assert.deepEqual(new Set(registrations),new Set(MCP_WRITE_TOOLS));
  assert.ok(!registrations.some(name=>name?.includes("publish")));
});

test("Rate budgets charge MySQL work, including 100-item retries and invalid batches",()=>{
  const call=(name:string,args:unknown)=>({
    jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:args},
  });
  assert.equal(mcpWriteCost({method:"tools/list"}),0);
  assert.equal(mcpWriteCost(call("vocabulary_search",{search:"test"})),0);
  assert.equal(mcpWriteCost(call("vocabulary_create_draft",{})),1);
  assert.equal(mcpWriteCost(call("topics_create",{})),10);
  assert.equal(mcpWriteCost(call("lessons_create",{})),10);
  assert.equal(mcpWriteCost(call("lesson_add_vocabulary_batch",{items:[{},{}]})),2);
  assert.equal(mcpWriteCost(call("lesson_add_vocabulary_batch",{items:Array(100).fill({})})),100);
  assert.equal(mcpWriteCost(call("lesson_add_vocabulary_batch",{})),101);
  assert.equal(mcpWriteCost([call("vocabulary_create_draft",{}),
    call("lesson_add_vocabulary_batch",{items:Array(100).fill({})})]),101);
  const limit=new FixedWindowLimiter(3);
  assert.equal(limit.consume("all-anonymous",250,60_000,0,100).allowed,true);
  assert.equal(limit.consume("all-anonymous",250,60_000,1,100).allowed,true);
  assert.deepEqual(limit.consume("all-anonymous",250,60_000,2,100),
    {allowed:false,retryAfterSeconds:60});
  assert.equal(limit.consume("all-anonymous",250,60_000,60_000,100).allowed,true);
  assert.deepEqual(limit.consume("one",10,1000,0,11),
    {allowed:false,retryAfterSeconds:1});
  assert.throws(()=>limit.consume("bad",10,1000,0,0),RangeError);
});

test("Anonymous lesson grants deny Admin IDs, bound memory, reset closed on restart",()=>{
  const grants=new AnonymousMcpLessons(2);
  assert.equal(grants.has("admin-private"),false);
  assert.equal(grants.allow("admin-private",false),false);
  assert.equal(grants.has("admin-private"),false);
  assert.equal(grants.allow("anonymous-1",true),true);
  assert.equal(grants.allow("anonymous-1",false),true);
  assert.equal(grants.allow("anonymous-2",true),true);
  assert.equal(grants.canCreate(),false);
  assert.equal(grants.allow("anonymous-3",true),false);
  grants.clear();
  assert.equal(grants.has("anonymous-1"),false);
});


// End-to-end authorization regression. Runs only on a disposable MySQL 8.4
// QA service; no network credentials or production database are touched.
test("MCP HTTP: 5 read/9 write tools, no anonymous Admin draft disclosure",{
  skip:!process.env.NIHON_MYSQL_TEST_URL,
},async()=>{
  const {randomBytes,randomUUID}=await import("node:crypto");
  const {mkdtempSync,rmSync}=await import("node:fs");
  const {tmpdir}=await import("node:os");
  const {join}=await import("node:path");
  const {default:mysql}=await import("mysql2/promise");
  const source=new URL(process.env.NIHON_MYSQL_TEST_URL!);
  if(source.protocol!=="mysql:"||!/^nihon_qa[a-zA-Z0-9_]*$/.test(source.pathname.slice(1)))
    throw new Error("MCP_TEST_REQUIRES_DISPOSABLE_QA_MYSQL");
  const connection={host:source.hostname,port:Number(source.port||3306),
    user:decodeURIComponent(source.username),password:decodeURIComponent(source.password)};
  const name="nihon_qa_mcp_"+randomBytes(6).toString("hex");
  const admin=await mysql.createConnection(connection);
  const dir=mkdtempSync(join(tmpdir(),"nihon-mcp-security-"));
  const keys=["NIHON_DATA_DIR","DB_PATH","AUTH_SECRET","NODE_ENV","PUBLIC_ORIGIN",
    "NIHON_MCP_NO_AUTH","NIHON_MCP_NO_AUTH_PRODUCTION_TEST_ACK",
    "NIHON_ADMIN_PASSWORD_HASH","NIHON_MCP_TOKEN","NIHON_MCP_READ_TOKEN"] as const;
  const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  let app:Awaited<ReturnType<typeof import("../src/server/app").buildApp>>|undefined;
  const tick=String.fromCharCode(96);
  try{
    const [versions]=await admin.query<import("mysql2").RowDataPacket[]>(
      "SELECT VERSION() AS version");
    assert.match(String(versions[0]?.version),/^8\.4\./);
    await admin.query("CREATE DATABASE "+tick+name+tick+" CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");
    for(const key of keys)delete process.env[key];
    process.env.NIHON_DATA_DIR=dir;
    process.env.NODE_ENV="test";
    const {prepareLocalStorage}=await import("../src/lib/bootstrap-storage");
    prepareLocalStorage();
    const {buildApp}=await import("../src/server/app");
    const {installationCodeForIsolatedTests}=await import("../src/server/installation");
    app=await buildApp({staticAssets:false});
    const origin=await app.listen({host:"127.0.0.1",port:0});
    const api=async(path:string,method="GET",body?:unknown,cookie?:string)=>{
      const response=await fetch(origin+path,{
        method,headers:{origin,...(cookie?{cookie}:{}),
          ...(body===undefined?{}:{"content-type":"application/json"})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
      });
      return {status:response.status,
        json:await response.json() as {data:{[key:string]:unknown};success:boolean},
        cookie:response.headers.get("set-cookie")?.split(";")[0]};
    };
    const rpc=async(payload:unknown,token?:string,originHeader?:string)=>{
      const response=await fetch(origin+"/mcp",{method:"POST",headers:{
        "content-type":"application/json",accept:"application/json, text/event-stream",
        ...(token?{authorization:"Bearer "+token}:{}),
        ...(originHeader?{origin:originHeader}:{}),
      },body:JSON.stringify(payload)});
      const raw=await response.text();
      let envelope:{result?:{tools?:{name:string}[]}}|undefined;
      try{envelope=JSON.parse(raw) as typeof envelope;}
      catch{
        const line=raw.split(/\r?\n/).filter(x=>x.startsWith("data:")).at(-1);
        if(line)envelope=JSON.parse(line.slice(5).trim()) as typeof envelope;
      }
      return {status:response.status,raw,tools:envelope?.result?.tools?.map(x=>x.name).sort()};
    };
    const request=(id:number,method:string,params:unknown={})=>({
      jsonrpc:"2.0",id,method,params,
    });
    const call=(id:number,name:string,args:unknown)=>request(id,"tools/call",{
      name,arguments:args,
    });
    const setup=await api("/api/v1/setup/initialize","POST",{
      setupCode:installationCodeForIsolatedTests(),origin,database:"mysql",
      mysql:{...connection,database:name,tls:"off"},
      adminPassword:"qa-mcp-security-password-2026",
      repeatPassword:"qa-mcp-security-password-2026",enableSignup:false,
    });
    assert.equal(setup.status,200,JSON.stringify(setup.json));
    const login=await api("/api/v1/auth/admin/login","POST",{
      password:"qa-mcp-security-password-2026",
    });
    assert.equal(login.status,200);
    assert.ok(login.cookie);
    const cookie=login.cookie!;
    assert.equal((await rpc(request(1,"tools/list"))).status,401);
    const read=await api("/api/v1/admin/settings/tokens/read","POST",{},cookie);
    const write=await api("/api/v1/admin/settings/tokens/write","POST",{},cookie);
    assert.equal(read.status,200);
    assert.equal(write.status,200);
    const readToken=read.json.data.token as string;
    const writeToken=write.json.data.token as string;
    assert.deepEqual((await rpc(request(2,"tools/list"),readToken)).tools,
      [...MCP_READ_TOOLS].sort());
    assert.deepEqual((await rpc(request(3,"tools/list"),writeToken)).tools,
      [...MCP_WRITE_TOOLS].sort());
    const secret="private-mcp-"+randomUUID();
    const topic=await api("/api/v1/admin/topics","POST",{
      name:"Restricted Security Topic",description:secret,
    },cookie);
    assert.equal(topic.status,200,JSON.stringify(topic.json));
    const lesson=await api("/api/v1/admin/lessons","POST",{
      name:"Restricted Security Lesson",description:secret,topicId:topic.json.data.id,
    },cookie);
    assert.equal(lesson.status,200,JSON.stringify(lesson.json));
    const lessonId=lesson.json.data.id as string;
    const batch=await api("/api/v1/admin/lessons/"+lessonId+"/batch","POST",{
      items:[{word:secret,reading:"ないぶ",meaningVi:secret}],
    },cookie);
    assert.equal(batch.status,200,JSON.stringify(batch.json));
    assert.ok(!(await rpc(call(4,"lesson_get",{lessonId}),readToken)).raw.includes(secret));
    assert.ok((await rpc(call(5,"lesson_get",{lessonId}),writeToken)).raw.includes(secret));
    process.env.NIHON_MCP_NO_AUTH="true";
    assert.deepEqual((await rpc(request(6,"tools/list"))).tools,
      [...MCP_WRITE_TOOLS].sort());
    assert.ok(!(await rpc(call(7,"lesson_get",{lessonId}))).raw.includes(secret));
    assert.ok(!(await rpc(call(8,"topics_list",{}))).raw.includes(secret));
    const collision=await rpc(call(9,"lessons_create",{
      name:"Restricted Security Lesson",topicId:topic.json.data.id,
    }));
    assert.match(collision.raw,/MCP_LESSON_UNAVAILABLE/);
    assert.ok(!collision.raw.includes(secret));
    const topicCollision=await rpc(call(10,"topics_create",{
      name:"Restricted Security Topic",
    }));
    assert.ok(!topicCollision.raw.includes(secret));
    const append=await rpc(call(11,"lesson_add_vocabulary_batch",{
      lessonId,items:[{word:"不正",reading:"ふせい",meaningVi:"incorrect"}],
    }));
    assert.match(append.raw,/MCP_LESSON_UNAVAILABLE/);
    const dedupe=await rpc(call(12,"vocabulary_create_draft",{
      word:secret,reading:"ないぶ",meaningVi:secret,
    }));
    assert.equal(dedupe.status,200);
    assert.ok(!dedupe.raw.includes(secret));
    assert.ok(!dedupe.raw.includes('"status":"draft"'));
    assert.equal((await rpc(request(13,"tools/list"),undefined,
      "https://attacker.invalid")).status,403);
    delete process.env.NIHON_MCP_NO_AUTH;
    assert.equal((await rpc(request(14,"tools/list"))).status,401);
  }finally{
    await app?.close();
    for(const key of keys){
      if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];
    }
    rmSync(dir,{recursive:true,force:true});
    await admin.query("DROP DATABASE IF EXISTS "+tick+name+tick);
    await admin.end();
  }
});
