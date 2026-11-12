import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const migrations=[
  "001_init.sql","002_legacy_import.sql","003_ai_studio.sql",
  "004_srs_learning.sql","005_learner_accounts.sql","006_auth_sessions.sql",
];

test("MCP read/write tokens enforce least privilege, Origin/Host and no-store",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"nihon-mcp-scope-"));
  const file=join(dir,"mcp.sqlite");
  const sql=new DatabaseSync(file);
  for(const migration of migrations)
    sql.exec(readFileSync(resolve("src/db/migrations",migration),"utf8"));
  const keys=["DB_PATH","PUBLIC_ORIGIN","NODE_ENV","NIHON_MCP_TOKEN","NIHON_MCP_READ_TOKEN"] as const;
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  process.env.DB_PATH=file;
  process.env.NODE_ENV="test";
  process.env.NIHON_MCP_TOKEN="write-token-scopes-012345678901234567890";
  process.env.NIHON_MCP_READ_TOKEN="read-token-scopes-012345678901234567890";
  const {buildApp}=await import("../src/server/app");
  let app:Awaited<ReturnType<typeof buildApp>>|undefined;
  try{
    app=await buildApp({staticAssets:false});
    const address=await app.listen({host:"127.0.0.1",port:0});
    process.env.PUBLIC_ORIGIN=address;
    const count=()=>Number((sql.prepare("SELECT count(*) AS n FROM vocabulary_entries").get() as {n:number}).n);
    const request=async(token:string|undefined,method:string="tools/list",params?:unknown,extra:Record<string,string>={})=>{
      const response=await fetch(address+"/mcp",{
        method:"POST",
        headers:{
          "content-type":"application/json",
          accept:"application/json, text/event-stream",
          ...(token?{authorization:"Bearer "+token}:{}),
          ...extra,
        },
        body:JSON.stringify({jsonrpc:"2.0",id:1,method, ...(params?{params}: {})}),
      });
      return {status:response.status,text:await response.text(),headers:response.headers};
    };
    const read=process.env.NIHON_MCP_READ_TOKEN!;
    const write=process.env.NIHON_MCP_TOKEN!;
    assert.equal((await request(undefined)).status,401);
    assert.equal((await request("wrong-token")).status,401);
    const reader=await request(read);
    assert.equal(reader.status,200);
    assert.match(reader.text,/vocabulary_search/);
    assert.match(reader.text,/vocabulary_get/);
    assert.doesNotMatch(reader.text,/vocabulary_create_draft/);
    assert.equal(reader.headers.get("cache-control"),"no-store");
    const writer=await request(write);
    assert.equal(writer.status,200);
    assert.match(writer.text,/vocabulary_create_draft/);

    const newWord="未許可";
    const payload={name:"vocabulary_create_draft",
      arguments:{word:newWord,reading:"みきょか",meaningVi:"không được phép"}};
    const before=count();
    const blocked=await request(read,"tools/call",payload);
    assert.ok(blocked.status>=400 || /error|unknown/i.test(blocked.text),blocked.text);
    assert.equal(count(),before);
    const created=await request(write,"tools/call",payload);
    assert.equal(created.status,200,created.text);
    assert.match(created.text,/draft/);
    assert.equal(count(),before+1);
    const row=sql.prepare("SELECT status FROM vocabulary_entries WHERE word=?").get(newWord) as {status:string};
    assert.equal(row.status,"draft");

    // Browser cross-site requests and DNS rebinding headers must fail closed.
    assert.equal((await request(write,"tools/list",undefined,{origin:"https://evil.invalid"})).status,403);
    assert.equal((await request(write,"tools/list",undefined,{"sec-fetch-site":"cross-site"})).status,403);
    // Fetch normalizes Host; use native HTTP to exercise a truly forged Host.
    const forgedHostStatus=await new Promise<number>((resolveStatus,reject)=>{
      const body=JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list"});
      const target=new URL(address);
      const client=httpRequest({
        hostname:target.hostname,port:target.port,path:"/mcp",method:"POST",
        headers:{
          host:"evil.invalid",authorization:"Bearer "+write,
          "content-type":"application/json","content-length":Buffer.byteLength(body),
          accept:"application/json, text/event-stream",
        },
      },response=>{
        response.resume();
        response.on("end",()=>resolveStatus(response.statusCode ?? 0));
      });
      client.on("error",reject);
      client.end(body);
    });
    assert.equal(forgedHostStatus,403);
    assert.equal((await request(write,"tools/list",undefined,
      {"x-forwarded-host":"evil.invalid","x-forwarded-proto":"https"})).status,200);
    assert.equal((await request(write,"tools/list",undefined,{origin:address})).status,200);

    // Misconfigured identical read and write tokens must authorize neither.
    process.env.NIHON_MCP_READ_TOKEN=write;
    assert.equal((await request(write)).status,401);
    process.env.NIHON_MCP_READ_TOKEN=read;

    // Production MCP must never derive a trusted Host from request headers.
    process.env.NODE_ENV="production";
    delete process.env.PUBLIC_ORIGIN;
    assert.equal((await request(write)).status,403);
    process.env.PUBLIC_ORIGIN=address;
    assert.equal((await request(write)).status,200);
  }finally{
    await app?.close();
    sql.close();
    for(const key of keys){
      const value=old[key];
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
    rmSync(dir,{recursive:true,force:true});
  }
});

test("MCP Host guard validates explicit origin and IPv6 loopback without proxy headers",async()=>{
  const {mcpHostAllowed}=await import("../src/server/mcp");
  assert.equal(mcpHostAllowed("localhost:3000",undefined,false),true);
  assert.equal(mcpHostAllowed("127.0.0.1:3000",undefined,false),true);
  assert.equal(mcpHostAllowed("[::1]:3000",undefined,false),true);
  assert.equal(mcpHostAllowed("example.com:3000",undefined,false),false);
  assert.equal(mcpHostAllowed("localhost:3000",undefined,true),false);
  assert.equal(mcpHostAllowed("nihon.example","https://nihon.example",true),true);
  assert.equal(mcpHostAllowed("nihon.example:443","https://nihon.example",true),true);
  assert.equal(mcpHostAllowed("nihon.example:444","https://nihon.example",true),false);
  assert.equal(mcpHostAllowed("nihon.example:3000","https://nihon.example:3000",true),true);
  assert.equal(mcpHostAllowed("nihon.example","https://nihon.example:3000",true),false);
  assert.equal(mcpHostAllowed("nihon.example","https://nihon.example/path",true),false);
  assert.equal(mcpHostAllowed("nihon.example","https://user@nihon.example",true),false);
  assert.equal(mcpHostAllowed("nihon.example","ftp://nihon.example",true),false);
  assert.equal(mcpHostAllowed("nihon.example/evil","https://nihon.example",true),false);
  assert.equal(mcpHostAllowed("user@nihon.example","https://nihon.example",true),false);
  assert.equal(mcpHostAllowed(undefined,"https://nihon.example",true),false);
});
