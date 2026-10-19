'use strict';
// Historical profiles remain immutable. Only NEW desktop assessments select
// this current profile; solution generation retains the user's own settings.
const P=require('./intent-profile.cjs'),I=require('../difficulty-v12/input.cjs'),{policy,stages}=require('./policy.cjs');
const resultStructureVersion='difficulty-result-1',contentNormalizerVersion='difficulty-input-adapter-3';
function reuseIdentity(e){return I.hash({profileVersion:P.version,contentHash:e.input.contentHash,
 imageHash:I.hash(e.input.images.map(i=>i.sha256).sort()),answer:I.normalizeText(e.validationContext.storedAnswer),
 choices:e.validationContext.choices.map(I.normalizeText),requiresImage:e.validationContext.requiresImage});}
const versions=Object.freeze({spec_version:policy.specVersion,spec_revision:policy.specRevision,model_policy_version:policy.version,
 prompt_hash:P.promptHash,json_schema_hash:P.schemaHash,scorer_code_hash:P.scorerCodeHash,normalizer_version:P.normalizerVersion,
 anchor_set_version:P.anchorSetVersion,profile_version:P.version,result_structure_version:resultStructureVersion,
 content_normalizer_version:contentNormalizerVersion,image_hash_method:'sha256(image bytes); aggregate sha256(canonical JSON sorted sha256 array)'});
module.exports={profile:P,versions,reuseIdentity,stages};
