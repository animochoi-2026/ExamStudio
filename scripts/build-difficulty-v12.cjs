'use strict';
// One source of scorer/schema/prompt truth shared by Node, desktop and Edge.
const esbuild=require('esbuild'),fs=require('fs');
fs.mkdirSync('supabase/functions/bank-difficulty-v12',{recursive:true});
esbuild.buildSync({entryPoints:['app/difficulty-v12/server.cjs'],bundle:true,platform:'node',format:'esm',outfile:'supabase/functions/bank-difficulty-v12/engine.mjs',banner:{js:"import crypto from 'node:crypto'; import {Buffer} from 'node:buffer'; const require=id=>{if(id==='node:crypto')return crypto;throw Error('Unsupported dependency '+id);};"}});
