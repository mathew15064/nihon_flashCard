import { createHash,createHmac,randomBytes,timingSafeEqual } from "node:crypto";
import type { FastifyReply,FastifyRequest } from "fastify";
import { eq,lt } from "drizzle-orm";
import type { openMySQL } from "./connector";
import { authSessions } from "./schema";
import { mysqlSettings } from "./settings";
import { mysqlAccounts } from "./accounts";
import { GUEST_COOKIE_NAME,GUEST_COOKIE_MAX_AGE,makeGuestToken,parseGuestToken } from "@/modules/learning/guest-session";
import { verifyBearer } from "@/server/auth";

type Db=ReturnType<typeof openMySQL>["db"];
type Actor={id:string;name:string;role:"admin"|"learner"};
const COOKIE="nihon_auth";
function secret():string{
  const value=process.env.AUTH_SECRET;
  if(!value||value.length<32)throw new Error("AUTH_NOT_CONFIGURED");
  return value;
}
function digest(payload:string,key:string):Buffer{
  return createHmac("sha256",key).update("nihon-session-v2:"+payload).digest();
}
function hashToken(value:string){
  return createHash("sha256").update("nihon-auth-session:"+value).digest("hex");
}
function parse(value:string|undefined):{id:string;exp:number}|null{
  if(!value||value.length>500)return null;
  const [version,encoded,signature]=value.split(".");
  if(version!=="v2"||!encoded||!signature)return null;
  const expected=digest(encoded,secret());
  const received=Buffer.from(signature,"base64url");
  if(received.length!==expected.length||!timingSafeEqual(received,expected))return null;
  try{
    const data=JSON.parse(Buffer.from(encoded,"base64url").toString()) as {
      id:unknown;exp:unknown;nonce:unknown;
    };
    if(typeof data.id!=="string"||typeof data.exp!=="number"||
       !Number.isSafeInteger(data.exp)||data.exp<=Date.now()||
       data.exp>Date.now()+30*24*3600*1000+60_000||
       typeof data.nonce!=="string"||data.nonce.length!==32)return null;
    return {id:data.id,exp:data.exp};
  }catch{return null;}
}
export function mysqlAuth(db:Db){
  const settings=mysqlSettings(db);
  const accounts=mysqlAccounts(db,settings.signup);
  const actor=async(request:FastifyRequest):Promise<Actor|null>=>{
    const value=request.cookies?.[COOKIE];
    const parsed=parse(value);
    if(!parsed||!value)return null;
    const session=(await db.select().from(authSessions)
      .where(eq(authSessions.tokenHash,hashToken(value))).limit(1))[0];
    if(!session||session.actorId!==parsed.id||
       session.expiresAt!==new Date(parsed.exp).toISOString()||
       session.expiresAt<=new Date().toISOString())return null;
    if(parsed.id==="nihon-local-admin"){
      return await settings.adminHash()?{id:parsed.id,role:"admin",name:"Nihon Admin"}:null;
    }
    if(parsed.id.startsWith("learner:")){
      const learner=await accounts.getLearnerById(parsed.id);
      return learner?{id:parsed.id,role:"learner",name:learner.displayName}:null;
    }
    return null;
  };
  const sameOrigin=async(request:FastifyRequest):Promise<boolean>=>{
    const actual=request.headers.origin;
    if(typeof actual!=="string"||request.headers["sec-fetch-site"]==="cross-site")
      return false;
    const expected=await settings.origin();
    if(!expected)return false;
    try{return new URL(actual).origin===new URL(expected).origin;}
    catch{return false;}
  };
  const setCookie=async(request:FastifyRequest,reply:FastifyReply,id:string)=>{
    const duration=id==="nihon-local-admin"?8*3600:30*24*3600;
    const expires=Date.now()+duration*1000;
    const payload=Buffer.from(JSON.stringify({
      id,exp:expires,nonce:randomBytes(24).toString("base64url"),
    })).toString("base64url");
    const token="v2."+payload+"."+digest(payload,secret()).toString("base64url");
    const now=new Date().toISOString();
    await db.transaction(async tx=>{
      const previous=request.cookies?.[COOKIE];
      if(previous&&previous.length<=500)
        await tx.delete(authSessions).where(eq(authSessions.tokenHash,hashToken(previous)));
      await tx.delete(authSessions).where(lt(authSessions.expiresAt,now));
      await tx.insert(authSessions).values({
        tokenHash:hashToken(token),actorId:id,
        expiresAt:new Date(expires).toISOString(),createdAt:now,
      });
    });
    reply.setCookie(COOKIE,token,{
      httpOnly:true,sameSite:"lax",path:"/",maxAge:duration,
      secure:process.env.NODE_ENV==="production",
    });
  };
  const logout=async(request:FastifyRequest,reply:FastifyReply)=>{
    const token=request.cookies?.[COOKIE];
    if(token&&token.length<=500)
      await db.delete(authSessions).where(eq(authSessions.tokenHash,hashToken(token)));
    reply.clearCookie(COOKIE,{
      path:"/",httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",
    });
  };
  const guest=(request:FastifyRequest)=>{
    const key=process.env.NIHON_GUEST_SESSION_SECRET||secret();
    return parseGuestToken(request.cookies?.[GUEST_COOKIE_NAME],key);
  };
  const learningId=async(request:FastifyRequest)=>{
    const learner=await actor(request);
    return learner?.role==="learner"?learner.id:guest(request);
  };
  const ensureGuest=async(request:FastifyRequest,reply:FastifyReply)=>{
    const a=await actor(request);
    if(a?.role==="learner")return true;
    if(!guest(request)){
      reply.setCookie(GUEST_COOKIE_NAME,makeGuestToken(
        process.env.NIHON_GUEST_SESSION_SECRET||secret(),
      ),{
        httpOnly:true,sameSite:"lax",path:"/",maxAge:GUEST_COOKIE_MAX_AGE,
        secure:process.env.NODE_ENV==="production",
      });
    }
    return true;
  };
  const requireAdmin=async(request:FastifyRequest,reply:FastifyReply)=>{
    const bearer=verifyBearer(request.headers.authorization,await settings.key("admin_rest_token"));
    const cookie=(await actor(request))?.role==="admin";
    if(!bearer&&!cookie){
      reply.code(401).send({success:false,error:{code:"ADMIN_REQUIRED"}});
      return false;
    }
    if(!bearer&&!["GET","HEAD","OPTIONS"].includes(request.method) &&
      !await sameOrigin(request)){
      reply.code(403).send({success:false,error:{code:"INVALID_ORIGIN"}});
      return false;
    }
    return true;
  };
  const requireSameOrigin=async(request:FastifyRequest,reply:FastifyReply)=>{
    if(!await sameOrigin(request)){
      reply.code(403).send({success:false,error:{code:"INVALID_ORIGIN"}});
      return false;
    }
    return true;
  };
  const requireLearning=async(request:FastifyRequest,reply:FastifyReply)=>{
    const userId=await learningId(request);
    if(!userId){
      reply.code(401).send({success:false,error:{code:"LEARNING_SESSION_REQUIRED"}});
      return null;
    }
    return userId;
  };
  const scope=async(request:FastifyRequest):Promise<"read"|"write"|null>=>{
    const read=await settings.key("mcp_read_token");
    const write=await settings.key("mcp_write_token");
    if(read&&write&&read===write)return null;
    if(verifyBearer(request.headers.authorization,write))return "write";
    if(verifyBearer(request.headers.authorization,read))return "read";
    return null;
  };
  return {
    actor,sameOrigin,setCookie,logout,guest,learningId,ensureGuest,
    requireAdmin,requireSameOrigin,requireLearning,scope,accounts,settings,
  };
}
