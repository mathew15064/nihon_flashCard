import { randomBytes, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Local zero-env boot: a stable 48-byte secret in the private SQLite volume,
 * then ordered, checksum-protected migrations. Do not silently regenerate lost
 * instance keys: the original key is needed to decrypt saved credentials.
 */
export function prepareLocalStorage():void {
  const file=resolve(process.env.DB_PATH || "./data/nihon.sqlite");
  const dir=dirname(file);
  mkdirSync(dir,{recursive:true,mode:0o700});
  if(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length<32)
    throw new Error("AUTH_SECRET_TOO_SHORT");
  if(!process.env.AUTH_SECRET){
    const keyFile=join(dir,"instance-secret.key");
    if(!existsSync(keyFile)){
      try{
        const fd=openSync(keyFile,"wx",0o600);
        try{writeFileSync(fd,randomBytes(48).toString("base64url")+"\n");}
        finally{closeSync(fd);}
      }catch(error){
        // Another trusted startup may have created it. Do not overwrite it.
        if(!(error instanceof Error && "code" in error && error.code==="EEXIST"))throw error;
      }
    }
    const details=lstatSync(keyFile);
    if(!details.isFile() || details.isSymbolicLink() || (details.mode&0o077)!==0)
      throw new Error("INSTANCE_KEY_PERMISSIONS_UNSAFE");
    const secret=readFileSync(keyFile,"utf8").trim();
    if(secret.length<32)throw new Error("INSTANCE_KEY_INVALID");
    process.env.AUTH_SECRET=secret;
  }
  const conn=new DatabaseSync(file);
  try {
    conn.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
    conn.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL
    )`);
    const migrationDir=resolve("src/db/migrations");
    const files=readdirSync(migrationDir).filter(n=>/^\d+_.*\.sql$/.test(n)).sort();
    for(const filename of files){
      const text=readFileSync(join(migrationDir,filename),"utf8");
      const sha=createHash("sha256").update(text).digest("hex");
      const prior=conn.prepare("SELECT checksum FROM schema_migrations WHERE filename=?")
        .get(filename) as {checksum:string}|undefined;
      if(prior){
        if(prior.checksum!==sha)throw new Error("MIGRATION_CHECKSUM_DRIFT");
        continue;
      }
      conn.exec("BEGIN IMMEDIATE");
      try{
        conn.exec(text);
        conn.prepare("INSERT INTO schema_migrations VALUES (?,?,?)")
          .run(filename,sha,new Date().toISOString());
        conn.exec("COMMIT");
      }catch(error){conn.exec("ROLLBACK");throw error;}
    }
  }finally{conn.close();}
  chmodSync(file,0o600);
}
