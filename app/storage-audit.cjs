'use strict';
// Read-only accounting. A missing reference is a diagnostic, never delete authority.
function audit({entries=[],catalog=[],current=[],exams=[],history=[],objects=null}){
 const currentRevisions=new Set(current.map(c=>c.revision_id)),pinned=new Set();
 function pins(v){if(!v||typeof v!=='object')return;if(typeof v.revisionId==='string')pinned.add(v.revisionId);for(const x of Object.values(v))if(x&&typeof x==='object')Array.isArray(x)?x.forEach(pins):pins(x);}
 exams.forEach(pins);history.forEach(pins);
 const refs=new Map();for(const c of catalog)for(const id of [c.commit_id,...(c.files||[]).map(f=>f.id)].filter(Boolean)){if(!refs.has(id))refs.set(id,new Set());refs.get(id).add(c.revision_id);}
 const groups={},roles={},hashes=new Map(),files=entries.filter(e=>e.kind==='file'),sum=(map,key,e)=>{const v=map[key]||={files:0,bytes:0,expectedChunks:0};v.files++;v.bytes+=Number(e.size)||0;v.expectedChunks+=Number(e.chunks)||0;};
 for(const e of files){const used=refs.get(e.id)||new Set(),role=e.props?.role||'unknown';let key=!e.verified?'incompleteUpload':used.size===0?'unreferencedInSnapshot':[...used].some(r=>currentRevisions.has(r))?'current':[...used].some(r=>pinned.has(r))?'pinnedHistory':'otherHistory';sum(groups,key,e);sum(roles,role,e);if(e.sha256&&e.size){const key=e.sha256+':'+e.size;if(!hashes.has(key))hashes.set(key,[]);hashes.get(key).push(e);}}
 const duplicateGroups=[...hashes.values()].filter(a=>a.length>1).map(a=>({sha256:a[0].sha256,files:a.length,bytes:a.reduce((n,e)=>n+Number(e.size),0),repeatedBytes:(a.length-1)*Number(a[0].size),ids:a.map(e=>e.id),allReferenced:a.every(e=>refs.has(e.id))}));
 return {logicalFiles:files.length,logicalBytes:files.reduce((n,e)=>n+Number(e.size||0),0),expectedChunks:files.reduce((n,e)=>n+Number(e.chunks||0),0),physicalObjects:objects?.length??null,physicalBytes:objects?.reduce((n,e)=>n+Number(e.metadata?.size||0),0)??null,groups,roles,derivedDocuments:['docx','pdf','preview','hwp'].reduce((n,k)=>n+(roles[k]?.bytes||0),0),pinnedRevisions:pinned.size,sharedReferencedFiles:[...refs.values()].filter(v=>v.size>1).length,duplicateGroups,duplicateRepeatedBytes:duplicateGroups.reduce((n,g)=>n+g.repeatedBytes,0),deleteAuthorized:false,limits:'Snapshot references and expected chunks are not a live Storage inventory. Shared/current/pinned/history references must be rechecked before any deletion.'};
}
module.exports={audit};
