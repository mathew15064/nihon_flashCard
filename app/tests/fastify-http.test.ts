import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {hashAdminPassword} from "../src/lib/admin-password";

test("Fastify protects Admin routes, rejects CSRF and isolates drafts",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"nihon-api-fastify-"));
  const filename=join(dir,"api.sqlite");
  const sqlite=new DatabaseSync(filename);
  for(const file of ["001_init.sql","002_legacy_import.sql","003_ai_studio.sql",
    "004_srs_learning.sql","005_learner_accounts.sql"]){
    sqlite.exec(readFileSync(resolve("src/db/migrations",file),"utf8"));
  }
  sqlite.close();
  const old={
    DB_PATH:process.env.DB_PATH,AUTH_SECRET:process.env.AUTH_SECRET,
    NIHON_ADMIN_PASSWORD_HASH:process.env.NIHON_ADMIN_PASSWORD_HASH,
    NODE_ENV:process.env.NODE_ENV,OPENAI_API_KEY:process.env.OPENAI_API_KEY,
    PUBLIC_ORIGIN:process.env.PUBLIC_ORIGIN,NIHON_ADMIN_TOKEN:process.env.NIHON_ADMIN_TOKEN,
  };
  process.env.DB_PATH=filename;
  process.env.AUTH_SECRET="test-fastify-auth-secret-1234567890123456789";
  process.env.NIHON_ADMIN_PASSWORD_HASH=hashAdminPassword("long-fastify-admin-test-password");
  process.env.NIHON_ADMIN_TOKEN="test-admin-rest-token-12345678901234567890";
  process.env.NODE_ENV="test";
  delete process.env.OPENAI_API_KEY;
  try{
    const {buildApp}=await import("../src/server/app");
    const app=await buildApp({staticAssets:false});
    try{
      const health=await app.inject({method:"GET",url:"/api/v1/health"});
      assert.equal(health.statusCode,200);
      assert.equal(health.json().data.framework,"fastify");
      assert.equal((await app.inject({method:"GET",url:"/api/v1/admin/vocabulary"})).statusCode,401);
      assert.equal((await app.inject({
        method:"POST",url:"/api/v1/auth/admin/login",
        headers:{origin:"https://evil.invalid"},
        payload:{password:"long-fastify-admin-test-password"},
      })).statusCode,403);
      const login=await app.inject({
        method:"POST",url:"/api/v1/auth/admin/login",
        headers:{origin:"http://localhost:80"},
        payload:{password:"long-fastify-admin-test-password"},
      });
      assert.equal(login.statusCode,200);
      const header=login.headers["set-cookie"];
      const cookie=(Array.isArray(header)?header[0]:header)!.split(";")[0];
      assert.ok(cookie.startsWith("nihon_auth="));
      const word="新規"+randomUUID().slice(0,4);
      const created=await app.inject({
        method:"POST",url:"/api/v1/admin/vocabulary",
        headers:{cookie,origin:"http://localhost:80"},
        payload:{word,reading:"しんき",meaningVi:"mới"},
      });
      assert.equal(created.statusCode,201);
      const id=created.json().data.id;
      const publicQuery=await app.inject({method:"GET",url:"/api/v1/vocabulary?search="+encodeURIComponent(word)});
      assert.equal(publicQuery.json().data.items.length,0);
      assert.equal((await app.inject({
        method:"POST",url:"/api/v1/admin/vocabulary/"+id+"/publish",
        headers:{cookie,origin:"https://evil.invalid"},
        payload:{},
      })).statusCode,403);
      assert.equal((await app.inject({
        method:"POST",url:"/api/v1/admin/vocabulary/"+id+"/publish",
        headers:{cookie,origin:"https://evil.invalid",authorization:"Bearer NOT_A_VALID_TOKEN"},
        payload:{},
      })).statusCode,403);
      const approved=await app.inject({
        method:"POST",url:"/api/v1/admin/vocabulary/"+id+"/publish",
        headers:{cookie,origin:"http://localhost:80"},
        payload:{},
      });
      assert.equal(approved.statusCode,200);
      const visible=await app.inject({method:"GET",url:"/api/v1/vocabulary?search="+encodeURIComponent(word)});
      assert.equal(visible.json().data.items.length,1);
      const validApiToken=await app.inject({
        method:"POST",url:"/api/v1/admin/vocabulary",
        headers:{origin:"https://evil.invalid",authorization:`Bearer ${process.env.NIHON_ADMIN_TOKEN}`},
        payload:{word:"試験"+randomUUID().slice(0,4),reading:"しけん",meaningVi:"kiểm thử"},
      });
      assert.equal(validApiToken.statusCode,201);
      const forgedCookie=cookie.replace(/.$/,"X");
      assert.equal((await app.inject({method:"GET",url:"/api/v1/admin/vocabulary",
        headers:{cookie:forgedCookie}})).statusCode,401);

      // In production, a missing PUBLIC_ORIGIN must not trust a forged Host header.
      process.env.NODE_ENV="production";
      delete process.env.PUBLIC_ORIGIN;
      assert.equal((await app.inject({
        method:"POST",url:"/api/v1/auth/admin/login",
        headers:{origin:"http://localhost:80",host:"localhost:80"},
        payload:{password:"long-fastify-admin-test-password"},
      })).statusCode,403);
      process.env.PUBLIC_ORIGIN="https://nihon.example";
      assert.equal((await app.inject({
        method:"POST",url:"/api/v1/auth/admin/login",
        headers:{origin:"https://nihon.example","sec-fetch-site":"cross-site"},
        payload:{password:"long-fastify-admin-test-password"},
      })).statusCode,403);
      assert.equal((await app.inject({
        method:"POST",url:"/api/v1/auth/admin/login",
        headers:{origin:"https://nihon.example"},
        payload:{password:"long-fastify-admin-test-password"},
      })).statusCode,200);
      process.env.NODE_ENV="test";
      delete process.env.PUBLIC_ORIGIN;

      // Ignore attacker-supplied forwarded IPs (trustProxy is explicitly false).
      for(let i=0;i<25;i++){
        const attempt=await app.inject({
          method:"POST",url:"/api/v1/auth/learner/login",
          headers:{origin:"https://evil.invalid","x-forwarded-for":`198.51.100.${i}`},
          payload:{username:"unknown",password:"wrong"},
        });
        assert.equal(attempt.statusCode,403);
      }
      const limited=await app.inject({
        method:"POST",url:"/api/v1/auth/learner/login",
        headers:{origin:"https://evil.invalid","x-forwarded-for":"203.0.113.10"},
        payload:{username:"unknown",password:"wrong"},
      });
      assert.equal(limited.statusCode,429);
      assert.equal(limited.json().error.code,"RATE_LIMITED");
      assert.ok(Number(limited.headers["retry-after"])>0);
      assert.equal((await app.inject({method:"GET",url:"/api/v1/health"})).statusCode,200);
    }finally{await app.close();}
  }finally{
    for(const [key,value] of Object.entries(old)){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
    rmSync(dir,{recursive:true,force:true});
  }
});
