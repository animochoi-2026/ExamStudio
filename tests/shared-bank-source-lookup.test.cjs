'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {SharedBankStorage}=require('../app/shared-bank-storage.cjs');

test('source lookup includes the predicate of the existing partial index',async()=>{
 let route;
 const auth={config:()=>({spaceId:'57fcd460-b526-487f-9075-5503e4d07145'}),token:async()=>'',request:async value=>{route=value;return [];}};
 const storage=new SharedBankStorage({auth});
 const key='a'.repeat(64);
 assert.deepEqual(await storage.list(`trashed=false and appProperties has { key='sourceKey' and value='${key}' }`),{files:[]});
 const url=new URL(route,'https://example.invalid');
 assert.equal(url.searchParams.get('props->>role'),'eq.source');
 assert.equal(url.searchParams.get('props->>sourceKey'),'eq.'+key);
 assert.equal(url.searchParams.get('verified'),'eq.true');
});
