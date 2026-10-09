'use strict';
// Task requested by the question, independent of curriculum and response format.
const crypto=require('node:crypto');
const version='question-task-types-v1';
const {definitions,catalog,normalized,effective,primaryKey}=require('./question-types.cjs');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
function input(row){const c=row.metadata?.classification||{};return {body:row.content?.body||'',choices:row.content?.choices||[],answer:row.content?.answer||'',solution:row.content?.solution||'',solutionMethods:c.solutions||[]};}
function fingerprint(row){return hash(input(row));}
function evidenceType(id,evidence,existing){const builtin=definitions.find(t=>t.id===id),target=catalog(existing).find(t=>t.id===id||t.name===builtin?.name);return target?{id:target.id,name:target.name,evidence,source:'saved_question',ruleVersion:version}:null;}
// Refinement reuses the main saved analysis, not unit names or response formats.
// Stable concept predicates avoid treating every angle/area calculation alike.
function contextualize(type,row){
 if(require('./question-types.cjs').detailed(type))return type;
 const classification=row.metadata?.classification||{},unit=classification.confirmed?.primaryUnit||classification.primaryUnit;
 const concepts=classification.solutions?.[0]?.concepts||[],body=String(row.content?.body||'');
 const rules={
  'task.angle':[
   ['symbolic_angle','각 관계식 표현',/문자식|문자를.*각|각의.*문자/],['central_angle','호·중심각 관계',/중심각|호의.*비/],
   ['combined_centers','외심·내심의 각 관계',/외심/],['incenter_angle','내심의 각 관계',/내심/],['congruent_angles','합동의 대응각',/합동/],['bisected_angles','각 이등분 관계',/이등분/],['base_angles','이등변삼각형의 밑각',/밑각/]],
  'task.area':[
   ['circle_area','원·부채꼴 넓이',/원의\s*넓이|반원의\s*넓이|부채꼴.*넓이/],['bisector_height','각 이등분선의 등거리와 넓이',/이등분선.*거리/],['incircle_area','내접원 반지름과 넓이',/내심|내접원.*반지름/],
   ['area_ratio','같은 높이·넓이의 비',/넓이의\s*비|밑변과\s*넓이|같은\s*높이/],['congruent_area','합동을 이용한 넓이 비교',/합동/],['area_partition','넓이 분할·합차',/넓이.*(?:합|분할|가법|차)|분할.*넓이|높이의\s*합/]],
  'task.length':[
   ['perimeter','둘레 관계',/둘레/],['bisector_distance','각 이등분선의 등거리',/이등분선.*거리|등거리/],['area_height_length','넓이·높이로 길이 계산',/넓이|높이/],['special_right_length','특수 직각삼각형의 변 관계',/30°|30\\circ|30\^/],['side_equation','대변 관계와 방정식',/방정식|문자식/],['angle_to_side','각 관계로 같은 길이 찾기',/밑각|이등변삼각형|두\s*각/]],
  'task.proof_fill':[['congruence_proof','합동 조건·증명 단계',/합동/]],
  'task.condition':[['parallel_condition','평행·대각 판정 조건',/평행|대각/]],
  'task.property':[['counterexample','성질의 반례 판별',/반례/],['diagonal_property','대각선 성질 판별',/대각선/],['congruence_property','합동·대응 관계 판별',/합동/]],
  'task.count':[['property_count','성질별 개수 분류',/조건별\s*개수|대각선/],['figure_count','도형 나열·중복 확인',/나열|중복|누락/]],
  'task.shape':[['shape_condition','도형 판정 조건',/판정|되는\s*조건/]],
  'task.expression':[['equation','조건식·방정식',/방정식|식의\s*값/]]
 };
 let candidates=rules[type.id]||[];
 // A symbolic demand is a mathematical subtask, independently of written/choice format.
 if(type.id==='task.angle'&&!/식으로\s*나타내|식을\s*구하/.test(body))candidates=candidates.filter(([id])=>id!=='symbolic_angle');
 if(type.id==='task.angle'&&!concepts.some(c=>/내심/.test(c)))candidates=candidates.map(r=>r[0]==='combined_centers'?['circumcenter_angle','외심의 각 관계',r[2]]:r);
 let core;for(const [id,name,pattern] of candidates){const evidence=concepts.find(c=>pattern.test(c));if(evidence){core={id,name,evidence,source:'saved_analysis'};break;}}
 if(core?.id==='circle_area'&&/색칠한\s*부분/.test(body))core={...core,id:'composite_circle_area',name:'원과 도형의 넓이 합차'};
 const result={...type,...(unit?.id?{assessmentUnit:{id:unit.id,name:unit.name}}:{}),...(core?{coreTask:core}:{})};
 if(unit?.id&&core)result.repeatKey=[type.id,unit.id,core.id].join('|');
 return result;
}
function infer(row,existing=[]){
 if(effective(row).length)return {status:'preserved',types:effective(row),reason:'기존 추천·확정 유형 보존'};
 const source=String(row.content?.body||'');if(!source.trim())return {status:'unresolved',types:[],reason:'저장된 전체 본문 없음'};
 const text=source.replace(/\((?:정답\s*\d+개\/)?\s*\d+(?:\.\d+)?점\)/g,'').trim();
 let id,evidence;
 // Whole proof-completion blocks can finish with choices rather than a demand.
 if(/(?:증명(?:하는|의|\s*과정)|보이는\s*과정)/.test(text)&&/(빈칸|괄호|\([가-힣]\)|[㉠-㉮])/.test(text)){id='task.proof_fill';evidence=(text.match(/[^\n.]*?(?:증명|보이는\s*과정)[^\n.]*[.?]?/)||[text])[0];}
 else {
  const rules=[
   ['task.condition',/(?:되(?:는|기)|성립(?:하는|하기))[^?.\n]{0,65}(?:조건|경우)[^?.\n]*[?]|필요한\s*조건[^?.\n]*[?]|(?:사각형|삼각형|□|\\square|\\triangle)[^?\n]{0,65}(?:형|꼴)이\s*되는\s*것은\s*[?]/],
   ['task.shape',/어떤\s*(?:사각형|삼각형|도형)인지[^?\n]{0,80}(?:쓰|구하|설명)|(?:사각형|삼각형|도형)의\s*종류[^?\n]{0,40}(?:구하|[?])/],
   ['task.ratio',/(?:비|비율)(?:는|을|를)[^?.\n]{0,50}(?:구하|얼마|[?])/],
   ['task.area',/(?:넓이(?:는|를)|넓이의\s*(?:합|차)(?:은|를|을))\s*(?:구하|얼마[^?\n]{0,12}[?]|[?])/],
   ['task.length',/(?:길이|둘레)(?:는|를|의\s*길이는)\s*(?:구하|얼마[^?\n]{0,12}[?]|[?])/],
   ['task.angle',/(?:각[^?.\n]{0,35}크기|\\angle[^?.\n]{0,45}크기)(?:는|를)[^?.\n]{0,85}(?:구하|나타내|[?])/],
   ['task.property',/(?:옳은|옳지\s*않은|항상\s*옳|옳지\s*않|성립하는)[^?.\n]{0,85}(?:고르|고른|것은|[?])/],
   ['task.proof',/증명(?:하|하여|해)[^?.\n]*(?:시오|라|[?])/]
  ];
  for(const [kind,pattern] of rules){const match=text.match(pattern);if(match){id=kind;evidence=match[0];break;}}
  // A counting task can ask for a product of counts, so require both explicit
  // counts in the statement and an independently saved counting method.
  if(!id){const count=text.match(/(?:총\s*)?개수(?:는|를)[^?\n]{0,45}(?:구하|[?])/);if(count){id='task.count';evidence=count[0];}}
  if(!id){const expression=text.match(/(?:\$[^$\n]{1,30}\$|[a-z])(?:의\s*)?값(?:은|을)[^?\n]{0,45}(?:구하|[?])/);if(expression){id='task.expression';evidence=expression[0];}}
  if(!id&&/개(?:일|인|,|\s)/.test(text)&&row.metadata?.classification?.solutions?.some(s=>/개수\s*세기|경우의\s*수|개수\s*계산/.test(s.label||''))){id='task.count';evidence=text;}
 }
 if(!id)return {status:'unresolved',types:[],reason:'요구 사항을 유형 기준에 유일하게 연결할 명시적 근거 부족'};
 const type=evidenceType(id,evidence,existing);if(!type)return {status:'unresolved',types:[],reason:'저장 근거에 해당하는 유형이 공동 기준 목록에 없음'};
 return {status:'suggested',types:[contextualize(type,row)],reason:'본문의 요구 작업 + 저장된 대표 단원·핵심과제. 단원명·응답형식만으로 추정하지 않음',fingerprint:fingerprint(row),ruleVersion:version};
}
function apply(metadata,result){const m=structuredClone(metadata),row={metadata:m};if(effective(row).length)return m;if(!result.types?.length)return m;m.classification||={};m.classification.types=normalized(result.types);m.classification.suggested={...m.classification.suggested,types:structuredClone(m.classification.types)};m.classification.typeRecommendation={status:'suggested',ruleVersion:version,inputFingerprint:result.fingerprint,reason:result.reason,source:result.source||'saved_question'};return m;}
module.exports={...require('./question-types.cjs'),version,definitions,catalog,normalized,effective,primaryKey,input,fingerprint,infer,apply,hash,contextualize};
