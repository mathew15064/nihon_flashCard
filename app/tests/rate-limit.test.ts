import { test } from "node:test";
import assert from "node:assert/strict";
import { FixedWindowLimiter } from "../src/server/rate-limit";

test("auth limiter isolates IP and endpoint and resets a completed window", () => {
  const limiter = new FixedWindowLimiter(4);
  assert.deepEqual(limiter.consume("ip1|admin", 2, 1000, 10), { allowed: true });
  assert.deepEqual(limiter.consume("ip1|admin", 2, 1000, 20), { allowed: true });
  assert.deepEqual(limiter.consume("ip1|admin", 2, 1000, 30),
    { allowed: false, retryAfterSeconds: 1 });
  assert.deepEqual(limiter.consume("ip2|admin", 2, 1000, 30), { allowed: true });
  assert.deepEqual(limiter.consume("ip1|learner", 2, 1000, 30), { allowed: true });
  assert.deepEqual(limiter.consume("ip1|admin", 2, 1000, 1010), { allowed: true });
});

test("auth limiter bounds memory and fails closed until a bucket expires", () => {
  const limiter = new FixedWindowLimiter(2);
  assert.deepEqual(limiter.consume("ip1", 1, 1000, 0), { allowed: true });
  assert.deepEqual(limiter.consume("ip2", 1, 3000, 0), { allowed: true });
  assert.deepEqual(limiter.consume("ip3", 1, 1000, 100),
    { allowed: false, retryAfterSeconds: 1 });
  assert.deepEqual(limiter.consume("ip1", 1, 1000, 100),
    { allowed: false, retryAfterSeconds: 1 });
  assert.deepEqual(limiter.consume("ip3", 1, 1000, 1000), { allowed: true });
  limiter.clear();
  assert.deepEqual(limiter.consume("ip1", 1, 1000, 1000), { allowed: true });
});
