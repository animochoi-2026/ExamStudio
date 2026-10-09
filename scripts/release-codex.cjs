'use strict';
const fs=require('node:fs'),path=require('node:path');
const files=['bin/codex.exe','bin/codex-code-mode-host.exe','codex-resources/codex-command-runner.exe','codex-resources/codex-windows-sandbox-setup.exe','codex-path/rg.exe','codex-package.json','LICENSE','NOTICE','PROVENANCE.json'];
function bundleCodex(source,target){
 for(const file of files)if(!fs.statSync(path.join(source,file)).isFile())throw Error('내장 Codex 배포 파일 누락: '+file);
 if(fs.existsSync(target))throw Error('Codex runtime destination already exists');
 for(const file of files){const dest=path.join(target,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(source,file),dest);}
}
module.exports={bundleCodex,files};
