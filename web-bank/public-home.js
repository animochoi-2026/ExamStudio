import {difficultyPanel} from './composition-summary.js';
import {decorateDifficulty} from './home-view.js';
let cached=null;
export async function publicHome({root,node,rpc,config}){
 const box=node('section','','public-bank-overview'),loading=node('p','문제은행 현황을 불러오는 중입니다.','hint');root.append(box);box.append(loading);
 try{const value=cached?.space===config.spaceId&&cached.until>Date.now()?cached.value:await rpc('bank_public_summary',{s:config.spaceId});cached={space:config.spaceId,until:Date.now()+60000,value};if(!box.isConnected)return;
 const d=value.dashboard;box.replaceChildren(node('h3','문제은행 한눈에'),node('p','공동 공개 범위의 등록 현황입니다. 문제 열람·출제는 가입 승인 후 이용할 수 있습니다.','hint'));const stats=node('div','','public-stat-grid');for(const [k,label]of [['questions','총 등록 문항'],['sourceExams','원본 시험지'],['schools','등록 학교'],['pending','검수 필요 문항']]){const c=node('div','','panel');c.append(node('span',label),node('strong',String(d[k])));stats.append(c);}box.append(stats);
 const difficulty=difficultyPanel(node,[],'등록 문항 난이도 분포',null,d.difficulty);decorateDifficulty(difficulty,d.difficulty,node,null);box.append(difficulty,node('h3','최근 등록·수정 자료'));
 for(const s of value.recentSources){const row=node('article','','public-source-summary');row.append(node('strong',s.school||'학교 미입력'),node('p',[s.academicYear&&s.academicYear+'학년도',s.grade,s.semester,s.exam].filter(Boolean).join(' · ')),node('small',`등록 ${s.registered}문항 · 검수 ${s.reviewed}문항`));box.append(row);}if(!value.recentSources.length)box.append(node('p','아직 등록된 원본 시험지가 없습니다.'));
 box.append(node('p','현황 조회 '+new Date(value.asOf).toLocaleString('ko-KR')+' · 최대 1분간 재사용','hint'));
 }catch(e){box.replaceChildren(node('p','현황을 불러오지 못했습니다. '+e.message,'error'));const retry=node('button','현황 다시 불러오기');retry.onclick=()=>{box.remove();return publicHome({root,node,rpc,config});};box.append(retry);}
}
