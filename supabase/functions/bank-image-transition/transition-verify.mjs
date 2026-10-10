import {same,sha,hold} from './lossless-core.mjs';
import {validateStoredProof} from './lossless-upload-contract.mjs';
export async function verifyTransition({plan,commit,oldBundle,bundle,entry,raw,codec}){
 const old=plan.before.catalog,oldCommit=plan.before.commit;
 if(!same(oldCommit.files,old.files)||!same(oldBundle.files,old.files.filter(f=>f.role!=='data'))||!same(bundle.files,commit.files.filter(f=>f.role!=='data')))hold('DESCRIPTOR_GRAPH_CHANGED');
 if(commit.questionId!==plan.questionId||commit.revisionId!==plan.targetRevisionId||commit.parentRevisionId!==plan.baseRevisionId||commit.rootId!==plan.spaceId||commit.sourceId!==oldCommit.sourceId||commit.folderId!==oldCommit.folderId||commit.app!=='examstudio-bank-v1'||commit.schemaVersion!==1)hold('COMMIT_SCOPE_CHANGED');
 const expectedBundle={...structuredClone(oldBundle),revisionId:plan.targetRevisionId,parentRevisionId:plan.baseRevisionId,files:bundle.files};
 if(!same(expectedBundle,bundle)||!same(bundle.metadata,old.metadata)||!same(commit.metadata,old.metadata))hold('NATIVE_OR_METADATA_CHANGED');
 const problem=bundle.native.project.problems.find(p=>[p.original,...(p.variants||[])].some(q=>q?.id===bundle.native.targetQuestionId));
 const q=problem&&[problem.original,...(problem.variants||[])].find(q=>q?.id===bundle.native.targetQuestionId);
 if(!q)hold('NATIVE_QUESTION_MISSING');
 const content={body:q.body,choices:q.choices||[],answer:q.answer||null,solution:q.solution||null};
 if(!same(content,old.content))hold('CONTENT_CHANGED');
 const changes=plan.changes.map(x=>({oldDescriptor:x.oldDescriptor,newDescriptor:x.newDescriptor}));
 if(!changes.length||changes.length>30||new Set(changes.map(x=>x.oldDescriptor.id)).size!==changes.length||new Set(changes.map(x=>x.newDescriptor.id)).size!==changes.length||new Set(commit.files.map(f=>f.id)).size!==commit.files.length||new Set(commit.files.map(f=>f.key)).size!==commit.files.length)hold('DUPLICATE_DESCRIPTOR');
 const expectedFiles=oldBundle.files.map(f=>changes.find(x=>same(x.oldDescriptor,f))?.newDescriptor||f);
 if(!same(expectedFiles,bundle.files))hold('NON_IMAGE_REFERENCE_CHANGED');
 const proofs=[];
 for(const change of changes){
  const o=change.oldDescriptor,n=change.newDescriptor;
  if(!oldBundle.files.some(f=>same(f,o))||!['asset','preview'].includes(o.role)||o.role!==n.role||o.key!==n.key||!o.name.toLowerCase().endsWith('.png')||!n.name.endsWith('.webp')||n.size>=o.size||n.size<1)hold('IMAGE_CHANGE_INVALID');
  const before=await entry(o.id),after=await entry(n.id);
  for(const [e,d]of [[before,o],[after,n]])if(!e.verified||e.space_id!==plan.spaceId||e.size!==d.size||e.sha256!==d.sha256||e.props.role!==d.role)hold('IMAGE_ENTRY_CHANGED');
  if(after.owner_id!==plan.ownerId||after.props.questionId!==plan.questionId||after.props.revisionId!==plan.targetRevisionId)hold('IMAGE_OWNER_CHANGED');
  let proof;
  if(n.role==='asset'){
   const p=await validateStoredProof({entry:after,descriptor:n,native:bundle.native,files:bundle.files,spaceId:plan.spaceId,questionId:plan.questionId});
   if(p.originalSha256!==o.sha256||p.originalSize!==o.size||p.originalName!==o.name)hold('ORIGINAL_PIXEL_PROVENANCE_CHANGED');
   proof={oldDescriptor:o,newDescriptor:n,fullRgbaEqual:true,pixelSha256:p.pixelSha256,width:p.width,height:p.height,codec:p.codec,source:'existing-server-asset-proof'};
  }else{
   if(n.encoding||after.lossless_proof)hold('PREVIEW_ENCODING_INVALID');
   const a=await codec.decode(await raw(before)),b=await codec.decode(await raw(after));
   if(a.format!=='png'||b.format!=='webp'||a.width!==b.width||a.height!==b.height||a.rgba.length!==b.rgba.length||!a.rgba.every((v,i)=>v===b.rgba[i]))hold('PREVIEW_PIXEL_MISMATCH');
   proof={oldDescriptor:o,newDescriptor:n,fullRgbaEqual:true,pixelSha256:await sha(a.rgba),width:a.width,height:a.height,codec:codec.id,source:'server-preview-full-rgba'};
  }
  proofs.push(proof);
 }
 // Existing WebP crops must remain bound to unchanged native content as well.
 for(const d of bundle.files.filter(f=>f.encoding))await validateStoredProof({entry:await entry(d.id),descriptor:d,native:bundle.native,files:bundle.files,spaceId:plan.spaceId,questionId:plan.questionId});
 return {proofs,changes,content};
}
