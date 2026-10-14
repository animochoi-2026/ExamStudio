const test=require('node:test'),assert=require('node:assert/strict'),{listFixture}=require('./list-pages-fixture.cjs');
test('server pages are 20/20/3 with stable ordering; atomic group edits preserve permissions and reject stale/missing confirmations',async t=>{
 const x=await listFixture();t.after(()=>x.close());const {A,B,X,S,g,other,users,db,rpc}=x;
 const collect=async(name,args,key)=>{const pages=[];for(const start_at of [0,20,40])pages.push(await rpc(A,name,{s:S,...args,start_at}));assert.deepEqual(pages.map(p=>p.items.length),[20,20,3]);const ids=pages.flatMap(p=>p.items.map(m=>m[key]));assert.equal(new Set(ids).size,43);return pages;};
 for(const filters of [{text:'low'},{text:'low',status:'shared_pending'},{compositionBand:'low'},{compositionBand:'middle'},{compositionBand:'high'},{compositionBand:'killer'}])await collect('bank_question_page',{filters},'question_id');
 const requested=x.questions.slice(0,2);await db.exec('reset role');for(const q of requested)await db.query("update bank_catalog set metadata=jsonb_set(metadata,'{source,documentId}',to_jsonb('page-set'::text)) where revision_id=$1",[q.r]);await db.query("insert into bank_question_sets(space_id,source_document,original_numbers,common,owner_id) values($1,'page-set',array['1','2'],'{}',$2)",[S,A]);const registry=await rpc(A,'bank_question_sets_page',{s:S,revisions:[requested[0].r]});assert.equal(registry.length,1);assert.equal(registry[0].members.length,2);assert.deepEqual(await rpc(A,'bank_question_sets_page',{s:S,revisions:[x.questions[10].r]}),[]);await assert.rejects(()=>rpc(A,'bank_question_sets_page',{s:S,revisions:x.questions.slice(0,21).map(q=>q.r)}),/20문항/);
 const pages=await collect('bank_members_page',{filters:{text:'검증학원'}},'userId');assert.equal(pages[2].startAt,40);assert.equal((await rpc(A,'bank_members_page',{s:S,filters:{text:'missing'},start_at:40})).startAt,0);
 await collect('bank_members_page',{filters:{text:'검증학원'},target_group:g},'userId');
 const first=await rpc(A,'bank_members_page',{s:S,target_group:g});assert(first.items.slice(0,5).every(m=>m.groupId===g));
 assert((await rpc(B,'bank_members_page',{s:S})).items.every(m=>m.groupId===g));
 for(const u of [B,X]){await assert.rejects(()=>rpc(u,'bank_members_page',{s:S,target_group:g}));await assert.rejects(()=>rpc(u,'bank_group_members_save',{s:S,g,changes:[]}));}
 await assert.rejects(()=>rpc(X,'bank_members_page',{s:S}));await x.actor(null);await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select bank_members_page($1)',[S]));
 const add={userId:users[10].userId,expectedGroupId:null,selected:true},remove={userId:users[0].userId,expectedGroupId:g,selected:false},move={userId:users[42].userId,expectedGroupId:other,selected:true};
 await assert.rejects(()=>rpc(A,'bank_group_members_save',{s:S,g,changes:[add,remove,move]}),/이동/);
 assert.equal((await rpc(A,'bank_members_page',{s:S,filters:{text:users[10].email}})).items[0].groupId,null);
 assert.equal((await rpc(A,'bank_group_members_save',{s:S,g,changes:[add,remove,{...move,confirmMove:true}]})).changed,3);
 assert.equal((await rpc(A,'bank_members_page',{s:S,filters:{text:users[42].email}})).items[0].groupId,g);
 await assert.rejects(()=>rpc(A,'bank_group_members_save',{s:S,g,changes:[add]}),/소속 그룹이 변경/);
 await assert.rejects(()=>rpc(A,'bank_group_members_save',{s:S,g,changes:[{userId:users[1].userId,expectedGroupId:g,selected:false},{userId:users[1].userId,expectedGroupId:g,selected:false}]}),/중복/);
 await assert.rejects(()=>rpc(B,'bank_security_overview',{s:S}));
 await db.exec('reset role');await db.query('delete from bank_members where user_id=any($1::uuid[])',[users.slice(40).map(u=>u.userId)]);
 const clamped=await rpc(A,'bank_members_page',{s:S,filters:{text:'검증학원'},start_at:40});assert.equal(clamped.startAt,20);assert.equal(clamped.items.length,20);
 console.log('Verified real PostgreSQL: 20/20/3 in search, review, every band, members and group picker; transaction rollback, stale edits, role isolation, empty-page fallback.');
});
