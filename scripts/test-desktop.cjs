'use strict';
// Isolated Electron integration tests. Every AI/account bridge is mocked.
const {spawnSync}=require('node:child_process'),path=require('node:path');
const suites=['desktop-shared-bank','desktop-pagination-font','desktop-source-figure','desktop-blank-dropdown','desktop-audit-improvements','desktop-multi-source','desktop-presentation','desktop-pdf-units','desktop-pdf-columns','desktop-batch-word','desktop-solve-ignore','desktop-request-updates','desktop-pipeline-final','desktop-automatic','desktop-batch','desktop-mixed-count','desktop-scope-account','desktop-compact-workflow','desktop-provider-selection','desktop-recognition-retry','desktop-center-override','desktop-error-navigation','desktop-solution-word','desktop-regression-six','desktop-input-composition','desktop-variant-regeneration','desktop-recovery'];
for(const suite of suites){
 console.log(`\nRunning ${suite} (mock AI)`);
 const result=spawnSync(process.execPath,[path.join(__dirname,'..','tests',suite+'.cjs')],{stdio:'inherit',windowsHide:true,timeout:180000});
 if(result.error||result.status!==0){console.error(result.error||`${suite} exited ${result.status}`);process.exit(1);}
}
