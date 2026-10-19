const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const D=require('../app/difficulty-assessment.cjs'),Display=require('../app/desktop-difficulty.cjs'),F=require('../app/bank-search-filters.cjs');
const row=n=>({metadata:{difficulty:{v121Latest:{record:{final_status:'complete',final_score:n,final_tier:'T3'}}}},confirmed:{}});
test('rollback preserves numeric boundaries and overlapping killer',()=>{
 for(const [n,band]of [[3,'low'],[3.1,'middle'],[6.8,'middle'],[7.9,'middle'],[8,'high'],[9,'high']])assert.equal(D.compositionBand(row(n)),band);
 assert.equal(Display.effective(row(6.8)).band,'중');assert(F.matches(row(9),{compositionBand:'high'}));assert(F.matches(row(9),{compositionBand:'killer'}));
});
test('stored approved results give original display counts without rewriting records',()=>{
 const path='artifacts/difficulty-v121/production-20261019/prepared.json';if(!fs.existsSync(path))return;
 const p=JSON.parse(fs.readFileSync(path)),counts={low:0,middle:0,high:0,killer:0};
 for(const x of p.items){const r=row(x.result.final_score);counts[D.compositionBand(r)]++;if(F.isKiller(r))counts.killer++;}
 assert.deepEqual(counts,{low:715,middle:550,high:1,killer:1});
});
