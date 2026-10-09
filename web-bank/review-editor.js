import T from '../app/question-types.cjs';
import D from '../app/difficulty-assessment.cjs';
import {attachScoreSlider} from './score-control.js';
import {setEditGuard} from './edit-guard.js';
export async function reviewEditor({root,c,r,user,node,field,action,rows,rpc,message,scopeControl,ratingsChanged,isCurrent=()=>true,onEvidenceSaved=()=>{}}){
 const own=(await rows('bank_difficulty_ratings',{revision_id:r.id,user_id:user.id}))[0];if(!isCurrent())return;
 const form=node('div','','panel');form.append(node('h3','문항 검수'));
 const tags=field(form,'태그 (쉼표 구분)',(c.confirmed?.tags||c.metadata.management?.tags||[]).join(', '));
 const unit=field(form,'대표 단원',c.confirmed?.primaryUnit||c.metadata.classification?.primaryUnit?.name||'');
 const type=field(form,'출제유형',T.label(c));const options=node('datalist');options.id='review-type-options';for(const d of T.detailedCatalog){const o=node('option');o.value=d.name;options.append(o);}form.append(options);type.setAttribute('list',options.id);
 const patch=()=>({tags:tags.value.split(',').map(x=>x.trim()).filter(Boolean),primaryUnit:unit.value,type:type.value});
 let savedPatch=JSON.stringify(patch()),version=r.review_version;
 const evidence=node('div','','panel');evidence.append(node('h3','난이도·원본 배점 확인'));
 evidence.classList.add('difficulty-review');
 const ai=D.currentAI(c);evidence.append(node('p','현재 기준 AI 추천 '+(ai?.score??'미평가')+'점','hint'));if(ai?.reason)evidence.append(node('p',ai.reason,'hint'));
 if(own?.score!=null)evidence.append(node('p','이전에 저장한 내 평가 '+own.score+'점 · 기존 보정 표본은 유지됩니다.','hint'));
 const assessment=node('section','','review-final-assessment');assessment.append(node('h3','검수자 난이도 평가'));
 const direct=field(assessment,'검수자 난이도 점수 (0~10)',c.confirmed?.difficulty??c.metadata.difficulty?.userScore??'','number');direct.step='.1';direct.min='0';direct.max='10';
 const slider=attachScoreSlider(direct,assessment,node);
 const legacy=c.confirmed?.difficultyBand??c.metadata.difficulty?.teacherBand;if(legacy)evidence.append(node('p','과거 교사 구간 '+legacy+'은 이력으로 보존합니다. 현재 분류는 최종 숫자를 따릅니다.','hint'));
 const points=field(evidence,'원본 배점',c.confirmed?.originalPoints??c.metadata.source?.originalPoints??'','number');points.step='.1';
 slider.parentElement.querySelector('small').textContent='검수 숫자가 있으면 최종 점수로 사용합니다. AI 원점수는 보존하며 교사 숫자에는 증명 가산을 하지 않습니다. 하 3점 이하 · 중 3점 초과~8점 미만 · 상 8점 이상. 저장 후 유사 유형 평가의 참고 예시로 활용할 수 있습니다.';
 // Leave historic originalPointsReviewed values untouched; the checkbox no longer participates in the UI patch.
 const evidencePatch=()=>({difficulty:direct.value?D.score(direct.value):null,originalPoints:points.value||null});let savedEvidence=JSON.stringify(evidencePatch());root.append(evidence);const evidenceDirty=()=>{try{return JSON.stringify(evidencePatch())!==savedEvidence;}catch{return true;}};
 const personal=(await rows('bank_personal',{user_id:user.id,question_id:c.question_id}))[0]||{};if(!isCurrent())return;
 const privateForm=node('div','','panel');privateForm.append(node('h3','나만의 메모'));
 const note=field(privateForm,'개인 메모',personal.note||'','textarea'),favorite=field(privateForm,'즐겨찾기','','checkbox');favorite.checked=!!personal.favorite;
 const personalValue=()=>JSON.stringify([note.value,favorite.checked]);let savedPersonal=personalValue();
 const savePersonal=async()=>{const snapshot=personalValue();await rpc('bank_personal_save',{q:c.question_id,n:note.value,f:favorite.checked});savedPersonal=snapshot;};
 let pendingRating=null,saving=null,canceled=false,savedApproved=r.visibility==='approved';
 const current=()=>!canceled&&isCurrent();
 const networkFailure=e=>/network|fetch|timeout|연결|응답.*유실/i.test(e.message||'')||['network','timeout'].includes(e.code);
 const checkedWrite=async(name,args)=>{try{return await rpc(name,args);}catch(e){
  if(!networkFailure(e))throw e;
  const latest=(await rows('bank_revisions',{id:r.id}))[0],catalog=(await rows('bank_catalog',{revision_id:r.id}))[0];
  const values=catalog?.confirmed||{};
  if(latest?.review_version===args.expected+1&&Object.entries(args.p).every(([k,v])=>JSON.stringify(values[k]??null)===JSON.stringify(v??null))&&(name!=='bank_review_save'||latest.visibility==='approved'))return {version:latest.review_version,recovered:true};
  throw Error('저장 응답을 확인하지 못했습니다. 서버 내용을 새로 확인한 뒤 다시 저장하세요.');
 }};
 const completed=()=>{const d=node('dialog','','review-complete');d.setAttribute('aria-label','검수 완료');d.append(node('h2','검수 완료'),node('p','검수 내용이 서버에 저장되었습니다.'),action('확인',()=>d.close()));d.addEventListener('close',()=>d.remove(),{once:true});document.body.append(d);d.showModal();};
 const performSave=async()=>{
  if(!current())return false;
  if(scopeControl?.dirty())await scopeControl.save();
  if(!current())return false;
  if(savedPersonal!==personalValue())await savePersonal();
  if(!current())return false;
  const currentEvidence=evidencePatch(),oldEvidence=JSON.parse(savedEvidence),diff=Object.fromEntries(Object.entries(currentEvidence).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(oldEvidence[k])));if(Object.keys(diff).length){const result=await checkedWrite('bank_difficulty_save',{r:r.id,p:diff,expected:version});version=result.version;savedEvidence=JSON.stringify(currentEvidence);onEvidenceSaved(diff);if(Object.hasOwn(diff,'difficulty'))pendingRating=diff.difficulty;}
  if(!current())return false;
  if(pendingRating!==null){try{await rpc('bank_rate_save',{r:r.id,value:pendingRating});}catch(e){if(!networkFailure(e)||(await rows('bank_difficulty_ratings',{revision_id:r.id,user_id:user.id}))[0]?.score!=pendingRating)throw e;}pendingRating=null;await ratingsChanged();}
  if(!current())return false;
  const snapshot=patch(),prior=JSON.parse(savedPatch),changes=Object.fromEntries(Object.entries(snapshot).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(prior[key])));const result=await checkedWrite('bank_review_save',{r:r.id,p:T.reviewPatch(changes,c),expected:version});version=result.version;savedPatch=JSON.stringify(snapshot);
  savedApproved=true;if(!current())return false;message('검수 내용을 저장했습니다. 검수 완료 후에도 수정할 수 있습니다.');completed();return true;
 };
 const saveAll=()=>{if(saving)return saving;if(savedApproved&&!evidenceDirty()&&JSON.stringify(patch())===savedPatch&&personalValue()===savedPersonal&&!scopeControl?.dirty()&&pendingRating===null){message('이미 저장된 검수 내용입니다.');return Promise.resolve(true);}evidence.inert=true;privateForm.inert=true;saving=performSave().finally(()=>{saving=null;evidence.inert=false;privateForm.inert=false;});return saving;};
 form.className='review-fields';form.append(node('p','기존 공동 확정 점수·이용 메모·분류 기준은 보존됩니다.','hint'));evidence.append(form,assessment,action('검수 저장',saveAll,true));
 privateForm.append(action('개인 메모 저장',async()=>{await savePersonal();message('개인 메모를 저장했습니다.');}));root.append(privateForm);
 setEditGuard({dirty:()=>!!saving||pendingRating!==null||evidenceDirty()||JSON.stringify(patch())!==savedPatch||personalValue()!==savedPersonal||!!scopeControl?.dirty(),save:saveAll,discard:()=>{canceled=true;}});
}
