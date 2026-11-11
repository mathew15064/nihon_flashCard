import { test } from "node:test";
import assert from "node:assert/strict";
import { hashAdminPassword, verifyAdminPassword } from "../src/lib/admin-password";

test("admin password is salted and verified without storing plaintext", () => {
  const password = "a-strong-test-password-for-dev";
  const first = hashAdminPassword(password);
  const second = hashAdminPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(verifyAdminPassword(password, first), true);
  assert.equal(verifyAdminPassword("wrong-password", first), false);
  assert.equal(verifyAdminPassword(password, undefined), false);
  assert.equal(verifyAdminPassword(password, "broken"), false);
});
test("rejects short initial admin passwords", () => {
  assert.throws(() => hashAdminPassword("123"), /12/);
});
