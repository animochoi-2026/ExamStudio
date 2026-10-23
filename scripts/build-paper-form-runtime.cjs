'use strict';
const fs=require('node:fs'),path=require('node:path');
function build(directory){
 const root=path.resolve(__dirname,'..');fs.mkdirSync(directory,{recursive:true});
 require('esbuild').buildSync({entryPoints:[path.join(root,'web-bank/desktop-paper-form.js')],outfile:path.join(directory,'paper-form-runtime.js'),bundle:true,minify:true,format:'iife',platform:'browser',target:['chrome110']});
 fs.cpSync(path.join(root,'web-bank/runtime/noto-sans-kr'),path.join(directory,'print-fonts'),{recursive:true});
 fs.writeFileSync(path.join(directory,'paper-form.css'),'@import url("./print-fonts/print-font.css");\n'+fs.readFileSync(path.join(root,'web-bank/style.css'),'utf8'));
 fs.writeFileSync(path.join(directory,'paper-form-editor.html'),'<!doctype html><html lang="ko" data-form-editor="true"><meta charset="utf-8"><link rel="stylesheet" href="paper-form.css"><div id="view"></div><script src="paper-form-runtime.js"></script></html>');
}
if(require.main===module)build(process.argv[2]||path.resolve(__dirname,'../app'));
module.exports={build};
