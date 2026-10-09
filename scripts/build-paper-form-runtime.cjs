'use strict';
const fs=require('node:fs'),path=require('node:path');
function build(directory){
 const root=path.resolve(__dirname,'..');fs.mkdirSync(directory,{recursive:true});
 require('esbuild').buildSync({entryPoints:[path.join(root,'web-bank/desktop-paper-form.js')],outfile:path.join(directory,'paper-form-runtime.js'),bundle:true,minify:true,format:'iife',platform:'browser',target:['chrome110']});
 fs.copyFileSync(path.join(root,'web-bank/style.css'),path.join(directory,'paper-form.css'));
 fs.writeFileSync(path.join(directory,'paper-form-editor.html'),'<!doctype html><html lang="ko" data-form-editor="true"><meta charset="utf-8"><link rel="stylesheet" href="paper-form.css"><div id="view"></div><script src="paper-form-runtime.js"></script></html>');
}
if(require.main===module)build(process.argv[2]||path.resolve(__dirname,'../app'));
module.exports={build};
