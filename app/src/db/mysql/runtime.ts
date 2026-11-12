import { openMySQL, mysqlConnectionSchema, testMySQLConnection } from "./connector";
import type { MysqlConnectionSettings } from "./connector";
import { readEncryptedConnection,writeEncryptedConnection } from "@/lib/mysql-local-config";

let opened:ReturnType<typeof openMySQL>|null=null;
export function activeMySQL(){return opened;}
export async function activateConfiguredMySQL():Promise<boolean>{
  const raw=readEncryptedConnection();
  if(!raw)return false;
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{throw new Error("MYSQL_CONNECTION_CONFIG_CORRUPT");}
  const input=mysqlConnectionSchema.parse(parsed);
  await testMySQLConnection(input);
  const candidate=openMySQL(input);
  try{
    const {mysqlSettings}=await import("./settings");
    if(!await mysqlSettings(candidate.db).adminHash())
      throw new Error("MYSQL_ADMIN_NOT_INITIALIZED");
  }catch(error){await candidate.pool.end();throw error;}
  opened=candidate;
  return true;
}
export async function activateMySQL(raw:MysqlConnectionSettings){
  if(opened)throw new Error("MYSQL_ALREADY_ACTIVE");
  const config=mysqlConnectionSchema.parse(raw);
  const candidate=openMySQL(config);
  try{
    const {mysqlSettings}=await import("./settings");
    if(!await mysqlSettings(candidate.db).adminHash())
      throw new Error("MYSQL_ADMIN_NOT_INITIALIZED");
    writeEncryptedConnection(JSON.stringify(config));
  }catch(error){await candidate.pool.end();throw error;}
  opened=candidate;
}
export async function shutdownMySQL(){
  const previous=opened;
  opened=null;
  await previous?.pool.end();
}
/** Only in-memory credentials; never return the password in a GET API. */
export function currentMySQLConnection():MysqlConnectionSettings{
  const raw=readEncryptedConnection();
  if(!raw)throw new Error("MYSQL_CONNECTION_CONFIG_MISSING");
  let value:unknown;
  try{value=JSON.parse(raw);}catch{throw new Error("MYSQL_CONNECTION_CONFIG_CORRUPT");}
  return mysqlConnectionSchema.parse(value);
}
/**
 * Rotate credentials without changing the current database or Admin identity.
 * Persist encrypted credentials before activating the replacement pool.
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
    writeEncryptedConnection(JSON.stringify(updated));
  }catch(error){await candidate.pool.end();throw error;}
  opened=candidate;
  await previous.pool.end();
}
