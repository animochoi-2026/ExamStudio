'use strict';
// Public response categories. Keep original recognition subtypes for answer
// validation/rubrics; old saved metadata is interpreted without rewriting it.
const aliases={single_choice:'선택형',multiple_choice:'선택형',객관식:'선택형',선택형:'선택형',single_value:'서술형',all_solutions:'서술형',proof:'서술형',written_response:'서술형',단답형:'서술형',주관식:'서술형','주관식(단답형)':'서술형',서답형:'서술형',서술형:'서술형'};
const normalize=value=>{if(value==null||String(value).trim()==='')return value;const text=String(value).trim();return aliases[text]||(/^(?:객관식|객관형|선택형|선택식|객관식[ (].*|선택형[ (].*|single_choice|multiple_choice)$/u.test(text)?'선택형':'서술형');};
const label=value=>normalize(value)==='선택형'?'객관식':normalize(value);
const fromMetadata=m=>normalize(m?.content?.responseType);
const formats=Object.freeze(['선택형','서술형']);
function counts(types={}){
 const result={};
 for(const [key,value]of Object.entries(types)){
  if(!Number.isInteger(value)||value<0)throw Error('응답 유형 개수는 0 이상의 정수로 입력하세요. 빈칸은 자동 충원입니다.');
  const format=normalize(key);result[format]=(result[format]||0)+value;
 }
 return result;
}
const rules=r=>({...r,types:counts(r.types||{})});
module.exports={label,normalize,fromMetadata,formats,counts,rules};
