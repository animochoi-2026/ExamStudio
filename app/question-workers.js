// Stable input order, bounded workers, per-question stage order, drain on error.
(function(root){
 async function runQuestions({problems,limit,stages=['recognition','solve','analysis','upload'],keepGoing,step,onResult=()=>{}}){
  if(!Number.isSafeInteger(limit)||limit<1)throw Error('동시 처리 수는 1 이상의 정수로 입력하세요.');
  let cursor=0,fatal=null;const results=new Array(problems.length);
  async function worker(){while(!fatal&&keepGoing()){
   const index=cursor++;if(index>=problems.length)return;const problem=problems[index],records=[];results[index]={problemId:problem.id,stages:records};
   try{for(const stage of stages){if(fatal||!keepGoing())break;const result=await step(problem,stage);records.push({stage,result});await onResult(problem,stage,result);if(result.held||result.stopped)break;}}
   catch(error){fatal=error;results[index].error=String(error.message);}
  }}
  await Promise.all(Array.from({length:Math.min(limit,problems.length)},worker));
  if(fatal)throw fatal;return results;
 }
 if(typeof module!=='undefined')module.exports={runQuestions};else root.ExamQuestionWorkers={runQuestions};
})(globalThis);
