'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const historyKeys=new Set(['recognitionHistory','originalHistory','revisionHistory','deletedVariants','solutionHistory','solutionDraftHistory','diagramHistory']);
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function within(root,file){const relative=path.relative(path.resolve(root),path.resolve(file));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('작업 폴더 밖의 파일에는 접근할 수 없습니다.');}
function files(root){
 if(!fs.existsSync(root))return [];
 if(fs.lstatSync(root).isSymbolicLink())throw Error('연결된 외부 폴더는 백업·정리할 수 없습니다.');
 const out=[];
 for(const entry of fs.readdirSync(root,{withFileTypes:true})){const file=path.join(root,entry.name);within(root,file);if(entry.isSymbolicLink())throw Error('연결된 외부 폴더는 백업·정리할 수 없습니다.');if(entry.isDirectory())out.push(...files(file));else if(entry.isFile())out.push({path:file,size:fs.statSync(file).size});}
 return out;
}
function stripHistories(value){
 if(!value||typeof value!=='object')return 0;let count=0;
 for(const [key,item] of Object.entries(value)){if(historyKeys.has(key)&&Array.isArray(item)){count+=item.length;delete value[key];}else if(item&&typeof item==='object')count+=stripHistories(item);}
 return count;
}
function plan(store,projectId,options={}){
 const project=store.get(projectId),folder=store.projectDir(projectId),assets=path.join(folder,'assets');
 const copy=structuredClone(project),historyCount=stripHistories(structuredClone(project));if(options.histories)stripHistories(copy);
 const refs=new Set();const visit=x=>{if(typeof x==='string'&&/[\\/]/.test(x))refs.add(path.posix.basename(x.replace(/\\/g,'/')));else if(x&&typeof x==='object')Object.values(x).forEach(visit);};visit(copy);
 const all=files(folder),unused=files(assets).filter(f=>path.dirname(f.path)===assets&&!refs.has(path.basename(f.path)));
 const selected=options.unusedAssets?unused:[];
 return {projectId,options:{histories:!!options.histories,unusedAssets:!!options.unusedAssets},historyCount,unused:unused.map(f=>({name:path.basename(f.path),bytes:f.size})),totalBytes:all.reduce((s,f)=>s+f.size,0),cleanupBytes:selected.reduce((s,f)=>s+f.size,0),token:hash({project,options:{histories:!!options.histories,unusedAssets:!!options.unusedAssets},files:all.map(f=>[f.path,f.size,fs.statSync(f.path).mtimeMs])})};
}
function backup(store,projectId){
 const folder=store.projectDir(projectId),all=files(folder),root=path.join(store.dataDir,'backups');
 if(fs.existsSync(root)&&fs.lstatSync(root).isSymbolicLink())throw Error('백업 폴더가 외부 경로에 연결되어 있습니다.');
 const target=path.join(root,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID(),projectId);within(root,target);
 fs.mkdirSync(target,{recursive:true});
 for(const f of all){const to=path.join(target,path.relative(folder,f.path));within(target,to);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(f.path,to,fs.constants.COPYFILE_EXCL);}
 return {path:target,files:all.length,bytes:all.reduce((s,f)=>s+f.size,0)};
}
function cleanup(store,{projectId,options,token}){
 if(!options||(!options.histories&&!options.unusedAssets))throw Error('정리할 항목을 먼저 선택하세요.');
 const preview=plan(store,projectId,options);if(!token||token!==preview.token)throw Error('미리보기 이후 작업이 바뀌었습니다. 정리 목록을 다시 확인하세요.');
 const saved=backup(store,projectId),project=store.get(projectId),warnings=[];
 if(options.histories)stripHistories(project);
 try{store.write(project);}catch(error){throw Error('작업 저장에 실패해 이미지 정리는 실행하지 않았습니다. 백업: '+saved.path+' · '+error.message);}
 const root=path.join(store.projectDir(projectId),'assets');
 if(options.unusedAssets)for(const item of preview.unused){const file=path.join(root,item.name);within(root,file);try{if(fs.lstatSync(file).isSymbolicLink())throw Error('연결 파일');fs.unlinkSync(file);}catch(error){warnings.push(item.name+': '+error.message);}}
 store.cache.delete(projectId);
 return {project:store.get(projectId),backup:saved,warnings};
}
function reconnect(store,{projectId,name,file}){
 const project=store.get(projectId),issue=project.assetIssues?.find(x=>x.name===name);if(!issue)throw Error('누락된 자료를 다시 확인하세요.');
 const folder=store.projectDir(projectId),target=path.join(folder,'assets',name);within(folder,target);
 if(path.basename(name)!==name||fs.existsSync(target))throw Error('기존 자료는 덮어쓸 수 없습니다.');
 store.validateSources([file]);if(path.extname(file).toLowerCase()!==path.extname(name).toLowerCase())throw Error('누락된 자료와 같은 파일 형식을 선택하세요.');
 const saved=backup(store,projectId);fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);
 const ids=(project.sources||[{...project.source,id:'primary'}]).filter(s=>s.path===target).map(s=>s.id);
 for(const p of project.problems){if(!p.cropPaths?.includes(target)&&!p.regions?.some(r=>ids.includes(r.sourceId||'primary')))continue;
  if(p.recognition){p.recognition.sourceStale=true;p.recognition.confirmed=false;p.recognition.cacheKey=null;}
  for(const q of [p.original,...p.variants].filter(Boolean)){q.needsReview=true;q.approval={status:'pending',reason:'누락 자료 다시 연결'};if(q.kind==='original')q.solutionStale=!!q.solution;}
 }
 store.write(project);store.cache.delete(projectId);return {project:store.get(projectId),backup:saved};
}
module.exports={plan,backup,cleanup,reconnect};
