'use strict';
const {hash}=require('./canonical.cjs');
const policy=Object.freeze({
 spec_revision:'difficulty-v1.2.2-rc1',
 projection_version:'m2-required-projection-r2',
 source_id_contract_version:'difficulty-source-id-r1',
 model_policy_version:'luna-medium-sol-medium-structural-high-r3',
 stages:Object.freeze([
  Object.freeze({stage:1,model:'gpt-6-luna',effort:'medium'}),
  Object.freeze({stage:2,model:'gpt-6.1-sol',effort:'medium'}),
  Object.freeze({stage:3,model:'gpt-6.1-sol',effort:'high'})
 ]),
 automaticRetries:0
});
function assertPolicy(version){if(version!==policy.model_policy_version)throw Object.assign(Error('difficulty_policy_upgrade_required'),{code:'difficulty_policy_upgrade_required'});}
module.exports={...policy,model_policy_hash:hash(policy),assertPolicy};
