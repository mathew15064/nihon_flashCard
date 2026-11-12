import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes,randomUUID } from "node:crypto";
import { existsSync,mkdtempSync,readFileSync,rmSync,statSync,writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mysql from "mysql2/promise";
import { prepareLocalStorage } from "../src/lib/bootstrap-storage";

test("MySQL wizard activates full HTTP engine: admin, vocabulary, deck, learner and SRS",{
  skip:!process.env.NIHON_MYSQL_TEST_URL,
},async()=>{
  const source=new URL(process.env.NIHON_MYSQL_TEST_URL!);
  const server={host:source.hostname,port:Number(source.port||3306),
    user:decodeURIComponent(source.username),password:decodeURIComponent(source.password),
    charset:"utf8mb4"};
  const name="nihon_it_"+randomBytes(7).toString("hex");
  const stagingName="nihon_restore_"+randomBytes(7).toString("hex");
  const corruptedStage="nihon_restore_"+randomBytes(7).toString("hex");
  const admin=await mysql.createConnection(server);
  const dir=mkdtempSync(join(tmpdir(),"nihon-full-mysql-it-"));
  const keys=["DB_PATH","AUTH_SECRET","NODE_ENV","PUBLIC_ORIGIN",
    "NIHON_ADMIN_PASSWORD_HASH","NIHON_MCP_TOKEN","NIHON_MCP_READ_TOKEN"] as const;
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  let app:Awaited<ReturnType<typeof import("../src/server/app").buildApp>>|undefined;
  try{
    await admin.query("CREATE DATABASE `"+name+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");
    await admin.query("CREATE DATABASE `"+stagingName+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");
    await admin.query("CREATE DATABASE `"+corruptedStage+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");
    for(const key of keys)delete process.env[key];
    process.env.DB_PATH=join(dir,"bootstrap.sqlite");
    process.env.NODE_ENV="test";
    prepareLocalStorage();
    const {buildApp}=await import("../src/server/app");
    const {installationCodeForIsolatedTests}=await import("../src/server/installation");
    app=await buildApp({staticAssets:false});
    const url=await app.listen({host:"127.0.0.1",port:0});
    const code=installationCodeForIsolatedTests();
    const password="qa-mysql-admin-password-2026";
    const connection={database:name,tls:"off",host:source.hostname,
      port:Number(source.port||3306),user:server.user,password:server.password,
    };
    const request=async(path:string,method="GET",body?:unknown,cookie?:string,
      token?:string)=>{
      const response=await fetch(url+path,{
        method,headers:{
          origin:url,
          ...(body!==undefined?{"content-type":"application/json"}:{}),
          ...(cookie?{cookie}:{}),
          ...(token?{authorization:"Bearer "+token}:{}),
        },...(body!==undefined?{body:JSON.stringify(body)}:{}),
      });
      return {status:response.status,data:await response.json(),
        cookie:response.headers.get("set-cookie")?.split(";")[0]};
    };
    const before=await request("/api/v1/setup/status");
    assert.equal(before.data.data.installed,false);
    const checked=await request("/api/v1/setup/mysql/test","POST",{
      setupCode:code,origin:url,connection,
    });
    assert.equal(checked.status,200,JSON.stringify(checked.data));
    assert.equal(checked.data.data.engine,"mysql");
    const init=await request("/api/v1/setup/initialize","POST",{
      setupCode:code,origin:url,database:"mysql",mysql:connection,
      adminPassword:password,repeatPassword:password,enableSignup:true,
    });
    assert.equal(init.status,201,JSON.stringify(init.data));
    assert.equal(init.data.data.database,"mysql");
    assert.equal((await request("/api/v1/setup/status")).data.data.installed,true);
    assert.equal((await request("/api/v1/health")).data.data.database,"mysql");
    const login=await request("/api/v1/auth/admin/login","POST",{password});
    assert.equal(login.status,200,JSON.stringify(login.data));
    assert.ok(login.cookie);
    const cookie=login.cookie!;
    const draft=await request("/api/v1/admin/vocabulary","POST",{
      word:"桜",reading:"さくら",meaningVi:"hoa anh đào",
    },cookie);
    assert.equal(draft.status,201,JSON.stringify(draft.data));
    const entryId=draft.data.data.id as string;
    assert.equal((await request("/api/v1/vocabulary")).data.data.items.length,0);
    const published=await request("/api/v1/admin/vocabulary/"+entryId+"/publish","POST",{},cookie);
    assert.equal(published.status,200,JSON.stringify(published.data));
    const deck=await request("/api/v1/admin/decks","POST",{name:"MySQL curated"},cookie);
    assert.equal(deck.status,201,JSON.stringify(deck.data));
    const deckId=deck.data.data.id as string;
    const added=await request("/api/v1/admin/decks/"+deckId+"/entries","POST",
      {entryId},cookie);
    assert.equal(added.status,200,JSON.stringify(added.data));
    const pubDeck=await request("/api/v1/admin/decks/"+deckId+"/publish","POST",{},cookie);
    assert.equal(pubDeck.status,200,JSON.stringify(pubDeck.data));

    const guest=await request("/api/v1/me/session");
    assert.equal(guest.status,200,JSON.stringify(guest.data));
    const guestCookie=guest.cookie!;
    const enroll=await request("/api/v1/me/decks/"+deckId+"/enroll","POST",{},guestCookie);
    assert.equal(enroll.status,200,JSON.stringify(enroll.data));
    assert.equal(enroll.data.data.newCards,1);
    const due=await request("/api/v1/me/reviews/due","GET",undefined,guestCookie);
    assert.equal(due.data.data.items.length,1);
    const review=await request("/api/v1/me/reviews","POST",{
      cardId:due.data.data.items[0].id,result:"correct",requestId:randomUUID(),
    },guestCookie);
    assert.equal(review.status,200,JSON.stringify(review.data));
    assert.equal(review.data.data.card.timesReviewed,1);

    const learnerUsername="qa"+randomBytes(5).toString("hex");
    const learnerPassword="mysql-qa-learner-password-2026";
    const registration=await request("/api/v1/auth/learner/register","POST",{
      username:learnerUsername,displayName:"QA Learner",
      password:learnerPassword,repeatPassword:learnerPassword,
    });
    assert.equal(registration.status,201,JSON.stringify(registration.data));
    const learnerLogin=await request("/api/v1/auth/learner/login","POST",{
      username:learnerUsername,password:learnerPassword,
    });
    assert.equal(learnerLogin.status,200,JSON.stringify(learnerLogin.data));
    const learnerCookie=learnerLogin.cookie!;
    const claim=await request("/api/v1/me/claim-guest","POST",{},[
      guestCookie,learnerCookie,
    ].join("; "));
    assert.equal(claim.status,200,JSON.stringify(claim.data));
    assert.equal(claim.data.data.cardsMoved,1);
    const progress=await request("/api/v1/me/progress","GET",undefined,learnerCookie);
    assert.equal(progress.data.data.todayReviews,1);
    const mysqlSettings=await request("/api/v1/admin/settings","GET",undefined,cookie);
    assert.equal(mysqlSettings.status,200,JSON.stringify(mysqlSettings.data));
    assert.equal(mysqlSettings.data.data.database,"mysql");
    const mysqlMeta=await request("/api/v1/admin/settings/mysql/connection","GET",
      undefined,cookie);
    assert.equal(mysqlMeta.status,200,JSON.stringify(mysqlMeta.data));
    assert.equal(mysqlMeta.data.data.database,name);
    assert.equal(mysqlMeta.data.data.host,source.hostname);
    assert.ok(!JSON.stringify(mysqlMeta.data).includes(server.password));
    const connectionTest=await request("/api/v1/admin/settings/mysql/test","POST",
      {host:source.hostname,port:Number(source.port||3306),tls:"off"},cookie);
    assert.equal(connectionTest.status,200,JSON.stringify(connectionTest.data));
    const wrongDatabase=await request("/api/v1/admin/settings/mysql/connection","PATCH",
      {database:"unrelated_schema"},cookie);
    assert.equal(wrongDatabase.status,400,JSON.stringify(wrongDatabase.data));
    const rotated=await request("/api/v1/admin/settings/mysql/connection","PATCH",
      {host:source.hostname,port:Number(source.port||3306),tls:"off"},cookie);
    assert.equal(rotated.status,200,JSON.stringify(rotated.data));
    assert.equal(rotated.data.data.reconfigured,true);
    const mysqlHealth=await request("/api/v1/admin/settings/mysql/health","GET",
      undefined,cookie);
    assert.equal(mysqlHealth.status,200,JSON.stringify(mysqlHealth.data));
    assert.equal(mysqlHealth.data.data.connected,true);

    const token=await request("/api/v1/admin/settings/tokens/read","POST",{},cookie);
    assert.equal(token.status,200,JSON.stringify(token.data));
    const mcp=await fetch(url+"/mcp",{
      method:"POST",headers:{
        authorization:"Bearer "+token.data.data.token,
        "content-type":"application/json",
        accept:"application/json, text/event-stream",
      },
      body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list"}),
    });
    assert.equal(mcp.status,200,await mcp.text());

    // MySQL backups must be private, encrypted, complete and Admin-only.
    const blocked=await request("/api/v1/admin/backups/mysql","POST",{});
    assert.equal(blocked.status,401);
    const blockedByOrigin=await fetch(url+"/api/v1/admin/backups/mysql",{
      method:"POST",headers:{
        cookie,origin:"https://attacker.invalid","content-type":"application/json",
      },body:"{}",
    });
    assert.equal(blockedByOrigin.status,403);
    const backup=await request("/api/v1/admin/backups/mysql","POST",{},cookie);
    assert.equal(backup.status,201,JSON.stringify(backup.data));
    assert.equal(backup.data.data.verified,true);
    assert.ok(backup.data.data.rows>=10);
    assert.ok(backup.data.data.tables>=15);
    const backupId=backup.data.data.id as string;
    assert.match(backupId,/^mysql-\d{8}-[0-9a-f]{24}\.nihonbak$/);
    const file=join(dir,"mysql-backups",backupId);
    assert.equal(statSync(file).mode&0o777,0o600);
    const archive=readFileSync(file);
    assert.ok(archive.length>40);
    assert.ok(archive.subarray(0,17).equals(Buffer.from("NIHONMYSQLBACKUP1")));
    assert.ok(!archive.includes(Buffer.from(learnerUsername)));
    assert.ok(!archive.includes(Buffer.from("MySQL curated")));
    const listing=await request("/api/v1/admin/backups/mysql","GET",undefined,cookie);
    assert.equal(listing.status,200);
    assert.ok(listing.data.data.items.some((item:{id:string})=>item.id===backupId));
    const verified=await request(
      "/api/v1/admin/backups/mysql/"+backupId+"/verify","POST",{},cookie);
    assert.equal(verified.status,200,JSON.stringify(verified.data));
    assert.equal(verified.data.data.rows,backup.data.data.rows);
    const deniedStage=await request(
      "/api/v1/admin/backups/mysql/"+backupId+"/stage","POST",
      {database:stagingName,confirmation:"RESTORE_TO_EMPTY_STAGING"});
    assert.equal(deniedStage.status,401);
    const deniedActive=await request(
      "/api/v1/admin/backups/mysql/"+backupId+"/stage","POST",
      {database:name,confirmation:"RESTORE_TO_EMPTY_STAGING"},cookie);
    assert.equal(deniedActive.status,400);
    const stage=await request(
      "/api/v1/admin/backups/mysql/"+backupId+"/stage","POST",
      {database:stagingName,confirmation:"RESTORE_TO_EMPTY_STAGING"},cookie);
    assert.equal(stage.status,200,JSON.stringify(stage.data));
    assert.equal(stage.data.data.restored,true);
    assert.equal(stage.data.data.verified,true);
    assert.equal(stage.data.data.rows,backup.data.data.rows);
    const [sourceCounts]=await admin.query(
      "SELECT COUNT(*) AS n FROM `"+name+"`.review_events"
    );
    const [stageCounts]=await admin.query(
      "SELECT COUNT(*) AS n FROM `"+stagingName+"`.review_events"
    );
    assert.deepEqual(sourceCounts,stageCounts);
    const repeatStage=await request(
      "/api/v1/admin/backups/mysql/"+backupId+"/stage","POST",
      {database:stagingName,confirmation:"RESTORE_TO_EMPTY_STAGING"},cookie);
    assert.equal(repeatStage.status,409);
    const deniedDownload=await fetch(
      url+"/api/v1/admin/backups/mysql/"+backupId+"/download");
    assert.equal(deniedDownload.status,401);
    const download=await fetch(
      url+"/api/v1/admin/backups/mysql/"+backupId+"/download",{
        headers:{cookie},
      });
    assert.equal(download.status,200);
    assert.match(download.headers.get("content-disposition")||"",/attachment;/);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()),archive);
    // A tampered ciphertext must never be reported as a valid backup.
    const tampered=Buffer.from(archive);
    tampered[30]^=0xff;
    writeFileSync(file,tampered);
    const tamperTest=await request(
      "/api/v1/admin/backups/mysql/"+backupId+"/verify","POST",{},cookie);
    assert.notEqual(tamperTest.status,200);
    assert.equal(tamperTest.data.success,false);
    assert.ok(existsSync(file));
    const badStage=await request(
      "/api/v1/admin/backups/mysql/"+backupId+"/stage","POST",
      {database:corruptedStage,confirmation:"RESTORE_TO_EMPTY_STAGING"},cookie);
    assert.notEqual(badStage.status,200);
    const [unexpected]=await admin.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=?",
      [corruptedStage],
    );
    assert.equal((unexpected as {n:number}[])[0]?.n,0);
    const wrongDelete=await request(
      "/api/v1/admin/backups/mysql/"+backupId+"/delete","POST",
      {confirmation:"INVALID"},cookie);
    assert.equal(wrongDelete.status,400);
    assert.ok(existsSync(file));
    const deleted=await request(
      "/api/v1/admin/backups/mysql/"+backupId+"/delete","POST",
      {confirmation:"DELETE_LOCAL_BACKUP"},cookie);
    assert.equal(deleted.status,200);
    assert.equal(existsSync(file),false);
    const fresh=await request("/api/v1/admin/backups/mysql","POST",{},cookie);
    assert.equal(fresh.status,201,JSON.stringify(fresh.data));
    assert.notEqual(fresh.data.data.id,backupId);

    await app.close();app=undefined;
    const {activateConfiguredMySQL}=await import("../src/db/mysql/runtime");
    assert.equal(await activateConfiguredMySQL(),true);
    app=await buildApp({staticAssets:false});
    const reopened=await app.inject({method:"GET",url:"/api/v1/setup/status"});
    assert.equal(reopened.json().data.installed,true);
    assert.equal(reopened.json().data.database,"mysql");
    const learnerRows=await admin.query(
      "SELECT COUNT(*) AS n FROM `"+name+"`.learner_accounts"
    );
    assert.ok(Array.isArray(learnerRows[0]));
    assert.equal((learnerRows[0] as {n:number}[])[0]?.n,1);
  }finally{
    await app?.close();
    for(const key of keys){
      if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];
    }
    rmSync(dir,{recursive:true,force:true});
    await admin.query("DROP DATABASE IF EXISTS `"+name+"`");
    await admin.query("DROP DATABASE IF EXISTS `"+stagingName+"`");
    await admin.query("DROP DATABASE IF EXISTS `"+corruptedStage+"`");
    await admin.end();
  }
});
