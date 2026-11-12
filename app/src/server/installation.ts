import { randomBytes,timingSafeEqual } from "node:crypto";
import type { FastifyInstance,FastifyRequest,FastifyReply } from "fastify";
import { z,ZodError } from "zod";
import { hashAdminPassword,verifyAdminPassword } from "@/lib/admin-password";
import { activeMySQL,activateMySQL } from "@/db/mysql/runtime";
import { mysqlConnectionSchema,migrateFreshMySQL,openMySQL,testMySQLConnection } from "@/db/mysql/connector";
import { mysqlSettings } from "@/db/mysql/settings";

let setupCode=randomBytes(24).toString("base64url");
let initializing=false;
export function showSetupInstructions():void{
  if(!activeMySQL()){
    console.log("\nNihon MySQL installer: open /setup");
    console.log("One-time setup code (server console only): "+setupCode);
    console.log("The code expires when this process restarts or setup completes.\n");
  }
}
export function installationCodeForIsolatedTests():string{return setupCode;}
function setupCodeValid(code:string):boolean {
  const a=Buffer.from(code),b=Buffer.from(setupCode);
  return a.length===b.length&&timingSafeEqual(a,b);
}
function originValid(value:string):boolean{
  try{
    const url=new URL(value);
    if(!["http:","https:"].includes(url.protocol)||url.username||url.password||
      url.pathname!=="/"||url.search||url.hash||url.origin!==value)return false;
    return process.env.NODE_ENV!=="production"||url.protocol==="https:"||
      ["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  }catch{return false;}
}
function sameOrigin(request:FastifyRequest,value:string):boolean{
  return request.headers.origin===value&&request.headers["sec-fetch-site"]!=="cross-site";
}
function bad(reply:FastifyReply,error:unknown){
  if(error instanceof ZodError)return reply.code(400).send({
    success:false,error:{code:"VALIDATION_ERROR"},
  });
  const code=error instanceof Error&&/^[A-Z_]{4,80}$/.test(error.message)
    ?error.message:"MYSQL_SETUP_FAILED";
  // Never forward mysql2 driver details, hostnames, SQL or credentials.
  const safe=/^(MYSQL_[A-Z_]+|ALREADY_INSTALLED|HTTPS_ORIGIN_REQUIRED)$/.test(code)
    ?code:"MYSQL_SETUP_FAILED";
  const status=safe.includes("ALREADY")||safe.includes("BUSY")?409:
    safe.includes("NOT_EMPTY")?409:safe==="MYSQL_SETUP_FAILED"?422:400;
  return reply.code(status).send({success:false,error:{code:safe}});
}
const setupInput=z.object({
  setupCode:z.string().min(1).max(100),
  database:z.literal("mysql"),
  mysql:mysqlConnectionSchema,
  adminPassword:z.string().min(12).max(256),
  repeatPassword:z.string().min(12).max(256),
  origin:z.string().min(1).max(250),
  enableSignup:z.boolean().default(false),
}).strict().refine(v=>v.adminPassword===v.repeatPassword,{
  path:["repeatPassword"],message:"Password confirmation mismatch",
});
const testInput=z.object({
  setupCode:z.string().min(1).max(100),
  origin:z.string().min(1).max(250),
  connection:mysqlConnectionSchema,
}).strict();

export function registerInstallationRoutes(app:FastifyInstance):void{
  app.get("/api/v1/setup/status",()=>({
    success:true,data:{
      installed:Boolean(activeMySQL()),database:"mysql",
      engines:[{id:"mysql",available:true}],
      needsSetupCode:!activeMySQL(),
    },
  }));
  app.post("/api/v1/setup/mysql/test",async(request,reply)=>{
    if(activeMySQL())return reply.code(409).send({
      success:false,error:{code:"ALREADY_INSTALLED"},
    });
    try{
      const input=testInput.parse(request.body);
      if(!sameOrigin(request,input.origin)||!originValid(input.origin))
        return reply.code(403).send({success:false,error:{code:"INVALID_ORIGIN"}});
      if(!setupCodeValid(input.setupCode))
        return reply.code(401).send({success:false,error:{code:"INVALID_SETUP_CODE"}});
      const result=await testMySQLConnection(input.connection);
      return {success:true,data:result};
    }catch(error){return bad(reply,error);}
  });
  app.post("/api/v1/setup/initialize",async(request,reply)=>{
    if(activeMySQL()||initializing)
      return reply.code(409).send({success:false,error:{
        code:activeMySQL()?"ALREADY_INSTALLED":"MYSQL_SETUP_BUSY",
      }});
    try{
      const input=setupInput.parse(request.body);
      if(!sameOrigin(request,input.origin)||!originValid(input.origin))
        return reply.code(403).send({success:false,error:{code:"INVALID_ORIGIN"}});
      if(!setupCodeValid(input.setupCode))
        return reply.code(401).send({success:false,error:{code:"INVALID_SETUP_CODE"}});
      initializing=true;
      const connection=input.mysql;
      await testMySQLConnection(connection);
      await migrateFreshMySQL(connection);
      const opened=openMySQL(connection);
      try{
        const settings=mysqlSettings(opened.db);
        const prior=await settings.adminHash();
        if(prior){
          // Safe recovery if a completed MySQL install lost ONLY its local
          // connection file. Never reset its existing Admin or user data.
          if(!verifyAdminPassword(input.adminPassword,prior))
            throw new Error("MYSQL_ALREADY_INSTALLED_ADMIN_PROOF_REQUIRED");
        }else{
          await settings.batch({
            admin_password_hash:hashAdminPassword(input.adminPassword),
            public_origin:input.origin,
            enable_signup:input.enableSignup?"true":"false",
          });
        }
      }finally{await opened.pool.end();}
      await activateMySQL(connection);
      setupCode=randomBytes(24).toString("base64url");
      return reply.code(201).send({success:true,data:{
        installed:true,database:"mysql",
      }});
    }catch(error){return bad(reply,error);}
    finally{initializing=false;}
  });
}
