'use strict';
// The assessed task is separate from curriculum, response format and solution method.
// No shared type taxonomy was present when these fallback definitions were added.
const definitions=[
 {id:'task.angle',name:'각도 계산',definition:'요구한 각의 크기·합·관계식을 구한다.'},
 {id:'task.length',name:'길이 계산',definition:'요구한 선분·거리·둘레의 길이를 구한다.'},
 {id:'task.area',name:'넓이 계산',definition:'요구한 도형·부분의 넓이 또는 넓이의 합을 구한다.'},
 {id:'task.property',name:'성질·관계 판별',definition:'명제·성질의 참거짓 또는 항상 성립하는 관계를 판별한다.'},
 {id:'task.condition',name:'조건 판별',definition:'어떤 도형·성질을 성립하게 하는 조건·경우를 판별한다.'},
 {id:'task.shape',name:'도형 판별',definition:'주어진 도형이 어떤 종류인지 판별하고 필요하면 그 이유를 설명한다.'},
 {id:'task.proof_fill',name:'증명 완성·빈칸',definition:'제시된 증명의 빈칸·근거·누락된 내용을 완성하거나 잘못된 단계를 판별한다.'},
 {id:'task.proof',name:'증명 구성',definition:'주어진 결론을 증명하는 과정을 직접 구성한다. 제시된 증명 완성과 구별한다.'},
 {id:'task.count',name:'개수 계산',definition:'조건을 만족하는 도형·대상·경우의 개수 또는 그 개수로 계산한 값을 구한다.'},
 {id:'task.expression',name:'식·수치 계산',definition:'명시적으로 요구한 식·미지수의 값을 구한다. 각도·길이·넓이가 명시되면 해당 유형을 우선한다.'},
 {id:'task.ratio',name:'비·비율 계산',definition:'명시적으로 요구한 비 또는 비율 자체를 구한다. 조건에 비가 있는 것만으로 분류하지 않는다.'}
];
const meaningful=x=>x!==null&&x!==undefined&&String(x).trim()!=='';
function catalog(existing=[]){const active=existing.filter(t=>!t.retired&&meaningful(t.label||t.name)).map(t=>({id:t.id,name:t.label||t.name,definition:t.definition||'기존 공동은행 유형: '+(t.label||t.name)}));return active.length?active:definitions;}
function normalized(input){const list=Array.isArray(input)?input:[input],out=[],seen=new Set();for(const raw of list){if(!raw)continue;const name=typeof raw==='string'?raw.trim():String(raw.name||raw.label||raw.id||'').trim();if(!name)continue;const known=definitions.find(t=>t.id===name||t.name===name||t.id===raw.id);const id=known?.id||(typeof raw==='object'?raw.id:null)||name,key=String(id).trim();if(seen.has(key))continue;seen.add(key);out.push({...((typeof raw==='object')?raw:{}),id:key,name:known?.name||name});}return out;}
function effective(row){const f=row.confirmed||{},c=row.metadata?.classification||{},recommended=normalized(c.types||[]);let manual;if(f.types?.length)manual=normalized(f.types);else if(meaningful(f.type)||meaningful(f.typeId))manual=normalized({id:f.typeId||null,name:f.type||f.typeId});else if(c.confirmed?.types?.length)manual=normalized(c.confirmed.types);else if(meaningful(c.confirmed?.type))manual=normalized(c.confirmed.type);if(!manual)return recommended;return manual.map(t=>{const saved=recommended.find(r=>r.id===t.id);return {...(saved?{assessmentUnit:saved.assessmentUnit,coreTask:saved.coreTask,repeatKey:saved.repeatKey}:{}),...t};});}
function primaryKey(row){const first=effective(row)[0];return first?.repeatKey||first?.id||null;}
const detailedCatalog=require('./question-type-catalog.json').types;
const placeholder=x=>/^(?:기타|미분류|확인 필요|unknown|other|unclassified|pending)$/i.test(String(x||'').trim());
function detailed(t){if(!t||typeof t!=='object')return false;const p=String(t.repeatKey||'').split('|');return p.length===3&&definitions.some(d=>d.id===p[0])&&!!p[1]&&!!p[2]&&p[1]===t.assessmentUnit?.id&&p[2]===t.coreTask?.id&&!!String(t.coreTask?.name||'').trim()&&!!String(t.coreTask?.definition||'').trim()&&!placeholder(t.coreTask.name)&&!placeholder(p[2])&&p[2]!==p[1];}
function requireDetailed(row){const ts=effective(row);if(!ts.length||ts.some(t=>!detailed(t)))throw Object.assign(Error('세부 유형이 필요합니다. 기존 문항 정보의 출제유형에서 추천을 확인하거나 세부 유형을 선택하세요. 원본은 보존됩니다.'),{code:'detailed_type_required'});return ts;}
function fromDefinition(d){const [task,unit,core]=d.key.split('|');return {...definitions.find(t=>t.id===task),repeatKey:d.key,assessmentUnit:{id:unit},coreTask:{id:core,name:d.name,definition:d.definition},source:'catalog'};}
function resolve(value,row={}){const text=String(value||'').trim(),current=effective(row),existing=current.filter(t=>detailed(t)&&(t.repeatKey===text||t.coreTask.name===text));if(existing.length)return existing;const matches=detailedCatalog.filter(t=>t.key===text||t.name===text);if(matches.length!==1)throw Error('기존 출제유형 입력란에서 핵심 풀이에 맞는 세부 유형을 선택하세요. 넓은 유형명만으로는 등록할 수 없습니다.');return [fromDefinition(matches[0])];}
function label(row){const first=effective(row)[0];return first?.coreTask?.name||first?.name||'';}
function reviewPatch(value,row){const p={...value};if(Object.hasOwn(p,'type')){p.types=resolve(p.type,row);delete p.type;}if(Object.hasOwn(p,'types'))requireDetailed({confirmed:{types:p.types}});return p;}
module.exports={definitions,catalog,normalized,effective,primaryKey,detailedCatalog,detailed,requireDetailed,fromDefinition,resolve,label,reviewPatch};
