'use strict';
// Deployment envelope binds the unchanged frozen evaluator and its approved review adapter.
// Historical records retain their actual evaluation versions.
const C=require('../difficulty-v122/canonical.cjs'),V=require('./versions.cjs'),manifest=require('./deployment-manifest.json');
const manifest_hash=C.hash(manifest);
if(manifest_hash!=='32150b5cb2399497f597fc9546d1ce72509bb194ddd80b3ff3af0962b8bad452'||manifest.base_evaluation_manifest_hash!==V.manifest_hash)throw Error('common_evaluation_manifest_mismatch');
const policy={...require('../difficulty-v122/policy.cjs'),...require('../difficulty-output-policy.cjs').metadata,...V.contract,...manifest.contract,
 evaluation_manifest_hash:manifest_hash,base_evaluation_manifest_hash:V.manifest_hash};
module.exports={manifest,manifest_hash,policy};

