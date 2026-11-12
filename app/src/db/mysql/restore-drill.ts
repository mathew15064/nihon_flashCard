import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { mysqlConnectionSchema, migrateFreshMySQL, openMySQL, testMySQLConnection,
  type MysqlConnectionSettings } from "./connector";
import { loadMySQLBackupForStaging, verifyMySQLBackup } from "./backup";

const STAGING=/^nihon_restore_[a-z0-9_]{3,40}$/;
function quote(name:string){
  if(!/^[a-z][a-z0-9_]*$/.test(name))
    throw new Error("MYSQL_STAGE_IDENTIFIER_INVALID");
  return "`"+name+"`";
}
function digestRows(rows:unknown[][]){
  const sha=createHash("sha256");
  for(const values of rows)sha.update(JSON.stringify(values)+"\n");
  return sha.digest("hex");
}
function serialized(value:unknown){
  return Buffer.isBuffer(value)?{$binary:value.toString("base64")}:value;
}
function fromSnapshot(value:unknown){
  if(value&&typeof value==="object"&&!Array.isArray(value)&&
    Object.keys(value).length===1&&typeof (value as {$binary?:unknown}).$binary==="string"){
    return Buffer.from((value as {$binary:string}).$binary,"base64");
  }
  return value;
}

/**
 * A staging-only restore rehearsal. NEVER switches the active application
 * database or writes to the live schema. Target must be an existing and
 * completely empty database with a reserved 'nihon_restore_' prefix.
 *
 * MySQL DDL cannot be rolled back. A failed staging restore can leave its
 * private test schema partially initialized; the operator must inspect it.
 */
export async function rehearseMySQLRestore(
  archiveId:string,sourceRaw:MysqlConnectionSettings,targetName:string,
):Promise<{restored:true;database:string;tables:number;rows:number;verified:true}>{
  const source=mysqlConnectionSchema.parse(sourceRaw);
  if(!STAGING.test(targetName)||targetName===source.database)
    throw new Error("MYSQL_STAGE_TARGET_INVALID");
  // Authentication and integrity are checked *before* any staging DDL.
  await verifyMySQLBackup(archiveId);
  const snapshot=await loadMySQLBackupForStaging(archiveId);
  const target=mysqlConnectionSchema.parse({...source,database:targetName});
  await testMySQLConnection(target);
  const check=openMySQL(target);
  try{
    const [existing]=await check.pool.query<RowDataPacket[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE()");
    if(existing.length)throw new Error("MYSQL_STAGE_TARGET_NOT_EMPTY");
  }finally{await check.pool.end();}

  // This creates tables only in the target (never in the live MySQL schema).
  await migrateFreshMySQL(target);
  const engine=openMySQL(target);
  const conn=await engine.pool.getConnection();
  let inTransaction=false;
  try{
    const [metadata]=await conn.query<RowDataPacket[]>(`SELECT table_name AS name,
      column_name AS col FROM information_schema.columns
      WHERE table_schema=DATABASE() ORDER BY table_name,ordinal_position`);
    const actual=new Map<string,string[]>();
    for(const row of metadata){
      const name=String(row.name),col=String(row.col);
      quote(name);quote(col);
      if(!actual.has(name))actual.set(name,[]);
      actual.get(name)!.push(col);
    }
    if(actual.size!==snapshot.header.tables.length)
      throw new Error("MYSQL_STAGE_SCHEMA_MISMATCH");
    for(const table of snapshot.header.tables){
      if(JSON.stringify(actual.get(table.name))!==JSON.stringify(table.columns))
        throw new Error("MYSQL_STAGE_SCHEMA_MISMATCH");
    }
    const [migrations]=await conn.query<RowDataPacket[]>(
      "SELECT filename,checksum,status FROM schema_migrations ORDER BY filename");
    if(migrations.length!==snapshot.header.migrations.length||
      migrations.some((m,i)=>m.filename!==snapshot.header.migrations[i]?.filename||
        m.checksum!==snapshot.header.migrations[i]?.checksum||
        m.status!=="applied"))
      throw new Error("MYSQL_STAGE_MIGRATIONS_MISMATCH");

    const [references]=await conn.query<RowDataPacket[]>(`SELECT
      table_name AS child, referenced_table_name AS parent
      FROM information_schema.key_column_usage
      WHERE table_schema=DATABASE() AND referenced_table_name IS NOT NULL`);
    const parents=new Map<string,Set<string>>();
    for(const name of actual.keys())parents.set(name,new Set());
    for(const ref of references){
      const child=String(ref.child),parent=String(ref.parent);
      if(actual.has(child)&&actual.has(parent)&&child!==parent)
        parents.get(child)!.add(parent);
    }
    const order:string[]=[];
    const visiting=new Set<string>(),visited=new Set<string>();
    const visit=(name:string)=>{
      if(visited.has(name))return;
      if(visiting.has(name))throw new Error("MYSQL_STAGE_FK_CYCLE");
      visiting.add(name);
      for(const parent of parents.get(name)||[])visit(parent);
      visiting.delete(name);visited.add(name);order.push(name);
    };
    for(const name of [...actual.keys()].sort())visit(name);

    // Only the known migration ledger + two bootstrap lock rows may be nonempty.
    for(const name of order){
      if(name==="schema_migrations")continue;
      if(name==="app_settings"){
        const [settings]=await conn.query<RowDataPacket[]>(
          "SELECT `key` AS name FROM app_settings ORDER BY `key`");
        if(JSON.stringify(settings.map(x=>x.name))!==JSON.stringify([
          "__ai_reservation_lock__","__signup_reservation_lock__",
        ]))throw new Error("MYSQL_STAGE_TARGET_NOT_EMPTY");
      }else{
        const [count]=await conn.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS n FROM "+quote(name));
        if(Number(count[0]?.n)!==0)throw new Error("MYSQL_STAGE_TARGET_NOT_EMPTY");
      }
    }

    await conn.beginTransaction();
    inTransaction=true;
    // These exact rows were generated by the fresh-only migration runner.
    await conn.query("DELETE FROM app_settings WHERE `key` IN (?,?)",
      ["__ai_reservation_lock__","__signup_reservation_lock__"]);
    await conn.query("DELETE FROM schema_migrations");
    let total=0;
    for(const name of order){
      const columns=actual.get(name)!;
      const rows=snapshot.records.get(name);
      if(!rows)throw new Error("MYSQL_STAGE_SCHEMA_MISMATCH");
      for(let offset=0;offset<rows.length;offset+=50){
        const batch=rows.slice(offset,offset+50);
        const params=batch.flatMap(values=>values.map(fromSnapshot));
        const placeholders="("+columns.map(()=>"?").join(",")+")";
        await conn.query("INSERT INTO "+quote(name)+" ("+
          columns.map(quote).join(",")+") VALUES "+
          batch.map(()=>placeholders).join(","),params);
      }
      total+=rows.length;
    }
    // Compare *every* table's row content, not just MySQL integrity or counts.
    for(const table of snapshot.header.tables){
      const saved=snapshot.records.get(table.name)!;
      const ordering=table.primary.map(quote).join(",");
      const columns=table.columns.map(quote).join(",");
      if(!ordering)throw new Error("MYSQL_STAGE_SCHEMA_MISMATCH");
      const restored:unknown[][]=[];
      for(let offset=0;;offset+=250){
        const [rows]=await conn.query<RowDataPacket[]>(
          "SELECT "+columns+" FROM "+quote(table.name)+
          " ORDER BY "+ordering+" LIMIT ? OFFSET ?",[250,offset]);
        for(const row of rows)restored.push(table.columns.map(c=>serialized(row[c])));
        if(rows.length<250)break;
      }
      if(restored.length!==saved.length||
        digestRows(restored)!==digestRows(saved))
        throw new Error("MYSQL_STAGE_ROW_CONTENT_MISMATCH");
    }
    if(total!==snapshot.rows)throw new Error("MYSQL_STAGE_ROW_COUNT_MISMATCH");
    await conn.commit();
    inTransaction=false;
    return {restored:true,database:targetName,tables:order.length,
      rows:total,verified:true};
  }catch(error){
    if(inTransaction)await conn.rollback().catch(()=>{});
    throw error;
  }finally{
    conn.release();
    await engine.pool.end();
  }
}
