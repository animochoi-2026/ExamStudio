'use strict';
const fs=require('node:fs'),path=require('node:path');
async function build(configFile,output=path.resolve(__dirname,'../web-bank/dist'),{stable=false}={}){
 if(!stable)require('./export-engine.cjs').releaseGate();
 const baseline=stable?require('../release/stable.json'):null;
 if(stable)require('./stable-release.cjs').verifySources();
 const root=path.resolve(__dirname,'..');if(!configFile)throw Error('공개 연결 JSON 경로를 지정하세요. 관리자 키를 넣지 마세요.');
 const config=require('../app/shared-bank-auth.cjs').configuration(JSON.parse(fs.readFileSync(configFile,'utf8')));
 fs.mkdirSync(output,{recursive:true});for(const file of ['index.html','style.css','_headers'])fs.copyFileSync(path.join(root,'web-bank',file),path.join(output,file));fs.writeFileSync(path.join(output,'config.json'),JSON.stringify(config));
 const katex=path.dirname(require.resolve('katex/package.json'));fs.copyFileSync(path.join(katex,'dist/katex.min.css'),path.join(output,'katex.min.css'));fs.cpSync(path.join(katex,'dist/fonts'),path.join(output,'fonts'),{recursive:true});
 // style.css is the canonical deployed stylesheet. Do not append a second,
 // independently versioned stylesheet while reproducing a reviewed release.
 fs.copyFileSync(path.join(root,'web-bank/export-worker.js'),path.join(output,'export-worker.js'));
 fs.cpSync(path.join(root,'web-bank/runtime'),path.join(output,'runtime'),{recursive:true});
 require('./export-engine.cjs').stage(path.join(output,'python'));
 // Both entry points must consume the same current data contracts. Previously
 // only app.js was rebuilt, leaving the composition worker on an older rubric.
 const crypto=require('node:crypto'),version=crypto.createHash('sha256');
 for(const name of fs.readdirSync(path.join(root,'app')).filter(n=>/\.(cjs|js|json)$/.test(n)).sort())version.update(name).update(fs.readFileSync(path.join(root,'app',name)));
 const define={__COMPOSITION_VERSION__:JSON.stringify(baseline?.web.compositionVersion||version.digest('hex'))};
 for(const name of ['app','exam-composition-worker'])await require('esbuild').build({entryPoints:[path.join(root,'web-bank',name+'.js')],outfile:path.join(output,name+'.js'),bundle:true,minify:true,format:'esm',platform:'browser',target:['chrome110'],sourcemap:false,define,plugins:[require('./web-platform.cjs').plugin()]});
 if(stable)require('./stable-release.cjs').verifyWeb(output);return output;
}
if(require.main===module)build(process.argv[2],process.argv[3],{stable:process.argv.includes('--stable')}).then(console.log).catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={build};
