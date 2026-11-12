import { randomBytes } from "node:crypto";
import { chmodSync,closeSync,existsSync,lstatSync,mkdirSync,openSync,
  readFileSync,writeFileSync } from "node:fs";
import { join,resolve } from "node:path";

/**
 * MySQL-only zero-env bootstrap: the sole local state is a private instance
 * secret and encrypted MySQL connection settings. No SQLite file is created.
 */
export function dataDirectory():string{
  return resolve(process.env.NIHON_DATA_DIR||"./data");
}
export function prepareLocalStorage():void{
  const dir=dataDirectory();
  if(existsSync(dir)){
    const stats=lstatSync(dir);
    if(!stats.isDirectory()||stats.isSymbolicLink())
      throw new Error("NIHON_DATA_DIRECTORY_UNSAFE");
  }else mkdirSync(dir,{recursive:true,mode:0o700});
  chmodSync(dir,0o700);
  // Never reinterpret a prior SQLite installation as a fresh MySQL install.
  const legacy=["nihon.sqlite","nihon.sqlite-wal","nihon.sqlite-shm","app.db"];
  if(legacy.some(name=>existsSync(join(dir,name)))||
    (process.env.DB_PATH&&existsSync(resolve(process.env.DB_PATH))))
    throw new Error("LEGACY_SQLITE_INSTALLATION_REQUIRES_MANUAL_MIGRATION");
  if(process.env.AUTH_SECRET&&process.env.AUTH_SECRET.length<32)
    throw new Error("AUTH_SECRET_TOO_SHORT");
  const file=join(dir,"instance-secret.key");
  if(!process.env.AUTH_SECRET){
    if(!existsSync(file)){
      try{
        const fd=openSync(file,"wx",0o600);
        try{writeFileSync(fd,randomBytes(48).toString("base64url")+"\n");}
        finally{closeSync(fd);}
      }catch(error){
        if(!(error instanceof Error && "code" in error && error.code==="EEXIST"))
          throw error;
      }
    }
    const detail=lstatSync(file);
    if(!detail.isFile()||detail.isSymbolicLink()||(detail.mode&0o077)!==0)
      throw new Error("INSTANCE_KEY_PERMISSIONS_UNSAFE");
    const secret=readFileSync(file,"utf8").trim();
    if(secret.length<32)throw new Error("INSTANCE_KEY_INVALID");
    process.env.AUTH_SECRET=secret;
  }
  const marker=join(dir,"mysql-installed.marker");
  const config=join(dir,"mysql-connection.enc");
  if(existsSync(marker)&&!existsSync(config))
    throw new Error("MYSQL_CONFIGURATION_MISSING_FAIL_CLOSED");
}
