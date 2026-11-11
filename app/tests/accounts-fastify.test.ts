import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";

test("Learner auth uses salted passwords, normalized names, DB lockout, and active account checks",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"nihon-fastify-account-"));
  const file=join(dir,"accounts.sqlite");
  const conn=new DatabaseSync(file);
  for(const name of ["001_init.sql","002_legacy_import.sql","003_ai_studio.sql",
    "004_srs_learning.sql","005_learner_accounts.sql"]){
    conn.exec(readFileSync(resolve("src/db/migrations",name),"utf8"));
  }
  conn.close();
  const old={DB_PATH:process.env.DB_PATH,AUTH_SECRET:process.env.AUTH_SECRET,
    NIHON_ENABLE_SIGNUP:process.env.NIHON_ENABLE_SIGNUP};
  process.env.DB_PATH=file;
  process.env.AUTH_SECRET="test-account-session-secret-1234567890-long";
  process.env.NIHON_ENABLE_SIGNUP="true";
  try{
    const {registerLearner,authenticateLearner,getLearnerById}=await import("../src/modules/accounts/service");
    const input={username:"sakura_01",displayName:"Sakura",password:"example-password-123456",
      repeatPassword:"example-password-123456"};
    const user=registerLearner(input);
    assert.ok(user.id.startsWith("learner:"));
    assert.throws(()=>registerLearner({...input,username:"SAKURA_01"}),/USERNAME_TAKEN/);
    assert.equal(authenticateLearner("sakura_01","example-password-123456")?.id,user.id);
    for(let i=0;i<5;i++)assert.equal(authenticateLearner("sakura_01","invalid-password-xxx"),null);
    assert.equal(authenticateLearner("sakura_01","example-password-123456"),null);
    const db=new DatabaseSync(file);
    db.prepare("UPDATE learner_login_limits SET locked_until=? WHERE username_key=?")
      .run("2020-01-01T00:00:00.000Z","sakura_01");
    assert.equal(authenticateLearner("sakura_01","example-password-123456")?.id,user.id);
    assert.equal(getLearnerById(user.id)?.displayName,"Sakura");
    db.prepare("UPDATE learner_accounts SET status='disabled' WHERE username_key=?").run("sakura_01");
    assert.equal(getLearnerById(user.id),null);
    assert.equal(authenticateLearner("sakura_01","example-password-123456"),null);
    db.close();
  }finally{
    for(const [key,value] of Object.entries(old)){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
    rmSync(dir,{recursive:true,force:true});
  }
});
