'use strict';
// Exercise the bundle imported by the real Edge entrypoint, without injecting
// an evaluator that the deployed entrypoint does not supply.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const expected = require('../app/difficulty-v122/policy.cjs');
async function main() {
  const requests = [];
  const bundle = path.join(root, 'supabase/functions/bank-difficulty-v12/engine.mjs');
  const {default: engine} = await import(pathToFileURL(bundle).href);
  const handler = engine.handler({
    env: key => ({
      SUPABASE_URL: 'https://mock.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'mock-service',
      SUPABASE_ANON_KEY: 'mock-anon',
    })[key],
    readFile: async () => { throw Error('Unexpected asset read'); },
    fetchImpl: async url => {
      requests.push(url);
      if (url === 'https://mock.invalid/auth/v1/user')
        return Response.json({id: 'mock-user', email_confirmed_at: '2026-01-01'});
      if (url === 'https://mock.invalid/rest/v1/rpc/bank_v12_access')
        return Response.json(true);
      throw Error('Unexpected network operation: ' + url);
    },
  });
  const response = await handler(new Request('https://mock.invalid/function', {
    method: 'POST',
    headers: {authorization: 'Bearer mock-user', 'content-type': 'application/json'},
    body: JSON.stringify({action: 'policy', spaceId: 'mock-space',
      model_policy_version: expected.model_policy_version}),
  }));
  const value = await response.json();
  const actual = value.policy?.model_policy_version ?? value.model_policy_version ?? null;
  let error = null;
  try {
    assert.equal(response.status, 200);
    assert.equal(actual, expected.model_policy_version,
      'Actual Edge bundle does not expose the canonical model policy');
  } catch (e) { error = e.message; }
  const report = {
    at: new Date().toISOString(),
    gate: 'actual_edge_entrypoint_canonical_policy',
    passed: error ? 0 : 1, failed: error ? 1 : 0,
    expected: expected.model_policy_version, actual,
    observedLegacyPolicy: {
      evaluationVersion: value.evaluationVersion,
      specRevision: value.specRevision, model: value.model, effort: value.effort,
    },
    error, entrypoint: 'supabase/functions/bank-difficulty-v12/index.ts',
    importedBundle: 'supabase/functions/bank-difficulty-v12/engine.mjs',
    bundleSha256: crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex'),
    mockRequests: requests, actualNetworkRequests: 0, actualAIcalls: 0,
    productionWrites: 0, computerUse: 0,
    stoppedBeforeCorpusRegressionSmokeAndFreeze: Boolean(error),
  };
  const destination = path.join(path.resolve(process.argv[2]||process.env.EXAMSTUDIO_TEST_OUTPUT||path.join(root,
    'artifacts/difficulty-v122-rc1')), 'edge-entrypoint-gate.json');
  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (error) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
