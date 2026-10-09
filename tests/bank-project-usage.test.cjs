const test = require('node:test');
const assert = require('node:assert/strict');
const {localServer} = require('./shared-bank-local-server.cjs');

test('owner refresh sees measured DB and project Storage; teacher and outsider are denied', async t => {
  const x = await localServer();
  t.after(() => x.close());
  await x.db.exec("reset role; insert into storage.objects(bucket_id,name,metadata) values ('question-bank','one', '{\"size\":\"1048576\"}'), ('other','two', '{\"size\":\"512\"}'), ('other','unknown','{}');");
  const get = uid => x.sql(uid, 'select public.bank_project_usage($1) as usage', [x.S]).then(result => result.rows[0].usage);
  const first = await get(x.A);
  assert.equal(first.storageBytes, 1_049_088);
  assert.equal(first.bankStorageBytes, 1_048_576);
  assert.equal(first.storageObjects, 3);
  assert.equal(first.storageUnknownSizeObjects, 1);
  assert.ok(first.databaseBytes > 0);
  assert.ok(Date.parse(first.measuredAt) > 0);
  await assert.rejects(get(x.B), /privilege|permission/i);
  await assert.rejects(get(x.X), /privilege|permission/i);
  await x.db.exec('reset role;set role anon');
  await assert.rejects(x.db.query('select public.bank_project_usage($1)', [x.S]), /permission/i);
  await x.db.exec("reset role; insert into storage.objects(bucket_id,name,metadata) values ('question-bank','new', '{\"size\":\"2048\"}');");
  const next = await get(x.A);
  assert.equal(next.storageBytes - first.storageBytes, 2048);
  assert.equal(next.storageObjects - first.storageObjects, 1);
});
