const fs=require('fs'),path=require('path');
const {localServer}=require('./shared-bank-local-server.cjs');
async function groupFixture(database=null){
 const x=await localServer({database});const db=x.db;await x.sql(x.A,'select bank_join($1)',[x.S]);await db.exec('reset role');
 await db.exec('create role authenticator;');
 await x.sql(x.A,'select bank_invite($1,$2,true)',[x.S,'teacher-b@example.test']);await x.sql(x.B,'select bank_join($1)',[x.S]);await db.exec('reset role');
 // Second verified owner required by the deployed membership migration.
 const O='bbbbbbbb-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
 await db.query("insert into auth.users values($1,'second-owner@example.test',now())",[O]);
 await db.query("insert into bank_members(space_id,email,user_id,role,enabled) values($1,'second-owner@example.test',$2,'owner',true)",[x.S,O]);
 for(const name of fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(n=>n>='202610100001'&&n.endsWith('.sql')).sort((a,b)=>a.replace('202610120030_','20261012150000_').localeCompare(b.replace('202610120030_','20261012150000_')))){
  if(name.includes('r2_freeze_preparation_only')||name.includes('paper_retention_schedule'))continue;
  try{await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8'));}catch(e){e.message=name+': '+e.message;throw e;}
 }
 const actor=async uid=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role authenticated');};
 const rpc=async(uid,name,args={})=>{await actor(uid);return (await db.query('select public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') result',Object.values(args))).rows[0].result;};
 return {...x,O,actor,rpc};
}
module.exports={groupFixture};
if(require.main===module)groupFixture().then(async x=>{console.log('group migration replay OK');await x.close();}).catch(e=>{console.error(e.message);process.exit(1);});
