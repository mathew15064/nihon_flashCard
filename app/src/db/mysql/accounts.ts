import { randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import type { openMySQL } from "./connector";
import { appSettings, authSessions, learnerAccounts, learnerLoginLimits, learnerSignupEvents } from "./schema";
import { hashAdminPassword,verifyAdminPassword } from "@/lib/admin-password";
import { changePasswordInputSchema,normalizeUsername,registerInputSchema,usernameSchema } from "@/modules/accounts/schema";

type Db=ReturnType<typeof openMySQL>["db"];
const hour=60*60_000;
const LOCK_FOR_MINUTES=15;
export function mysqlAccounts(db:Db,signupEnabled:()=>Promise<boolean>){
  async function getLearnerById(id:string){
    if(!/^learner:[a-f0-9-]{36}$/i.test(id))return null;
    const rows=await db.select({
      id:learnerAccounts.id,username:learnerAccounts.username,
      displayName:learnerAccounts.displayName,status:learnerAccounts.status,
    }).from(learnerAccounts).where(eq(learnerAccounts.id,id.slice(8))).limit(1);
    const user=rows[0];
    return user?.status==="active"?{...user,id:"learner:"+user.id}:null;
  }
  async function register(raw:unknown){
    if(!await signupEnabled())throw new Error("SIGNUP_DISABLED");
    const input=registerInputSchema.parse(raw);
    const usernameKey=normalizeUsername(input.username);
    const hash=hashAdminPassword(input.password);
    const now=new Date().toISOString();
    return db.transaction(async tx=>{
      const lock=await tx.select({key:appSettings.key}).from(appSettings)
        .where(eq(appSettings.key,"__signup_reservation_lock__")).for("update");
      if(!lock.length)throw new Error("MYSQL_SIGNUP_LOCK_MISSING");
      const [{total}={total:0}]=await tx.select({total:sql<number>`count(*)`})
        .from(learnerSignupEvents)
        .where(gte(learnerSignupEvents.createdAt,new Date(Date.now()-hour).toISOString()));
      if(Number(total)>=10)throw new Error("SIGNUP_RATE_LIMITED");
      const previous=await tx.select({id:learnerAccounts.id}).from(learnerAccounts)
        .where(eq(learnerAccounts.usernameKey,usernameKey)).limit(1);
      if(previous.length)throw new Error("USERNAME_TAKEN");
      const id=randomUUID();
      await tx.insert(learnerAccounts).values({
        id,username:input.username,usernameKey,displayName:input.displayName,
        passwordHash:hash,status:"active",createdAt:now,updatedAt:now,
      });
      await tx.insert(learnerSignupEvents).values({id:randomUUID(),createdAt:now});
      return {id:"learner:"+id,username:input.username,displayName:input.displayName};
    });
  }
  async function authenticate(username:unknown,password:unknown){
    if(typeof username!=="string"||typeof password!=="string"||password.length>256)
      return null;
    if(!usernameSchema.safeParse(username).success)return null;
    const key=normalizeUsername(username);
    const now=new Date();
    const record=(await db.select().from(learnerLoginLimits)
      .where(eq(learnerLoginLimits.usernameKey,key)).limit(1))[0];
    if(record?.lockedUntil && record.lockedUntil>now.toISOString())return null;
    const user=(await db.select().from(learnerAccounts).where(and(
      eq(learnerAccounts.usernameKey,key),eq(learnerAccounts.status,"active")
    )).limit(1))[0];
    const valid=verifyAdminPassword(password,user?.passwordHash);
    if(!valid){
      const failures=(record?.failures??0)+1;
      const lockedUntil=failures>=5
        ?new Date(now.getTime()+LOCK_FOR_MINUTES*60_000).toISOString():null;
      const payload={
        usernameKey:key,failures:lockedUntil?0:failures,
        lockedUntil,updatedAt:now.toISOString(),
      };
      await db.insert(learnerLoginLimits).values(payload).onDuplicateKeyUpdate({set:{
        failures:payload.failures,lockedUntil:payload.lockedUntil,updatedAt:payload.updatedAt,
      }});
      return null;
    }
    await db.delete(learnerLoginLimits).where(eq(learnerLoginLimits.usernameKey,key));
    return {id:"learner:"+user!.id,name:user!.displayName};
  }
  async function changePassword(actorId:string,raw:unknown){
    const input=changePasswordInputSchema.parse(raw);
    const learner=await getLearnerById(actorId);
    if(!learner)throw new Error("LEARNER_REQUIRED");
    const valid=await authenticate(learner.username,input.currentPassword);
    if(!valid)throw new Error("INVALID_CREDENTIALS");
    if(input.currentPassword===input.newPassword)
      throw new Error("PASSWORD_REUSE_NOT_ALLOWED");
    const hash=hashAdminPassword(input.newPassword);
    await db.transaction(async tx=>{
      const rows=await tx.select({status:learnerAccounts.status}).from(learnerAccounts)
        .where(eq(learnerAccounts.id,actorId.slice(8))).limit(1);
      if(rows[0]?.status!=="active")throw new Error("LEARNER_REQUIRED");
      await tx.update(learnerAccounts).set({
        passwordHash:hash,updatedAt:new Date().toISOString(),
      }).where(eq(learnerAccounts.id,actorId.slice(8)));
      await tx.delete(authSessions).where(eq(authSessions.actorId,actorId));
    });
  }
  async function adminPasswordAllowed(){
    const record=(await db.select().from(learnerLoginLimits)
      .where(eq(learnerLoginLimits.usernameKey,"__admin__")).limit(1))[0];
    return !record?.lockedUntil||record.lockedUntil<new Date().toISOString();
  }
  async function recordAdminLogin(success:boolean){
    if(success){
      await db.delete(learnerLoginLimits)
        .where(eq(learnerLoginLimits.usernameKey,"__admin__"));
      return;
    }
    const now=new Date();
    const prev=(await db.select().from(learnerLoginLimits)
      .where(eq(learnerLoginLimits.usernameKey,"__admin__")).limit(1))[0];
    const failures=(prev?.failures??0)+1;
    const locked=failures>=5?new Date(now.getTime()+15*60_000).toISOString():null;
    const values={usernameKey:"__admin__",failures:locked?0:failures,
      lockedUntil:locked,updatedAt:now.toISOString()};
    await db.insert(learnerLoginLimits).values(values).onDuplicateKeyUpdate({set:{
      failures:values.failures,lockedUntil:values.lockedUntil,updatedAt:values.updatedAt,
    }});
  }
  return {register,authenticate,changePassword,getLearnerById,adminPasswordAllowed,recordAdminLogin};
}
