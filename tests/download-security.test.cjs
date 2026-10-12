const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,space=id(99);
test('official download ledger: roles, duplicate requests, threshold boundary, failures and unblock allowance',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role authenticator;create role service_role;create schema auth;create schema bank_access;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table bank_spaces(id uuid primary key);insert into bank_spaces values('${space}');
 create table bank_members(space_id uuid,user_id uuid,email text,role text,enabled boolean);
 create table bank_access.owners(space_id uuid,user_id uuid);
 create function bank_member(s uuid,admin boolean default false) returns boolean language sql stable security definer as $$select exists(select 1 from bank_members where space_id=s and user_id=auth.uid() and enabled and (not admin or role='owner'))$$;
 create table bank_questions(id uuid primary key,archived boolean default false);
 create table bank_revisions(id uuid primary key,question_id uuid,committed boolean default true,visibility text default 'approved');
 create table bank_catalog(revision_id uuid,question_id uuid,space_id uuid,metadata jsonb,created_at timestamptz default now());
 create table bank_exam_drafts(id uuid,space_id uuid,owner_id uuid);create table bank_mock_exams(id uuid,space_id uuid,owner_id uuid);
 create function bank_read_revision(r uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.bank_catalog where revision_id=r and public.bank_member(space_id))$$;
 alter table bank_catalog enable row level security;create policy read_catalog on bank_catalog for select to authenticated using(bank_read_revision(revision_id));grant select on bank_catalog to authenticated;
 grant usage on schema public,auth to authenticated;
 insert into auth.users select ('0000000'||n||'-1111-4111-8111-111111111111')::uuid,'test'||n||'@example.test',now() from generate_series(1,7)n;
 insert into bank_members select '${space}',id,email,case when id in ('${id(1)}','${id(2)}') then 'owner' when id='${id(3)}' then 'admin' else 'teacher' end,true from auth.users where id<>'${id(7)}';
 insert into bank_access.owners select space_id,user_id from bank_members where role='owner';`);
 for(let n=101;n<=110;n++){
  await db.query('insert into bank_questions(id) values($1)',[id(n)]);
  await db.query('insert into bank_revisions(id,question_id) values($1,$1)',[id(n)]);
  await db.query('insert into bank_catalog(revision_id,question_id,space_id,metadata) values($1,$1,$2,$3)',[id(n),space,JSON.stringify({source:{kind:'학교기출',documentId:'source-'+n}})]);
 }
 await db.exec(fs.readFileSync('supabase/migrations/20261012081610_download_security.sql','utf8'));
 // The PostgREST hook also runs for bank-verify's service role. The original
 // migration allowed browser roles only, preventing every file verification.
 assert.equal((await db.query("select has_function_privilege('service_role','bank_security_request_guard()','EXECUTE') ok")).rows[0].ok,false);
 await db.exec(fs.readFileSync('supabase/migrations/20261012181330_restore_upload_verifier_guard_execute.sql','utf8'));
 await db.exec('set role service_role;select bank_security_request_guard();reset role');
 const actor=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);await db.exec('set role authenticated');};
 const rpc=async(name,args)=> (await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
 const begin=(req,ns=[101],fmt='pdf')=>rpc('bank_download_begin',[space,id(req),fmt,ns.map(id),'exam',null]);
 const finish=(req,ok=true)=>rpc('bank_download_finish',[space,id(req),ok]);
 await actor(1);await rpc('bank_security_configure',[space,90,true,0]);
 assert.equal((await rpc('bank_security_overview',[space])).sourceTotal,10);
 for(const who of [3,4,7]){await actor(who);await assert.rejects(rpc('bank_security_overview',[space]));await assert.rejects(rpc('bank_security_configure',[space,100,false,1]));await assert.rejects(rpc('bank_security_unblock',[space,id(4),1,'test']));await assert.rejects(db.query('select * from bank_security.identities'));}
 await actor(7);await assert.rejects(begin(900));await actor(null);await assert.rejects(begin(900));
 await actor(4);const a=await begin(901,[101,101,102]);assert.match(a.identifier,/^\d{4}$/);assert.equal((await begin(901,[102,101])).identifier,a.identifier);await assert.rejects(begin(901,[103]));assert((await finish(901)).allowed);assert((await finish(901)).allowed);
 await begin(902,[103]);assert.equal((await finish(902,false)).state,'failed');
 await begin(903,[103,104,105,106,107,108]);assert((await finish(903)).allowed);
 await begin(904,[109]);await begin(905,[110]);
 const results=await Promise.allSettled([finish(904),finish(905)]);assert(results.every(r=>r.status==='rejected'||!r.value.allowed));
 assert.equal((await rpc('bank_member',[space])).toString(),'false');assert.equal((await db.query('select * from bank_catalog')).rows.length,0);await assert.rejects(rpc('bank_security_request_guard',[]));
 await actor(1);let overview=await rpc('bank_security_overview',[space]);let u=overview.users.find(x=>x.userId===id(4));assert.equal(u.sources,8);assert.equal(u.downloads,2);assert(u.blocked);
 await rpc('bank_security_unblock',[space,id(4),1,'one additional source approved']);
 await actor(4);assert.equal((await begin(906,[109])).identifier,a.identifier);assert((await finish(906)).allowed);await begin(907,[110]);assert(!(await finish(907)).allowed);
 await actor(1);await begin(908,Array.from({length:10},(_,i)=>101+i));assert((await finish(908)).allowed);
 await actor(5);const b=await begin(909);assert.notEqual(b.identifier,a.identifier);
 await db.exec('reset role');await db.query('update bank_members set enabled=false where user_id=$1',[id(5)]);await actor(5);await assert.rejects(finish(909));
 await actor(3);await begin(910,[101]);assert((await finish(910)).allowed);
 await actor(1);await rpc('bank_security_overview',[space,0,null,null,null,id(101),a.identifier]);
 // No public source exams: no divide by zero and no automatic block.
 await db.exec('reset role;update bank_questions set archived=true');await actor(6);await begin(911,[101]);assert((await finish(911)).allowed);
 await db.exec('reset role');const before=(await db.query('select count(*) n from bank_security.downloads')).rows[0].n;
 await db.exec(fs.readFileSync('supabase/rollback-download-security.sql','utf8'));
 assert.equal((await db.query('select count(*) n from bank_security.downloads')).rows[0].n,before);
 assert.equal((await db.query("select has_function_privilege('authenticated','bank_download_begin(uuid,uuid,text,uuid[],text,uuid)','EXECUTE') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
