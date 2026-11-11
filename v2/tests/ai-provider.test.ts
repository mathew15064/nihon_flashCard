import { test } from "node:test";
import assert from "node:assert/strict";
import { openAIProvider } from "../src/modules/ai/provider";
import { generationRequestSchema } from "../src/modules/ai/schema";

test("Responses API request is structured, bounded and server-key authenticated", async () => {
  process.env.OPENAI_API_KEY = "test-only-in-memory-not-real";
  process.env.NIHON_AI_MODEL = "gpt-4.1-mini";
  const candidate = {
    word: "牛乳", reading: "ぎゅうにゅう", romanization: "gyuunyuu",
    partOfSpeech: "noun", jlptLevel: "N5",
    meaningVi: "sữa bò", meaningEn: "milk",
    exampleJa: "牛乳を飲みます。", exampleVi: "Tôi uống sữa.",
  };
  const fakeFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string,string>)?.authorization,
      "Bearer test-only-in-memory-not-real");
    const body = JSON.parse(String(init?.body)) as Record<string,unknown>;
    assert.equal(body.store, false);
    assert.equal(body.model, "gpt-4.1-mini");
    assert.equal((body.text as {format: {type:string}}).format.type, "json_schema");
    assert.ok(Number(body.max_output_tokens) <= 8000);
    return Response.json({
      status:"completed",
      output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({items:[candidate]})}]}],
      usage:{input_tokens:120,output_tokens:200},
    });
  };
  const provider = openAIProvider(fakeFetch as typeof fetch);
  const result = await provider.generate(generationRequestSchema.parse({
    topic:"Đồ uống",jlptLevel:"N5",count:5,notes:"Dễ học",
  }));
  assert.equal(result.items[0].word,"牛乳");
  assert.equal(result.inputTokens,120);
  assert.equal(result.outputTokens,200);
  delete process.env.OPENAI_API_KEY;
  delete process.env.NIHON_AI_MODEL;
});

test("Provider does not call external API without a configured server key", async () => {
  delete process.env.OPENAI_API_KEY;
  let called = false;
  const provider = openAIProvider((async () => {called=true;throw new Error("unexpected");}) as typeof fetch);
  await assert.rejects(provider.generate({topic:"Ăn uống",jlptLevel:"N5",count:5,notes:""}),/AI_NOT_CONFIGURED/);
  assert.equal(called,false);
});
