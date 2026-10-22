'use strict';
// Server-owned policy. No caller-provided numeric budget is authoritative.
const version='provider-default-or-model-max-no-artificial-cap-r1';
const capFields=['max_output_tokens','max_completion_tokens','max_tokens','output_token_limit','response_token_limit','token_budget','completion_budget'];
function request(value){const out={...value};for(const key of capFields)delete out[key];return out;}
const metadata=Object.freeze({difficulty_output_budget_policy_version:version,application_output_cap:'none',output_limit_parameter_omitted:true,endpoint_required_output_limit:null,low_cap_first_pass:false,retry_full_request_with_higher_cap:false});
function outputLimit(result){return result.finish_reason==='length'||/max_output_tokens|max_completion_tokens|max_tokens|output.{0,20}(?:limit|truncat)|token.{0,20}(?:limit|exceed)/i.test(JSON.stringify({reason:result.reason,finish_reason:result.finish_reason,stop_reason:result.stop_reason,computed_reason:result.computed?.reason,evidence:result.evidence,incomplete_details:result.incomplete_details}));}
module.exports={version,capFields,request,metadata,outputLimit};
