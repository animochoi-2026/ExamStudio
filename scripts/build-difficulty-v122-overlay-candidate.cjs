'use strict';
const fs=require('fs'),path=require('path'),C=require('../app/difficulty-v122/canonical.cjs');
const dir=path.resolve(__dirname,'../app/difficulty-v122');
fs.writeFileSync(path.join(dir,'schema.json'),JSON.stringify(require('../app/difficulty-v122/schema.cjs').modelSchema(),null,2)+'\n');
const files=Object.fromEntries(fs.readdirSync(dir).filter(n=>/\.(cjs|json)$/.test(n)&&n!=='candidate-versions.json').sort().map(n=>[n,C.bytesHash(fs.readFileSync(path.join(dir,n)))]));
const versions={prompt_hash:C.hash([files['prompt.json'],files['prompt.cjs']]),schema_hash:C.hash([files['schema.json'],files['schema.cjs']]),projection_hash:files['projection.cjs'],validator_hash:C.hash(['validate.cjs','references.cjs','response-contract.cjs','evidence.cjs','projection-role-overlay.cjs','projection-role-overlays.json'].map(n=>files[n])),scorer_hash:files['scorer.cjs'],source_builder_hash:C.hash(['source.cjs','input.cjs','evidence.cjs','projection-role-overlay.cjs','projection-role-overlays.json'].map(n=>files[n])),criteria_payload_hash:C.hash(files)};
fs.writeFileSync(path.join(dir,'candidate-versions.json'),JSON.stringify({status:'unfrozen_user_role_overlay_candidate',versions,files},null,2)+'\n');
console.log(JSON.stringify(versions));
