const test=require('node:test'),assert=require('node:assert/strict'),layout=require('../app/structured-layout.js');
test('explicit source-image notice dismissal leaves unrelated review warnings intact',()=>{
 const first={id:'photo',type:'figure',origin:'printed',figureId:'photo',inlines:[]};const second={...first,id:'other',figureId:'other'};const uncertain={id:'uncertain',type:'paragraph',origin:'uncertain',inlines:[]};const q={layoutDocument:{nodes:[first,second,uncertain]}};
 assert.equal(layout.warnings(q).length,3);first.sourceImageWarningDismissed=true;const warnings=layout.warnings(q);assert.equal(warnings.length,2);assert(warnings.some(s=>s.includes('other')));assert(warnings.some(s=>s.includes('uncertain')));first.sourceImageWarningDismissed=false;assert.equal(layout.warnings(q).length,3);
});
