'use strict';
// Planning range, not a measured quote or hard currency cap. Standard pricing 2026-10-18.
const rates={inputPerMillion:2,outputPerMillion:10,currency:'USD',source:'https://developers.openai.com/api/docs/models/gpt-6.1-sol'};
function estimate(count,maxCalls=count){const cost=(n,input,output)=>+(n*(input*rates.inputPerMillion+output*rates.outputPerMillion)/1e6).toFixed(2);return {count,maxCalls,estimated:true,inputTokensPerItem:[8000,20000],outputTokensPerItem:[3000,12000],baseUSD:[cost(count,8000,3000),cost(count,20000,12000)],withRetriesHighUSD:cost(maxCalls,20000,12000),rates};}
function actual(entries){let input=0,output=0,cached=0;for(const e of entries){const u=e.state?.providerUsage||e.state?.result?.usage;if(!u)continue;input+=u.input_tokens||0;output+=u.output_tokens||0;cached+=u.input_tokens_details?.cached_tokens||0;}return {input,output,cached,knownResponsesUSD:+(((input-cached)*2+cached*.1+output*10)/1e6).toFixed(6),unknownRequestCostExcluded:true};}
module.exports={estimate,actual,rates};
