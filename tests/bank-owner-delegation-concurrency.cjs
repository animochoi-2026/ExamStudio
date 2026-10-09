'use strict';
// Disposable native PostgreSQL, separate sessions and real overlapping locks.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),net=require('node:net'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),bin=path.join(os.tmpdir(),'examstudio-dbhotfix-tools/pgsql/bin');
const cluster=fs.mkdtempSync(path.join(os.tmpdir(),'examstudio-member-owner-')),out=path.join(root,'tmp/member-owner-delegation');
const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,PGCLIENTENCODING:'UTF8'};
const S='57fcd460-b526-487f-9075-5503e4d07145',A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-cccc-cccccccccccc';
let port,started=false;
function run(name,args,input){const r=cp.spawnSync(path.join(bin,name+'.exe'),args,{env,input,encoding:'utf8',windowsHide:true,...(name==='pg_ctl'?{stdio:'ignore'}:{}),maxBuffer:8*1024*1024});if(r.status!==0)throw Error(name+' failed: '+(r.stderr||r.status));return r.stdout;}
const psqlArgs=()=>['-h','127.0.0.1','-p',String(port),'-U','fixture','-d','postgres','-X','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=q=>run('psql',psqlArgs(),q).trim();
function session(code){const child=cp.spawn(path.join(bin,'psql.exe'),psqlArgs(),{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='',signal;const locked=new Promise(resolve=>signal=resolve);const done=new Promise(resolve=>{child.stdout.on('data',b=>{stdout+=b;if(stdout.includes('LOCKED'))signal();});child.stderr.on('data',b=>stderr+=b);child.on('close',exit=>resolve({exit,stdout,stderr}));child.on('error',e=>resolve({exit:-1,stderr:e.message}));});child.stdin.end(code);return{locked,done};}
const actor=(id,statement)=>`BEGIN;SET LOCAL request.jwt.claim.sub='${id}';SET LOCAL ROLE authenticated;${statement};COMMIT;`;
const role=(email,next,version)=>`SELECT bank_change_member_role('${S}','${email}','${next}',${version},'${email}')`;
(async()=>{try{
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));port=probe.address().port;await new Promise(r=>probe.close(r));
 run('initdb',['-D',cluster,'-U','fixture','-A','trust','--encoding=UTF8','--locale=C']);
 run('pg_ctl',['-D',cluster,'-l',path.join(cluster,'server.log'),'-o','-h 127.0.0.1 -p '+port,'-w','start']);started=true;
 sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA storage;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb DEFAULT '{}',UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,anon,service_role;
 INSERT INTO auth.users VALUES('${A}','animochoi@gmail.com',now()),('${B}','teacher-b@example.test',now()),('${C}','teacher-c@example.test',now());`);
 for(const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).sort())sql(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
 sql(actor(A,`SELECT bank_join('${S}');SELECT bank_invite('${S}','teacher-b@example.test');SELECT bank_invite('${S}','teacher-c@example.test')`));
 sql(actor(B,`SELECT bank_join('${S}')`));sql(actor(C,`SELECT bank_join('${S}')`));
 sql(actor(A,role('teacher-b@example.test','owner',1)));
 const report={engine:'native PostgreSQL, independent sessions',productionWrites:0,aiCalls:0,checks:[]};
 // A demotes itself and holds the space lock. B's self-demotion must wait,
 // then reject because B became the last administrator.
 const first=session(actor(A,role('animochoi@gmail.com','reviewer',1)+";SELECT 'LOCKED';SELECT pg_sleep(0.4)"));await first.locked;
 const second=session(actor(B,role('teacher-b@example.test','reviewer',2)));const pair=await Promise.all([first.done,second.done]);
 assert.equal(pair[0].exit,0);assert.notEqual(pair[1].exit,0);assert.match(pair[1].stderr,/마지막 관리자/);
 assert.equal(sql("SELECT count(*) FROM bank_members WHERE role='owner' AND enabled"),'1');report.checks.push('overlapping self-demotions retain one owner');
 sql(actor(B,role('animochoi@gmail.com','owner',2)));
 // Both owners loaded the same C version. Only the first change may commit.
 const third=session(actor(A,role('teacher-c@example.test','owner',1)+";SELECT 'LOCKED';SELECT pg_sleep(0.4)"));await third.locked;
 const fourth=session(actor(B,role('teacher-c@example.test','reviewer',1)));const secondPair=await Promise.all([third.done,fourth.done]);
 assert.equal(secondPair[0].exit,0);assert.notEqual(secondPair[1].exit,0);assert.match(secondPair[1].stderr,/회원 정보가 변경/);report.checks.push('overlapping stale target change rejects with CAS');
 // An actor demoted while waiting cannot use its old owner permissions.
 const fifth=session(actor(A,role('teacher-b@example.test','reviewer',2)+";SELECT 'LOCKED';SELECT pg_sleep(0.4)"));await fifth.locked;
 const sixth=session(actor(B,role('teacher-c@example.test','reviewer',2)));const thirdPair=await Promise.all([fifth.done,sixth.done]);
 assert.equal(thirdPair[0].exit,0);assert.notEqual(thirdPair[1].exit,0);assert.match(thirdPair[1].stderr,/insufficient_privilege|permission denied/);report.checks.push('waiting demoted actor loses grant rights before mutation');
 assert.equal(sql("SELECT count(*) FROM bank_audit WHERE action='member_role_change'"),'5');report.checks.push('only committed role changes generate audit entries');
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'concurrency-validation.json'),JSON.stringify(report,null,2));console.log('PASS '+report.checks.join('; '));
}finally{if(started)run('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);}})().catch(e=>{console.error(e);process.exitCode=1;});
