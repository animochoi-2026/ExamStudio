'use strict';
const S=require('../../app/difficulty-v12/scorer.cjs');
const d=(id,C=2,R=2,B=1,H=2,depends_on=[],is_non_obvious=true)=>({id,C,R,B,H,depends_on,is_non_obvious,summary:'전환',clue_in_text:'단서',must_construct:'관계',hint_effect:'단순화'});
const route=(ds,extra={})=>({route_id:'a',route_summary:'교과 풀이',uses_powerful_tool:false,execution_load:0,execution_extreme:false,execution_evidence:'',parallel_branch_count:1,independent_branches:[],critical_discoveries:ds,...extra});
const score=(ds,extra={},lit=false)=>S.scoreProblem([route(ds,extra)],lit);
const raw=r=>({construct:'insight_bottleneck_difficulty',spec_version:'1.2',reference_student_match:true,curriculum_scope:'중2',literacy_high:false,literacy_evidence:'',pre_solution_cues:{explicitly_cued_methods:[],likely_initial_approaches:[],likely_impasse:''},viable_routes:[r],alternative_viable_routes_checked:1,key_hint:'관계',estimated_post_hint_tier:'T0',multiple_choice_execution_only:false,confidence:.8,short_reason:'단서와 발견'});

module.exports={d,route,raw,score};
