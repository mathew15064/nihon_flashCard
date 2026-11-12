/**
 * T05: synthetic-only, local MySQL 8.4 backup/restore rehearsal.
 * cd app && NIHON_MYSQL_TEST_URL='mysql://QA_USER:QA_PASSWORD@127.0.0.1:3306/nihon_qa' \
 *   node --import tsx scripts/topic-restore-qa.mjs
 * Creates and drops only freshly named schemas; never reads a real backup.
 */
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {copyFile,mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import mysql from 'mysql2/promise';

function safeId(value) {
  assert.match(value,/^[a-z][a-z0-9_]*$/);
  return String.fromCharCode(96)+value+String.fromCharCode(96);
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalize = v => Buffer.isBuffer(v)?{$binary:v.toString('base64')}:
  v instanceof Date?v.toISOString():v;
function options(url,database){
  return {host:url.hostname,port:Number(url.port||3306),
    user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),
    database,tls:'off'};
}
function driver(options){
  const {tls,...config}=options;
  return {...config,connectTimeout:5000};
}
async function fingerprint(db){
  const [columns]=await db.query('SELECT table_name AS name,column_name AS col FROM information_schema.columns WHERE table_schema=DATABASE() ORDER BY table_name,ordinal_position');
  const [keys]=await db.query("SELECT table_name AS name,column_name AS col FROM information_schema.statistics WHERE table_schema=DATABASE() AND index_name='PRIMARY' ORDER BY table_name,seq_in_index");
  const tables=new Map();
  for(const row of columns){
    safeId(String(row.name));safeId(String(row.col));
    if(!tables.has(row.name))tables.set(row.name,{columns:[],primary:[]});
    tables.get(row.name).columns.push(row.col);
  }
  for(const key of keys)tables.get(key.name)?.primary.push(key.col);
  const result={};
  for(const [name,spec] of tables){
    assert.ok(spec.primary.length,'T05_NO_PRIMARY_KEY');
    const [rows]=await db.query('SELECT '+spec.columns.map(safeId).join(',')+' FROM '+
      safeId(name)+' ORDER BY '+spec.primary.map(safeId).join(','));
    const data=rows.map(row=>spec.columns.map(col=>normalize(row[col])));
    result[name]={count:data.length,sha256:hash(data),columns:spec.columns};
  }
  return result;
}
async function checkFK(db){
  const [flag]=await db.query('SELECT @@FOREIGN_KEY_CHECKS AS n');
  assert.equal(Number(flag[0]?.n),1,'T05_FK_CHECKS_DISABLED');
  const [refs]=await db.query('SELECT constraint_name AS con,table_name AS child,column_name AS childCol,referenced_table_name AS parent,referenced_column_name AS parentCol FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND referenced_table_name IS NOT NULL ORDER BY table_name,constraint_name,ordinal_position');
  const groups=new Map();
  for(const ref of refs){
    const key=String(ref.child)+':'+String(ref.con);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(ref);
  }
  for(const parts of groups.values()){
    const first=parts[0];
    const on=parts.map(p=>'c.'+safeId(p.childCol)+'=p.'+safeId(p.parentCol)).join(' AND ');
    const nonNull=parts.map(p=>'c.'+safeId(p.childCol)+' IS NOT NULL').join(' AND ');
    const [orphans]=await db.query('SELECT COUNT(*) AS n FROM '+safeId(first.child)+
      ' c LEFT JOIN '+safeId(first.parent)+' p ON '+on+' WHERE '+nonNull+
      ' AND p.'+safeId(first.parentCol)+' IS NULL');
    assert.equal(Number(orphans[0]?.n),0,'T05_FK_ORPHAN');
  }
  return groups.size;
}
async function verifyLedger(db,expected){
  const [rows]=await db.query('SELECT filename,checksum,status FROM schema_migrations ORDER BY filename');
  assert.equal(rows.length,expected.length,'T05_LEDGER_LENGTH');
  for(let i=0;i<expected.length;i++){
    assert.equal(rows[i].filename,expected[i].filename,'T05_LEDGER_NAME');
    assert.equal(rows[i].checksum,expected[i].checksum,'T05_LEDGER_CHECKSUM');
    assert.equal(rows[i].status,'applied','T05_LEDGER_STATUS');
  }
  return rows.map(r=>({filename:r.filename,checksum:r.checksum,status:r.status}));
}
async function seed(db){
  const now='2026-11-12T10:00:00.000Z';
  const topic=randomUUID(),lesson=randomUUID(),sibling=randomUUID();
  const legacy=randomUUID(),card=randomUUID(),entries=Array.from({length:3},()=>randomUUID());
  await db.execute('INSERT INTO topics (id,slug,name,description,created_at) VALUES (?,?,?,?,?)',
    [topic,'t05-'+topic,'QA Topic 日本語','synthetic only',now]);
  for(const [id,name,topicId,lessonKey] of [
    [lesson,'QA Lesson One',topic,'t05-'+lesson],
    [sibling,'QA Lesson Two',topic,'t05-'+sibling],
    [legacy,'QA Legacy Deck',null,null]]){
    await db.execute('INSERT INTO decks (id,name,topic_id,lesson_key,visibility,created_at) VALUES (?,?,?,?,?,?)',
      [id,name,topicId,lessonKey,'private',now]);
  }
  for(let i=0;i<entries.length;i++){
    const id=entries[i];
    await db.execute('INSERT INTO vocabulary_entries (id,word,reading,normalized_key,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      [id,['学校','先生','勉強'][i],['がっこう','せんせい','べんきょう'][i],
        't05:'+id,i===2?'draft':'published',now,now]);
    await db.execute('INSERT INTO vocabulary_senses (id,entry_id,language,meaning,sort_order) VALUES (?,?,?,?,?)',
      [randomUUID(),id,'vi',['trường học','giáo viên','học tập'][i],i]);
  }
  for(const [deckId,entryId,order] of [[lesson,entries[0],0],
    [lesson,entries[1],1],[sibling,entries[1],0],
    [sibling,entries[2],1],[legacy,entries[0],0]]){
    await db.execute('INSERT INTO deck_items (deck_id,entry_id,sort_order) VALUES (?,?,?)',
      [deckId,entryId,order]);
  }
  await db.execute('INSERT INTO user_deck_enrollments (user_id,deck_id,enrolled_at) VALUES (?,?,?)',
    ['guest:t05-synthetic',lesson,now]);
  await db.execute('INSERT INTO review_cards (id,user_id,entry_id,status,next_review_at,streak,times_reviewed,correct_count,wrong_count,last_reviewed_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [card,'guest:t05-synthetic',entries[0],'review','2026-12-01T02:00:00.000Z',4,7,5,2,now]);
  await db.execute('INSERT INTO review_events (id,card_id,result,reviewed_at,request_id) VALUES (?,?,?,?,?)',
    [randomUUID(),card,'correct',now,randomUUID()]);
  return {topic,legacy,card};
}
async function run(raw){
  let url;
  try{url=new URL(raw);}catch{throw new Error('T05_URL_INVALID');}
  if(url.protocol!=='mysql:'||!/^\/nihon_qa[a-zA-Z0-9_]*$/.test(url.pathname)||
    !['127.0.0.1','localhost','[::1]'].includes(url.hostname)||
    url.search||url.hash||!url.username)throw new Error('T05_LOCAL_QA_ONLY');
  const id=randomBytes(6).toString('hex');
  const source='nihon_qa_t05_'+id,target='nihon_restore_t05_'+id;
  const tamper='nihon_restore_t05_bad_'+id;
  const created=[];
  const dir=await mkdtemp(join(tmpdir(),'nihon-t05-qa-'));
  const priorSecret=process.env.AUTH_SECRET,priorDir=process.env.NIHON_DATA_DIR;
  process.env.AUTH_SECRET=randomBytes(48).toString('base64url');
  process.env.NIHON_DATA_DIR=dir;
  let admin;
  try{
    admin=await mysql.createConnection(driver(options(url,undefined)));
    const [versions]=await admin.query('SELECT VERSION() AS version');
    assert.match(String(versions[0]?.version||''),/^8\.4\./,'T05_MYSQL_8_4_REQUIRED');
    for(const name of [source,target,tamper]){
      await admin.query('CREATE DATABASE '+safeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');
      created.push(name);
    }
    const {migrateFreshMySQL}=await import('../src/db/mysql/connector.ts');
    const {createMySQLBackup,verifyMySQLBackup,loadMySQLBackupForStaging}=await import('../src/db/mysql/backup.ts');
    const {rehearseMySQLRestore}=await import('../src/db/mysql/restore-drill.ts');
    const connect=options(url,source);
    assert.equal((await migrateFreshMySQL(connect)).migrations,2);
    const migrations=[];
    for(const filename of ['20261112021255_initial','20261112180000_topics_lessons']){
      const sql=await readFile(join('src','db','mysql','migrations',filename,'migration.sql'));
      migrations.push({filename,checksum:createHash('sha256').update(sql).digest('hex')});
    }
    const db=await mysql.createConnection(driver(connect));
    let fixture,before,ledgerBefore,foreignKeys;
    try{
      fixture=await seed(db);
      before=await fingerprint(db);
      ledgerBefore=await verifyLedger(db,migrations);
      foreignKeys=await checkFK(db);
    }finally{await db.end();}
    const domain=['topics','decks','deck_items','vocabulary_entries',
      'vocabulary_senses','review_cards','review_events','user_deck_enrollments'];
    for(const name of domain)assert.ok(before[name]?.count>0,'T05_FIXTURE_MISSING');
    assert.equal(before.decks.count,3);
    assert.equal(before.deck_items.count,5);
    const archive=await createMySQLBackup(connect);
    const verified=await verifyMySQLBackup(archive.id);
    assert.equal(archive.sha256,verified.sha256);
    assert.equal(archive.rows,Object.values(before).reduce((n,v)=>n+v.count,0));
    const parsed=await loadMySQLBackupForStaging(archive.id);
    assert.deepEqual(parsed.header.migrations,migrations);
    for(const name of domain)assert.ok(parsed.records.has(name),'T05_MANIFEST_MISSING');
    const path=join(dir,'mysql-backups',archive.id);
    const bytes=await readFile(path);
    const archiveSha256=createHash('sha256').update(bytes).digest('hex');
    assert.equal((await stat(path)).mode&0o777,0o600,'T05_ARCHIVE_PERMISSIONS');
    const result=await rehearseMySQLRestore(archive.id,connect,target);
    assert.equal(result.restored,true);
    assert.equal(result.rows,verified.rows);
    const restored=await mysql.createConnection(driver(options(url,target)));
    let after,foreignKeysAfter,ledgerAfter;
    try{
      after=await fingerprint(restored);
      assert.deepEqual(after,before,'T05_FULL_CONTENT_MISMATCH');
      foreignKeysAfter=await checkFK(restored);
      assert.equal(foreignKeysAfter,foreignKeys);
      ledgerAfter=await verifyLedger(restored,migrations);
      assert.deepEqual(ledgerAfter,ledgerBefore);
      const [legacy]=await restored.execute('SELECT topic_id,lesson_key FROM decks WHERE id=?',[fixture.legacy]);
      assert.equal(legacy[0]?.topic_id,null);
      assert.equal(legacy[0]?.lesson_key,null);
      const [count]=await restored.execute('SELECT COUNT(*) AS n FROM decks WHERE topic_id=?',[fixture.topic]);
      assert.equal(Number(count[0]?.n),2);
      const [cards]=await restored.execute('SELECT status,next_review_at,streak,times_reviewed,correct_count,wrong_count,last_reviewed_at FROM review_cards WHERE id=?',[fixture.card]);
      assert.equal(cards[0]?.streak,4);
      assert.equal(cards[0]?.times_reviewed,7);
      assert.equal(cards[0]?.correct_count,5);
      assert.equal(cards[0]?.wrong_count,2);
      assert.equal(cards[0]?.next_review_at,'2026-12-01T02:00:00.000Z');
    }finally{await restored.end();}
    // Tampering must fail before staging schema initialization.
    const corrupted=Buffer.from(bytes);
    corrupted[Math.floor(corrupted.length/2)]^=1;
    const badId='mysql-20261112-'+randomBytes(12).toString('hex')+'.nihonbak';
    const badPath=join(dir,'mysql-backups',badId);
    await copyFile(path,badPath);
    await writeFile(badPath,corrupted,{mode:0o600});
    await assert.rejects(()=>verifyMySQLBackup(badId));
    await assert.rejects(()=>rehearseMySQLRestore(badId,connect,tamper));
    const [empty]=await admin.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=?',[tamper]);
    assert.equal(Number(empty[0]?.n),0,'T05_TAMPER_DDL_OCCURRED');
    console.log(JSON.stringify({status:'PASS',syntheticOnly:true,mysql:'local 8.4',
      migrations:ledgerAfter,tables:Object.keys(before).length,rows:result.rows,
      foreignKeyConstraintsChecked:foreignKeysAfter,
      archiveSha256,plaintextSha256:verified.sha256,
      domain:Object.fromEntries(domain.map(name=>[name,{
        count:before[name].count,sha256:before[name].sha256}])),
      tamperRejectedBeforeDDL:true,legacyDeckNullsPreserved:true,
      srsExactScheduleAndCounters:true,imageBootVerified:false,
      offsiteRecoveryVerified:false},null,2));
  }finally{
    if(admin){
      for(const name of [...created].reverse()){
        try{await admin.query('DROP DATABASE '+safeId(name));}
        catch{console.error('BLOCKED: inspect orphan synthetic T05 QA schema with QA operator.');}
      }
      await admin.end().catch(()=>{});
    }
    await rm(dir,{recursive:true,force:true});
    if(priorSecret===undefined)delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET=priorSecret;
    if(priorDir===undefined)delete process.env.NIHON_DATA_DIR;
    else process.env.NIHON_DATA_DIR=priorDir;
  }
}
const uri=process.env.NIHON_MYSQL_TEST_URL;
if(!uri){
  console.error('BLOCKED: NIHON_MYSQL_TEST_URL missing; zero restore assertions executed.');
  process.exitCode=2;
}else{
  await run(uri).catch(error=>{
    // Never echo raw MySQL errors or credentials in CI logs.
    const value=String(error?.message||'');
    const safe=/^T05_[A-Z0-9_]+$/.test(value)?value:
      /^ER_[A-Z0-9_]+$/.test(error?.code||'')?error.code:'T05_QA_FAILED';
    console.error('FAIL: topic restore QA:',safe);
    process.exitCode=1;
  });
}
