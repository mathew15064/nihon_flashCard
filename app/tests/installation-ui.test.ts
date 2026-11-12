import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("zero-env SQLite installer and encrypted UI settings survive restart without leaking secrets",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"nihon-install-ui-"));
  const dbFile=join(dir,"nihon.sqlite");
  const keys=[
    "DB_PATH","AUTH_SECRET","NODE_ENV","PUBLIC_ORIGIN","NIHON_ADMIN_PASSWORD_HASH",
    "NIHON_ENABLE_SIGNUP","OPENAI_API_KEY","NIHON_MCP_TOKEN","NIHON_MCP_READ_TOKEN",
    "NIHON_ADMIN_TOKEN","NIHON_AI_MODEL","NIHON_AI_DAILY_LIMIT",
  ] as const;
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  for(const key of keys)delete process.env[key];
  process.env.DB_PATH=dbFile;
  process.env.NODE_ENV="test";
  const adminPassword="long-test-bootstrap-admin-2026";
  const origin="http://localhost";
  try{
    const {prepareLocalStorage}=await import("../src/lib/bootstrap-storage");
    prepareLocalStorage();
    assert.ok(existsSync(dbFile));
    const secretFile=join(dir,"instance-secret.key");
    assert.ok(existsSync(secretFile));
    assert.equal(statSync(secretFile).mode&0o777,0o600);
    assert.equal(statSync(dbFile).mode&0o777,0o600);
    const instanceSecret=readFileSync(secretFile,"utf8");
    assert.ok(instanceSecret.trim().length>=32);
    const {buildApp}=await import("../src/server/app");
    const {installationCodeForIsolatedTests}=await import("../src/server/installation");
    const app=await buildApp({staticAssets:false});
    const sqlite=new DatabaseSync(dbFile);
    const call=(url:string,method:"GET"|"POST"|"PATCH"|"DELETE"="GET",
      payload?:unknown,cookie?:string,forcedOrigin=origin,authorization?:string)=>app.inject({
      method,url,
      headers:{origin:forcedOrigin,...(payload!==undefined?{"content-type":"application/json"}:{}),
        ...(cookie?{cookie}:{}),...(authorization?{authorization}: {})},
      ...(payload!==undefined?{payload:JSON.stringify(payload)}:{}),
    });
    const installer={setupCode:installationCodeForIsolatedTests(),
      database:"sqlite",adminPassword,repeatPassword:adminPassword,
      origin,enableSignup:true};
    const getCookie=(res:{headers:Record<string,unknown>})=>{
      const h=res.headers["set-cookie"];assert.ok(h);
      return (Array.isArray(h)?h[0]:String(h)).split(";")[0] as string;
    };
    try{
      const before=await call("/api/v1/setup/status");
      assert.equal(before.statusCode,200);
      assert.equal(before.json().data.installed,false);
      assert.equal(before.json().data.engines[1].available,true);
      assert.doesNotMatch(before.body,new RegExp(installer.setupCode));
      assert.equal((await call("/api/v1/setup/initialize","POST",
        {...installer,setupCode:"invalid-setup"})).statusCode,401);
      assert.equal((await call("/api/v1/setup/initialize","POST",
        {...installer,database:"mysql"})).statusCode,400);
      assert.equal((await call("/api/v1/setup/initialize","POST",installer,undefined,
        "https://attacker.example")).statusCode,403);
      const installed=await call("/api/v1/setup/initialize","POST",installer);
      assert.equal(installed.statusCode,201,installed.body);
      assert.equal(installed.json().data.database,"sqlite");
      assert.equal((await call("/api/v1/setup/initialize","POST",installer)).statusCode,409);
      assert.equal((await call("/api/v1/setup/status")).json().data.installed,true);
      assert.ok((sqlite.prepare("SELECT value FROM app_settings WHERE key='admin_password_hash'")
        .get() as {value:string}).value.startsWith("scrypt:"));
      assert.equal((await call("/api/v1/admin/settings")).statusCode,401);

      const login=await call("/api/v1/auth/admin/login","POST",{password:adminPassword});
      assert.equal(login.statusCode,200,login.body);
      const cookie=getCookie(login);
      const settings=await call("/api/v1/admin/settings","GET",undefined,cookie);
      assert.equal(settings.statusCode,200);
      assert.equal(settings.json().data.enableSignup,true);
      assert.equal(settings.json().data.openaiConfigured,false);
      const apiKey="sk-test-configuration-secret-should-never-leak-12345";
      const updated=await call("/api/v1/admin/settings","PATCH",{
        origin,enableSignup:false,aiModel:"gpt-4.1-mini",aiDailyLimit:7,
        openaiApiKey:apiKey,
      },cookie);
      assert.equal(updated.statusCode,200,updated.body);
      assert.doesNotMatch(updated.body,/sk-test-configuration/);
      assert.equal((await call("/api/v1/admin/settings","GET",undefined,cookie))
        .json().data.openaiConfigured,true);
      const keyRecord=sqlite.prepare(
        "SELECT value FROM app_settings WHERE key='openai_api_key'"
      ).get() as {value:string};
      assert.match(keyRecord.value,/^enc1\./);
      assert.doesNotMatch(keyRecord.value,/sk-test-configuration/);
      assert.equal((await call("/api/v1/auth/me")).json().data.signUpEnabled,false);

      const readToken=await call("/api/v1/admin/settings/tokens/read","POST",{},cookie);
      assert.equal(readToken.statusCode,200,readToken.body);
      const raw=readToken.json().data.token as string;
      assert.ok(raw.length>=24);
      assert.equal((await call("/api/v1/admin/settings","GET",undefined,cookie))
        .body.includes(raw),false);
      const writeToken=await call("/api/v1/admin/settings/tokens/write","POST",{},cookie);
      assert.equal(writeToken.statusCode,200);
      assert.notEqual(raw,writeToken.json().data.token);
      const restToken=await call("/api/v1/admin/settings/tokens/rest","POST",{},cookie);
      assert.equal(restToken.statusCode,200);
      assert.equal((await call("/api/v1/admin/vocabulary","GET",undefined,
        undefined,"https://attacker.example","Bearer "+restToken.json().data.token)).statusCode,200);
      assert.equal((await call("/api/v1/admin/settings","PATCH",{
        origin,enableSignup:true,aiModel:"gpt-4.1-mini",aiDailyLimit:3,
      },cookie,"https://attacker.example")).statusCode,403);

      const {openaiKey,mcpToken,aiDailyLimit}=await import("../src/lib/runtime-config");
      assert.equal(openaiKey(),apiKey);
      assert.equal(mcpToken("read"),raw);
      assert.equal(aiDailyLimit(),7);
      const rotated=await call("/api/v1/admin/settings/tokens/read","POST",{},cookie);
      assert.equal(rotated.statusCode,200);
      assert.notEqual(rotated.json().data.token,raw);
      assert.equal(mcpToken("read"),rotated.json().data.token);
      // Revoking a UI token must not reactivate an old env fallback credential.
      process.env.NIHON_MCP_TOKEN="obsolete-environment-write-token-0123456789";
      assert.equal((await call("/api/v1/admin/settings/tokens/write","DELETE",undefined,cookie)).statusCode,200);
      assert.equal(mcpToken("write"),undefined);
      assert.equal((await call("/api/v1/admin/settings","GET",undefined,cookie))
        .json().data.mcpWriteConfigured,false);
      process.env.OPENAI_API_KEY="obsolete-environment-openai-key-0123456789";
      assert.equal((await call("/api/v1/admin/settings/openai","DELETE",undefined,cookie)).statusCode,200);
      assert.equal(openaiKey(),undefined);
      assert.equal((await call("/api/v1/admin/settings","GET",undefined,cookie))
        .json().data.openaiConfigured,false);
      const restoredKey="sk-qa-replaced-test-only-key-0123456789";
      assert.equal((await call("/api/v1/admin/settings","PATCH",{
        origin,enableSignup:false,aiModel:"gpt-4.1-mini",aiDailyLimit:7,
        openaiApiKey:restoredKey,
      },cookie)).statusCode,200);
      assert.equal(openaiKey(),restoredKey);

      // Repeated startup reads the same key and does not replace DB state.
      prepareLocalStorage();
      assert.equal(readFileSync(secretFile,"utf8"),instanceSecret);
      assert.equal(openaiKey(),"sk-qa-replaced-test-only-key-0123456789");
      assert.equal(sqlite.prepare("SELECT count(*) AS n FROM schema_migrations").get()!.n,7);
    }finally{sqlite.close();await app.close();}
  }finally{
    for(const key of keys){
      if(old[key]===undefined)delete process.env[key];
      else process.env[key]=old[key];
    }
    rmSync(dir,{recursive:true,force:true});
  }
});

test("auto-start fails closed for weak AUTH_SECRET and symlinked secret files",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"nihon-install-key-"));
  const oldPath=process.env.DB_PATH,oldSecret=process.env.AUTH_SECRET;
  try {
    process.env.DB_PATH=join(dir,"nihon.sqlite");
    process.env.AUTH_SECRET="short-secret";
    const {prepareLocalStorage}=await import("../src/lib/bootstrap-storage");
    assert.throws(()=>prepareLocalStorage(),/AUTH_SECRET_TOO_SHORT/);
    delete process.env.AUTH_SECRET;
    const target=join(dir,"outside-target.key");
    writeFileSync(target,"a".repeat(70),{mode:0o600});
    symlinkSync(target,join(dir,"instance-secret.key"));
    assert.throws(()=>prepareLocalStorage(),/INSTANCE_KEY_PERMISSIONS_UNSAFE/);
    assert.equal(existsSync(join(dir,"nihon.sqlite")),false);
  }finally{
    if(oldPath===undefined)delete process.env.DB_PATH;else process.env.DB_PATH=oldPath;
    if(oldSecret===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=oldSecret;
    rmSync(dir,{recursive:true,force:true});
  }
});
