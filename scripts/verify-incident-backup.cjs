'use strict';
// Offline backup rehearsal. All database mutations below target an in-memory PGlite instance.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir=path.resolve(__dirname,'../data/diagnostics/db-20261001-hotfix'),data=JSON.parse(fs.readFileSync(path.join(dir,'database-backup.json')));
(async()=>{const x=await require('../tests/shared-bank-local-server.cjs').localServer();try{
 await x.db.exec('reset role;set session_replication_role=replica;');
 const names=Object.keys(data.tables);await x.db.exec('truncate '+names.map(n=>'public.'+n).join(',')+' cascade');
 for(const m of data.tables.bank_members)if(m.user_id)await x.db.query('insert into auth.users values($1,$2,now()) on conflict do nothing',[m.user_id,m.email]);
 for(const name of names){await x.db.query(`insert into public.${name} overriding system value select * from jsonb_populate_recordset(null::public.${name},$1)`,[JSON.stringify(data.tables[name])]);assert.equal(Number((await x.db.query(`select count(*) n from public.${name}`)).rows[0].n),data.tables[name].length);}
 await x.db.exec('set session_replication_role=origin');
 assert.equal(Number((await x.db.query('select count(*) n from bank_revision_files l left join bank_revisions r on r.id=l.revision_id left join bank_entries e on e.id=l.file_id where r.id is null or e.id is null')).rows[0].n),0);
 const M=require('../app/bank-model.cjs');let restored=0,withDiagram=0;for(const c of data.tables.bank_catalog){
  const native=c.files.find(f=>f.role==='data');assert.ok(native);const bundle=JSON.parse(fs.readFileSync(path.join(dir,'storage-files',native.id))),captured=new Map();
  for(const f of bundle.files){const b=fs.readFileSync(path.join(dir,'storage-files',f.id));assert.equal(b.length,f.size);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),f.sha256);captured.set(f.key,b);}
  const p=M.restoreSnapshot(bundle,captured,path.join(dir,'offline-restore',c.revision_id));const target=p.problems.flatMap(p=>[p.original,...p.variants]).find(q=>q?.id===bundle.native.targetQuestionId);assert.ok(target);assert.equal(target.body,c.content.body);assert.deepEqual(target.choices||[],c.content.choices||[]);if(target.diagram||target.diagrams?.length)withDiagram++;restored++;
 }
 const result={at:new Date().toISOString(),environment:'in-memory PostgreSQL engine; offline actual backup files',tablesRestored:names.length,versionsRestored:restored,withDiagram,revisionFileReferences:528,productionWrites:false};fs.writeFileSync(path.join(dir,'backup-rehearsal.json'),JSON.stringify(result,null,2));console.log(result);
}finally{await x.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
