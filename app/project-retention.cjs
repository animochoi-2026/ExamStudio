'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {atomicWrite}=require('./store.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const key=file=>process.platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file);
function contains(root,file){const rel=path.relative(root,file);return !rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
// Intermediate junctions are as unsafe as linked files. Never follow either for deletion.
function safe(root,file){
 root=path.resolve(root);file=path.resolve(file);if(!contains(root,file))throw Error('프로젝트 외부 경로');
 let current=root;for(const part of ['',...path.relative(root,file).split(path.sep).filter(Boolean)]){
  if(part)current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('심볼릭 링크·정션 경로는 자동 삭제할 수 없습니다.');
 }
 if(!contains(fs.realpathSync(root),fs.realpathSync(file)))throw Error('프로젝트 외부 실제 경로');
}
function tree(root,folder){
 const result=[];safe(root,folder);
 for(const entry of fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  const file=path.join(folder,entry.name);safe(root,file);const s=fs.lstatSync(file);
  if(s.isDirectory())result.push({file,directory:true},...tree(root,file));
  else if(s.isFile())result.push({file,size:s.size,mtime:s.mtimeMs,ino:s.ino,links:s.nlink,sha:hash(fs.readFileSync(file))});
  else throw Error('파일 소유권을 확인할 수 없습니다: '+entry.name);
 }return result;
}
function refs(value,folder,result=[],context=''){
 if(typeof value==='string'&&(path.isAbsolute(value)||/[\\/]/.test(value)||/(?:path|file|asset|source|export|output)/i.test(context))){
  if(/^[a-z]+:\/\//i.test(value)&&!value.startsWith('file://'))return result;
  if(value.startsWith('file://')){try{value=require('node:url').fileURLToPath(value);}catch{return result;}}
  for(const file of path.isAbsolute(value)?[value]:[path.resolve(folder,value),path.resolve(folder,'assets',value)]){
   result.push({file:key(file),output:/(?:export|output|attachment)/i.test(context)});
   try{result.push({file:key(fs.realpathSync(file)),output:/(?:export|output|attachment)/i.test(context)});}catch{}
  }
 }else if(value&&typeof value==='object')for(const [name,child]of Object.entries(value))refs(child,folder,result,context+'.'+name);
 return result;
}
function bankStates(store){
 const files=[],shared=path.join(store.dataDir,'shared-banks'),legacy=path.join(store.dataDir,'question-bank','state.json');
 if(fs.existsSync(legacy))files.push(legacy);
 if(fs.existsSync(shared)){safe(store.dataDir,shared);for(const d of fs.readdirSync(shared,{withFileTypes:true})){
  const folder=path.join(shared,d.name);safe(store.dataDir,folder);if(!d.isDirectory())continue;
  const file=path.join(folder,'question-bank','state.json');if(fs.existsSync(file))files.push(file);
 }}
 return files.map(file=>{safe(store.dataDir,file);const bytes=fs.readFileSync(file);return {file,sha:hash(bytes),data:JSON.parse(bytes)};});
}
function plan(store){
 safe(store.dataDir,store.projectsDir);
 // A deletion preview never repairs or rewrites the index.
 const index=fs.existsSync(store.indexFile)?(safe(store.dataDir,store.indexFile),JSON.parse(fs.readFileSync(store.indexFile,'utf8'))):{lastId:null,recent:[]};
 if(!Array.isArray(index.recent))throw Error('작업 목록을 확인한 후 정리하세요.');
 const projects=[],excluded=[],unknown=[];
 for(const d of fs.readdirSync(store.projectsDir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(d.name))continue;
  const folder=store.projectDir(d.name),file=path.join(folder,'project.json');
  try{
   safe(store.projectsDir,folder);if(!d.isDirectory()||!fs.existsSync(file))continue;safe(store.projectsDir,file);
   const bytes=fs.readFileSync(file),p=JSON.parse(bytes);if(p.id!==d.name||!Array.isArray(p.problems))throw Error('프로젝트 형식 오류');
   projects.push({id:p.id,title:p.title,updatedAt:String(p.updatedAt||p.createdAt||''),sha:hash(bytes),busy:p.problems.some(x=>(x.runs||[]).some(r=>r.status==='running')),refs:refs(p,folder)});
  }catch(e){excluded.push({id:d.name,reason:e.message});unknown.push(d.name);}
 }
 let banks=[];try{banks=bankStates(store);}catch(e){unknown.push('문제은행 참조: '+e.message);}
 projects.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
 const keep=projects.slice(0,5),candidates=[],snapshots=[];
 for(const p of projects.slice(5)){
  try{
   if(p.busy||p.id===index.lastId)throw Error('현재 열었거나 실행 중인 프로젝트');
   if(unknown.length)throw Error('공유 참조를 확인할 수 없습니다: '+unknown.join(', '));
   if(banks.some(b=>(b.data.dirty||[]).some(j=>j.projectId===p.id)||(b.data.jobs||[]).some(j=>j.projectId===p.id&&j.status!=='complete')))throw Error('문제은행 대기·실패 작업에서 사용하는 프로젝트');
   const folder=store.projectDir(p.id),entries=tree(store.projectsDir,folder);
   snapshots.push({id:p.id,entries});
   if(entries.some(e=>e.directory&&!['assets','cache','.cache','exports'].includes(path.relative(folder,e.file).split(path.sep)[0])))throw Error('소유권이 불명확한 하위 폴더');
   const shared=projects.filter(x=>x.id!==p.id).flatMap(x=>x.refs).concat(banks.flatMap(b=>refs(b.data,path.dirname(b.file))));
   const remove=[],preserve=[];
   for(const entry of entries.filter(e=>!e.directory)){
    const rel=path.relative(folder,entry.file),top=rel.split(path.sep)[0],file=key(entry.file);
    const referenced=shared.some(r=>contains(r.file,file));
    const output=top==='exports'||/\.(?:docx?|hwpx?|rtf)$/i.test(rel)||p.refs.some(r=>r.output&&contains(r.file,file));
    if(referenced||output||entry.links>1){if(rel==='project.json')throw Error('다른 자료에서 프로젝트 정보 자체를 참조합니다.');preserve.push({...entry,reason:referenced?'공유 참조':output?'출력물':'하드 링크'});}
    else if(rel==='project.json'||['assets','cache','.cache'].includes(top))remove.push(entry);
    else throw Error('소유권이 불명확한 파일: '+rel);
   }
   candidates.push({id:p.id,title:p.title,updatedAt:p.updatedAt,remove,preserve,bytes:remove.reduce((sum,e)=>sum+e.size,0)});
  }catch(e){excluded.push({id:p.id,reason:e.message});}
 }
 const token=hash(JSON.stringify({projects,index,banks:banks.map(({file,sha})=>({file,sha})),snapshots,excluded,candidates}));
 return {keep:keep.map(({refs,...p})=>p),candidates,excluded,token,policy:'최근 생성·수정 5개를 유지합니다. 확인한 이전 프로젝트의 데이터·전용 이미지·캐시는 영구 삭제합니다. 외부 원본, 출력물, 공유 참조 파일은 보존합니다. 현재 작업·실행 중인 작업과 안전 확인이 안 된 대상은 제외합니다.'};
}
function apply(store,{token,confirmed=false}){
 if(confirmed!==true)throw Error('정리 대상을 확인하세요.');const current=plan(store);
 if(token!==current.token)throw Error('프로젝트나 파일이 변경되었습니다. 정리 목록을 다시 확인하세요.');
 const deleted=[],failed=[];let bytes=0;
 for(const item of current.candidates){
  try{
   // No recursive deletion: exported/shared files and their directories stay in place.
   const metadata=path.join(store.projectDir(item.id),'project.json');
   const ordered=[...item.remove.filter(e=>e.file!==metadata),...item.remove.filter(e=>e.file===metadata)];
   for(const e of ordered){safe(store.projectsDir,e.file);const s=fs.lstatSync(e.file);if(!s.isFile()||s.nlink!==e.links||s.ino!==e.ino||hash(fs.readFileSync(e.file))!==e.sha)throw Error('삭제 직전 파일 변경 감지');}
   for(const e of ordered){safe(store.projectsDir,e.file);fs.unlinkSync(e.file);bytes+=e.size;}
   deleted.push(item.id);store.cache.delete(item.id);
   const folder=store.projectDir(item.id),dirs=tree(store.projectsDir,folder).filter(e=>e.directory).map(e=>e.file).sort((a,b)=>b.length-a.length);
   for(const dir of [...dirs,folder]){safe(store.projectsDir,dir);if(fs.readdirSync(dir).length===0)fs.rmdirSync(dir);}
  }catch(e){failed.push({id:item.id,reason:e.message});}
 }
 const index=store.readIndex();index.recent=index.recent.filter(p=>!deleted.includes(p.id));atomicWrite(store.indexFile,index);
 return {deleted,failed,excluded:current.excluded,bytes,recent:index.recent,preserved:current.candidates.flatMap(p=>p.preserve.map(f=>({projectId:p.id,file:f.file,reason:f.reason})))};
}
module.exports={plan,apply};
