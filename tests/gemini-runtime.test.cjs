'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {RELEASE,findRuntime,ensureRuntime}=require('../app/gemini-runtime.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'exam-gemini-runtime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const bytes=Buffer.from('mock official executable'),release={...RELEASE,sha512:crypto.createHash('sha512').update(bytes).digest('hex')};return {directory:path.join(root,'runtime'),env:{LOCALAPPDATA:path.join(root,'empty-profile')},release,fetchImpl:async()=>new Response(bytes)};}
test('Gemini first-use download verifies integrity, deduplicates and reuses the installed runtime',async t=>{
 const options=fixture(t),fetcher=options.fetchImpl;let downloads=0;options.fetchImpl=async(...args)=>{downloads++;assert.equal(args[0],RELEASE.url);assert.equal(args[1].redirect,'error');return fetcher();};
 const results=await Promise.all([ensureRuntime(options),ensureRuntime(options)]);assert.equal(results[0],results[1]);assert.equal(downloads,1);
 assert.equal(findRuntime(options),results[0]);assert.equal(await ensureRuntime(options),results[0]);assert.equal(downloads,1);
 assert.deepEqual(fs.readdirSync(options.directory).sort(),['PROVENANCE.json','agy.exe']);
});
test('Gemini corrupt or interrupted download is not executable and can be retried',async t=>{
 const options=fixture(t),fetcher=options.fetchImpl;options.fetchImpl=async()=>new Response('corrupt');
 await assert.rejects(ensureRuntime(options),/무결성/);assert.deepEqual(fs.readdirSync(options.directory),[]);
 options.fetchImpl=async()=>{throw Error('offline');};await assert.rejects(ensureRuntime(options),/다시 시도/);
 options.fetchImpl=fetcher;assert.ok(fs.existsSync(await ensureRuntime(options)));
});
test('Gemini explicit executable override is respected and never silently replaced',async t=>{
 const options=fixture(t);options.env.EXAM_ANTIGRAVITY_PATH=path.join(options.directory,'custom.exe');
 options.fetchImpl=()=>{assert.fail('Must not download over an explicit override');};await assert.rejects(ensureRuntime(options),/EXAM_ANTIGRAVITY_PATH/);
 fs.mkdirSync(options.directory,{recursive:true});fs.writeFileSync(options.env.EXAM_ANTIGRAVITY_PATH,'custom');assert.equal(await ensureRuntime(options),options.env.EXAM_ANTIGRAVITY_PATH);
});
test('Gemini download refuses unexpected sources and preserves an existing external installation',async t=>{
 const options=fixture(t);await assert.rejects(ensureRuntime({...options,release:{...options.release,url:'https://example.com/agy.exe'}}),/공식/);
 const external=path.join(options.env.LOCALAPPDATA,'agy/bin/agy.exe');fs.mkdirSync(path.dirname(external),{recursive:true});fs.writeFileSync(external,'external');
 options.fetchImpl=()=>assert.fail('Existing installation must be preserved');assert.equal(await ensureRuntime(options),external);
});
