'use strict';
// Actual Edge handler/imports with isolated HTTP and identity substitutes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url'),{stripTypeScriptTypes}=require('node:module');
async function loadVerifier(context){
 const directory=path.join(__dirname,'../supabase/functions/bank-verify');
 let source=fs.readFileSync(path.join(directory,'index.ts'),'utf8');
 const imported={};let index=0;
 for(const match of [...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm)]){
  const specifier=match[2],key='__edgeImport'+index++;
  imported[key]=await import(specifier.startsWith('node:')?specifier:pathToFileURL(path.resolve(directory,specifier)).href);
  source=source.replace(match[0],`const {${match[1]}}=${key};`);
 }
 vm.runInNewContext(stripTypeScriptTypes(source),{Response,Request,TextDecoder,Uint8Array,JSON,Error,Math,String,Set,...context,...imported});
}
module.exports={loadVerifier};
