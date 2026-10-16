export function listState(states,key){return states[key]||= {page:0,filters:{}};}
export function captureSourceOrigin(route,states,scroll,grade){return ['schools','schools-name','originals'].includes(route)?{route,state:structuredClone(listState(states,route)),scroll,grade}:null;}
export function restoreSourceOrigin(origin,states,grade){if(!origin||origin.grade!==grade)return {route:'schools',scroll:0};states[origin.route]=structuredClone(origin.state);return {route:origin.route,scroll:origin.scroll||0};}
export const registrationLabel=e=>({user_confirmed:'등록완료(사용자 확인)',complete:'등록 완료',partial:'일부 등록',mismatch:'문항 수 불일치',unregistered:'미등록',unknown:'완료 여부 확인 필요'}[e.registration_state]||'완료 여부 확인 필요');
