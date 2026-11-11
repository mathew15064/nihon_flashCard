import { test } from "node:test";
import assert from "node:assert/strict";
import { vocabularyInput, listQuery } from "../src/modules/vocabulary/schema";

test("validates a Japanese vocabulary entry", () => {
  const input=vocabularyInput.parse({word:" 食べる ",reading:"たべる",meaningVi:"ăn"});
  assert.equal(input.word,"食べる");
  assert.equal(input.language,"ja");
  assert.equal(input.source,"manual");
});
test("rejects empty reading and unsupported JLPT labels", () => {
  assert.equal(vocabularyInput.safeParse({word:"日本",reading:"",meaningVi:"Nhật Bản"}).success,false);
  assert.equal(vocabularyInput.safeParse({word:"日本",reading:"にほん",meaningVi:"Nhật Bản",jlptLevel:"N0"}).success,false);
});
test("limits pagination to 100 entries", () => {
  assert.equal(listQuery.safeParse({limit:"500"}).success,false);
  assert.equal(listQuery.parse({limit:"20"}).limit,20);
});
