'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const manifest=()=>JSON.parse(fs.readFileSync(path.join(root,'release/stable.json'),'utf8'));
function verifySources(){const m=manifest();for(const [n,h]of Object.entries(m.source))assert.equal(hash(path.join(root,n)),h,'Canonical source changed: '+n);return m;}
function verifyWeb(dir){const m=manifest();for(const [n,h]of Object.entries(m.web.assets))assert.equal(hash(path.join(dir,n)),h,'Web asset differs: '+n);return m;}
function verifyDesktop(dir){const m=manifest();for(const [n,h]of Object.entries(m.desktop.applicationAssets))assert.equal(hash(path.join(dir,'resources/app',n)),h,'Desktop source differs: '+n);require('./export-engine.cjs').verify(path.join(dir,'resources/app/scripts'));return m;}
module.exports={verifySources,verifyWeb,verifyDesktop};
if(require.main===module){verifySources();if(process.argv[2]==='web')verifyWeb(process.argv[3]);if(process.argv[2]==='desktop')verifyDesktop(process.argv[3]);console.log('Stable release identity verified');}
