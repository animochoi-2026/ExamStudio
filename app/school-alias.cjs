'use strict';
const names=['신동중','신동중학교'];
function known(source){const s=typeof source==='string'?{school:source}:source||{},region=String(s.region||'').trim();return names.includes(s.school)&&(!region||/^(서울(시|특별시)?\s*)?(서초구)?$/.test(region));}
function name(value,region=''){return known({school:value,region})?'신동중':value;}
function source(s){return s&&known(s)?{...s,school:'신동중'}:s;}
function expand(schools){return [...new Set((schools||[]).flatMap(s=>names.includes(s)?names:[s]))];}
function key(s){return JSON.stringify([known(s)?'':s.schoolId||'',known(s)?'서울 서초구':s.region||'',name(s.school||'',s.region)]);}
module.exports={known,name,source,expand,key};
