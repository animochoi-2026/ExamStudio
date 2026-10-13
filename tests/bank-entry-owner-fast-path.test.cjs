const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261013124928_bank_entry_owner_fast_path.sql'),'utf8');
test('entry owner fast path preserves permissions and skips recursive folder scan only when already allowed',async t=>{
 const s=await require('./shared-bank-local-server.cjs').localServer();t.after(()=>s.close());
 const own='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',file='10000000-0000-4000-8000-000000000003';
 await s.db.exec(`reset role;insert into public.bank_members(space_id,email,user_id,role) values('${s.S}','teacher-b@example.test','${s.B}','teacher') on conflict do nothing;
 insert into public.bank_entries(id,space_id,parent_id,name,kind,owner_id) values
 ('${own}','${s.S}','${s.S}','own folder','folder','${s.A}'),
 ('${other}','${s.S}','${s.S}','other folder','folder','${s.B}'),
 ('${file}','${s.S}','${other}','private file','file','${s.B}');`);
 const ids=[s.S,own,other,file,'10000000-0000-4000-8000-000000000099'];
 const matrix=async()=>{const out=[];for(const uid of [s.A,s.B,s.X])for(const id of ids){const r=await s.sql(uid,'select public.bank_read_entry($1) allowed',[id]);out.push([uid,id,r.rows[0].allowed]);}return out;};
 const before=await matrix();await s.db.exec('reset role;'+migration);assert.deepEqual(await matrix(),before);
 // Prove the owner/root branches never invoke the expensive descendant scan.
 await s.db.exec(`reset role;create or replace function public.bank_read_folder(f uuid) returns boolean language plpgsql stable security definer set search_path='' as $$ begin raise exception 'recursive scan invoked'; end $$;`);
 assert.equal((await s.sql(s.A,'select public.bank_read_entry($1) allowed',[own])).rows[0].allowed,true);
 assert.equal((await s.sql(s.A,'select public.bank_read_entry($1) allowed',[s.S])).rows[0].allowed,true);
 assert.equal((await s.sql(s.X,'select public.bank_read_entry($1) allowed',[own])).rows[0].allowed,false);
 await assert.rejects(s.sql(s.A,'select public.bank_read_entry($1)',[other]),/recursive scan invoked/);
 await s.db.exec(`reset role;update public.bank_members set enabled=false where email='teacher-b@example.test';`);
 assert.equal((await s.sql(s.B,'select public.bank_read_entry($1) allowed',[other])).rows[0].allowed,false);
});
