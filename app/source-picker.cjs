'use strict';
const fs=require('node:fs'),path=require('node:path');
const {atomicWrite}=require('./store.cjs');
// Input history belongs to the persistent profile, independently of output paths.
async function pickSourceFiles(dialog,window,directory,options){
 const file=path.join(directory,'source-picker.json');
 let defaultPath;
 try{
  const saved=JSON.parse(fs.readFileSync(file,'utf8')).lastDirectory;
  if(typeof saved==='string'&&path.isAbsolute(saved)&&fs.statSync(saved).isDirectory()){
   fs.accessSync(saved,fs.constants.R_OK);defaultPath=saved;
  }
 }catch{} // A moved/deleted/inaccessible folder uses Electron's usual default.
 const result=await dialog.showOpenDialog(window,{...options,...(defaultPath?{defaultPath}:{})});
 if(result.canceled||!result.filePaths?.length)return null;
 const lastDirectory=path.dirname(result.filePaths[0]);
 try{atomicWrite(file,{lastDirectory});}catch(error){console.warn('Could not remember the source folder:',error.code||error.message);}
 return result.filePaths;
}
module.exports={pickSourceFiles};
