// Working copies exist only for this tab. Only the explicit save action writes
// bank_exam_drafts. Existing localStorage recovery copies remain untouched.
import {workspaceKey,workspaceStored} from './grade-workspace.js';
export const examSession={
 read(user,id){try{return JSON.parse(workspaceStored(sessionStorage,'bank-exam-work:'+user+':'+id)||'null');}catch{return null;}},
 write(user,id,doc){sessionStorage.setItem(workspaceKey('bank-exam-work:'+user+':'+id),JSON.stringify(doc));},
 clear(user,id){sessionStorage.removeItem(workspaceKey('bank-exam-work:'+user+':'+id));}
};
