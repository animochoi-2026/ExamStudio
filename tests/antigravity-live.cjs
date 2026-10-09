// Explicit live smoke test: synthetic arithmetic image only, never user exam files.
const path=require('node:path'),fs=require('node:fs');
const {AntigravityBridge}=require('../app/antigravity.cjs');
const {DEFAULT_PROMPTS}=require('../app/prompts.cjs');
const root=path.resolve(__dirname,'../data/validation/antigravity-probe');
const bridge=new AntigravityBridge({cwd:root,requestsDir:path.join(root,'live-requests')});
bridge.run({context:{id:'arithmetic-smoke',messages:[],original:null,variants:[]},text:'이미지의 원문을 읽고 정답과 짧은 풀이를 작성하세요. 유사문제는 생성하지 마세요.',images:[path.join(root,'crop.png')],model:'gemini-3.8-flash-low',effort:'low',commonPrompt:DEFAULT_PROMPTS.common}).then(result=>{fs.writeFileSync(path.join(root,'live-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:!!result.result.original?.body,answer:result.result.original?.answer,model:result.model}));}).catch(error=>{console.error(error.message);process.exitCode=1;});
