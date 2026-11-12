import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import mysql, { type ConnectionOptions } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { drizzle } from "drizzle-orm/mysql2";

export const mysqlConnectionSchema=z.object({
  host:z.string().trim().min(1).max(253)
    .regex(/^[a-z0-9.:-]+$/i, "MYSQL_HOST_INVALID"),
  port:z.number().int().min(1).max(65535).default(3306),
  database:z.string().min(1).max(64).regex(/^[a-zA-Z0-9_]+$/),
  user:z.string().min(1).max(128),
  password:z.string().max(4096),
  tls:z.enum(["required","off"]).default("required"),
}).strict();
export type MysqlConnectionSettings=z.infer<typeof mysqlConnectionSchema>;

function connectionOptions(input:MysqlConnectionSettings):ConnectionOptions {
  return {
    host:input.host,port:input.port,database:input.database,user:input.user,
    password:input.password,charset:"utf8mb4",timezone:"Z",
    connectTimeout:5000,
    ...(input.tls==="required"?{ssl:{rejectUnauthorized:true,minVersion:"TLSv1.2" as const}}:{}),
  };
}
export async function testMySQLConnection(raw:unknown) {
  const input=mysqlConnectionSchema.parse(raw);
  const connection=await mysql.createConnection(connectionOptions(input));
  try{
    const [rows]=await connection.query<RowDataPacket[]>(
      "SELECT DATABASE() AS name, VERSION() AS version, @@character_set_database AS charset, @@sql_mode AS sql_mode"
    );
    if(!rows[0] || rows[0].name!==input.database)throw new Error("MYSQL_DATABASE_MISMATCH");
    if(!String(rows[0].charset).startsWith("utf8mb4"))throw new Error("MYSQL_UTF8MB4_REQUIRED");
    return {connected:true,database:input.database,engine:"mysql",
      version:String(rows[0].version),tls:input.tls};
  }finally{await connection.end();}
}
const migrationDir=resolve("src/db/mysql/migrations");
function listMigrationFiles():{name:string;statements:string[];checksum:string}[]{
  const dirs=readdirSync(migrationDir,{withFileTypes:true})
    .filter(x=>x.isDirectory()).map(x=>x.name).sort();
  return dirs.map(name=>{
    const script=readFileSync(join(migrationDir,name,"migration.sql"),"utf8");
    const statements=script.split(/--> statement-breakpoint/).map(x=>x.trim()).filter(Boolean);
    if(!statements.length)throw new Error("MYSQL_MIGRATION_EMPTY");
    return {name,statements,
      checksum:createHash("sha256").update(script).digest("hex")};
  });
}
/**
 * Fresh-only native MySQL migration; never touch a nonempty schema with no Nihon
 * migration ledger. DDL isn't transactional on MySQL. Keep a persisted applying
 * marker and fail closed if any statement failed or a process crashed.
 */
export async function migrateFreshMySQL(raw:unknown):Promise<{migrations:number;tables:number}> {
  const input=mysqlConnectionSchema.parse(raw);
  const conn=await mysql.createConnection(connectionOptions(input));
  let hasLock=false;
  try {
    const [lockRows]=await conn.query<RowDataPacket[]>("SELECT GET_LOCK(?, 8) AS acquired",[
      "nihon:initialize:"+input.database,
    ]);
    if(lockRows[0]?.acquired!==1)throw new Error("MYSQL_MIGRATION_LOCK_BUSY");
    hasLock=true;
    const [existing]=await conn.query<RowDataPacket[]>(
      "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema=DATABASE()"
    );
    if(existing.length>0 && !existing.some(row=>row.name==="schema_migrations"))
      throw new Error("MYSQL_DATABASE_NOT_EMPTY");
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename varchar(191) PRIMARY KEY,
      checksum char(64) NOT NULL,
      status varchar(20) NOT NULL,
      applied_at varchar(32)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    const migrations=listMigrationFiles();
    for (const file of migrations){
      const [rows]=await conn.query<RowDataPacket[]>(
        "SELECT checksum,status FROM schema_migrations WHERE filename=?",[file.name]);
      if(rows.length){
        if(rows[0].checksum!==file.checksum||rows[0].status!=="applied")
          throw new Error("MYSQL_MIGRATION_STATE_REVIEW_REQUIRED");
        continue;
      }
      await conn.execute(
        "INSERT INTO schema_migrations (filename,checksum,status) VALUES(?,?,'applying')",
        [file.name,file.checksum],
      );
      // MySQL DDL commits independently. Do not retry after a partial failure:
      // the marker must be reviewed or restored from a verified backup.
      for(const statement of file.statements)await conn.query(statement);
      await conn.execute(
        "UPDATE schema_migrations SET status='applied',applied_at=? WHERE filename=?",
        [new Date().toISOString(),file.name],
      );
    }
    // Serialize signup and AI quota reservations across Fastify processes.
    // These fixed sentinel rows are never exposed as user settings.
    for(const key of ["__ai_reservation_lock__","__signup_reservation_lock__"]){
      await conn.execute(
        "INSERT INTO app_settings (`key`,value,updated_at) VALUES(?,?,?) "+
        "ON DUPLICATE KEY UPDATE `key`=`key`",
        [key,"1",new Date().toISOString()],
      );
    }
    const [tables]=await conn.query<RowDataPacket[]>(
      "SELECT count(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE()");
    return {migrations:migrations.length,tables:Number(tables[0]?.n||0)};
  }finally{
    if(hasLock)await conn.query("SELECT RELEASE_LOCK(?)",["nihon:initialize:"+input.database]).catch(()=>{});
    await conn.end();
  }
}
export function openMySQL(raw:unknown){
  const config=mysqlConnectionSchema.parse(raw);
  const pool=mysql.createPool({...connectionOptions(config),waitForConnections:true,
    connectionLimit:8,queueLimit:100,multipleStatements:false});
  return {db:drizzle({client:pool}),pool};
}
