import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hashAdminPassword, verifyAdminPassword } from "../src/lib/admin-password";

test("learner password rotation requires current password and revokes all previous sessions",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"nihon-account-security-"));
  const filename=join(dir,"account.sqlite");
  const seed=new DatabaseSync(filename);
  for(const name of [
    "001_init.sql","002_legacy_import.sql","003_ai_studio.sql",
    "004_srs_learning.sql","005_learner_accounts.sql","006_auth_sessions.sql",
  ]) seed.exec(readFileSync(resolve("src/db/migrations",name),"utf8"));
  seed.close();
  const keys=["DB_PATH","AUTH_SECRET","NODE_ENV","PUBLIC_ORIGIN",
    "NIHON_ENABLE_SIGNUP","NIHON_ADMIN_PASSWORD_HASH"] as const;
  const old=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  process.env.DB_PATH=filename;
  process.env.AUTH_SECRET="account-change-security-test-secret-0123456789";
  process.env.NODE_ENV="test";
  delete process.env.PUBLIC_ORIGIN;
  process.env.NIHON_ENABLE_SIGNUP="true";
  process.env.NIHON_ADMIN_PASSWORD_HASH=hashAdminPassword("admin-strong-password-xyz");
  const origin="http://localhost:80";
  const oldPassword="old-secure-password-2026";
  const newPassword="new-secure-password-2026";
  const getCookie=(response:{headers:Record<string,unknown>})=>{
    const header=response.headers["set-cookie"];
    assert.ok(header);
    return (Array.isArray(header)?header[0]:String(header)).split(";")[0] as string;
  };
  try{
    const {buildApp}=await import("../src/server/app");
    const app=await buildApp({staticAssets:false});
    const sqlite=new DatabaseSync(filename);
    try{
      const register=await app.inject({method:"POST",url:"/api/v1/auth/learner/register",
        headers:{origin},payload:{username:"secur3_user",displayName:"Safe user",
          password:oldPassword,repeatPassword:oldPassword}});
      assert.equal(register.statusCode,201);
      const actorId=register.json().data.id as string;
      const login=(password:string)=>app.inject({
        method:"POST",url:"/api/v1/auth/learner/login",
        headers:{origin},payload:{username:"secur3_user",password},
      });
      const first=await login(oldPassword),second=await login(oldPassword);
      assert.equal(first.statusCode,200);
      assert.equal(second.statusCode,200);
      const cookieA=getCookie(first),cookieB=getCookie(second);
      assert.notEqual(cookieA,cookieB);
      const change=(cookie:string|undefined,input:object,originValue=origin)=>app.inject({
        method:"POST",url:"/api/v1/auth/learner/password",
        headers:{origin:originValue,...(cookie?{cookie}:{})},payload:input,
      });
      const data={currentPassword:oldPassword,newPassword,repeatPassword:newPassword};
      assert.equal((await change(undefined,data)).statusCode,401);
      assert.equal((await change(cookieA,data,"https://attacker.invalid")).statusCode,403);
      assert.equal((await change(cookieA,{...data,repeatPassword:"not-matching"})).statusCode,400);
      assert.equal((await change(cookieA,{...data,currentPassword:"not-the-password"})).statusCode,401);
      assert.equal((await change(cookieA,{...data,newPassword:oldPassword,repeatPassword:oldPassword})).statusCode,400);
      assert.equal((await change(cookieA,{...data,newPassword:"short",repeatPassword:"short"})).statusCode,400);
      assert.equal((await app.inject({method:"GET",url:"/api/v1/auth/me",
        headers:{cookie:cookieB}})).json().data.user.id,actorId);
      const before=sqlite.prepare("SELECT password_hash AS hash FROM learner_accounts").get() as {hash:string};
      assert.ok(verifyAdminPassword(oldPassword,before.hash));
      const updated=await change(cookieA,data);
      assert.equal(updated.statusCode,200,updated.body);
      assert.deepEqual(updated.json().data,{passwordChanged:true,otherSessionsRevoked:true});
      assert.doesNotMatch(updated.body,/new-secure-password-2026|old-secure-password-2026/);
      const newCookie=getCookie(updated);
      assert.notEqual(newCookie,cookieA);
      const dbRow=sqlite.prepare("SELECT password_hash AS hash FROM learner_accounts").get() as {hash:string};
      assert.notEqual(dbRow.hash,before.hash);
      assert.ok(verifyAdminPassword(newPassword,dbRow.hash));
      assert.equal(verifyAdminPassword(oldPassword,dbRow.hash),false);
      assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM auth_sessions WHERE actor_id=?")
        .get(actorId) as {n:number}).n,1);
      for(const obsolete of [cookieA,cookieB]){
        const me=await app.inject({method:"GET",url:"/api/v1/auth/me",headers:{cookie:obsolete}});
        assert.equal(me.json().data.user,null);
      }
      const me=await app.inject({method:"GET",url:"/api/v1/auth/me",
        headers:{cookie:newCookie}});
      assert.equal(me.json().data.user.id,actorId);
      assert.equal((await login(oldPassword)).statusCode,401);
      assert.equal((await login(newPassword)).statusCode,200);
      // A password rotation doesn't mutate SRS or user-owned study history.
      assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM review_cards").get() as {n:number}).n,0);
      assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM review_events").get() as {n:number}).n,0);

      const adminLogin=await app.inject({method:"POST",url:"/api/v1/auth/admin/login",
        headers:{origin},payload:{password:"admin-strong-password-xyz"}});
      assert.equal(adminLogin.statusCode,200);
      assert.equal((await change(getCookie(adminLogin),data)).statusCode,401);
      assert.equal((await change(newCookie,data)).statusCode,401);
    }finally{sqlite.close();await app.close();}
  }finally{
    for(const key of keys){
      const value=old[key];
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
    rmSync(dir,{recursive:true,force:true});
  }
});
