'use strict';
// Loaded before application imports. No real process or socket may leave a test.
const fs=require('node:fs'),moduleApi=require('node:module'),path=require('node:path');
const symbol=Symbol.for('examstudio.offline-test-guard');
if(!globalThis[symbol]){
 const state={blocked:[],allowed:[]};
 Object.defineProperty(globalThis,symbol,{value:state});
 process.env.EXAMSTUDIO_OFFLINE_TEST='1';
 function deny(kind){
  const event={at:new Date().toISOString(),pid:process.pid,kind};
  state.blocked.push(event);
  if(process.env.EXAMSTUDIO_TEST_AUDIT)fs.appendFileSync(process.env.EXAMSTUDIO_TEST_AUDIT,JSON.stringify(event)+'\n');
  throw Object.assign(Error('Offline test blocked '+kind),{code:'ERR_TEST_EXTERNAL_IO_BLOCKED',testIsolation:true});
 }
 function replace(obj,key,kind){
  if(typeof obj[key]!=='function')return;
  Object.defineProperty(obj,key,{value:function(){return deny(kind||key);},writable:false,configurable:false});
 }
 // PGlite's WASM filesystem asks for legacy constants. Supply public data
 // only; never expose a native binding (including spawn_wrap/tcp_wrap).
 Object.defineProperty(process,'binding',{value:name=>{
  if(name==='constants')return {fs:fs.constants};
  return deny('native.binding');
 },writable:false,configurable:false});
 const cp=require('node:child_process'),nativeSpawnSync=cp.spawnSync;
 // A deliberately small argv grammar: no shell, hooks, aliases, remote or
 // repository-selected executable. The parent supplies the resolved Git path.
 const git=process.env.EXAMSTUDIO_READONLY_GIT;
 function permitted(file,args){
  if(!Array.isArray(args)||args.some(x=>typeof x!=='string'))return false;
  if(file===process.execPath)return args.length===1&&args[0]==='--version';
  if(!git||file!==git)return false;
  return args.length===2&&(
   args[0]==='rev-parse'&&['HEAD','--show-toplevel','--git-common-dir'].includes(args[1])||
   args[0]==='status'&&args[1]==='--porcelain'||
   args[0]==='diff'&&args[1]==='--name-only'||
   args[0]==='hash-object'&&!args[1].startsWith('-')&&fs.statSync(args[1],{throwIfNoEntry:false})?.isFile());
 }
 function launch(file,args,options={}){
  if(!permitted(file,args)||options.shell||options.input||options.env) return deny('process.non_allowlisted');
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^GIT_|TOKEN|SECRET|COOKIE|API_KEY|^OPENAI_|^NODE_OPTIONS$/i.test(k)));
  state.allowed.push({kind:'readonly.process',file,args});
  const safeArgs=file===git?['-c','core.hooksPath=NUL','-c','core.fsmonitor=false','-c','core.untrackedCache=false',...args]:args;
  return nativeSpawnSync(file,safeArgs,{cwd:options.cwd||process.cwd(),encoding:options.encoding||'utf8',
   env:{...env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'},windowsHide:true,timeout:10000,maxBuffer:4*1024*1024});
 }
 Object.defineProperty(cp,'spawnSync',{value:launch,writable:false,configurable:false});
 Object.defineProperty(cp,'execFileSync',{value:(file,args,options)=>{
  const r=launch(file,args,options);if(r.error)throw r.error;
  if(r.status!==0)throw Object.assign(Error('read-only command failed'),{status:r.status});
  return r.stdout;
 },writable:false,configurable:false});
 for(const k of ['spawn','exec','execSync','execFile','fork'])replace(cp,k,'process.'+k);
 replace(cp.ChildProcess.prototype,'spawn','process.nativeSpawn');
 replace(require('node:worker_threads'),'Worker','process.worker');
 const nativeLoad=process.dlopen,sharpDir=path.resolve(__dirname,'../node_modules/@img/sharp-win32-x64/lib');
 const sharpNodes=fs.existsSync(sharpDir)?fs.readdirSync(sharpDir).filter(x=>/^sharp-win32-x64(?:-[\d.]+)?\.node$/.test(x))
  .map(x=>fs.realpathSync.native(path.join(sharpDir,x))):[];
 Object.defineProperty(process,'dlopen',{value:(mod,file,...rest)=>{
  const real=fs.realpathSync.native(file);
  if(!sharpNodes.includes(real))return deny('native.addon');
  state.allowed.push({kind:'sharp.local-addon',file:real});
  return nativeLoad(mod,file,...rest);
 },writable:false,configurable:false});
 const net=require('node:net'),tls=require('node:tls'),dns=require('node:dns'),http=require('node:http'),https=require('node:https');
 for(const k of ['connect','createConnection'])replace(net,k,'network.net.'+k);
 replace(net.Socket.prototype,'connect','network.socket.connect');
 replace(tls,'connect','network.tls.connect');
 for(const m of [http,https])for(const k of ['request','get'])replace(m,k,'network.http.'+k);
 replace(require('node:http2'),'connect','network.http2.connect');
 replace(require('node:dgram'),'createSocket','network.udp');
 for(const k of Object.keys(dns))if(k==='lookup'||k==='reverse'||k.startsWith('resolve'))replace(dns,k,'network.dns.'+k);
 for(const k of Object.keys(dns.promises))replace(dns.promises,k,'network.dns.promise.'+k);
 Object.defineProperty(globalThis,'fetch',{value:async()=>deny('network.fetch'),writable:false,configurable:false});
 if(globalThis.WebSocket)Object.defineProperty(globalThis,'WebSocket',{value:class{constructor(){deny('network.websocket');}},writable:false,configurable:false});
 // Keep ESM imports of builtins on the same guarded functions.
 moduleApi.syncBuiltinESMExports();
}
module.exports=globalThis[symbol];
