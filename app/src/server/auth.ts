import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { authSessions, learnerLoginLimits } from "@/db/schema";
import { getLearnerById } from "@/modules/accounts/service";
import { adminPasswordHash, adminRestToken, mcpToken, publicOrigin } from "@/lib/runtime-config";
import { GUEST_COOKIE_NAME, guestSessionSecret, makeGuestToken, parseGuestToken,
  GUEST_COOKIE_MAX_AGE } from "@/modules/learning/guest-session";

const COOKIE = "nihon_auth";
type Actor = { id: string; role: "admin"|"learner"; name: string };
const MAX_CLOCK_SKEW = 0;
function secret() {
  const value = process.env.AUTH_SECRET;
  return value && value.length >= 32 ? value : null;
}
function sign(payload: string, key: string): Buffer {
  return createHmac("sha256", key).update("nihon-session-v2:" + payload).digest();
}
function safeCompare(a: string, b: string): boolean {
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x,y);
}
export function verifyBearer(actual: string|undefined, expected: string|undefined):boolean {
  return !!actual?.startsWith("Bearer ") && !!expected && expected.length>=24
    && safeCompare(actual.slice(7),expected);
}
function sessionToken(id:string, duration:number, key:string):{token:string;expiresAt:string} {
  const exp=Date.now()+duration*1000;
  // Prevent token reuse from two logins made in the same millisecond.
  const payload=Buffer.from(JSON.stringify({
    id,exp,nonce:randomBytes(24).toString("base64url"),
  })).toString("base64url");
  return {
    token:"v2."+payload+"."+sign(payload,key).toString("base64url"),
    expiresAt:new Date(exp).toISOString(),
  };
}
function parseSession(value:string|undefined,key:string):{id:string;exp:number}|null {
  if(!value || value.length>500)return null;
  const segments=value.split(".");
  if(segments.length!==3 || segments[0]!=="v2")return null;
  let digest:Buffer;
  try{digest=Buffer.from(segments[2],"base64url");}catch{return null;}
  const expected=sign(segments[1],key);
  if(digest.length!==expected.length || !timingSafeEqual(digest,expected))return null;
  try{
    const payload=JSON.parse(Buffer.from(segments[1],"base64url").toString()) as {
      id:unknown;exp:unknown;nonce:unknown;
    };
    if(typeof payload.id!=="string" || typeof payload.exp!=="number" ||
       !Number.isSafeInteger(payload.exp) || payload.exp < Date.now()-MAX_CLOCK_SKEW ||
       typeof payload.nonce!=="string" || payload.nonce.length!==32)return null;
    if(payload.exp > Date.now()+30*24*3600*1000+60000)return null;
    return {id:payload.id,exp:payload.exp};
  }catch{return null;}
}
function digestToken(value:string):string {
  return createHash("sha256").update("nihon-auth-session:"+value).digest("hex");
}
export function revokeAuthSession(request:FastifyRequest):void {
  const token=request.cookies?.[COOKIE];
  if(token && token.length<=500)
    db.delete(authSessions).where(eq(authSessions.tokenHash,digestToken(token))).run();
}
export function getActor(request:FastifyRequest):Actor|null {
  const key=secret();
  if(!key)return null;
  const token=request.cookies?.[COOKIE];
  const session=parseSession(token,key);
  if(!session || !token)return null;
  const record=db.select().from(authSessions)
    .where(eq(authSessions.tokenHash,digestToken(token))).get();
  if(!record || record.actorId!==session.id ||
     record.expiresAt!==new Date(session.exp).toISOString() ||
     record.expiresAt<=new Date().toISOString())return null;
  const id=session.id;
  if(id==="nihon-local-admin" && adminPasswordHash())return {id,role:"admin",name:"Nihon Admin"};
  if(id.startsWith("learner:")){
    const user=getLearnerById(id);
    return user?{id,role:"learner",name:user.displayName}:null;
  }
  return null;
}
export function setAuthCookie(request:FastifyRequest,reply:FastifyReply,id:string):void {
  const key=secret();
  if(!key)throw new Error("AUTH_NOT_CONFIGURED");
  const admin=id==="nihon-local-admin";
  const age=admin?8*3600:30*24*3600;
  const {token,expiresAt}=sessionToken(id,age,key);
  const now=new Date().toISOString();
  db.transaction(tx=>{
    const previous=request.cookies?.[COOKIE];
    if(previous && previous.length<=500)
      tx.delete(authSessions).where(eq(authSessions.tokenHash,digestToken(previous))).run();
    tx.delete(authSessions).where(lt(authSessions.expiresAt,now)).run();
    tx.insert(authSessions).values({
      tokenHash:digestToken(token),actorId:id,expiresAt,createdAt:now,
    }).run();
  });
  reply.setCookie(COOKIE,token,{
    httpOnly:true,sameSite:"lax",path:"/",maxAge:age,
    secure:process.env.NODE_ENV==="production",
  });
}
export function clearAuthCookie(reply:FastifyReply):void {
  reply.clearCookie(COOKIE,{
    path:"/",httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",
  });
}
export function getGuestId(request:FastifyRequest):string|null {
  const key=guestSessionSecret();
  if(!key)return null;
  return parseGuestToken(request.cookies?.[GUEST_COOKIE_NAME],key);
}
export function getLearningId(request:FastifyRequest):string|null {
  const actor=getActor(request);
  if(actor?.role==="learner")return actor.id;
  return getGuestId(request);
}
export function ensureGuest(request:FastifyRequest,reply:FastifyReply):boolean {
  const actor=getActor(request);
  if(actor?.role==="learner")return true;
  const key=guestSessionSecret();
  if(!key)return false;
  if(!getGuestId(request)){
    reply.setCookie(GUEST_COOKIE_NAME,makeGuestToken(key),{
      httpOnly:true,sameSite:"lax",path:"/",maxAge:GUEST_COOKIE_MAX_AGE,
      secure:process.env.NODE_ENV==="production",
    });
  }
  return true;
}
export function safeOrigin(request:FastifyRequest):boolean {
  const origin=request.headers.origin;
  if(typeof origin!=="string")return false;
  const configured=publicOrigin();
  // Never derive a production CSRF allowlist from the attacker-controlled Host header.
  if(process.env.NODE_ENV==="production" && !configured)return false;
  const expected=configured || request.protocol+"://"+request.headers.host;
  try{
    return new URL(origin).origin===new URL(expected).origin &&
      request.headers["sec-fetch-site"]!=="cross-site";
  }catch{return false;}
}
export function needsAdmin(request:FastifyRequest):boolean {
  return getActor(request)?.role==="admin" ||
    verifyBearer(request.headers.authorization,adminRestToken());
}
export type McpScope = "read" | "write";
/** Separate credentials for read-only search/get versus restricted draft creation. */
export function mcpScope(request:FastifyRequest):McpScope|null {
  const writeToken=mcpToken("write");
  const readToken=mcpToken("read");
  // Misconfigured equal credentials cannot provide meaningful least privilege.
  if(writeToken && readToken && writeToken===readToken)return null;
  if(verifyBearer(request.headers.authorization,writeToken))return "write";
  if(verifyBearer(request.headers.authorization,readToken))return "read";
  return null;
}
/** Simple DB-backed per-account lockout; no shared Redis needed on one instance. */
export function adminPasswordAllowed():boolean {
  const record=db.select().from(learnerLoginLimits)
    .where(eq(learnerLoginLimits.usernameKey,"__admin__")).get();
  return !record?.lockedUntil || record.lockedUntil < new Date().toISOString();
}
export function recordAdminLogin(ok:boolean):void {
  if(ok){
    db.delete(learnerLoginLimits).where(eq(learnerLoginLimits.usernameKey,"__admin__")).run();
    return;
  }
  const now=new Date();
  const prev=db.select().from(learnerLoginLimits)
    .where(eq(learnerLoginLimits.usernameKey,"__admin__")).get();
  const failures=(prev?.failures??0)+1;
  const lock=failures>=5?new Date(now.getTime()+15*60000).toISOString():null;
  db.insert(learnerLoginLimits).values({
    usernameKey:"__admin__",failures:lock?0:failures,lockedUntil:lock,updatedAt:now.toISOString(),
  }).onConflictDoUpdate({target:learnerLoginLimits.usernameKey,set:{
    failures:lock?0:failures,lockedUntil:lock,updatedAt:now.toISOString(),
  }}).run();
}
export function newRequestId():string {
  return randomBytes(16).toString("hex");
}
