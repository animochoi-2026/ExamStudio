'use strict';
// Shared entry point for full-bank and exam manifests. No implicit target scan,
// provider creation, retries, activation, or deployment.
const {batch}=require('../app/difficulty-v122/adapters.cjs');
async function run(manifest,runtime){
 if(!manifest?.sources?.length||!manifest.target_snapshot_hash)throw Error('fixed target snapshot required');
 const C=require('../app/difficulty-v122/canonical.cjs');
 if(C.hash(manifest.sources)!==manifest.target_snapshot_hash)throw Error('target snapshot hash mismatch');
 return batch(manifest.sources,runtime);
}
module.exports={run};
if(require.main===module)throw Error('Explicit approved manifest and difficulty runtime required; no automatic evaluation');
