import model from '../app/bank-exam-model.cjs';
import D from '../app/difficulty-assessment.cjs';
export const difficultyMapping='교사 점수 우선. 하 3점 이하 · 중 3점 초과~8점 미만 · 상 8점 이상 · 킬러 9점 이상(상에 포함). 새 기준은 발상 접근성과 남은 추론으로 환산하며 증명 별도 가산은 없습니다. 구버전 점수와 보정 이력은 보존합니다.';
export function countsText(summary){return Object.entries(D.compositionLabels).map(([key,label])=>`${label} ${summary.counts[key]||0}`).join(' · ')+` · 킬러 ${summary.killerCount??0}(상에 포함)`;}
export function compositionFailureText(result){
 if(result.failureKind==='search_limit')return '배분 탐색 한도 안에서 조건 충족 여부를 확정하지 못했습니다. 문항 부족으로 판정하지 않았으며, 조건이나 기존 시험지는 변경하지 않았습니다.';
 if(result.shortages?.length)return result.shortages.map(s=>`${s.label} ${s.requested}개 요청 / ${s.available}개 가능 / ${s.missing}개 부족`).join('\n');
 if(result.failureKind==='scope_conflict')return '시험범위 비중의 정수 배분과 난이도·응답 형식 개수를 함께 만족하는 조합이 없습니다. 단원별 목표와 가용 문항을 확인하세요. 비중이나 개수를 변경하지 않았습니다.';
 return '난이도·응답 형식의 개수를 함께 만족하는 조합이 없습니다. 조건별 가용 수와 교차 집계를 확인하세요.';
}
// Count the actual paper, including unloaded revisions, rather than the generation targets.
export function paperComposition(items,catalogs=new Map()){
 const difficulty={low:0,middle:0,high:0,unknown:0,killer:0},formats={'선택형':0,'서술형':0,'단답형':0,'미분류':0};
 for(const item of items){const c=catalogs.get(item.revisionId),hasScore=Object.hasOwn(item,'scoreSnapshot');
  const row=hasScore?{confirmed:{difficulty:item.scoreSnapshot},metadata:{}}:c;
  difficulty[row?model.compositionBand(row):'unknown']++;if(row&&D.effective(row).number>=9)difficulty.killer++;
  const type=c?model.responseType(c.metadata||{}):item.responseType;formats[Object.hasOwn(formats,type)?type:'미분류']++;
 }
 return {total:items.length,difficulty,formats};
}
export function paperCompositionText(summary){const {total,difficulty:d,formats:f}=summary;return `총 ${total}문항 · 상 ${d.high}(킬러 ${d.killer??0} 포함) · 중 ${d.middle} · 하 ${d.low}${d.unknown?' · 난이도 미분석·판단보류 '+d.unknown:''} · 객관식 ${f['선택형']} · 서술형 ${f['서술형']}${f['단답형']?' · 단답형 '+f['단답형']:''}${f['미분류']?' · 응답 형식 미분류 '+f['미분류']:''}`;}
export function difficultyPanel(node,rows,title='난이도별 등록 문항',onSelect=null,storedSummary=null){
 const summary=storedSummary||model.difficultySummary(rows),box=node('section','','panel difficulty-counts');box.append(node('h3',title));
 const cards=node('div','','difficulty-count-grid');for(const [key,label]of Object.entries(D.compositionLabels)){const card=node(onSelect?'button':'div','','difficulty-count');if(onSelect){card.type='button';card.onclick=()=>onSelect(key);card.setAttribute('aria-label',`${label} ${summary.counts[key]}문항 보기`);}card.dataset.band=key;card.append(node('span',label),node('strong',String(summary.counts[key])));cards.append(card);}box.append(cards,node('p',`킬러 ${summary.killerCount??0}문항 (상에 포함)`,'difficulty-summary-detail'),node('p',difficultyMapping,'hint difficulty-summary-detail'),node('p','검수 숫자가 있으면 AI 추천을 완전히 대체합니다. AI 원점수·과거 교사 구간·이력은 보존합니다. 숫자 없는 과거 구간을 임의 점수로 바꾸지 않습니다.','hint difficulty-summary-detail'));
 if(summary.labelDisagreements)box.append(node('p',`최종 숫자와 과거 지정 구간이 다른 문항 ${summary.labelDisagreements}개. 현재 분류는 최종 숫자를 따릅니다. 과거 구간은 보존됩니다.`,'hint'));
 return box;
}
export async function loadCompositionCandidates(rpc,spaceId,{onProgress=()=>{},isValid=()=>true}={}){
 const all=[];for(let start=0;;start+=50){if(!isValid())throw new DOMException('시험지 생성 취소','AbortError');const page=await rpc('bank_search_current',{s:spaceId,filters:{},start_at:start});if(!isValid())throw new DOMException('시험지 생성 취소','AbortError');all.push(...page);onProgress(all.length);if(page.length<50)return all;if(start>=4950)throw Error('접근 가능한 후보가 5,000개를 넘습니다. 현재 조회 한도를 확인하세요.');}
}
