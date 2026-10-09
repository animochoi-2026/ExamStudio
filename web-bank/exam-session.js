// Working copies exist only for this tab. Only the explicit save action writes
// bank_exam_drafts. Existing localStorage recovery copies remain untouched.
export const examSession={
 read(user,id){try{return JSON.parse(sessionStorage.getItem('bank-exam-work:'+user+':'+id)||'null');}catch{return null;}},
 write(user,id,doc){sessionStorage.setItem('bank-exam-work:'+user+':'+id,JSON.stringify(doc));},
 clear(user,id){sessionStorage.removeItem('bank-exam-work:'+user+':'+id);}
};
