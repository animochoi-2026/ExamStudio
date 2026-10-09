'use strict';
const fs=require('node:fs'),path=require('node:path');
// Only managed files in a direct UUID child are removed. Unknown files are retained.
function removeRequestFiles(root,folder){
 if(!folder||!fs.existsSync(folder)||!fs.existsSync(root))return;
 const realRoot=fs.realpathSync(root),realFolder=fs.realpathSync(folder);
 if(path.dirname(realFolder)!==realRoot||! /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(path.basename(realFolder))||fs.lstatSync(folder).isSymbolicLink())return;
 for(const item of fs.readdirSync(realFolder,{withFileTypes:true})){
  if(item.isFile()&&/^(?:request\.txt|schema\.json|crop-\d+\.(?:png|jpe?g|webp))$/i.test(item.name))fs.unlinkSync(path.join(realFolder,item.name));
 }
 if(!fs.readdirSync(realFolder).length)fs.rmdirSync(realFolder);
}
module.exports={removeRequestFiles};
