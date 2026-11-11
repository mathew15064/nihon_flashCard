import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";

const ROOT=process.env.SMOKE_BASE_URL || "http://127.0.0.1:3498";
if(!["127.0.0.1","localhost","[::1]"].includes(new URL(ROOT).hostname) ||
   process.env.SMOKE_ENABLE!=="yes"){
  throw new Error("Smoke tests mutate data. Only run against localhost with SMOKE_ENABLE=yes.");
}
const ADMIN_PASSWORD=process.env.SMOKE_ADMIN_PASSWORD || "temporary-fastify-smoke-admin-2026";
const MCP_TOKEN=process.env.SMOKE_MCP_TOKEN || "local-smoke-mcp-token-987654321098765";

function client(){
  const cookies=new Map();
  return async function request(path,options={}){
    const headers=new Headers(options.headers||{});
    if(cookies.size)headers.set("cookie",[...cookies.entries()].map(([k,v])=>k+"="+v).join("; "));
    if(options.method && options.method!=="GET" && !headers.has("origin"))headers.set("origin",ROOT);
    if(options.body && typeof options.body!=="string"){
      headers.set("content-type","application/json");
    }
    const response=await fetch(ROOT+path,{
      ...options,headers,redirect:"manual",
      body:options.body && typeof options.body!=="string"?JSON.stringify(options.body):options.body,
    });
    for(const value of response.headers.getSetCookie()){
      const raw=value.split(";")[0],cut=raw.indexOf("=");
      if(cut>0){
        const name=raw.slice(0,cut),cookie=raw.slice(cut+1);
        if(cookie)cookies.set(name,cookie);else cookies.delete(name);
      }
    }
    const text=await response.text();
    let body;
    try{body=JSON.parse(text);}catch{body=text;}
    return {status:response.status,body,headers:response.headers,cookies};
  };
}
async function run(){
  const visitor=client(),admin=client(),learner=client();
  const home=await visitor("/");
  assert.equal(home.status,200);
  assert.ok(home.body.includes("Nihon Vocabulary"));
  const shell=await visitor("/practice");
  assert.equal(shell.status,200);

  const health=await visitor("/api/v1/health");
  assert.equal(health.status,200);
  assert.equal(health.body.data.framework,"fastify");
  const unauth=await visitor("/api/v1/admin/vocabulary");
  assert.equal(unauth.status,401);
  const deniedMcp=await visitor("/mcp",{method:"POST",body:{jsonrpc:"2.0",id:1,method:"tools/list"}});
  assert.equal(deniedMcp.status,401);

  const adminLogin=await admin("/api/v1/auth/admin/login",{
    method:"POST",body:{password:ADMIN_PASSWORD},
  });
  assert.equal(adminLogin.status,200);
  assert.equal((await admin("/api/v1/auth/me")).body.data.user.role,"admin");

  const word="単語"+randomUUID().slice(0,6);
  const created=await admin("/api/v1/admin/vocabulary",{
    method:"POST",body:{word,reading:"たんご",meaningVi:"từ vựng",jlptLevel:"N5"},
  });
  assert.equal(created.status,201);
  const entryId=created.body.data.id;
  const hidden=await visitor("/api/v1/vocabulary?search="+encodeURIComponent(word));
  assert.equal(hidden.body.data.items.length,0);
  const published=await admin("/api/v1/admin/vocabulary/"+entryId+"/publish",{method:"POST",body:{}});
  assert.equal(published.status,200);
  const after=await visitor("/api/v1/vocabulary?search="+encodeURIComponent(word));
  assert.equal(after.body.data.items.length,1);

  const deck=await admin("/api/v1/admin/decks",{
    method:"POST",body:{name:"Smoke Deck "+randomUUID().slice(0,5),description:"Local only"},
  });
  assert.equal(deck.status,201);
  const deckId=deck.body.data.id;
  assert.equal((await visitor("/api/v1/decks/"+deckId)).status,404);
  const added=await admin("/api/v1/admin/decks/"+deckId+"/entries",{method:"POST",body:{entryId}});
  assert.equal(added.status,200);
  const pdeck=await admin("/api/v1/admin/decks/"+deckId+"/publish",{method:"POST",body:{}});
  assert.equal(pdeck.status,200);
  assert.equal((await visitor("/api/v1/decks/"+deckId)).body.data.entries.length,1);

  const session=await learner("/api/v1/me/session");
  assert.equal(session.status,200);
  assert.ok([...session.headers.getSetCookie()].some(c=>c.startsWith("nihon_guest_v2=")&&c.includes("HttpOnly")));
  const enroll=await learner("/api/v1/me/decks/"+deckId+"/enroll",{method:"POST",body:{}});
  assert.equal(enroll.status,200);
  assert.equal(enroll.body.data.newCards,1);
  const due=await learner("/api/v1/me/reviews/due?limit=20");
  const card=due.body.data.items.find(c=>c.entryId===entryId);
  assert.ok(card);
  const requestId=randomUUID();
  const review=await learner("/api/v1/me/reviews",{
    method:"POST",body:{cardId:card.id,result:"correct",requestId},
  });
  assert.equal(review.status,200);
  assert.equal(review.body.data.card.streak,1);
  const replay=await learner("/api/v1/me/reviews",{
    method:"POST",body:{cardId:card.id,result:"correct",requestId},
  });
  assert.equal(replay.body.data.idempotent,true);
  const blocked=await learner("/api/v1/me/reviews",{
    method:"POST",headers:{origin:"https://attacker.invalid"},
    body:{cardId:card.id,result:"correct",requestId:randomUUID()},
  });
  assert.equal(blocked.status,403);

  const name="test"+randomUUID().replaceAll("-","").slice(0,14);
  const registered=await learner("/api/v1/auth/learner/register",{
    method:"POST",body:{username:name,displayName:"Local test",password:"long-secure-test-password-2026",
      repeatPassword:"long-secure-test-password-2026"},
  });
  assert.equal(registered.status,201);
  const login=await learner("/api/v1/auth/learner/login",{
    method:"POST",body:{username:name,password:"long-secure-test-password-2026"},
  });
  assert.equal(login.status,200);
  const actor=await learner("/api/v1/auth/me");
  assert.equal(actor.body.data.user.role,"learner");
  const claim=await learner("/api/v1/me/claim-guest",{method:"POST",body:{}});
  assert.equal(claim.status,200);
  assert.equal(claim.body.data.cardsMoved,1);
  const progress=await learner("/api/v1/me/progress");
  assert.equal(progress.body.data.totalTracked,1);
  assert.equal(progress.body.data.todayReviews,1);

  const ai=await admin("/api/v1/admin/ai/config");
  assert.equal(ai.status,200);
  assert.equal(ai.body.data.configured,false);

  const mcp=await fetch(ROOT+"/mcp",{
    method:"POST",
    headers:{"content-type":"application/json","accept":"application/json, text/event-stream",
      authorization:"Bearer "+MCP_TOKEN},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list"}),
  });
  const mcpText=await mcp.text();
  assert.equal(mcp.status,200);
  assert.ok(mcpText.includes("vocabulary_create_draft"));

  console.log(JSON.stringify({
    home:home.status,api:health.status,unauthorizedAdmin:unauth.status,
    adminLogin:adminLogin.status,createdDraft:created.status,
    hiddenUntilPublished:hidden.body.data.items.length===0,
    publishedDeck:deckId,guestSrsReview:review.body.data.card.streak,
    learnerAccountCreated:registered.status,guestCardsClaimed:claim.body.data.cardsMoved,
    mcpTools:mcpText.includes("vocabulary_create_draft"),
  },null,2));
}
run().catch(e=>{console.error("SMOKE FAILED",e);process.exitCode=1;});
