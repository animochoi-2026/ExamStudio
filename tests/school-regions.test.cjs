const test=require('node:test'),assert=require('node:assert/strict');
test('Google candidates require exact school and unambiguous administrative location',async()=>{
 const {classifySchoolPlaces:f}=await import('../supabase/functions/_shared/school-places.mjs');
 const p=(id,province,district)=>({id,displayName:{text:'중앙중학교'},types:['secondary_school'],formattedAddress:`${province} ${district} 학교로 1`,addressComponents:[{longText:province,types:['administrative_area_level_1']},{longText:district,types:['locality']}]});
 assert.equal(f('중앙중',[p('1','서울특별시','종로구')]).status,'verified');
 assert.equal(f('중앙중',[p('1','서울특별시','종로구'),p('2','부산광역시','중구')]).status,'ambiguous');
 assert.equal(f('다른중',[p('1','서울특별시','종로구')]).status,'unverified');
 assert.equal(f('중앙중',[{...p('1','서울특별시','종로구'),addressComponents:[]}]).status,'ambiguous');
});
test('region grouping preserves names, unknown last, region+name search and duplicate district labels',async()=>{
 const m=await import('../web-bank/school-regions.js');m.setSchoolRegions([{school_key:'|서울중',name:'서울중',province:'서울특별시',district:'중구',status:'verified'},{school_key:'|부산중',name:'부산중',province:'부산광역시',district:'중구',status:'verified'}]);
 assert.equal(m.regionLabel('서울중'),'서울 중구');assert.equal(m.regionLabel('부산중'),'부산 중구');assert(m.schoolMatches('서울중','서울 중구'));assert(!m.schoolMatches('부산중','서울'));assert(m.compareSchools('미확인중','서울중')>0);
});

test('common list and select keep a region heading even for a single search match, plain school labels and stable IDs',async()=>{
 const m=await import('../web-bank/school-regions.js'),rows=[['월촌중','양천구'],['경원중','강남구'],['목운중','양천구'],['목동중','양천구'],['미상중',null]].map(([name,district],i)=>({id:'school-'+i,school_key:'|'+name,name,district,province:'서울특별시',status:district?'verified':'unverified'}));m.setSchoolRegions(rows);
 const node=(tag,text='')=>({tag,text,children:[],append(...x){this.children.push(...x);}}),source=r=>({school:r.name,schoolId:r.id}),list=node('div');
 m.appendSchoolGroups(list,rows,{node,source,render:r=>node('label',r.name)});assert.deepEqual(list.children.map(x=>x.text),['[강남구]','경원중','[양천구]','목동중','목운중','월촌중','[지역 확인 필요]','미상중']);
 const select=node('select');m.schoolOptions(select,rows.filter(r=>m.schoolMatches(source(r),'양천구 목운')),node,{source,value:r=>r.id,label:r=>r.name});assert.equal(select.children[0].label,'[양천구]');assert.equal(select.children[0].children[0].text,'목운중');assert.equal(select.children[0].children[0].value,'school-2');
});

test('location gateway never calls Google without owner authorization and caches checked outcomes',async()=>{
 const {schoolPlacesHandler}=await import('../supabase/functions/_shared/school-places.mjs');let google=0,saves=0,denied=false,busy=false,checked=false;
 const env=k=>({SUPABASE_URL:'https://fixture.test',SUPABASE_ANON_KEY:'test-public',GOOGLE_MAPS_API_KEY:'test-only'})[k];
 const handler=schoolPlacesHandler({env,fetchImpl:async(url,options)=>{if(url.includes('googleapis')){google++;assert.equal(options.headers['X-Goog-Api-Key'],'test-only');return Response.json({places:[]});}if(url.endsWith('bank_school_regions_sync'))return Response.json(denied?{message:'denied'}:[{school_key:'|검증중',name:'검증중',version:1,checked_at:checked?'2026-01-01':null}],{status:denied?403:200});if(url.endsWith('bank_school_region_claim'))return Response.json(busy?{busy:true}:{claimed:true});if(url.endsWith('bank_school_region_save')){saves++;return Response.json(JSON.parse(options.body).value);}throw Error('unexpected request');}});
 const request=()=>new Request('https://fixture.test/function',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify({spaceId:'fixture',schoolKey:'|검증중'})});
 assert.equal((await handler(new Request('https://fixture.test/function',{method:'POST'}))).status,401);
 denied=true;await handler(request());assert.equal(google,0);denied=false;busy=true;assert.equal((await handler(request())).status,409);assert.equal(google,0);busy=false;checked=true;assert.equal((await (await handler(request())).json()).reused,true);assert.equal(google,0);checked=false;const result=await (await handler(request())).json();assert.equal(result.school.status,'unverified');assert.equal(google,1);assert.equal(saves,1);assert(!JSON.stringify(result).includes('test-only'));
});
