import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance,FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { hashAdminPassword } from "@/lib/admin-password";
import {
  adminPasswordHash, adminRestToken, aiDailyLimit, aiModel,
  mcpToken, openaiKey, publicOrigin, readSetting, saveSecret,
  signupEnabledByConfig, writeSetting,
} from "@/lib/runtime-config";
import { ok, fail, requireAdmin } from "./http";

// A one-boot, out-of-band installer challenge, never returned by an HTTP endpoint.
const setupCode=randomBytes(18).toString("base64url");
export function showSetupInstructions():void {
  if(!adminPasswordHash()){
    console.log("\nNihon first-run installer: open /setup");
    console.log("One-time setup code (server console only): "+setupCode);
    console.log("The code expires when this process restarts or setup completes.\n");
  }
}
export function installationCodeForIsolatedTests():string { return setupCode; }
function setupCodeValid(code:string):boolean {
  const a=Buffer.from(code),b=Buffer.from(setupCode);
  return a.length===b.length && timingSafeEqual(a,b);
}
function validateOrigin(value:string):string {
  let url:URL;
  try{url=new URL(value);}catch{throw new Error("ORIGIN_INVALID");}
  if(!["http:","https:"].includes(url.protocol) ||
     url.username || url.password || url.pathname!=="/" ||
     url.search || url.hash || url.origin!==value)
    throw new Error("ORIGIN_INVALID");
  const local=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  if(process.env.NODE_ENV==="production" && url.protocol!=="https:" && !local)
    throw new Error("HTTPS_ORIGIN_REQUIRED");
  return value;
}
function initialRequestAllowed(request:FastifyRequest,origin:string):boolean {
  return request.headers.origin===origin &&
    request.headers["sec-fetch-site"]!=="cross-site";
}
const installInput=z.object({
  setupCode:z.string().min(1).max(100),
  database:z.enum(["sqlite","mysql"]),
  adminPassword:z.string().min(12).max(256),
  repeatPassword:z.string().min(12).max(256),
  origin:z.string().min(1).max(250),
  enableSignup:z.boolean().default(false),
}).strict().refine(v=>v.adminPassword===v.repeatPassword,{path:["repeatPassword"],
  message:"Mật khẩu xác nhận không khớp"});
const settingsInput=z.object({
  origin:z.string().min(1).max(250),
  enableSignup:z.boolean(),
  aiModel:z.string().trim().min(2).max(100).regex(/^[a-zA-Z0-9._-]+$/),
  aiDailyLimit:z.number().int().min(1).max(100),
  openaiApiKey:z.string().trim().min(10).max(4096).optional(),
}).strict();

export function registerInstallationRoutes(app:FastifyInstance):void {
  app.get("/api/v1/setup/status",()=>ok({
    installed:Boolean(adminPasswordHash()),
    database:"sqlite",
    engines:[{id:"sqlite",available:true},{id:"mysql",available:false}],
    needsSetupCode:!adminPasswordHash(),
  }));
  app.post("/api/v1/setup/initialize",async(request,reply)=>{
    if(adminPasswordHash())
      return reply.code(409).send({success:false,error:{code:"ALREADY_INSTALLED"}});
    try {
      const input=installInput.parse(request.body);
      if(!initialRequestAllowed(request,input.origin))
        return reply.code(403).send({success:false,error:{code:"INVALID_ORIGIN"}});
      if(!setupCodeValid(input.setupCode))
        return reply.code(401).send({success:false,error:{code:"INVALID_SETUP_CODE"}});
      if(input.database!=="sqlite")
        return reply.code(422).send({success:false,error:{code:"MYSQL_ADAPTER_NOT_READY"}});
      const origin=validateOrigin(input.origin);
      const passwordHash=hashAdminPassword(input.adminPassword);
      const now=new Date().toISOString();
      // Install is atomic. It must never reset an existing Admin password.
      db.transaction(tx=>{
        const existing=tx.select({value:appSettings.value}).from(appSettings)
          .where(zeroAdminKey).get();
        if(existing || process.env.NIHON_ADMIN_PASSWORD_HASH)
          throw new Error("ALREADY_INSTALLED");
        for(const [key,value] of [
          ["admin_password_hash",passwordHash],
          ["public_origin",origin],
          ["enable_signup",input.enableSignup?"true":"false"],
        ]){
          tx.insert(appSettings).values({key,value,updatedAt:now}).run();
        }
      });
      return reply.code(201).send(ok({installed:true,database:"sqlite"}));
    }catch(error){return fail(reply,error);}
  });

  app.get("/api/v1/admin/settings",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    return ok({
      database:"sqlite",mysqlAvailable:false,
      origin:publicOrigin()||"",
      enableSignup:signupEnabledByConfig(),
      aiModel:aiModel(),aiDailyLimit:aiDailyLimit(),
      openaiConfigured:Boolean(openaiKey()),
      mcpReadConfigured:Boolean(mcpToken("read")),
      mcpWriteConfigured:Boolean(mcpToken("write")),
      restConfigured:Boolean(adminRestToken()),
      envFallback:{
        openai:!readSetting("openai_api_key")&&Boolean(process.env.OPENAI_API_KEY),
        mcpRead:!readSetting("mcp_read_token")&&Boolean(process.env.NIHON_MCP_READ_TOKEN),
        mcpWrite:!readSetting("mcp_write_token")&&Boolean(process.env.NIHON_MCP_TOKEN),
      },
    });
  });
  app.patch("/api/v1/admin/settings",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    try{
      const input=settingsInput.parse(request.body);
      const origin=validateOrigin(input.origin);
      // Encrypt first: if encryption fails, do not partially save plain settings.
      const encrypted=input.openaiApiKey?await import("@/lib/runtime-config")
        .then(({encryptValue})=>encryptValue(input.openaiApiKey!)):undefined;
      db.transaction(tx=>{
        const now=new Date().toISOString();
        for(const [key,value] of [
          ["public_origin",origin],["enable_signup",String(input.enableSignup)],
          ["ai_model",input.aiModel],["ai_daily_limit",String(input.aiDailyLimit)],
          ...(encrypted?[["openai_api_key",encrypted]]:[]),
        ]){
          tx.insert(appSettings).values({key,value,updatedAt:now})
            .onConflictDoUpdate({target:appSettings.key,set:{value,updatedAt:now}}).run();
        }
      });
      return ok({saved:true,openaiConfigured:Boolean(openaiKey())});
    }catch(error){return fail(reply,error);}
  });
  app.delete("/api/v1/admin/settings/openai",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    writeSetting("openai_api_key","disabled");
    return ok({deleted:true,stillConfigured:Boolean(openaiKey())});
  });
  for(const scope of ["read","write","rest"] as const){
    app.post("/api/v1/admin/settings/tokens/"+scope,async(request,reply)=>{
      if(!requireAdmin(request,reply))return;
      const raw=randomBytes(36).toString("base64url");
      saveSecret(scope==="read"?"mcp_read_token":scope==="write"?"mcp_write_token":"admin_rest_token",raw);
      return ok({scope,token:raw,showOnce:true});
    });
    app.delete("/api/v1/admin/settings/tokens/"+scope,async(request,reply)=>{
      if(!requireAdmin(request,reply))return;
      writeSetting(scope==="read"?"mcp_read_token":scope==="write"?"mcp_write_token":"admin_rest_token","disabled");
      return ok({scope,deleted:true});
    });
  }
}
// Avoid arbitrary query composition for the installation guard.
import { eq } from "drizzle-orm";
const zeroAdminKey=eq(appSettings.key,"admin_password_hash");
