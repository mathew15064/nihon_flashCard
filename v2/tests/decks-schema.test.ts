import { test } from "node:test";
import assert from "node:assert/strict";
import { createDeckInput, deckIdSchema } from "../src/modules/decks/schema";

test("deck names are required and trimmed", () => {
  const value = createDeckInput.parse({name:"  Ăn uống N5  ",description:"Mỗi ngày"});
  assert.equal(value.name,"Ăn uống N5");
  assert.equal(createDeckInput.safeParse({name:"x"}).success,false);
  assert.equal(createDeckInput.safeParse({name:"Hello",visibility:"public"}).success,false);
});
test("deck IDs must be UUID", () => {
  assert.equal(deckIdSchema.safeParse("not-a-uuid").success,false);
});
