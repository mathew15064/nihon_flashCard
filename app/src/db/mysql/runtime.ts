import { openMySQL, mysqlConnectionSchema, testMySQLConnection } from "./connector";
import type { MysqlConnectionSettings } from "./connector";
import { readSetting, saveSecret, storedSecret, writeSetting } from "@/lib/runtime-config";

let opened:ReturnType<typeof openMySQL>|null=null;
export function activeMySQL(){return opened;}
export async function activateConfiguredMySQL():Promise<boolean>{
  if(readSetting("database_engine")!=="mysql")return false;
  const raw=storedSecret("mysql_connection");
  if(!raw)throw new Error("MYSQL_CONNECTION_CONFIG_MISSING");
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{throw new Error("MYSQL_CONNECTION_CONFIG_CORRUPT");}
  const input=mysqlConnectionSchema.parse(parsed);
  await testMySQLConnection(input);
  opened=openMySQL(input);
  return true;
}
export async function activateMySQL(input:MysqlConnectionSettings){
  if(opened)return;
  // Connection credentials are encrypted using the instance key and stay local.
  saveSecret("mysql_connection",JSON.stringify(input));
  writeSetting("database_engine","mysql");
  opened=openMySQL(input);
}
export async function shutdownMySQL(){
  const previous=opened;
  opened=null;
  await previous?.pool.end();
}

/** Metadata is safe for Admin Settings; no password is ever returned. */
export function currentMySQLConnection(){
  const raw=storedSecret("mysql_connection");
  if(!raw)throw new Error("MYSQL_CONNECTION_CONFIG_MISSING");
  let value:unknown;
  try{value=JSON.parse(raw);}catch{throw new Error("MYSQL_CONNECTION_CONFIG_CORRUPT");}
  return mysqlConnectionSchema.parse(value);
}
/**
 * Reconfigure MySQL credentials through authenticated Settings.
 * The target must carry the same Admin verifier; an unrelated empty database
 * must never silently replace the active learner/SRS database.
 */
export async function rotateMySQLConnection(raw:unknown):Promise<void>{
  const previous=opened;
  if(!previous)throw new Error("MYSQL_NOT_ACTIVE");
  const current=currentMySQLConnection();
  const updated=mysqlConnectionSchema.parse(raw);
  if(updated.database!==current.database)throw new Error("MYSQL_DATABASE_SWITCH_FORBIDDEN");
  await testMySQLConnection(updated);
  const candidate=openMySQL(updated);
  try{
    const {mysqlSettings}=await import("./settings");
    const [expected,actual]=await Promise.all([
      mysqlSettings(previous.db).adminHash(),
      mysqlSettings(candidate.db).adminHash(),
    ]);
    if(!expected||actual!==expected)throw new Error("MYSQL_ADMIN_IDENTITY_MISMATCH");
    const [rows]=await candidate.pool.query<import("mysql2").RowDataPacket[]>(
      "SELECT filename,status FROM schema_migrations"
    );
    if(!rows.length||rows.some(row=>row.status!=="applied"))
      throw new Error("MYSQL_MIGRATION_NOT_VERIFIED");
    saveSecret("mysql_connection",JSON.stringify(updated));
  }catch(error){
    await candidate.pool.end();
    throw error;
  }
  opened=candidate;
  await previous.pool.end();
}
