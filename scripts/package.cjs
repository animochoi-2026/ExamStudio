const fs=require('node:fs');const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
// External processes/Python imports used by main.cjs and github-update.cjs.
// Operator, build, live-DB and test scripts belong in the development workspace.
const runtimeScripts=['apply-update.ps1','convert_hwp.ps1','export_docx.py','hwp_compat.py','hwp_native.py','structured_docx.py','verify_hwp.py','word_math.py'];
const nonRuntimeScripts=new RegExp('^/scripts/(?!(?:'+runtimeScripts.map(n=>n.replace(/\./g,'\\.')).join('|')+')$).+');
function normalizeExecutable(output){const name=fs.readdirSync(output).find(n=>n.normalize('NFC')==='문제공방.exe');if(name&&name!=='문제공방.exe')fs.renameSync(path.join(output,name),path.join(output,'문제공방.exe'));}
function packageOptions(root=ROOT){
  const buildId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+require('node:crypto').randomUUID().slice(0,8);
  return {dir:root,out:path.join(root,'builds',buildId),name:'ExamStudio',executableName:'문제공방',platform:'win32',arch:'x64',overwrite:false,asar:false,prune:true,
    ignore:[nonRuntimeScripts,/^\/app\/revision-payload-prune\.cjs$/,/\.map$/i,/\/(?:tests?|__tests__|examples?)(?:\/|$)/i,/^\/(?!app(?:\/|$)|scripts(?:\/|$)|node_modules(?:\/|$)|package\.json$|package-lock\.json$).+/],
    appCopyright:'Created by animochoi',win32metadata:{CompanyName:'animochoi',FileDescription:'문제공방 · Created by animochoi',ProductName:'문제공방'}};
}
async function main({root=ROOT,packager,pythonSource=process.env.EXAM_RELEASE_PYTHON,codexSource=path.join(root,'vendor','codex-runtime')}={}){
  require('./export-engine.cjs').releaseGate();
  const sharedConfig=path.join(root,'app','shared-bank-config.json');
  if(fs.existsSync(sharedConfig))require('../app/shared-bank-auth.cjs').configuration(JSON.parse(fs.readFileSync(sharedConfig,'utf8')));
  packager=packager||(await import('@electron/packager')).packager;
  const paths=await packager(packageOptions(root));
  for(const output of paths){
    require('./export-engine.cjs').stage(path.join(output,'resources','app','scripts'));
    require('./shared-contracts.cjs').stage(path.join(output,'resources','app','app'));
    // These approved generated assets belong to canonical app source. Rebuilding
    // from web CSS here used to silently change the desktop form during packaging.
    for(const name of ['paper-form-runtime.js','paper-form.css','paper-form-editor.html']){
      if(!fs.existsSync(path.join(output,'resources','app','app',name)))throw Error('Missing canonical form asset: '+name);
    }
    normalizeExecutable(output);
    if(pythonSource)require('./release-runtime.cjs').bundlePython(pythonSource,path.join(output,'runtime','python'));
    require('./release-codex.cjs').bundleCodex(codexSource,path.join(output,'runtime','codex'));
    const guide=path.join(root,'RELEASE-GUIDE.txt');
    fs.writeFileSync(path.join(output,'START-HERE.txt'),fs.existsSync(guide)?fs.readFileSync(guide):'문제공방.exe를 실행하세요. AI 서비스 설치와 본인 계정 로그인이 필요합니다.\r\n','utf8');
    const bankGuide=path.join(root,'SHARED-BANK-SETUP.md');
    if(fs.existsSync(bankGuide))fs.copyFileSync(bankGuide,path.join(output,'SHARED-BANK-SETUP.md'));
  }
  console.log(paths.join('\n'));
  return paths;
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={packageOptions,main,normalizeExecutable,runtimeScripts};
