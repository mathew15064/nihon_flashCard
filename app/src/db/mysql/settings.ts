import { eq } from "drizzle-orm";
import type { openMySQL } from "./connector";
import { appSettings } from "./schema";
import { encryptValue,decryptValue } from "@/lib/runtime-config";
type Db=ReturnType<typeof openMySQL>["db"];

type SecretSetting="openai_api_key"|"mcp_read_token"|"mcp_write_token"|"admin_rest_token";
export function mysqlSettings(db:Db) {
  const read=async(key:string):Promise<string|undefined>=>{
    const rows=await db.select({value:appSettings.value}).from(appSettings)
      .where(eq(appSettings.key,key)).limit(1);
    return rows[0]?.value;
  };
  const write=async(key:string,value:string)=>{
    const now=new Date().toISOString();
    await db.insert(appSettings).values({key,value,updatedAt:now})
      .onDuplicateKeyUpdate({set:{value,updatedAt:now}});
  };
  const batch=async(items:Record<string,string>)=>{
    await db.transaction(async tx=>{
      for(const [key,value] of Object.entries(items)){
        const now=new Date().toISOString();
        await tx.insert(appSettings).values({key,value,updatedAt:now})
          .onDuplicateKeyUpdate({set:{value,updatedAt:now}});
      }
    });
  };
  const key=async(name:SecretSetting):Promise<string|undefined>=>{
    const value=await read(name);
    return value===undefined?(name==="openai_api_key"?process.env.OPENAI_API_KEY?.trim():
      name==="mcp_read_token"?process.env.NIHON_MCP_READ_TOKEN:
      name==="mcp_write_token"?process.env.NIHON_MCP_TOKEN:
      process.env.NIHON_ADMIN_TOKEN):
      value==="disabled"?undefined:decryptValue(value);
  };
  const storeKey=async(name:SecretSetting,value:string)=>{
    if(!value||value.length>4096)throw new Error("SECRET_INVALID");
    await write(name,encryptValue(value));
  };
  const revokeKey=async(name:SecretSetting)=>write(name,"disabled");
  const origin=async()=>await read("public_origin")||process.env.PUBLIC_ORIGIN?.trim();
  const adminHash=async()=>read("admin_password_hash");
  const signup=async()=>((await read("enable_signup"))??process.env.NIHON_ENABLE_SIGNUP)==="true";
  const model=async()=>await read("ai_model")||process.env.NIHON_AI_MODEL?.trim()||"gpt-4.1-mini";
  const dailyLimit=async()=>{
    const configured=Number((await read("ai_daily_limit"))??process.env.NIHON_AI_DAILY_LIMIT??10);
    return Number.isInteger(configured)&&configured>=1&&configured<=100?configured:10;
  };
  return {read,write,batch,key,storeKey,revokeKey,origin,adminHash,signup,model,dailyLimit};
}
