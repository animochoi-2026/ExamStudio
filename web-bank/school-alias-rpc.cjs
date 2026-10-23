'use strict';
const alias=require('../app/school-alias.cjs');
const candidateReads=new Set(['bank_exam_candidates','bank_mock_snapshot','bank_mock_recommendation_snapshot','bank_mock_candidates','bank_mock_auto_candidates']);
function request(name,args){return candidateReads.has(name)&&Array.isArray(args.schools)?{...args,schools:alias.expand(args.schools)}:args;}
// Read projections only: source/revision IDs and stored records remain intact.
function response(name,data){
 if(name==='bank_mock_schools')return [...new Set(data.map(s=>alias.name(s)))];
 if(!candidateReads.has(name)&&!['bank_source_exams','bank_source_list_page','bank_search_current','bank_source_questions'].includes(name))return data;
 function map(value){if(Array.isArray(value))return value.map(map);if(!value||typeof value!=='object')return value;const out={...value};if(out.source)out.source=alias.source(out.source);if(out.metadata)out.metadata={...out.metadata,source:alias.source(out.metadata.source)};if(out.school)out.school=alias.name(out.school,out.region);for(const key of ['items','exams','candidates'])if(Array.isArray(out[key]))out[key]=out[key].map(map);return out;}
 return map(data);
}
module.exports={request,response};
