'use strict';
const fs=require('node:fs'),path=require('node:path');
const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
const safeName=name=>typeof name==='string'&&name!=='.'&&name!=='..'&&name===path.basename(name)&&!/[<>:"/\\|?*\x00-\x1f]/.test(name)&&!/[ .]$/.test(name);
function creationDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
 const d=new Date(value);if(!Number.isFinite(d.getTime()))return null;
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function cleanTitle(value){
 let s=String(value||'').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[ .]+$/,'').trim();
 if(!s)return null;if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(s))s='_'+s;return s;
}
function rewritePaths(value,moves){
 if(typeof value==='string'){
  for(const {from,to}of moves){for(const sep of ['\\','/']){const old=from.replace(/[\\/]/g,sep),next=to.replace(/[\\/]/g,sep),v=process.platform==='win32'?value.toLowerCase():value,o=process.platform==='win32'?old.toLowerCase():old;if(v===o||v.startsWith(o+sep))return next+value.slice(old.length);}
   const {pathToFileURL}=require('node:url'),oldUrl=pathToFileURL(from).href;if(value===oldUrl||value.startsWith(oldUrl+'/'))return pathToFileURL(to).href+value.slice(oldUrl.length);
  }return value;
 }
 if(Array.isArray(value))return value.map(v=>rewritePaths(v,moves));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewritePaths(v,moves)]));return value;
}
class ProjectFolders{
 constructor(root,atomicWrite){this.root=path.resolve(root);this.file=path.join(path.dirname(this.root),'project-folders.json');this.atomicWrite=atomicWrite;this.names=new Map();this.aliases=[];if(fs.existsSync(this.file)){const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));if(saved.version!==1||!saved.names)throw Error('프로젝트 폴더 연결 정보를 확인하세요. 기존 자료는 이동하지 않았습니다.');for(const [id,name]of Object.entries(saved.names)){if(!safeId(id)||!safeName(name))throw Error('프로젝트 폴더 연결 정보가 올바르지 않습니다.');this.names.set(id,name);}this.aliases=saved.aliases||[];}}
 target(name){if(!safeName(name))throw Error('프로젝트 폴더 이름이 올바르지 않습니다.');const f=path.resolve(this.root,name);if(path.dirname(f)!==this.root)throw Error('프로젝트 폴더 밖으로 이동할 수 없습니다.');if(fs.existsSync(f)&&fs.lstatSync(f).isSymbolicLink())throw Error('연결된 프로젝트 폴더는 이동하지 않습니다.');return f;}
 entries(){
  const out=[],ids=new Set();for(const e of fs.readdirSync(this.root,{withFileTypes:true})){if(!e.isDirectory()||!safeName(e.name))continue;try{const folder=this.target(e.name);if(path.dirname(fs.realpathSync(folder))!==fs.realpathSync(this.root))continue;const p=JSON.parse(fs.readFileSync(path.join(folder,'project.json'),'utf8'));if(!safeId(p.id)||!Array.isArray(p.problems))continue;if(ids.has(p.id))throw Error('DUPLICATE_PROJECT_ID '+p.id);ids.add(p.id);out.push({id:p.id,name:e.name,folder,project:p});}catch(error){if(error.message.startsWith('DUPLICATE_PROJECT_ID'))throw error;}}
  return out;
 }
 resolve(id){if(!safeId(id))throw Error('프로젝트 번호가 올바르지 않습니다.');const known=this.names.get(id);if(known&&fs.existsSync(this.target(known)))return this.target(known);const matches=this.entries().filter(e=>e.id===id);if(matches.length){this.names.set(id,matches[0].name);return matches[0].folder;}return this.target(id);}
 persist(){this.atomicWrite(this.file,{version:1,names:Object.fromEntries(this.names),aliases:this.aliases});}
 choose(project,relativeLength=48){
  const title=cleanTitle(project.title||project.source?.originalName),date=creationDate(project.createdAt);if(!title||!date)return null;
  const occupied=new Set([...fs.readdirSync(this.root),...this.names.values()].map(s=>s.toLocaleLowerCase('en-US')));
  const budget=Math.min(90,240-this.root.length-1-relativeLength-1);if(budget<24)return null;
  for(let n=1;n<10000;n++){const suffix='_'+date+(n===1?'':` (${n})`),limit=budget-suffix.length;let stem=title.slice(0,limit);if(/[\uD800-\uDBFF]$/.test(stem))stem=stem.slice(0,-1);stem=stem.replace(/[ .]+$/,'');const name=stem+suffix;if(!occupied.has(name.toLocaleLowerCase('en-US')))return name;}throw Error('같은 이름의 프로젝트 폴더가 너무 많습니다.');
 }
 reserve(project){if(this.names.has(project.id)||fs.existsSync(this.target(project.id)))return this.resolve(project.id);const name=this.choose(project);if(!name)return this.resolve(project.id);this.names.set(project.id,name);this.persist();return this.target(name);}
 migrate(){
  const moves=[],skipped=[];for(const entry of this.entries()){
   if(entry.name!==entry.id){this.names.set(entry.id,entry.name);continue;}
   let longest=0,linked=false;const visit=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(fs.lstatSync(f).isSymbolicLink()){linked=true;continue;}longest=Math.max(longest,path.relative(entry.folder,f).length);if(e.isDirectory())visit(f);}};visit(entry.folder);
   const name=linked?null:this.choose(entry.project,Math.max(longest,48));if(!name){skipped.push({id:entry.id,reason:linked?'링크 포함':'작업명·생성일 또는 경로 길이 확인 필요'});continue;}
   const to=this.target(name);if(fs.existsSync(to))throw Error('동일한 프로젝트 폴더가 있어 이동하지 않았습니다.');
   const move={from:entry.folder,to};this.names.set(entry.id,name);this.aliases.push(move);this.persist();
   try{fs.renameSync(entry.folder,to);}catch(error){this.names.set(entry.id,entry.name);this.aliases.pop();this.persist();skipped.push({id:entry.id,reason:error.message});continue;}
   moves.push({...move,id:entry.id});
  }
  for(const e of this.entries()){const updated=this.rebase(e.project);if(JSON.stringify(updated)!==JSON.stringify(e.project))this.atomicWrite(path.join(e.folder,'project.json'),updated);}
  this.persist();return {moves,skipped};
 }
 rebase(value){
  const result=rewritePaths(value,this.aliases.filter(m=>path.dirname(path.resolve(m.from))===this.root&&path.dirname(path.resolve(m.to))===this.root&&!fs.existsSync(m.from)&&fs.existsSync(m.to)));
  for(const [i,p]of (value?.problems||[]).entries())for(const q of [p.original,...(p.variants||[])].filter(Boolean)){
   if(q.questionOnlyExport?.sourceKey!==JSON.stringify(p.cropPaths||[]))continue;
   const next=result.problems[i],target=[next.original,...(next.variants||[])].find(x=>x?.id===q.id);
   if(target?.questionOnlyExport)target.questionOnlyExport.sourceKey=JSON.stringify(next.cropPaths||[]);
  }
  return result;
 }
}
module.exports={ProjectFolders,creationDate,cleanTitle,rewritePaths};
