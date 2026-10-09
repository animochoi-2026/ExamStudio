'use strict';
// Read-only archived data diagnosis. Intentionally has no --execute option.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),R=require('../app/difficulty-reassessment.cjs');
function readSnapshot(directory){
 const backup=JSON.parse(fs.readFileSync(path.join(directory,'backup.json'),'utf8')),latest=new Map();
 for(const r of backup.records.filter(r=>r.revision.committed&&!r.question.archived).sort((a,b)=>b.catalog.created_at.localeCompare(a.catalog.created_at)||b.catalog.revision_id.localeCompare(a.catalog.revision_id)))if(!latest.has(r.catalog.question_id))latest.set(r.catalog.question_id,r.catalog);
 const items=[];for(const c of latest.values()){
  const file=c.files.find(f=>f.role==='data');let question=null,problem=null,scope=c.metadata?.difficulty?.scope;
  if(file){if(!/^[a-f0-9-]{36}$/i.test(file.id))throw Error('원본 파일 ID 형식이 잘못되었습니다.');const bytes=fs.readFileSync(path.join(directory,'files',file.id));if(bytes.length!==file.size||crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('저장 원본 파일의 무결성이 맞지 않습니다.');const bundle=JSON.parse(bytes);if(bundle.questionId!==c.question_id||bundle.revisionId!==c.revision_id)throw Error('문항 버전과 원본 파일이 다릅니다.');const native=bundle.native,p=native?.project?.problems?.[0];question=[p?.original,...(p?.variants||[])].find(q=>q?.id===native?.targetQuestionId)||null;scope=native?.project?.scope||scope;problem=p;}
  items.push({catalog:c,question,problem,scope,modules:structuredClone(question?.reviewBaseline?.modules||[])});
 }return {items,snapshotCreatedAt:backup.createdAt};
}
function run({snapshot,output,model,effort}){const input=readSnapshot(path.resolve(snapshot)),report=R.plan(input.items,{model,effort});report.source={snapshot:path.resolve(snapshot),snapshotCreatedAt:input.snapshotCreatedAt,freshProductionQuery:false};fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));return report;}
if(require.main===module){try{const argv=process.argv.slice(2),args={};for(let i=0;i<argv.length;i+=2){if(!['--snapshot','--output','--model','--effort'].includes(argv[i])||!argv[i+1])throw Error('사용법: --snapshot <백업폴더> --output <계획.json> --model <모델> --effort <수준>. 실행 기능은 없습니다.');args[argv[i].slice(2)]=argv[i+1];}if(!args.snapshot||!args.output)throw Error('백업과 출력 경로가 필요합니다.');const r=run(args);console.log(JSON.stringify({dryRun:r.dryRun,total:r.total,counts:r.counts,maximumProposedCalls:r.maximumProposedCalls,aiCalls:0,productionWrites:0,output:path.resolve(args.output)}));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={readSnapshot,run};
