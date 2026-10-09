const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const engine=require('../scripts/export-engine.cjs');
test('web and desktop stage the same engine and stale or omitted files fail verification',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'exam-engine-test-')),web=path.join(root,'web'),desktop=path.join(root,'desktop');
 const a=engine.stage(web),b=require('../phase2-desktop/scripts/export-engine.cjs').stage(desktop);
 assert.deepEqual(a,b);assert.equal(engine.verify(desktop).engineId,a.engineId);
 fs.appendFileSync(path.join(desktop,'word_math.py'),'\n# stale copy\n');assert.throws(()=>engine.verify(desktop),/서로 다릅니다/);
 fs.renameSync(path.join(web,'export_hwpx.py'),path.join(web,'export_hwpx.py.missing'));assert.throws(()=>engine.verify(web));
});
test('worker blocks a mismatched cached engine before Python composition',async()=>{
 const messages=[],manifest=engine.manifest();let composed=false;
 const context={Uint8Array,URL,crypto:require('node:crypto').webcrypto,importScripts(){},
 self:{location:{href:'http://localhost/export-worker.js'},postMessage:value=>messages.push(value)},
 loadPyodide:async()=>({loadPackage:async()=>{},unpackArchive(){},FS:{mkdirTree(){},writeFile(){},analyzePath(){return{exists:false}}},globals:{delete(){}},runPythonAsync(){composed=true}}),
 fetch:async url=>({ok:true,text:async()=>JSON.stringify(manifest),arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer})};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../web-bank/export-worker.js'),'utf8'),context);
 await context.self.onmessage({data:{format:'docx',assets:[],snapshot:{}}});
 assert.equal(composed,false);assert.match(messages.at(-1).error,/출력 엔진 파일이 서로 다릅니다/);
 await context.self.onmessage({data:{format:'hwpx',assets:[],snapshot:{}}});
 assert.equal(composed,false);assert.match(messages.at(-1).error,/출력 엔진 파일이 서로 다릅니다/);
});
test('aggregate formula diagnostics stay visible without Python traceback',()=>{
 const context={importScripts(){},self:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../web-bank/export-worker.js'),'utf8'),context);
 context.failure={message:'Traceback (most recent call last):\nFile /home/pyodide/example.py\nword_math.MathSyntaxError: 1번 본문: unknownOne | 2번 상세 풀이: unknownTwo'};
 const message=vm.runInContext('exportErrorMessage(failure)',context);
 assert.equal(message,'1번 본문: unknownOne | 2번 상세 풀이: unknownTwo');
});
