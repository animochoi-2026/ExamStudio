'use strict';
const path=require('node:path'),Policy=require('./policy.cjs'),{fileStore}=require('./ledger.cjs');
const {versions}=require('./candidate-versions.json'),Prompt=require('./prompt.cjs');
function createRuntime(root,{runStage,smoke=false}={}){
 const ledgerRoot=path.join(root,'difficulty-v122','ledger'),artifactRoot=path.join(root,'difficulty-v122','protected-calls');
 return {policyVersion:Policy.model_policy_version,versions,instructions:Prompt.instructions,store:fileStore(ledgerRoot),smoke,
  runStage:runStage||require('./subscription.cjs').provider({artifactRoot})};
}
module.exports={createRuntime};
