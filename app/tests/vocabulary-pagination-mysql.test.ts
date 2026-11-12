import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import { migrateFreshMySQL, openMySQL } from "../src/db/mysql/connector";
import { mysqlVocabulary } from "../src/db/mysql/vocabulary";
import { vocabularyEntries, vocabularySenses } from "../src/db/mysql/schema";

test("MySQL vocabulary pages cover >100 entries without duplicate IDs or draft exposure",{
  skip:!process.env.NIHON_MYSQL_TEST_URL,
},async()=>{
  const source=new URL(process.env.NIHON_MYSQL_TEST_URL!);
  // This test creates/drops ONLY a uniquely named disposable QA database.
  if(source.protocol!=="mysql:"||!source.pathname.startsWith("/nihon_qa"))
    throw new Error("PAGINATION_TEST_REQUIRES_DISPOSABLE_QA_MYSQL");
  const base={
    host:source.hostname,port:Number(source.port||3306),
    user:decodeURIComponent(source.username),password:decodeURIComponent(source.password),
  };
  const name="nihon_page_"+randomBytes(7).toString("hex");
  const admin=await mysql.createConnection(base);
  let pool:ReturnType<typeof openMySQL>["pool"]|undefined;
  try{
    await admin.query("CREATE DATABASE `"+name+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");
    const options={...base,database:name,tls:"off" as const};
    await migrateFreshMySQL(options);
    const connection=openMySQL(options);pool=connection.pool;
    const {db}=connection;
    const stamp=new Date().toISOString();
    const search="QAPage"+randomBytes(4).toString("hex");
    const rows=Array.from({length:105},(_,i)=>({
      id:randomUUID(),language:"ja" as const,word:search+"-"+String(i).padStart(3,"0"),
      reading:"ぺーじ",normalizedKey:search+":"+i,
      status:i===104?"draft" as const:"published" as const,
      source:"manual" as const,createdAt:stamp,updatedAt:stamp,
    }));
    await db.insert(vocabularyEntries).values(rows);
    await db.insert(vocabularySenses).values(rows.map(row=>({
      id:randomUUID(),entryId:row.id,language:"vi",meaning:"Trang kiểm thử",
      sortOrder:0,
    })));
    const vocab=mysqlVocabulary(db);
    const publicPages=await Promise.all([1,2,3].map(page=>
      vocab.list({search,page,limit:40})));
    assert.deepEqual(publicPages.map(p=>p.items.length),[40,40,24]);
    assert.deepEqual(publicPages.map(p=>p.total),[104,104,104]);
    assert.deepEqual(publicPages.map(p=>p.hasMore),[true,true,false]);
    const all=publicPages.flatMap(p=>p.items);
    assert.equal(new Set(all.map(row=>row.id)).size,104);
    assert.ok(all.every(row=>row.senses.length===1));
    assert.ok(all.every(row=>row.status==="published"));
    assert.deepEqual(all.map(row=>row.id),rows.filter(row=>row.status==="published")
      .map(row=>row.id).sort());
    const adminPages=await Promise.all([1,2].map(page=>
      vocab.list({search,page,limit:100,includeDrafts:true,order:"newest"})));
    assert.deepEqual(adminPages.map(p=>p.items.length),[100,5]);
    assert.deepEqual(adminPages.map(p=>p.total),[105,105]);
    assert.deepEqual(adminPages.map(p=>p.hasMore),[true,false]);
    const adminIds=adminPages.flatMap(p=>p.items.map(row=>row.id));
    assert.deepEqual(adminIds,[...rows.map(row=>row.id)].sort().reverse());
    assert.equal(new Set(adminIds).size,105);
    assert.equal(adminPages.flatMap(p=>p.items).filter(row=>row.status==="draft").length,1);
  }finally{
    if(pool)await pool.end();
    await admin.query("DROP DATABASE IF EXISTS `"+name+"`");
    await admin.end();
  }
});
