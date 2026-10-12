import {originalLoading} from './original-exams.js';
// Only loading lifetime is shared. Outside clicks never dismiss this dialog.
export async function loadingTask(ctx,title,task){
 const load=originalLoading({...ctx,titleText:title,statusText:'데이터를 불러오는 중입니다.'});
 try{return await task(load);}finally{load.cancel();}
}
