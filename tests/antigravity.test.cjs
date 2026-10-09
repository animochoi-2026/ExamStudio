const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {AntigravityBridge,parseModels}=require('../app/antigravity.cjs');
test('Gemini compiled execution writes the same selected rules and schema without old full prompts or history',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agy-execution-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const {recognition}=require('./workflow-fixtures.cjs'),{schemas}=require('../app/task-schemas.cjs');let folder,text,schema;
 const bridge=new AntigravityBridge({cwd:dir,requestsDir:path.join(dir,'requests')});bridge.getAccount=async()=>({available:true,models:[{model:'gemini-test'}]});
 bridge.execute=async(_args,options)=>{folder=options.cwd;text=fs.readFileSync(path.join(folder,'request.txt'),'utf8');schema=JSON.parse(fs.readFileSync(path.join(folder,'schema.json')));return{out:JSON.stringify({status:'SUCCESS',structured_output:{reply:'판독',recognition:recognition()},usage:{input_tokens:100,cache_read_tokens:20,output_tokens:30}})};};
 const result=await bridge.run({context:{id:'p',messages:[{text:'OLD FULL HISTORY'}]},images:[],model:'gemini-test',effort:'high',text:'SELECTED DATA',execution:{instructions:'ONLY SELECTED RULES',schema:schemas.recognition}});
 assert.equal(fs.existsSync(folder),false);assert.match(text,/ONLY SELECTED RULES/);assert.doesNotMatch(text,/OLD FULL HISTORY|현재 사용자 공통 프롬프트/);assert.deepEqual(schema,schemas.recognition);assert.equal(result.tokens.cache_read_tokens,20);
});
test('Antigravity selects only Gemini catalog models and stages only selected images for structured output',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'exam-agy-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const images=path.join(directory,'projects');fs.mkdirSync(images);const file=path.join(images,'crop.png');fs.writeFileSync(file,'fixture');
 const bridge=new AntigravityBridge({cwd:images,requestsDir:path.join(directory,'requests')});
 const calls=[];let stagedFiles,stagedText;bridge.execute=async(args,options)=>{
  calls.push({args,options});
  if(args[0]==='models')return{out:'Fetching available models...\ngemini-test-high\tGemini test (High)\nclaude-test\tClaude'};
  if(args.includes('/usage'))return{out:JSON.stringify({status:'SUCCESS',command:{data:{groups:[{name:'Gemini Models',buckets:[{remaining_fraction:.5}]}]}}})};
  stagedFiles=fs.readdirSync(options.cwd).sort();stagedText=fs.readFileSync(path.join(options.cwd,'request.txt'),'utf8');
  return{out:JSON.stringify({status:'SUCCESS',conversation_id:'gemini-id',structured_output:{reply:'인식했습니다',original:null,variants:[],replaceVariants:false,warnings:[]}})};
 };
 const output=await bridge.run({context:{id:'p',messages:[]},text:'인식',images:[file],model:'gemini-test-high',effort:'high',commonPrompt:'공통'});
 assert.equal(output.geminiThreadId,'gemini-id');assert.equal(output.threadId,undefined);
 const request=calls.at(-1);assert.ok(request.args.includes('--add-dir'));assert.ok(request.args.includes('--json-schema'));assert.equal(request.args.includes('--dangerously-skip-permissions'),false);
 assert.deepEqual(stagedFiles,['crop-0.png','request.txt','schema.json']);
 assert.match(stagedText,/공통/);
 assert.equal(parseModels('gemini-test-high\tTest\nclaude-x\tOther').length,1);
 await assert.rejects(bridge.run({context:{id:'p'},text:'인식',model:'unknown',commonPrompt:'공통'}),/모델/);
 bridge.execute=async args=>args[0]==='models'?{out:'gemini-test-high\tTest'}:{out:JSON.stringify({status:'SUCCESS',command:{data:{groups:[{name:'Gemini Models',buckets:[{remaining_fraction:0}]}]}}})};
 assert.equal((await bridge.getAccount()).available,false);
});
