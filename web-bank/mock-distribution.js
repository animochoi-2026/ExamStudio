import roundEdit from './mock-round-edit.cjs';
import curriculum from '../app/curriculum.js';
export function distributionPanel(node,variants){
 const s=roundEdit.distribution({variants}),box=node('section','','mock-distribution');
 box.append(node('h3','문항 배치 구성'),node('p',`공통문항 ${s.shared}개 · 서로 다른 문항 ${s.distinct}개 · 전체 배치 ${s.total}문항`));
 box.append(node('p','공통문항은 여러 시험지에 사용한 같은 문항을 한 번만 셉니다. 아래 단원별 개수는 개별문항입니다.','hint'));
 for(const v of s.variants){const section=node('section');section.append(node('h4',v.label),node('p',`공통 ${v.common}문항 · 개별 ${v.individual}문항 · 전체 ${v.total}문항`));
  for(const u of v.units)section.append(node('p',`${curriculum.leaves.find(x=>x.id===u.id)?.title||u.name||'단원 정보 확인 필요'} ${u.count}문항`));
  if(!v.individual)section.append(node('p','개별문항 없음','hint'));box.append(section);
 }return box;
}
