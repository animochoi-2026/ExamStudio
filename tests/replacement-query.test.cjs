const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),{PGlite}=require('@electric-sql/pglite');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,space=id(999);
test('server replacement pages preserve school pool, scopes, exclusions and stable order without difficulty gates',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema bank_summary;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function bank_member(s uuid,admin boolean default false) returns boolean language sql as $$select auth.uid() is not null$$;
 create function bank_read_revision(r uuid) returns boolean language sql as $$select public.bank_member(null::uuid)$$;
 create function bank_type_matches(m jsonb,f jsonb,t text) returns boolean language sql as $$select coalesce(t,'')='' or m#>>'{classification,types,0,name}'=t$$;
 create function bank_summary.row_difficulty(r uuid,m jsonb,f jsonb) returns jsonb language sql as $$select jsonb_build_object('score',m#>'{difficulty,userScore}','band',case when (m#>>'{difficulty,userScore}')::numeric>=8 then 'high' else 'middle' end)$$;
 create table bank_questions(id uuid primary key,space_id uuid,archived boolean default false,owner_email text);
 create table bank_revisions(id uuid primary key,question_id uuid,parent_id uuid,committed boolean default true,visibility text default 'approved');
 create table bank_catalog(revision_id uuid,question_id uuid,space_id uuid,metadata jsonb,confirmed jsonb default '{}',content jsonb default '{}',created_at timestamptz default now());
 create table bank_question_sets(space_id uuid,source_document text,original_numbers text[]);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261012054328_question_replacement.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261012062747_replacement_query_materialization.sql','utf8'));
 const taxonomy=(await db.query('select u.id,array_agg(a.id order by a.id) ids from bank_query.units u join bank_query.units a on a.ordinal <@ u.allowed group by u.id')).rows;const C=require('../app/curriculum.js');for(const u of taxonomy)assert.deepEqual(u.ids,C.allowedUnitIds([u.id]).sort());
 await db.exec(`select set_config('request.jwt.claim.sub','${id(9999)}',false);`);
 for(let n=1;n<=32;n++){
 const unit=n===29?'m2-9.1':n===28?'m2-8.6':'m2-8.7',school=n>=20&&n<=27?'Other':'Original',typ=n===27||n===30?'other':'length';
 const meta={source:{school,grade:'중2',documentId:'exam',originalNumber:String(n),kind:'학교기출'},classification:{primaryUnit:{id:unit},types:[{id:typ,name:typ}]},difficulty:{userScore:n%11}};
 await db.query('insert into bank_questions values($1,$2,false,$3)',[id(n),space,'teacher@example.test']);await db.query('insert into bank_revisions(id,question_id) values($1,$2)',[id(100+n),id(n)]);
 await db.query('insert into bank_catalog(revision_id,question_id,space_id,metadata,content) values($1,$2,$3,$4,$5)',[id(100+n),id(n),space,JSON.stringify(meta),JSON.stringify({body:'人工 body',solution:'PRIVATE SOLUTION',answer:'PRIVATE ANSWER'})]);
 }
 await db.query('insert into bank_question_sets values($1,$2,$3)',[space,'exam',['31','32']]);
 const rules={schools:['Original'],units:['m2-8.7','m2-8.6'],excludeIds:[id(2)],bins:[{min:99,max:100}],profile:{high:100}};
 const args=[space,id(101),JSON.stringify(rules),[id(1),id(3)]];
 const get=async(page=0,expanded=false,version=null,candidate=null)=>(await db.query('select bank_replacement_page($1,$2,$3,$4,$5,$6,$7,$8) v',[...args,page,expanded,version,candidate])).rows[0].v;
 const first=await get();assert.equal(first.items.length,10);assert.equal(first.baseCount,18);assert.equal(first.extraCount,7);
 const second=await get(1,false,first.version);assert.equal(new Set([...first.items,...second.items].map(x=>x.question_id)).size,18);assert(first.items.some(x=>x.summaryDifficulty.score<8));
 const expanded=[];for(let p=0;p<3;p++)expanded.push(...(await get(p,true,first.version)).items);
 assert.equal(expanded.length,25);for(const row of [...first.items,...second.items])assert(expanded.some(x=>x.question_id===row.question_id));
 assert(!expanded.some(x=>[id(1),id(2),id(3),id(27),id(29),id(31),id(32)].includes(x.question_id)));
 assert.equal(expanded.find(x=>x.question_id===id(28)).tier,3);assert.equal(expanded.find(x=>x.question_id===id(30)).tier,2);
 assert(!JSON.stringify(expanded).includes('PRIVATE'));assert(expanded.every(x=>!x.files));
 assert.equal((await get(0,false,null,id(20))).items.length,0);assert.equal((await get(0,true,null,id(20))).items.length,1);
 await db.query("update bank_catalog set confirmed='{\"originalPoints\":4}' where question_id=$1",[id(4)]);assert.equal((await get(1,false,first.version)).changed,true);
 await db.query('update bank_questions set archived=true where id=$1',[id(4)]);assert.equal((await get(1,false,first.version)).changed,true);
 await db.exec("select set_config('request.jwt.claim.sub','',false)");await assert.rejects(get());
 }finally{await db.close();}
});
