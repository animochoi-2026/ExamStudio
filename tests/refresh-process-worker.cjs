'use strict';
const {SharedBankAuth}=require('../app/shared-bank-auth.cjs');
const auth=new SharedBankAuth({directory:process.argv[2],safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).reverse(),decryptString:b=>Buffer.from(b).reverse().toString()},openExternal:()=>{},fetchImpl:(_,options)=>fetch(process.argv[3],options)});
auth.token().then(()=>process.stdout.write('OK'),()=>{process.stderr.write('refresh failed');process.exitCode=1;});
