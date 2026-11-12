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
