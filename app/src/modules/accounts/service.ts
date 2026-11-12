import { randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { authSessions, learnerAccounts, learnerLoginLimits, learnerSignupEvents } from "@/db/schema";
import { hashAdminPassword, verifyAdminPassword } from "@/lib/admin-password";
import { signupEnabledByConfig } from "@/lib/runtime-config";
import { changePasswordInputSchema, normalizeUsername, registerInputSchema, usernameSchema } from "./schema";

const MAX_SIGNUPS_PER_HOUR = 10;
const MAX_LOGIN_FAILURES = 5;
const LOCK_FOR_MINUTES = 15;

export function signupEnabled() {
  return signupEnabledByConfig();
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

/**
 * Self-service password rotation. Only a currently authenticated learner can
 * invoke this. Re-authenticates using the existing DB-backed lockout mechanism.
 * All the learner's sessions are revoked atomically with the password update.
 * The HTTP route issues a fresh cookie for the current device after commit.
 */
export function changeLearnerPassword(actorId: string, raw: unknown):void {
  const input=changePasswordInputSchema.parse(raw);
  const learner=getLearnerById(actorId);
  if(!learner)throw new Error("LEARNER_REQUIRED");
  if(!authenticateLearner(learner.username,input.currentPassword))
    throw new Error("INVALID_CREDENTIALS");
  if(input.currentPassword===input.newPassword)
    throw new Error("PASSWORD_REUSE_NOT_ALLOWED");
  const passwordHash=hashAdminPassword(input.newPassword);
  const now=new Date().toISOString();
  const id=learner.id.slice("learner:".length);
  db.transaction(tx=>{
    const current=tx.select({status:learnerAccounts.status})
      .from(learnerAccounts).where(eq(learnerAccounts.id,id)).get();
    if(current?.status!=="active")throw new Error("LEARNER_REQUIRED");
    tx.update(learnerAccounts).set({passwordHash,updatedAt:now})
      .where(eq(learnerAccounts.id,id)).run();
    tx.delete(authSessions).where(eq(authSessions.actorId,actorId)).run();
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
