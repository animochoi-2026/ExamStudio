/* Local-only Python document composition and native HWPX packaging. */
importScripts('./runtime/pyodide.js');
let runtime, engineReady=false;
function exportErrorMessage(error) {
 const lines=String(error.message||error).trim().split('\n').map(s=>s.trim()).filter(Boolean);
 const last=lines.at(-1)||'문서를 생성하지 못했습니다.';
 return last.replace(/^(?:[\w.]+\.)?(?:MathSyntaxError|ValueError):\s*/, '');
}
async function resource(path, binary = false) {
 const response = await fetch(path,{cache:'no-cache'});
 if (!response.ok) throw Error('문서 엔진 파일을 불러오지 못했습니다: ' + path);
 return binary ? new Uint8Array(await response.arrayBuffer()) : response.text();
}
self.onmessage = async ({data}) => {
 const assets = [], format = data.format || 'docx';
 try {
  if (!['docx','hwpx'].includes(format)) throw Error('지원하지 않는 문서 형식입니다.');
  if (!engineReady) {
   self.postMessage({progress:'문서 엔진을 처음 불러오는 중입니다 (약 15MB).'});
   if(!runtime)runtime = await loadPyodide({indexURL:new URL('./runtime/',self.location.href).href});
   await runtime.loadPackage(['lxml','pillow']);
   for (const name of ['python_docx-1.2.0-py3-none-any.whl','typing_extensions-4.15.0-py3-none-any.whl']) {
    runtime.unpackArchive(await resource('./runtime/'+name,true),'zip',{extractDir:'/lib/python3.13/site-packages'});
   }
   const manifestText=await resource('./python/export-engine.json'),manifest=JSON.parse(manifestText);
   const names=['paper_form.py','export_docx.py','word_math.py','structured_docx.py','solution_guide_docx.py','export_hwpx.py','hwp_native.py','hwp_compat.py','export_preflight.py','export_integrity.py','hwpx/Skeleton.hwpx','hwpx/LICENSE.txt','hwpx/NOTICE.txt'];
   if(manifest.schema!==1||JSON.stringify(Object.keys(manifest.assets||{}).sort())!==JSON.stringify([...names].sort()))throw Error('출력 엔진 정보가 다릅니다. 페이지를 새로고침해 주세요.');
   runtime.FS.mkdirTree('/home/pyodide/hwpx');
   for(const name of names){
    const bytes=await resource('./python/'+name,true);
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==manifest.assets[name])throw Error('출력 엔진 파일이 서로 다릅니다. 페이지를 새로고침해 주세요: '+name);
    runtime.FS.writeFile('/home/pyodide/'+name,bytes);
   }
   runtime.FS.writeFile('/home/pyodide/export-engine.json',manifestText);
   engineReady=true;
  }
  for (const asset of data.assets) {
   if (!/^(?:figure-\d+-\d+|paper-(?:form|logo)-\d+)\.png$/.test(asset.name)) throw Error('그림 파일 이름이 잘못되었습니다.');
   const path = '/tmp/'+asset.name;
   runtime.FS.writeFile(path,new Uint8Array(asset.bytes));
   assets.push(path);
  }
  self.postMessage({progress:format==='hwpx'?'HWPX 문단·수식·표·그림을 구성하고 참조를 검사하는 중…':'편집 가능한 문서로 변환 중…'});
  runtime.globals.set('snapshot_json',JSON.stringify(data.snapshot));
  runtime.globals.set('export_format',format);
  await runtime.runPythonAsync("import json, importlib\nengine = importlib.import_module('export_' + export_format)\nexport_result = engine.export_document(json.loads(snapshot_json), '/tmp/exam.' + export_format)");
  const bytes = runtime.FS.readFile('/tmp/exam.'+format);
  self.postMessage({bytes},[bytes.buffer]);
 } catch (e) {
  self.postMessage({error:exportErrorMessage(e)});
 } finally {
  if (runtime) {
   for (const path of [...assets,'/tmp/exam.docx','/tmp/exam.hwpx','/tmp/exam.layout.json']) {
    if (runtime.FS.analyzePath(path).exists) runtime.FS.unlink(path);
   }
   runtime.globals.delete('snapshot_json');
  }
 }
};
