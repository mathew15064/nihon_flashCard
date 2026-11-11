import { randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { learnerAccounts, learnerLoginLimits, learnerSignupEvents } from "@/db/schema";
import { hashAdminPassword, verifyAdminPassword } from "@/lib/admin-password";
import { normalizeUsername, registerInputSchema, usernameSchema } from "./schema";

const MAX_SIGNUPS_PER_HOUR = 10;
const MAX_LOGIN_FAILURES = 5;
const LOCK_FOR_MINUTES = 15;

export function signupEnabled() {
  return process.env.NIHON_ENABLE_SIGNUP === "true" && Boolean(process.env.AUTH_SECRET);
}

export function getLearnerById(id: string) {
  if (!/^learner:[a-f0-9-]{36}$/i.test(id)) return null;
  const idOnly = id.slice("learner:".length);
  const user = db.select({
    id: learnerAccounts.id, username:learnerAccounts.username,
    displayName: learnerAccounts.displayName, status:learnerAccounts.status,
  }).from(learnerAccounts).where(eq(learnerAccounts.id, idOnly)).get();
  return user?.status === "active" ? {...user, id: "learner:"+user.id} : null;
}

export function registerLearner(raw: unknown) {
  if (!signupEnabled()) throw new Error("SIGNUP_DISABLED");
  const input = registerInputSchema.parse(raw);
  const usernameKey = normalizeUsername(input.username);
  const passwordHash = hashAdminPassword(input.password);
  const now = new Date().toISOString();
  const since = new Date(Date.now()-60*60_000).toISOString();
  return db.transaction(tx => {
    const registrations = tx.select({total:sql<number>`count(*)`})
      .from(learnerSignupEvents).where(gte(learnerSignupEvents.createdAt,since)).get()?.total ?? 0;
    if (registrations >= MAX_SIGNUPS_PER_HOUR) throw new Error("SIGNUP_RATE_LIMITED");
    const existing = tx.select({id:learnerAccounts.id})
      .from(learnerAccounts).where(eq(learnerAccounts.usernameKey,usernameKey)).get();
    if (existing) throw new Error("USERNAME_TAKEN");
    const id = randomUUID();
    tx.insert(learnerAccounts).values({
      id, username:input.username, usernameKey, displayName:input.displayName,
      passwordHash, status:"active", createdAt:now, updatedAt:now,
    }).run();
    tx.insert(learnerSignupEvents).values({id:randomUUID(),createdAt:now}).run();
    return {id:"learner:"+id,username:input.username,displayName:input.displayName};
  });
}

/** Authenticate learner credentials server-side; never expose the stored verifier. */
export function authenticateLearner(username: unknown, password: unknown) {
  if (typeof username !== "string" || typeof password !== "string" || password.length > 256) return null;
  if (!usernameSchema.safeParse(username).success) return null;
  const key = normalizeUsername(username);
  const now = new Date();
  const record = db.select().from(learnerLoginLimits)
    .where(eq(learnerLoginLimits.usernameKey,key)).get();
  if (record?.lockedUntil && record.lockedUntil > now.toISOString()) return null;
  const user = db.select().from(learnerAccounts)
    .where(and(eq(learnerAccounts.usernameKey,key),eq(learnerAccounts.status,"active"))).get();
  const valid = verifyAdminPassword(password,user?.passwordHash);
  if (!valid) {
    // Avoid a user-not-found oracle, and apply a bounded lockout after 5 failures.
    const failures = (record?.failures ?? 0)+1;
    const lockedUntil = failures >= MAX_LOGIN_FAILURES
      ? new Date(now.getTime()+LOCK_FOR_MINUTES*60_000).toISOString() : null;
    db.insert(learnerLoginLimits).values({
      usernameKey:key, failures:lockedUntil?0:failures,
      lockedUntil,updatedAt:now.toISOString(),
    }).onConflictDoUpdate({target:learnerLoginLimits.usernameKey,set:{
      failures:lockedUntil?0:failures,lockedUntil,updatedAt:now.toISOString(),
    }}).run();
    return null;
  }
  db.delete(learnerLoginLimits).where(eq(learnerLoginLimits.usernameKey,key)).run();
  return {id:"learner:"+user!.id,name:user!.displayName};
}
