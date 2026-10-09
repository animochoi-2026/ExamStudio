'use strict';
// Filename suggestions only. Unknown or ambiguous fields stay empty; no AI call.
function inferSourceInfo(filename){
 const title=String(filename||'').replace(/\.(?:pdf|png|jpe?g|webp|bmp|docx?|hwpx?)$/i,'').normalize('NFC');
 const text=title.replace(/[()\[\]{}_]/g,' ').replace(/\s+/g,' ').trim();
 const unique=values=>{const all=[...new Set(values)];return all.length===1?all[0]:null;};
 const school=unique([...text.matchAll(/(?:^|\s)([가-힣A-Za-z]{2,24}(?:중학교|고등학교|초등학교|중|고|초))(?=\s|$)/g)].map(m=>m[1]));
 const exam=unique([...text.matchAll(/(중간|기말)(?:고사|시험)?/g)].map(m=>m[1]+'고사'));
 const kind=/기출/.test(text)||(school&&exam)?'학교기출':'기타자료';
 const yearCandidates=[...text.matchAll(/(?<!\d)((?:19|20)\d{2})\s*(?:학년도|학년|년도|년)/g)].map(m=>m[1]);
 if(kind==='학교기출')yearCandidates.push(...[...text.matchAll(/(?:^|\s)((?:19|20)\d{2})(?=\s|$)/g)].map(m=>m[1]));
 const academicYear=unique(yearCandidates);
 let grade=unique([...text.matchAll(/(?:^|\s)([중고초])\s*([1-6])(?=\D|$)/g)].map(m=>m[1]+m[2]));
 if(!grade)grade=unique([...text.matchAll(/(?<!\d)([1-6])\s*학년/g)].map(m=>(school?.match(/중(?:학교)?$/)?'중':school?.match(/고(?:등학교)?$/)?'고':school?.match(/초(?:등학교)?$/)?'초':'')+m[1]+(school?'':'학년')));
 let semester=unique([...text.matchAll(/([12])\s*학기/g)].map(m=>m[1]+'학기'));
 const compact=[...title.matchAll(/(?:^|\s|_)([1-3])\s*[-_]\s*([12])(?=\s|_|중간|기말|학기)/g)];
 if(compact.length===1){if(!grade)grade=(school?.match(/중(?:학교)?$/)?'중':school?.match(/고(?:등학교)?$/)?'고':'')+compact[0][1]+(school?'':'학년');if(!semester)semester=compact[0][2]+'학기';}
 const region=unique([...text.matchAll(/(?:^|\s)(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?=\s|$)/g)].map(m=>m[1]));
 return {kind,materialTitle:title||null,school,region,academicYear,grade,semester,exam};
}
module.exports={inferSourceInfo};
