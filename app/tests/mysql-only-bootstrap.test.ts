import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync,mkdtempSync,readFileSync,rmSync,statSync,symlinkSync,
  writeFileSync,chmodSync,unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareLocalStorage } from "../src/lib/bootstrap-storage";
import { readEncryptedConnection,writeEncryptedConnection } from "../src/lib/mysql-local-config";

const keys=["NIHON_DATA_DIR","AUTH_SECRET","DB_PATH"] as const;
function isolated(action:(dir:string)=>void){
  const dir=mkdtempSync(join(tmpdir(),"nihon-mysql-only-"));
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  for(const key of keys)delete process.env[key];
  process.env.NIHON_DATA_DIR=dir;
  try{action(dir);}finally{
    for(const key of keys){
      if(previous[key]===undefined)delete process.env[key];
      else process.env[key]=previous[key];
    }
    rmSync(dir,{recursive:true,force:true});
  }
}
test("fresh bootstrap creates only private secret and encrypted MySQL config, never SQLite",()=>{
  isolated(dir=>{
    prepareLocalStorage();
    assert.equal(statSync(dir).mode&0o777,0o700);
    assert.equal(statSync(join(dir,"instance-secret.key")).mode&0o777,0o600);
    assert.ok(!existsSync(join(dir,"nihon.sqlite")));
    assert.equal(readEncryptedConnection(),undefined);
    const secret=readFileSync(join(dir,"instance-secret.key"),"utf8");
    const fake=JSON.stringify({host:"qa.invalid",user:"qa",password:"test-my-sql-password",
      database:"nihon",port:3306,tls:"off"});
    writeEncryptedConnection(fake);
    assert.equal(readEncryptedConnection(),fake);
    assert.equal(statSync(join(dir,"mysql-connection.enc")).mode&0o777,0o600);
    assert.ok(!readFileSync(join(dir,"mysql-connection.enc"),"utf8")
      .includes("test-my-sql-password"));
    assert.ok(existsSync(join(dir,"mysql-installed.marker")));
    prepareLocalStorage();
    assert.equal(readFileSync(join(dir,"instance-secret.key"),"utf8"),secret);
    assert.ok(!existsSync(join(dir,"nihon.sqlite")));
    writeEncryptedConnection(fake.replace("qa.invalid","qa2.invalid"));
    assert.ok(readEncryptedConnection()?.includes("qa2.invalid"));
    const cipherPath=join(dir,"mysql-connection.enc");
    const original=readFileSync(cipherPath,"utf8");
    writeFileSync(cipherPath,original.replace(/(enc1\.[^.]+\.[^.]+\.)(.)/,
      (_match,prefix:string,first:string)=>prefix+(first==="A"?"B":"A")));
    assert.throws(()=>readEncryptedConnection(),/SETTINGS_DECRYPT_FAILED|SETTINGS_CIPHERTEXT_INVALID/);
    unlinkSync(cipherPath);
    assert.throws(()=>prepareLocalStorage(),/MYSQL_CONFIGURATION_MISSING_FAIL_CLOSED/);
  });
});
test("legacy SQLite DB is never silently reinitialized or deleted",()=>{
  isolated(dir=>{
    const db=join(dir,"nihon.sqlite");
    writeFileSync(db,"existing user data");
    assert.throws(()=>prepareLocalStorage(),
      /LEGACY_SQLITE_INSTALLATION_REQUIRES_MANUAL_MIGRATION/);
    assert.equal(readFileSync(db,"utf8"),"existing user data");
    assert.equal(existsSync(join(dir,"instance-secret.key")),false);
  });
});
test("bootstrap rejects insecure secret and symlinks",()=>{
  isolated(dir=>{
    process.env.AUTH_SECRET="short";
    assert.throws(()=>prepareLocalStorage(),/AUTH_SECRET_TOO_SHORT/);
    delete process.env.AUTH_SECRET;
    const external=join(dir,"outside.key");
    writeFileSync(external,"b".repeat(50),{mode:0o600});
    symlinkSync(external,join(dir,"instance-secret.key"));
    assert.throws(()=>prepareLocalStorage(),/INSTANCE_KEY_PERMISSIONS_UNSAFE/);
    unlinkSync(join(dir,"instance-secret.key"));
    prepareLocalStorage();
    writeEncryptedConnection("temporary");
    const file=join(dir,"mysql-connection.enc");
    chmodSync(file,0o644);
    assert.throws(()=>readEncryptedConnection(),/MYSQL_CONNECTION_FILE_UNSAFE/);
  });
});
