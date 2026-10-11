'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateScope}=require('./rules.cjs');
function gradeDefaultScope(grade){const curriculum=require('./curriculum.js'),key=curriculum.gradeKey(grade);return key&&curriculum.tree.some(g=>g.id===key)?validateScope(curriculum.build([key])):null;}
const canonical=value=>Array.isArray(value)?value.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
function entry(value){
 const scope=validateScope(value);
 if(!scope.units.length)throw Error('기억할 시험범위를 선택하세요.');
 const id='queue-scope-'+crypto.createHash('sha256').update(JSON.stringify(canonical(scope))).digest('hex');
 return {id,name:[scope.grade,scope.semester,scope.units.join(' · ')].filter(Boolean).join(' / '),scope};
}
const contextKey=m=>{const clean=x=>String(x||'').normalize('NFKC').replace(/\s/g,'');const grade=clean(m?.grade).replace(/학교|학년/g,''),semester=clean(m?.semester).replace(/학기$/,''),exam=clean(m?.exam).replace(/고사$/,'');return grade&&semester&&exam?JSON.stringify([grade,semester,exam]):null;};
class QueueScopeHistory{
 constructor(directory){this.file=path.join(directory,'queue-scope-history.json');}
 read(){try{const data=JSON.parse(fs.readFileSync(this.file,'utf8'));if(data.version!==1||!Array.isArray(data.scopes))throw Error('형식 오류');return data.scopes.map(x=>({...entry(x.scope),contexts:Array.isArray(x.contexts)?x.contexts:[]}));}catch(e){if(e.code==='ENOENT')return [];throw Error('기억한 시험범위를 읽지 못했습니다. 기존 파일을 보존합니다: '+e.message);}}
 save(scopes){fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.'+crypto.randomUUID()+'.tmp';let fd;try{fd=fs.openSync(temp,'wx');fs.writeFileSync(fd,JSON.stringify({version:1,scopes},null,2));fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temp,this.file);}finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}}
 remember(value,metadata){const next=entry(value),all=this.read(),key=contextKey(metadata);next.contexts=[...(all.find(x=>x.id===next.id)?.contexts||[])];const scopes=all.filter(x=>x.id!==next.id);if(key){next.contexts=[key,...next.contexts.filter(x=>x!==key)];for(const s of scopes)s.contexts=s.contexts.filter(x=>x!==key);}scopes.unshift(next);this.save(scopes);return scopes;}
 match(metadata){const key=contextKey(metadata);return key?this.read().find(x=>x.contexts.includes(key))||null:null;}
 list(items=[]){const scopes=this.read(),ids=new Set(scopes.map(x=>x.id)),known=new Set(scopes.flatMap(x=>x.contexts));let changed=false;for(const item of [...items].sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))){if(!item.scopeConfirmed||!item.scope||item.scopeMode==='grade-default')continue;let next;try{next=entry(item.scope);}catch{continue;}if(!ids.has(next.id)){ids.add(next.id);next.contexts=[];scopes.push(next);changed=true;}const key=contextKey(item.metadata);if(key&&!known.has(key)){known.add(key);scopes.find(x=>x.id===next.id).contexts.push(key);changed=true;}}if(changed)this.save(scopes);return scopes;}
}
module.exports={QueueScopeHistory,entry,contextKey,gradeDefaultScope};
