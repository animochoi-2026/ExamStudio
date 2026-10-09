'use strict';
// Canonical source for browser Python, desktop development and release packages.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=__dirname;
let checkedEngine;
const files=['paper_form.py','export_docx.py','word_math.py','structured_docx.py','solution_guide_docx.py','export_hwpx.py','hwp_native.py','hwp_compat.py','export_preflight.py','export_integrity.py','hwpx/Skeleton.hwpx','hwpx/LICENSE.txt','hwpx/NOTICE.txt'];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function manifest(){
 const assets=Object.fromEntries(files.map(name=>[name,sha(fs.readFileSync(path.join(source,name)))]));
 return {schema:1,engineId:sha(Buffer.from(JSON.stringify(assets))),assets};
}
function verify(directory,expected=manifest()){
 const actual=JSON.parse(fs.readFileSync(path.join(directory,'export-engine.json'),'utf8'));
 if(actual.schema!==1||actual.engineId!==expected.engineId||JSON.stringify(actual.assets)!==JSON.stringify(expected.assets))throw Error('출력 엔진 버전이 다릅니다. 공통 원본으로 다시 빌드하세요.');
 for(const [name,hash]of Object.entries(expected.assets))if(sha(fs.readFileSync(path.join(directory,name)))!==hash)throw Error('출력 엔진 파일이 누락되거나 서로 다릅니다: '+name);
 return actual;
}
function stage(directory){
 if(path.resolve(directory)===source)throw Error('공통 출력 원본에 빌드 결과를 덮어쓸 수 없습니다.');
 const expected=manifest();
 for(const name of files){const to=path.join(directory,name);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(source,name),to);}
 fs.writeFileSync(path.join(directory,'export-engine.json'),JSON.stringify(expected,null,2)+'\n');
 return verify(directory,expected);
}
function releaseGate(){
 const expected=manifest();
 if(checkedEngine===expected.engineId)return expected;
 const directory=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'exam-export-gate-'));
 stage(directory);
 const python=process.env.EXAM_EXPORT_PYTHON||(process.platform==='win32'?'python':'python3');
 const result=require('node:child_process').spawnSync(python,[path.join(source,'verify-export-engine.py')],{encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,PYTHONUTF8:'1',EXAM_EXPORT_ENGINE_DIR:directory}});
 if(result.error||result.status!==0)throw Error('공통 출력 엔진 검증 실패. 빌드를 중단했습니다. Python 경로는 EXAM_EXPORT_PYTHON으로 지정할 수 있습니다.\n'+(result.error?.message||result.stderr||result.stdout));
 const root=path.resolve(source,'..');
 const js=require('node:child_process').spawnSync(process.execPath,['--test',path.join(root,'tests/export-engine.test.cjs'),path.join(root,'tests/bank-exam-quadrants.test.cjs'),path.join(root,'tests/integrated-stability.test.cjs')],{encoding:'utf8',windowsHide:true,timeout:30000});
 if(js.error||js.status!==0)throw Error('출력 엔진 동기화·배치 검증 실패. 빌드를 중단했습니다.\n'+(js.error?.message||js.stdout||js.stderr));
 checkedEngine=expected.engineId;
 return expected;
}
module.exports={source,files,manifest,stage,verify,releaseGate};
