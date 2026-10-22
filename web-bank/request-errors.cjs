'use strict';
const readNames=new Set(['bank_home_summary','bank_public_summary','bank_access_context','bank_source_list_page','bank_source_questions','bank_source_progress_get','bank_source_exams','bank_search_current','bank_search_options','bank_question_page','bank_rating_samples','bank_exam_candidates','bank_replacement_candidates']);
const isConnectionError=e=>/failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(e?.message||String(e));
function errorText(e){const text=e?.message||String(e||'');if(isConnectionError(e))return '서버와 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';if(/statement timeout|TimeoutError|timed out/i.test(text))return '조회 시간이 오래 걸려 중단되었습니다. 조회 범위를 줄이거나 잠시 후 다시 시도해 주세요.';return text;}
async function readRequest(name,run,signal){let result=await run();if(readNames.has(name)&&result.error&&isConnectionError(result.error)&&!signal?.aborted&&globalThis.navigator?.onLine!==false){await new Promise(r=>setTimeout(r,350));if(!signal?.aborted)result=await run();}return result;}
module.exports={readRequest,errorText,isConnectionError};
