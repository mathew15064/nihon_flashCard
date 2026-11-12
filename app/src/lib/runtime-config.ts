import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Avoid touching the domain DB when a provider is unit-tested in isolation. */
function settingsPath():string { return resolve(process.env.DB_PATH||"./data/nihon.sqlite"); }

export type SettingName =
  "database_engine" | "mysql_connection" | "admin_password_hash" | "public_origin" | "enable_signup" |
  "ai_model" | "ai_daily_limit" | "openai_api_key" |
  "mcp_read_token" | "mcp_write_token" | "admin_rest_token";

export function readSetting(key:SettingName):string|undefined {
  const path=settingsPath();
  if(!existsSync(path))return undefined;
  const sqlite=new DatabaseSync(path,{readOnly:true});
  try {
    sqlite.exec("PRAGMA query_only=ON");
    return (sqlite.prepare("SELECT value FROM app_settings WHERE key=?")
      .get(key) as {value:string}|undefined)?.value;
  } catch (error) {
    // Old isolated fixtures may not yet include the settings table.
    if(error instanceof Error && /no such table: app_settings/.test(error.message))
      return undefined;
    throw error;
  }finally{sqlite.close();}
}
export function writeSetting(key:SettingName,value:string):void {
  const path=settingsPath();
  if(!existsSync(path))throw new Error("SETTINGS_DB_NOT_INITIALIZED");
  const sqlite=new DatabaseSync(path);
  try{
    sqlite.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) "+
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .run(key,value,new Date().toISOString());
  }finally{sqlite.close();}
}
export function eraseSetting(key:SettingName):void {
  const path=settingsPath();
  if(!existsSync(path))throw new Error("SETTINGS_DB_NOT_INITIALIZED");
  const sqlite=new DatabaseSync(path);
  try{sqlite.prepare("DELETE FROM app_settings WHERE key=?").run(key);}
  finally{sqlite.close();}
}

/** Derive a dedicated encryption key from the private, persistent instance secret. */
function encryptionKey():Buffer {
  const secret=process.env.AUTH_SECRET;
  if(!secret || secret.length<32)throw new Error("INSTANCE_SECRET_UNAVAILABLE");
  return Buffer.from(hkdfSync("sha256",Buffer.from(secret),"nihon-settings-v1","settings-at-rest",32));
}
export function encryptValue(plaintext:string):string {
  const iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const output=Buffer.concat([cipher.update(plaintext,"utf8"),cipher.final()]);
  return ["enc1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),output.toString("base64url")].join(".");
}
export function decryptValue(value:string):string {
  const parts=value.split(".");
  if(parts.length!==4 || parts[0]!=="enc1")throw new Error("SETTINGS_CIPHERTEXT_INVALID");
  try {
    const iv=Buffer.from(parts[1]!,"base64url");
    const tag=Buffer.from(parts[2]!,"base64url");
    if(iv.length!==12 || tag.length!==16)throw new Error("SETTINGS_CIPHERTEXT_INVALID");
    const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(parts[3]!,"base64url")),decipher.final()]).toString("utf8");
  }catch{throw new Error("SETTINGS_DECRYPT_FAILED");}
}
export function storedSecret(key:"openai_api_key"|"mcp_read_token"|"mcp_write_token"|"admin_rest_token"|"mysql_connection"):string|undefined {
  const value=readSetting(key);
  return value && value!=="disabled"?decryptValue(value):undefined;
}
export function saveSecret(key:"openai_api_key"|"mcp_read_token"|"mcp_write_token"|"admin_rest_token"|"mysql_connection",value:string):void {
  if(!value || value.length>4096)throw new Error("SECRET_INVALID");
  writeSetting(key,encryptValue(value));
}
export function adminPasswordHash():string|undefined {
  return readSetting("admin_password_hash") || process.env.NIHON_ADMIN_PASSWORD_HASH;
}
export function publicOrigin():string|undefined {
  return readSetting("public_origin") || process.env.PUBLIC_ORIGIN?.trim();
}
export function signupEnabledByConfig():boolean {
  return (readSetting("enable_signup") ?? process.env.NIHON_ENABLE_SIGNUP)==="true" &&
    Boolean(process.env.AUTH_SECRET);
}
export function aiModel():string {
  return readSetting("ai_model") || process.env.NIHON_AI_MODEL?.trim() || "gpt-4.1-mini";
}
export function aiDailyLimit():number {
  const configured=Number(readSetting("ai_daily_limit") ?? process.env.NIHON_AI_DAILY_LIMIT ?? "10");
  return Number.isInteger(configured) && configured>=1 && configured<=100?configured:10;
}
export function openaiKey():string|undefined {
  const stored=readSetting("openai_api_key");
  return stored=== "disabled" ? undefined :
    stored ? decryptValue(stored) : process.env.OPENAI_API_KEY?.trim();
}
export function mcpToken(scope:"read"|"write"):string|undefined {
  const setting=scope==="read"?"mcp_read_token":"mcp_write_token";
  const stored=readSetting(setting);
  return stored==="disabled" ? undefined :
    stored ? decryptValue(stored) :
    process.env[scope==="read"?"NIHON_MCP_READ_TOKEN":"NIHON_MCP_TOKEN"];
}
export function adminRestToken():string|undefined {
  const stored=readSetting("admin_rest_token");
  return stored==="disabled" ? undefined :
    stored ? decryptValue(stored) : process.env.NIHON_ADMIN_TOKEN;
}
