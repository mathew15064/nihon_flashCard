import {test} from "node:test";
import assert from "node:assert/strict";
import {verifyOpenAIModelAccess} from "../src/lib/integration-diagnostics";

const model="gpt-4.1-mini";
const secret="sk-test-only-no-external-request";
function mock(response:Response){
  const calls:{url:string;options:RequestInit}[]=[];
  const fetcher=(async(input:RequestInfo|URL,options:RequestInit={})=>{
    calls.push({url:String(input),options});
    return response;
  }) as typeof fetch;
  return {fetcher,calls};
}
test("OpenAI checker never sends credentials to a caller-supplied URL",async()=>{
  const {fetcher,calls}=mock(new Response(JSON.stringify({
    object:"model",id:model,owned_by:"openai",
  }),{status:200,headers:{"content-type":"application/json"}}));
  const outcome=await verifyOpenAIModelAccess(secret,model,fetcher);
  assert.equal(outcome.verified,true);
  assert.equal(outcome.code,"OK");
  assert.equal(outcome.model,model);
  assert.equal(outcome.check,"model_access_only");
  assert.equal(calls.length,1);
  assert.equal(calls[0]?.url,"https://api.openai.com/v1/models/gpt-4.1-mini");
  assert.equal(calls[0]?.options.method,"GET");
  assert.equal(calls[0]?.options.redirect,"error","must not forward secrets on redirect");
  assert.equal((calls[0]?.options.headers as Record<string,string>).authorization,
    "Bearer "+secret);
  assert.equal(calls[0]?.options.body,undefined,"model check must not generate content");
  assert.ok(!JSON.stringify(outcome).includes(secret));
});
test("OpenAI checker fails closed on invalid model input",async()=>{
  let called=false;
  const fetcher=(async()=>{
    called=true;throw new Error("Should not call");
  }) as typeof fetch;
  const outcome=await verifyOpenAIModelAccess(secret,"../../other/path",fetcher);
  assert.equal(outcome.code,"AI_MODEL_INVALID");
  assert.equal(called,false);
});
test("OpenAI checker requires a saved credential",async()=>{
  let called=false;
  const fetcher=(async()=>{
    called=true;throw new Error("Should not call");
  }) as typeof fetch;
  const result=await verifyOpenAIModelAccess(undefined,model,fetcher);
  assert.equal(result.verified,false);
  assert.equal(result.code,"AI_NOT_CONFIGURED");
  assert.equal(called,false);
});
test("OpenAI checker sanitizes provider HTTP error codes",async()=>{
  const expectations:[[number,string],...[number,string][]]=[
    [401,"AI_KEY_INVALID"],[403,"AI_ACCESS_FORBIDDEN"],
    [404,"AI_MODEL_NOT_FOUND"],[429,"AI_RATE_LIMITED"],
    [400,"AI_PROVIDER_UNAVAILABLE"],[500,"AI_PROVIDER_UNAVAILABLE"],
  ];
  for(const [status,code]of expectations){
    const {fetcher}=mock(new Response(
      JSON.stringify({error:{message:"SECRET upstream detail should never leak"}}),
      {status},
    ));
    const result=await verifyOpenAIModelAccess(secret,model,fetcher);
    assert.equal(result.code,code);
    assert.equal(result.verified,false);
    assert.ok(!JSON.stringify(result).includes("SECRET"));
  }
});
test("OpenAI checker rejects malformed 200 metadata and connection errors",async()=>{
  for(const body of [JSON.stringify({object:"model",id:"wrong"}),
    JSON.stringify({object:"list",id:model}),"null"]){
    const {fetcher}=mock(new Response(body,{status:200}));
    assert.equal((await verifyOpenAIModelAccess(secret,model,fetcher)).code,
      "AI_VERIFICATION_RESPONSE_INVALID");
  }
  const networkFailure=(async()=>{
    throw new Error("token secret="+secret);
  }) as typeof fetch;
  const response=await verifyOpenAIModelAccess(secret,model,networkFailure);
  assert.equal(response.code,"AI_CONNECTION_FAILED");
  assert.ok(!JSON.stringify(response).includes(secret));
});

test("OpenAI checker reports timeout without exposing upstream exceptions",async()=>{
  const fake=(async()=>{
    const error=new Error("api credential should stay private");
    error.name="TimeoutError";
    throw error;
  }) as typeof fetch;
  const result=await verifyOpenAIModelAccess(secret,model,fake);
  assert.equal(result.code,"AI_VERIFICATION_TIMEOUT");
  assert.equal(result.verified,false);
  assert.ok(!JSON.stringify(result).includes("credential"));
});
