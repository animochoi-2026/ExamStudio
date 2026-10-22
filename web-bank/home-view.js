import {schoolLabel} from './school-regions.js';
import {maskEmail} from './display-help.js';
import inventory from '../app/source-inventory.cjs';
import model from '../app/bank-exam-model.cjs';
import difficultyAssessment from '../app/difficulty-assessment.cjs';
import {loadSourceDifficulty} from './source-difficulty.js';

// The source RPC counts distinct committed original questions, not revisions or reviews.
export function uploadProgress(entry) {
 const uploaded=Number(entry.question_count)||0;
 const total=inventory.sourceProgress(entry.source||{},entry.progress||{}).expectedCount;
 return {uploaded,total,ratio:total?Math.min(uploaded/total,1):null,
  text:total?`업로드 ${uploaded} / ${total}`:`업로드 ${uploaded} · 전체 수 미확인`,
  excess:!!total&&uploaded>total};
}
export function icon(name) {
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 const paths={paper:'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6',restore:'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6',search:'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',review:'M5 4h14v17H5z M9 3h6v3H9z M8 13l3 3 5-6',home:'M3 11l9-8 9 8 M6 9v12h12V9 M10 21v-7h4v7',schools:'M3 21V9l9-6 9 6v12 M3 9h18 M7 12v6 M12 12v6 M17 12v6 M2 21h20',arrow:'M5 12h14 M13 6l6 6-6 6'};
 const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[name]||paths.paper);p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.6');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');svg.append(p);return svg;
}
 export function homeLayout({root,node,action,navigate}) {
 const primary=node('div','','home-primary-actions'),support=node('section','','home-support-actions');support.setAttribute('aria-label','문항 탐색과 검수');
 for(const [title,desc,next,kind]of [['시험지 만들기','모든 학생이 함께 풀 시험지 한 부 만들기','exam/new','paper'],['기출문제 복원하기','원래 시험봤던 시험지 그대로!','originals','restore'],['실전모의고사 출제하기','회차별로 시험범위가 다른 시험지 함께 출제하기','mock-exams/new','paper'],['직전대비 기출프린트','시험범위에 맞는 기출을 연도별로 모아보세요','past-print','paper'],['문항 찾기','학교·단원·난이도로 찾아보세요','search','search'],['검수함 보기','검토가 필요한 문항을 확인하세요','review','review'],['시험지 폼 설정','로고와 시험 안내를 미리 설정하세요','paper-forms','form']]){
  const b=action('',()=>navigate(next));b.className='home-action home-action-'+kind+(next.startsWith('mock-exams')?' home-action-mock':next==='past-print'?' home-action-past-print':'');
  const tile=node('span','','home-action-icon'),text=node('span','','home-action-text'),arrow=node('span','','home-arrow');tile.append(icon(kind));text.append(node('strong',title),node('span',desc));arrow.append(icon('arrow'));b.append(tile,text,arrow);(['exam','originals','mock-exams','past-print'].includes(next.split('/')[0])?primary:support).append(b);
 }
 const statsPanel=node('section','','home-stat-panel'),statsHeading=node('div','','home-panel-heading');statsHeading.append(node('h3','문제은행 한눈에'));statsPanel.append(statsHeading);
 const stats=node('div','','home-stat-grid'),statNodes={};
 for(const [key,label,next]of [['questions','총 업로드 문항','search'],['sourceExams','원본 시험지','schools-name'],['schools','기출 등록 학교','schools']]){const b=action('',()=>navigate(next));b.className='home-stat';b.append(node('span',label),node('strong','…'));stats.append(b);statNodes[key]=b;}
 const pending=action('',()=>navigate('review'));pending.className='home-pending';pending.append(node('span','검수 필요 문항'),node('strong','…'));statNodes.pending=pending;
 statsPanel.append(stats,pending,node('p','현재 계정이 읽을 수 있는 최신 문항만 집계하며 중복 개정본은 세지 않습니다. 학교 수는 학교명이 입력된 자료 기준입니다.','hint'));
 const difficulty=node('div','','home-difficulty');
 const recentPanel=node('section','','home-recent-panel'),heading=node('div','','home-panel-heading');heading.append(node('h3','시험지에 활용할 최근 자료'),node('span','최근 등록·수정 순','hint'));
 const recent=node('div','','home-recent-list');recent.append(node('p','최근 자료를 불러오는 중입니다.','hint'));recentPanel.append(heading,node('p','최근 등록·수정된 자료에서 시험지에 필요한 문항을 찾아보세요.','hint'),recent);
 root.append(primary,statsPanel,support,difficulty,recentPanel);
 return {statsPanel,statsHeading,recentHeading:heading,statNodes,difficulty,recent};
}
export function refreshIcon(node,action,label,refresh){
 const button=action('',refresh);button.classList.add('home-refresh-icon');button.setAttribute('aria-label',label);button.title=label;
 const svg=icon('arrow');svg.querySelector('path').setAttribute('d','M20 7v5h-5 M20 12a8 8 0 1 0-2 5 M20 12l-4-5');button.append(svg);return button;
}
export function homeDifficultySummary(rows){
 const summary=model.difficultySummary(rows);
 return {...summary,killerCount:difficultyAssessment.statistics(rows).reduce((n,group)=>n+group.all.killerCount,0)};
}
export function decorateDifficulty(box,rows,node,onSelect=null){
 for(const detail of box.querySelectorAll(':scope > .difficulty-summary-detail'))detail.remove();
 const summary=Array.isArray(rows)?homeDifficultySummary(rows):rows,heading=node('div','','home-panel-heading'),title=box.querySelector('h3');title.textContent='등록된 문항의 난이도 분포';heading.append(title,node('span',`등록 ${summary.total}문항`,'hint'));box.prepend(heading);
 if(!Number.isSafeInteger(summary.killerCount)||summary.killerCount<0||summary.killerCount>summary.counts.high)throw Error('킬러 문항 저장 집계를 확인할 수 없습니다.');
 for(const card of box.querySelectorAll('.difficulty-count'))if(onSelect){card.onclick=()=>onSelect(card.dataset.band);card.setAttribute('aria-label',card.querySelector('span').textContent+' '+card.querySelector('strong').textContent+'문항 보기');}
 const {low,middle,high,unknown}=summary.counts,killer=summary.killerCount;
 const bar=node('div','','home-difficulty-bar');bar.setAttribute('role','img');bar.setAttribute('aria-label',`난이도 분포: 하 ${low}문항, 중 ${middle}문항, 상 ${high}문항 중 킬러 ${killer}문항, 미분석·판단보류 ${unknown}문항. 킬러는 상에 포함됩니다.`);
 for(const [key,count]of [['low',low],['middle',middle],['high',high-killer],['killer',killer],['unknown',unknown]]){const part=node('span','','band-'+key);part.style.flex=String(count);part.setAttribute('aria-hidden','true');bar.append(part);}heading.after(bar);
 const metric=node(onSelect?'button':'div','','home-killer-stat');if(onSelect){metric.type='button';metric.dataset.band='killer';metric.setAttribute('aria-label',`킬러 ${killer}문항 보기`);metric.onclick=()=>onSelect('killer');}metric.append(node('span','킬러 문항'),node('strong',String(killer)),node('small','상에 포함 · AI T5 / 교사 9점 이상'));
 box.querySelector('.difficulty-count-grid').after(metric,node('p','막대 색상: 상은 분홍색, 킬러는 형광 핑크입니다. AI는 현재 평가 단계, 교사 조정은 확정 점수로 분류합니다. 킬러를 총문항 수에 더하지 않습니다.','hint home-killer-legend'));
}
export function recentSource(entry,{node,action,navigate,rpc,spaceId}) {
 const s=entry.source||{},p=uploadProgress(entry),row=action('',()=>navigate('source/'+encodeURIComponent(entry.source_id)));row.className='home-source-row';
 const text=node('span','','home-source-text'),heading=node('strong',s.school?schoolLabel(s):s.materialTitle||'출처 미입력');text.append(heading,node('span',[s.region,s.academicYear&&s.academicYear+'학년도',s.grade,s.semester,s.exam].filter(Boolean).join(' · '),'home-source-caption'));
 const registration=node('span',`등록 ${entry.question_count}${entry.progress?.expected_count?'/'+entry.progress.expected_count:''}문항 · 검수 ${entry.reviewed_count}문항 · ${{unknown:'완료 여부 미확인',partial:'일부 등록',in_progress:'등록 진행 중',complete:'등록 완료 (사용자 확인)'}[entry.progress?.status]||'완료 여부 미확인'}`,'home-source-caption');
 const difficulty=node('span','난이도 확인 중','home-source-caption home-source-difficulty');text.append(registration,difficulty);
 loadSourceDifficulty(rpc,spaceId,entry.source_id,entry.difficulty).then(value=>{if(row.isConnected)difficulty.textContent=value;}).catch(()=>{if(row.isConnected)difficulty.textContent='난이도 조회 실패';});
 const meter=node('span','','home-upload'),track=node('span','','home-upload-track'),fill=node('span','','home-upload-fill');
 if(p.total){track.setAttribute('role','progressbar');track.setAttribute('aria-label','원본 문항 업로드');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(p.total));track.setAttribute('aria-valuenow',String(Math.min(p.uploaded,p.total)));track.setAttribute('aria-valuetext',p.text+(p.excess?' · 원본 전체 수 확인 필요':''));fill.style.width=p.ratio*100+'%';}else{track.classList.add('unknown');track.setAttribute('aria-hidden','true');}
 track.append(fill);meter.append(track,node('span',p.text+(p.excess?' · 전체 수 확인 필요':''),'home-upload-label'));text.append(meter,node('small',`${(entry.contributors||[]).map(maskEmail).join(', ')} · ${new Date(entry.updated_at).toLocaleDateString('ko-KR')} 수정`,'home-source-date'));
 const arrow=node('span','','home-source-arrow');arrow.append(icon('arrow'));row.append(text,arrow);return row;
}
