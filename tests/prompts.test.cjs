'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PromptStore, DEFAULT_PROMPTS, LIMIT, composePrompt } = require('../app/prompts.cjs');

test('prompt settings persist globally, restore defaults, and reject invalid edits without data loss', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-prompts-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new PromptStore(directory);
  assert.deepEqual(store.read(), DEFAULT_PROMPTS);
  assert.equal(fs.existsSync(store.file), false);
  const edited = { common: '중학교 기하 범위만 사용하세요.\n삼각함수는 사용하지 마세요.', recognition: '필기를 제외하고 인식하세요.', parts: { ...DEFAULT_PROMPTS.parts } };
  store.save(edited);
  assert.deepEqual(new PromptStore(directory).read(), edited);
  for (const invalid of [null, {}, { ...edited, common: '  ' }, { ...edited, recognition: 'x'.repeat(LIMIT + 1) }]) {
    assert.throws(() => store.save(invalid), /프롬프트/);
    assert.deepEqual(store.read(), edited);
  }
  store.save(DEFAULT_PROMPTS);
  assert.deepEqual(store.read(), DEFAULT_PROMPTS);
  fs.writeFileSync(store.file, '{broken');
  assert.throws(() => store.read(), /다시 저장/);
  assert.match(store.snapshot().error, /다시 저장/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), '{broken');
  store.save(edited);
  assert.equal(store.snapshot().error, '');
});

test('stage-one settings migrate without replacing edits; only selected part is composed', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-parts-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new PromptStore(directory);
  const old = { common: '사용자 지정 공통', recognition: '사용자 지정 인식' };
  fs.writeFileSync(store.file, JSON.stringify(old));
  assert.deepEqual(store.read(), { ...old, parts: { ...DEFAULT_PROMPTS.parts } });
  assert.deepEqual(JSON.parse(fs.readFileSync(store.file)), old, 'read must not overwrite legacy file');
  const next = store.read(); next.parts.geometry = '삼각함수 없이 닮음으로 풀기'; next.parts.algebra = '';
  store.save(next); assert.deepEqual(new PromptStore(directory).read(), next);
  const combined = composePrompt(next.common, 'geometry', next.parts.geometry);
  assert.match(combined, /사용자 지정 공통/); assert.match(combined, /삼각함수 없이 닮음/);
  assert.doesNotMatch(combined, /무연근/);
  assert.doesNotMatch(composePrompt(next.common, '', next.parts.geometry), /삼각함수 없이 닮음/);
  assert.doesNotThrow(() => composePrompt(next.common, 'algebra', ''));
  assert.doesNotThrow(() => composePrompt('x'.repeat(LIMIT), 'integer', 'y'.repeat(LIMIT)));
  assert.throws(() => composePrompt(next.common, 'toString', ''), /파트/);
  assert.throws(() => store.save({ ...next, parts: { ...next.parts, integer: 'x'.repeat(LIMIT + 1) } }), /정수/);
  assert.deepEqual(store.read(), next);
});
