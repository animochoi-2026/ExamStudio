'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {atomicWrite}=require('./store.cjs');
const {logKey}=require('./review-issues.js');
// Kept outside problem messages: diagnostics must never become AI conversation input.
class ErrorLog {
 constructor(directory){this.file=path.join(directory,'error-log.json');}
 read(){if(!fs.existsSync(this.file))return [];const data=JSON.parse(fs.readFileSync(this.file,'utf8'));if(!Array.isArray(data))throw Error('오류 기록 형식을 확인해 주세요.');return [...new Map(data.map(e=>[logKey(e),e])).values()];}
 resolve(projectId,problemId,resolutions){const reasons=new Set((resolutions||[]).flatMap(r=>r.reasons));const records=this.read(),done=records.filter(e=>e.projectId===projectId&&e.problemId===problemId&&reasons.has(e.text));if(done.length){const archive=this.file.replace('.json','-resolved.json');const previous=fs.existsSync(archive)?JSON.parse(fs.readFileSync(archive,'utf8')):[];atomicWrite(archive,[...previous,...done.map(e=>({...e,resolvedAt:new Date().toISOString()}))]);this.remove(done.map(e=>e.id));}return done.map(e=>e.id);}
 remove(ids){if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))throw Error('삭제할 오류 항목을 확인해 주세요.');const selected=new Set(ids),records=this.read().filter(e=>!selected.has(e.id));atomicWrite(this.file,records);return records;}
 append(value){
  const optionalId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)?v:null;
  let text=String(value?.text||'작업을 완료하지 못했습니다.').replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [redacted]').replace(/\bsk-[A-Za-z0-9_-]{8,}/g,'[redacted]');
  if(text.length>30000)text=text.slice(0,30000)+'\n[긴 오류의 앞 30,000자까지 보관했습니다.]';
  const entry={id:randomUUID(),role:'error',text,projectId:optionalId(value?.projectId),problemId:optionalId(value?.problemId),createdAt:new Date().toISOString()};
  const records=this.read(),existing=records.find(e=>logKey(e)===logKey(entry));
  if(existing){existing.lastSeenAt=entry.createdAt;existing.occurrences=(existing.occurrences||1)+1;atomicWrite(this.file,records);return existing;}
  records.push(entry);atomicWrite(this.file,records);return entry;
 }
}
module.exports={ErrorLog};
