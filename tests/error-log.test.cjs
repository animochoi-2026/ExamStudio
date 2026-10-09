const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ErrorLog}=require('../app/error-log.cjs');
test('errors survive restart separately from project/AI data and preserve long readable messages',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-errors-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const log=new ErrorLog(dir);assert.deepEqual(log.read(),[]);
 const text='긴 오류\n'.repeat(400)+'마지막 원인';const entry=log.append({projectId:'project-1',problemId:'problem-1',text});
 const again=log.append({projectId:'project-1',problemId:'problem-1',text});assert.equal(again.id,entry.id);assert.equal(log.read().length,1);
 assert.equal(new ErrorLog(dir).read()[0].text,text);assert.equal(entry.role,'error');assert.equal(entry.problemId,'problem-1');
 assert.deepEqual(fs.readdirSync(dir),['error-log.json']);
 assert.match(log.append({text:'Bearer secret-token sk-example-secret-123'}).text,/redacted/);
 assert.doesNotMatch(log.read().at(-1).text,/secret-token|sk-example/);
 const other=log.append({projectId:'project-2',problemId:'problem-2',text:'다른 문제 오류'});
 log.remove([entry.id]);assert.ok(!log.read().some(e=>e.id===entry.id));assert.ok(log.read().some(e=>e.id===other.id));
 const shown=log.read().filter(e=>e.projectId!=='project-2');log.remove(shown.map(e=>e.id));assert.deepEqual(log.read().map(e=>e.id),[other.id]);
 assert.throws(()=>log.remove('all'));assert.equal(new ErrorLog(dir).read().length,1);
 fs.writeFileSync(log.file,'bad json');assert.throws(()=>log.append({text:'x'}));assert.equal(fs.readFileSync(log.file,'utf8'),'bad json');
});

test('successful retry archives only matching errors for this project and problem',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exam-resolved-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const log=new ErrorLog(dir);
 const a=log.append({projectId:'p',problemId:'a',text:'인식 실패'}),b=log.append({projectId:'p',problemId:'b',text:'인식 실패'}),c=log.append({projectId:'p',problemId:'a',text:'아직 해결 안됨'});
 assert.deepEqual(log.resolve('p','a',[{reasons:['인식 실패']}]),[a.id]);assert.deepEqual(log.read().map(e=>e.id),[b.id,c.id]);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'error-log-resolved.json')))[0].id,a.id);
});
