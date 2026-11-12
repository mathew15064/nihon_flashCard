import { test } from "node:test";
import assert from "node:assert/strict";
import { mcpHostAllowed } from "../src/lib/mcp-host";
import { verifyBearer } from "../src/lib/bearer";

test("MCP Host guard uses explicit Origin and rejects spoofed authority",()=>{
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
test("MCP/Admin bearer comparison rejects missing or short tokens",()=>{
  const token="trusted-test-only-token-with-a-safe-length";
  assert.equal(verifyBearer("Bearer "+token,token),true);
  assert.equal(verifyBearer("Bearer "+token+"x",token),false);
  assert.equal(verifyBearer("Bearer "+token,token+"x"),false);
  assert.equal(verifyBearer(undefined,token),false);
  assert.equal(verifyBearer("Basic "+token,token),false);
  assert.equal(verifyBearer("Bearer x","x"),false);
});
