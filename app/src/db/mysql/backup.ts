import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { appendFile, open, readFile, unlink } from "node:fs/promises";
import { join,resolve } from "node:path";
import { dataDirectory } from "@/lib/bootstrap-storage";
import { createGzip, createGunzip, gunzipSync } from "node:zlib";
import { Readable, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { pipeline } from "node:stream/promises";
import type { RowDataPacket } from "mysql2";
import mysql from "mysql2/promise";
import { mysqlConnectionSchema, type MysqlConnectionSettings } from "./connector";

const MAGIC=Buffer.from("NIHONMYSQLBACKUP1");
const ID=/^mysql-\d{8}-[a-f0-9]{24}\.nihonbak$/;
const BATCH=250;
const MAX_ROWS=100_000;
const MAX_BYTES=128*1024*1024;
const MAX_LINE=4*1024*1024;
const TAG_SIZE=16;

type TableSpec={name:string;columns:string[];primary:string[]};
type Header={kind:"nihon-mysql-backup";version:1;createdAt:string;
  tables:TableSpec[];migrations:{filename:string;checksum:string}[]};
type BackupInfo={id:string;bytes:number;createdAt:string};
type Report={verified:true;tables:number;rows:number;bytes:number;sha256:string};

function encryptionKey():Buffer {
  const secret=process.env.AUTH_SECRET;
  if(!secret||secret.length<32)throw new Error("INSTANCE_SECRET_UNAVAILABLE");
  return Buffer.from(hkdfSync("sha256",Buffer.from(secret),
    "nihon-mysql-backup-v1","mysql-backup-aes256gcm",32));
}
function quote(id:string){
  if(!/^[a-z][a-z0-9_]*$/.test(id))throw new Error("MYSQL_BACKUP_SCHEMA_INVALID");
  return "`"+id+"`";
}
function privateDir():string{
  const dir=join(dataDirectory(),"mysql-backups");
  mkdirSync(dir,{recursive:true,mode:0o700});
  const stats=lstatSync(dir);
  if(!stats.isDirectory()||(stats.mode&0o077)!==0)
    throw new Error("MYSQL_BACKUP_DIRECTORY_PERMISSIONS");
  return dir;
}
function backupPath(id:string):string{
  if(!ID.test(id))throw new Error("MYSQL_BACKUP_ID_INVALID");
  const path=join(privateDir(),id);
  if(!existsSync(path))throw new Error("MYSQL_BACKUP_NOT_FOUND");
  const stat=lstatSync(path);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
    throw new Error("MYSQL_BACKUP_FILE_UNSAFE");
  return path;
}
export function listMySQLBackups():BackupInfo[]{
  const dir=privateDir();
  return readdirSync(dir).filter(name=>ID.test(name)).flatMap(id=>{
    try{
      const s=lstatSync(join(dir,id));
      return s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o077)===0
        ? [{id,bytes:s.size,createdAt:s.birthtime.toISOString()}]:[];
    }catch{return [];}
  }).sort((a,b)=>b.id.localeCompare(a.id)).slice(0,100);
}
export function downloadableMySQLBackup(id:string){
  const path=backupPath(id);
  return {path,size:statSync(path).size};
}
export async function deleteLocalMySQLBackup(id:string):Promise<void>{
  const path=backupPath(id);
  // Only one whitelisted regular file inside the private backup directory.
  await unlink(path);
}

function migrationFiles(){
  const root=resolve("src/db/mysql/migrations");
  const dirs=readdirSync(root,{withFileTypes:true})
    .filter(x=>x.isDirectory()).map(x=>x.name).sort();
  if(!dirs.length)throw new Error("MYSQL_BACKUP_MIGRATIONS_UNAVAILABLE");
  return dirs.map(filename=>({
    filename,checksum:createHash("sha256")
      .update(readFileSync(join(root,filename,"migration.sql"))).digest("hex"),
  }));
}
async function schemaMetadata(conn:import("mysql2/promise").Connection,
  database:string):Promise<TableSpec[]>{
  const [rows]=await conn.query<RowDataPacket[]>(`SELECT table_name AS name,
    column_name AS col,is_nullable AS nullable,ordinal_position AS pos,column_key AS colKey
    FROM information_schema.columns WHERE table_schema=? ORDER BY table_name,ordinal_position`,[database]);
  const tables:TableSpec[]=[];
  for(const row of rows){
    const name=String(row.name),column=String(row.col);
    quote(name);quote(column);
    let spec=tables[tables.length-1];
    if(!spec||spec.name!==name){
      spec={name,columns:[],primary:[]};
      tables.push(spec);
    }
    spec.columns.push(column);
  }
  // Primary keys may be compound; order exactly as declared in the index.
  const [pkRows]=await conn.query<RowDataPacket[]>(`SELECT table_name AS name,
    column_name AS col FROM information_schema.statistics
    WHERE table_schema=? AND index_name='PRIMARY'
    ORDER BY table_name,seq_in_index`,[database]);
  for(const row of pkRows){
    const name=String(row.name),col=String(row.col);
    const spec=tables.find(t=>t.name===name);
    if(spec)spec.primary.push(col);
  }
  if(tables.length<15||tables.some(t=>!t.primary.length||!t.columns.length))
    throw new Error("MYSQL_BACKUP_SCHEMA_INVALID");
  return tables;
}

/** Consistent MVCC snapshot, gzip + AES-256-GCM, 0600 protected local file. */
export async function createMySQLBackup(raw:MysqlConnectionSettings):
  Promise<BackupInfo & Report>{
  const config=mysqlConnectionSchema.parse(raw);
  const connection=await mysql.createConnection({
    host:config.host,port:config.port,database:config.database,
    user:config.user,password:config.password,charset:"utf8mb4",
    connectTimeout:5000,timezone:"Z",
    ...(config.tls==="required"?{ssl:{rejectUnauthorized:true,minVersion:"TLSv1.2"}}:{}),
  });
  // Never prune automatically: fail closed instead of deleting an operator backup.
  if(listMySQLBackups().length>=20)throw new Error("MYSQL_BACKUP_RETENTION_LIMIT");
  const id="mysql-"+new Date().toISOString().slice(0,10).replaceAll("-","")+"-"+
    randomBytes(12).toString("hex")+".nihonbak";
  const path=join(privateDir(),id);
  let created=false;
  let locked=false;
  let started=false;
  try{
    const [lock]=await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?,8) AS acquired",
      ["nihon:initialize:"+config.database]);
    if(lock[0]?.acquired!==1)throw new Error("MYSQL_BACKUP_MIGRATION_LOCK_BUSY");
    locked=true;
    await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
    started=true;
    const expected=migrationFiles();
    const [applied]=await connection.query<RowDataPacket[]>(
      "SELECT filename,checksum,status FROM schema_migrations ORDER BY filename");
    if(applied.length!==expected.length||applied.some((row,i)=>
      row.filename!==expected[i]?.filename ||
      row.checksum!==expected[i]?.checksum || row.status!=="applied"))
      throw new Error("MYSQL_BACKUP_MIGRATIONS_MISMATCH");
    const tables=await schemaMetadata(connection,config.database);
    const expectedNames=new Set(["schema_migrations"]);
    // Include all native, known Nihon tables; reject unexpected tables.
    const ddl=expected.map(m=>readFileSync(join(resolve("src/db/mysql/migrations"),
      m.filename,"migration.sql"),"utf8")).join("\n");
    for(const match of ddl.matchAll(/CREATE TABLE `([a-z][a-z0-9_]*)`/g))
      expectedNames.add(match[1]!);
    if(tables.length!==expectedNames.size||tables.some(t=>!expectedNames.has(t.name)))
      throw new Error("MYSQL_BACKUP_UNEXPECTED_SCHEMA");

    const fd=await open(path,"wx",0o600);
    created=true;
    const iv=randomBytes(12);
    try{await fd.write(Buffer.concat([MAGIC,iv]));}finally{await fd.close();}
    const cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
    cipher.setAAD(MAGIC);
    const digest=createHash("sha256");
    let rows=0,bytes=0;
    const header:Header={
      kind:"nihon-mysql-backup",version:1,
      createdAt:new Date().toISOString(),tables,migrations:expected,
    };
    async function* lines():AsyncGenerator<Buffer>{
      function line(data:unknown){
        const line=Buffer.from(JSON.stringify(data)+"\n");
        bytes+=line.length;
        if(line.length>MAX_LINE||bytes>MAX_BYTES)
          throw new Error("MYSQL_BACKUP_SIZE_LIMIT");
        digest.update(line);
        return line;
      }
      yield line(header);
      for(const table of tables){
        let offset=0;
        const fields=table.columns.map(quote).join(",");
        const ordering=table.primary.map(quote).join(",");
        for(;;){
          const [result]=await connection.query<RowDataPacket[]>(
            "SELECT "+fields+" FROM "+quote(table.name)+" ORDER BY "+ordering+
            " LIMIT ? OFFSET ?",[BATCH,offset]);
          if(result.length===0)break;
          for(const record of result){
            rows++;
            if(rows>MAX_ROWS)throw new Error("MYSQL_BACKUP_ROW_LIMIT");
            const values=table.columns.map(key=>{
              const value=record[key] as unknown;
              return Buffer.isBuffer(value)?{$binary:value.toString("base64")}:value;
            });
            yield line({table:table.name,values});
          }
          offset+=result.length;
          if(result.length<BATCH)break;
        }
      }
      const checksum=digest.digest("hex");
      const footer=Buffer.from(JSON.stringify({kind:"end",rows,bytes,sha256:checksum})+"\n");
      yield footer;
    }
    await pipeline(Readable.from(lines()),createGzip({level:6}),cipher,
      createWriteStream(path,{flags:"a",mode:0o600}));
    await appendFile(path,cipher.getAuthTag());
    await connection.query("COMMIT");
    started=false;
    const result=await verifyMySQLBackup(id);
    return {...result,id,createdAt:header.createdAt};
  }catch(error){
    if(created)await unlink(path).catch(()=>{});
    throw error;
  }finally{
    if(started)await connection.query("ROLLBACK").catch(()=>{});
    if(locked)await connection.query("SELECT RELEASE_LOCK(?)",
      ["nihon:initialize:"+config.database]).catch(()=>{});
    await connection.end();
  }
}

/** Read-only authentication, integrity and completeness verification. */
export async function verifyMySQLBackup(id:string):Promise<Report>{
  const path=backupPath(id);
  const size=statSync(path).size;
  if(size<MAGIC.length+12+TAG_SIZE+10)throw new Error("MYSQL_BACKUP_INVALID");
  const fd=await open(path,"r");
  let iv:Buffer,tag:Buffer;
  try{
    const prefix=Buffer.alloc(MAGIC.length+12);
    const tail=Buffer.alloc(TAG_SIZE);
    if((await fd.read(prefix,0,prefix.length,0)).bytesRead!==prefix.length ||
       (await fd.read(tail,0,TAG_SIZE,size-TAG_SIZE)).bytesRead!==TAG_SIZE)
      throw new Error("MYSQL_BACKUP_TRUNCATED");
    if(!prefix.subarray(0,MAGIC.length).equals(MAGIC))
      throw new Error("MYSQL_BACKUP_INVALID");
    iv=prefix.subarray(MAGIC.length);
    tag=tail;
  }finally{await fd.close();}
  const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  const digest=createHash("sha256");
  let header:Header|undefined,footer:Record<string,unknown>|undefined;
  let rows=0,bytes=0,buffer="",lineNumber=0;
  const decoder=new StringDecoder("utf8");
  const checkLine=(line:string)=>{
    if(!line)return;
    lineNumber++;
    const length=Buffer.byteLength(line+"\n");
    if(length>MAX_LINE)throw new Error("MYSQL_BACKUP_LINE_LIMIT");
    let parsed:unknown;
    try{parsed=JSON.parse(line);}catch{throw new Error("MYSQL_BACKUP_JSON_INVALID");}
    if(!parsed||typeof parsed!=="object")throw new Error("MYSQL_BACKUP_JSON_INVALID");
    const record=parsed as Record<string,unknown>;
    if(record.kind==="end"){
      if(!header||footer)throw new Error("MYSQL_BACKUP_FOOTER_INVALID");
      footer=record;
      return;
    }
    if(footer)throw new Error("MYSQL_BACKUP_TRAILING_DATA");
    bytes+=length;
    if(bytes>MAX_BYTES)throw new Error("MYSQL_BACKUP_SIZE_LIMIT");
    digest.update(line+"\n");
    if(lineNumber===1){
      const h=record as unknown as Header;
      if(h.kind!=="nihon-mysql-backup"||h.version!==1||
         !Array.isArray(h.tables)||h.tables.length<15||
         !Array.isArray(h.migrations))throw new Error("MYSQL_BACKUP_HEADER_INVALID");
      header=h;return;
    }
    if(!header||typeof record.table!=="string"||!Array.isArray(record.values))
      throw new Error("MYSQL_BACKUP_ROW_INVALID");
    const table=header.tables.find(t=>t.name===record.table);
    if(!table||table.columns.length!==record.values.length)
      throw new Error("MYSQL_BACKUP_ROW_INVALID");
    rows++;
    if(rows>MAX_ROWS)throw new Error("MYSQL_BACKUP_ROW_LIMIT");
  };
  const sink=new Writable({write(chunk:Buffer,_encoding,callback){
    try{
      buffer+=decoder.write(chunk);
      if(Buffer.byteLength(buffer)>MAX_LINE+128*1024)
        throw new Error("MYSQL_BACKUP_LINE_LIMIT");
      let index:number;
      while((index=buffer.indexOf("\n"))!==-1){
        checkLine(buffer.slice(0,index));
        buffer=buffer.slice(index+1);
      }
      callback();
    }catch(error){callback(error as Error);}
  }});
  await pipeline(createReadStream(path,{start:MAGIC.length+12,end:size-TAG_SIZE-1}),
    decipher,createGunzip(),sink);
  buffer+=decoder.end();
  if(buffer.length||!header||!footer||footer.rows!==rows||
    footer.bytes!==bytes||footer.sha256!==digest.digest("hex"))
    throw new Error("MYSQL_BACKUP_CHECKSUM_MISMATCH");
  return {verified:true,tables:header.tables.length,rows,bytes:size,
    sha256:String(footer.sha256)};
}

/**
 * Strictly bounded in-memory decoding for a staging-only restore exercise.
 * The regular streaming backup/verify path supports larger snapshots.
 * This helper authenticates the entire GCM archive *before* yielding any rows.
 */
export async function loadMySQLBackupForStaging(id:string){
  const info=downloadableMySQLBackup(id);
  const LIMIT=32*1024*1024;
  if(info.size>LIMIT)throw new Error("MYSQL_STAGE_BACKUP_TOO_LARGE");
  const archive=await readFile(info.path);
  if(archive.length<MAGIC.length+12+TAG_SIZE+10 ||
     !archive.subarray(0,MAGIC.length).equals(MAGIC))
    throw new Error("MYSQL_BACKUP_INVALID");
  const iv=archive.subarray(MAGIC.length,MAGIC.length+12);
  const tag=archive.subarray(archive.length-TAG_SIZE);
  const decoder=createDecipheriv("aes-256-gcm",encryptionKey(),iv);
  decoder.setAAD(MAGIC);
  decoder.setAuthTag(tag);
  let raw:Buffer;
  try{
    const zip=Buffer.concat([decoder.update(archive.subarray(
      MAGIC.length+12,archive.length-TAG_SIZE)),decoder.final()]);
    raw=gunzipSync(zip,{maxOutputLength:LIMIT});
  }catch{throw new Error("MYSQL_BACKUP_AUTHENTICATION_FAILED");}
  let header:Header|undefined,footer:Record<string,unknown>|undefined;
  const records=new Map<string,unknown[][]>();
  const digest=createHash("sha256");
  let count=0,bytes=0,position=0;
  while(position<raw.length){
    const end=raw.indexOf(10,position);
    if(end<0)throw new Error("MYSQL_BACKUP_TRUNCATED");
    const line=raw.subarray(position,end);
    if(line.length>MAX_LINE)throw new Error("MYSQL_BACKUP_LINE_LIMIT");
    const text=line.toString("utf8");
    let value:unknown;
    try{value=JSON.parse(text);}catch{throw new Error("MYSQL_BACKUP_JSON_INVALID");}
    if(!value||typeof value!=="object")throw new Error("MYSQL_BACKUP_JSON_INVALID");
    const row=value as Record<string,unknown>;
    if(row.kind==="end"){
      if(footer||!header)throw new Error("MYSQL_BACKUP_FOOTER_INVALID");
      footer=row;
    }else{
      if(footer)throw new Error("MYSQL_BACKUP_TRAILING_DATA");
      digest.update(raw.subarray(position,end+1));
      bytes+=line.length+1;
      if(!header){
        const first=row as unknown as Header;
        if(first.kind!=="nihon-mysql-backup"||first.version!==1||
          !Array.isArray(first.tables)||first.tables.length<15)
          throw new Error("MYSQL_BACKUP_HEADER_INVALID");
        header=first;
        for(const table of header.tables){
          quote(table.name);
          if(!Array.isArray(table.columns)||!Array.isArray(table.primary))
            throw new Error("MYSQL_BACKUP_HEADER_INVALID");
          for(const column of table.columns)quote(column);
          records.set(table.name,[]);
        }
      }else{
        if(typeof row.table!=="string"||!Array.isArray(row.values)||
          !records.has(row.table))throw new Error("MYSQL_BACKUP_ROW_INVALID");
        const table=header.tables.find(t=>t.name===row.table)!;
        if(table.columns.length!==row.values.length)
          throw new Error("MYSQL_BACKUP_ROW_INVALID");
        records.get(row.table)!.push(row.values);
        count++;
        if(count>25_000)throw new Error("MYSQL_STAGE_ROW_LIMIT");
      }
    }
    position=end+1;
  }
  if(!header||!footer||footer.rows!==count||footer.bytes!==bytes||
    footer.sha256!==digest.digest("hex"))
    throw new Error("MYSQL_BACKUP_CHECKSUM_MISMATCH");
  return {header,records,rows:count};
}
