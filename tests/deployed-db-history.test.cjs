'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const expected=require('./fixtures/deployed-db-history/expected-functions.json');
test('isolated replay matches read-only production function bodies and security attributes',async t=>{
 const s=await require('./shared-bank-local-server.cjs').localServer();t.after(()=>s.close());
 for(const f of expected){
  const row=(await s.db.query("select md5(replace(prosrc,E'\\r\\n',E'\\n')) digest,proacl::text[] acl,prosecdef,proconfig from pg_proc where oid=$1::regprocedure",[f.identity])).rows[0];
  assert.equal(row.digest,f.bodyMd5,f.identity+' body');
  assert.equal(row.prosecdef,f.securityDefiner,f.identity+' security definer');
  assert.deepEqual(row.proconfig,f.config,f.identity+' search path');
  // PGlite's bootstrap owner is postgres, matching production. Compare explicit grants exactly.
  const grants=Array.isArray(f.acl)?f.acl:(f.acl||'{}').slice(1,-1).split(',').filter(Boolean);
  assert.deepEqual((row.acl||[]).sort(),grants.sort(),f.identity+' ACL');
 }
});
