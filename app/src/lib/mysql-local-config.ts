import { closeSync,existsSync,fsyncSync,lstatSync,openSync,readFileSync,
  renameSync,unlinkSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { dataDirectory } from "./bootstrap-storage";
import { decryptValue,encryptValue } from "./runtime-config";

const FILE="mysql-connection.enc";
const MARKER="mysql-installed.marker";
function path(name:string){return join(dataDirectory(),name);}
export function readEncryptedConnection():string|undefined{
  const filename=path(FILE);
  if(!existsSync(filename)){
    if(existsSync(path(MARKER)))throw new Error("MYSQL_CONFIGURATION_MISSING_FAIL_CLOSED");
    return undefined;
  }
  const s=lstatSync(filename);
  if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.size>16*1024)
    throw new Error("MYSQL_CONNECTION_FILE_UNSAFE");
  const encrypted=readFileSync(filename,"utf8").trim();
  return decryptValue(encrypted);
}
/** Atomic replace. The only plaintext is held in process memory. */
export function writeEncryptedConnection(plaintext:string):void{
  if(plaintext.length>4096)throw new Error("MYSQL_CONNECTION_CONFIGURATION_TOO_LARGE");
  const dest=path(FILE);
  if(existsSync(dest)){
    const s=lstatSync(dest);
    if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0)
      throw new Error("MYSQL_CONNECTION_FILE_UNSAFE");
  }
  const tmp=path("."+FILE+"."+randomBytes(12).toString("hex")+".tmp");
  const fd=openSync(tmp,"wx",0o600);
  try{
    writeFileSync(fd,encryptValue(plaintext)+"\n");
    fsyncSync(fd);
  }finally{closeSync(fd);}
  try{renameSync(tmp,dest);}
  catch(error){
    try{unlinkSync(tmp);}catch{/* Preserve original write error. */}
    throw error;
  }
  const marker=path(MARKER);
  if(!existsSync(marker)){
    const mfd=openSync(marker,"wx",0o600);
    try{writeFileSync(mfd,"mysql-only-v1\n");fsyncSync(mfd);}
    finally{closeSync(mfd);}
  }
}
