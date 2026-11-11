import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeGuestToken, parseGuestToken, validGuestMutationOrigin,
} from "../src/modules/learning/guest-session";

const secret="a-strong-independent-guest-test-secret-at-least-32-chars";
const id="8acbc50e-4bd1-4d7e-a96a-e0b576cc14b2";

test("Guest cookie is signed and rejects modified or guessed IDs", () => {
  const token=makeGuestToken(secret,id);
  assert.ok(token.startsWith("v1."));
  assert.equal(parseGuestToken(token,secret),"guest:"+id);
  assert.equal(parseGuestToken(token,"other-secret"),null);
  assert.equal(parseGuestToken(token.replace(id,"8acbc50e-4bd1-4d7e-a96a-e0b576cc14b3"),secret),null);
  assert.equal(parseGuestToken(id,secret),null);
  assert.equal(parseGuestToken("v1."+id+".anything",secret),null);
  assert.equal(parseGuestToken("",secret),null);
});
test("Guest review mutations require matching Origin and reject cross-site", () => {
  const make=(origin?:string,site?:string)=>new Request("http://127.0.0.1:3000/api/v1/me/reviews",{
    method:"POST",headers:{
      ...(origin ? {origin}:{}),
      ...(site ? {"sec-fetch-site":site}:{})
    },
  });
  assert.equal(validGuestMutationOrigin(make("http://127.0.0.1:3000","same-origin")),true);
  assert.equal(validGuestMutationOrigin(make("https://another.test","cross-site")),false);
  assert.equal(validGuestMutationOrigin(make(undefined,"same-origin")),false);
  assert.equal(validGuestMutationOrigin(make("http://127.0.0.1:3000","cross-site")),false);
  // Next may normalize Request.url to localhost while retaining inbound Host.
  const normalized = new Request("http://localhost:3000/api/v1/me/reviews",{
    method:"POST",
    headers:{host:"127.0.0.1:3000",origin:"http://127.0.0.1:3000","sec-fetch-site":"same-origin"},
  });
  assert.equal(validGuestMutationOrigin(normalized),true);
});
