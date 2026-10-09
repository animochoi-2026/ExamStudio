'use strict';

// Run with Node: node tests/app-integration.cjs
// Exercises the real isolated preload and main-process IPC handlers. Only the AI
// transport is replaced by a replay of a previously verified Astra response;
// there are no new model calls and no writes to the user's active project.
if (!process.versions.electron) {
  // Windows GUI executables detach from a direct PowerShell invocation; keeping
  // a Node parent preserves output and the real test exit status.
  const { spawn } = require('node:child_process');
  const child = spawn(require('electron'), [__filename], { cwd: require('node:path').resolve(__dirname, '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => process.stdout.write(chunk));
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { app } = require('electron');
const ROOT = path.resolve(__dirname, '..');
const validationDir = path.join(ROOT, 'data', 'validation');
fs.mkdirSync(validationDir, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(validationDir, 'ipc-integration-'));
const fixture = JSON.parse(fs.readFileSync(path.join(validationDir, 'astra-roundtrip.json'), 'utf8'));
const sourcePath = path.join(validationDir, 'original-triangle.png');
const python = process.env.EXAM_PYTHON || path.join(process.env.USERPROFILE, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe');
process.env.EXAM_DATA_DIR = dataDir;
process.env.EXAM_TEST_SOURCE = sourcePath;
process.env.EXAM_TEST_EXPORT = path.join(dataDir, 'original-only.docx');
process.env.EXAM_PYTHON = python;

const clone = value => JSON.parse(JSON.stringify(value));
const requests = [];
let bridgeCwd;
class ReplayBridge {
  constructor({ cwd, onEvent }) { bridgeCwd = cwd; this.onEvent = onEvent; }
  async getAccount() { return { account: { type: 'chatgpt', email: 'ipc-test@example.invalid', planType: 'prolite' }, models: [{ id: 'gpt-6-astra', model: 'gpt-6-astra' }], rateLimits: null }; }
  async run(request) {
    requests.push(clone(request));
    const threadId = request.threadId || `replay-${request.context.id}`;
    this.onEvent({ type: 'chat-status', problemId: request.context.id, status: '캐시된 Astra 응답 재생 중' });
    if (request.text === 'fixture:fail') {
      const error = new Error('의도적인 통합 테스트 오류'); error.threadId = threadId; throw error;
    }
    if (request.text === 'fixture:reply') return { threadId, result: { reply: '기존 문제와 수정 내용을 확인했습니다.', original: null, variants: [], replaceVariants: false, warnings: [] } };
    const result = clone(fixture.result);
    const problemId = request.context.id;
    result.original.id = request.context.original?.id || `${problemId}-original`;
    result.original.sourceId = problemId;
    result.variants.forEach((q, index) => { q.id = request.context.variants?.[index]?.id || `${problemId}-variant-${index + 1}`; q.sourceId = problemId; });
    result.warnings.push('통합 테스트: 작은 도형 표시의 확인 경고');
    return { threadId, result };
  }
  async cancel() { return false; }
  close() {}
}
require('../app/codex.cjs').CodexBridge = ReplayBridge;

const report = { mode: 'real Electron preload and IPC; cached Astra replay; no AI calls', dataDir, checks: [], exports: [] };
let finished = false;
const deadline = setTimeout(() => finish(new Error('Electron 통합 테스트 제한 시간 150초 초과')), 150000);

function finish(error) {
  if (finished) return;
  finished = true; clearTimeout(deadline);
  report.ok = !error;
  if (error) report.error = error.stack || String(error);
  fs.writeFileSync(path.join(dataDir, 'integration-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  app.exit(error ? 1 : 0);
}

function inspectDocx(file, expectedQuestions) {
  assert.ok(fs.statSync(file).size > 5000, 'DOCX exists and contains meaningful output');
  const code = `import json,sys,zipfile,xml.etree.ElementTree as E
z=zipfile.ZipFile(sys.argv[1]); n={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','m':'http://schemas.openxmlformats.org/officeDocument/2006/math'}
d=E.fromstring(z.read('word/document.xml'))
print(json.dumps({'solutionReferences':len(d.findall('.//w:hyperlink',n)),'editableEquations':len(d.findall('.//m:oMath',n)),'solutions':len(d.findall('.//w:bookmarkStart',n)),'twoColumnSections':sum(x.attrib.get('{'+n['w']+'}num')=='2' for x in d.findall('.//w:cols',n)),'images':len([x for x in z.namelist() if x.startswith('word/media/')])}))`;
  const counts = JSON.parse(execFileSync(python, ['-c', code, file], { encoding: 'utf8', windowsHide: true }));
  assert.equal(counts.solutionReferences, expectedQuestions);
  assert.equal(counts.solutions, expectedQuestions);
  assert.ok(counts.editableEquations > expectedQuestions);
  assert.ok(counts.twoColumnSections >= 1);
  assert.ok(counts.images >= expectedQuestions);
  report.exports.push({ file, ...counts });
}

app.on('browser-window-created', (event, win) => {
  // Keep this independent IPC test from covering the user's/UI agent's window.
  win.on('show', () => win.hide());
  win.webContents.once('did-finish-load', () => run(win).then(() => finish()).catch(finish));
});

async function run(win) {
  const evaluate = (fn, ...args) => win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
  const call = (name, ...args) => evaluate((name, args) => window.exam[name](...args), name, args);
  const checkpoint = name => { report.checks.push(name); fs.writeFileSync(path.join(dataDir, 'integration-progress.json'), JSON.stringify(report, null, 2)); console.log(`PASS ${name}`); };
  await evaluate(() => { window.__ipcEvents = []; window.exam.onEvent(e => window.__ipcEvents.push(e)); });
  assert.equal(await evaluate(() => typeof window.require), 'undefined');
  assert.equal((await call('boot')).project, null);
  checkpoint('isolated preload, real IPC and fresh project');

  let project = await call('importSource');
  const asset = await call('readAsset', project.source.path);
  assert.equal(asset.mime, 'image/png');
  assert.equal(asset.base64, fs.readFileSync(sourcePath).toString('base64'));
  const capture = { page: 1, x: 0, y: 0, width: 1, height: 1 };
  project = await call('addRegion', { projectId: project.id, region: capture, imageDataUrl: asset.dataUrl });
  const pid = project.problems[0].id;
  assert.equal(project.problems[0].original, null);
  assert.equal(project.problems[0].cropPaths.length, 1);
  checkpoint('source image import, owned asset read and region capture');

  project = (await call('chat', { projectId: project.id, problemId: pid, text: 'fixture:recognize' })).project;
  assert.equal(project.problems[0].messages.length, 2);
  assert.equal(project.problems[0].variants.length, 1);
  assert.equal(project.problems[0].original.answer, fixture.result.original.answer);
  assert.equal(project.problems[0].threadId, `replay-${pid}`);
  assert.equal(bridgeCwd, path.join(dataDir, 'projects'));
  assert.equal(requests[0].images[0], project.problems[0].cropPaths[0]);
  assert.equal((await call('previewDocument', { projectId: project.id })).questions.length, 0);
  checkpoint('cached actual Astra result applied, thread/messages persisted, unchecked drafts excluded');

  project.problems[0].original.include = true;
  project = await call('saveProject', project);
  assert.ok(project.problems[0].warnings.some(x => x.includes('작은 도형 표시')));
  await assert.rejects(call('exportDocument', { projectId: project.id, format: 'docx' }), /재확인/);
  project.problems[0].original.needsReview = false;
  project = await call('saveProject', project);
  assert.equal((await call('previewDocument', { projectId: project.id })).questions.length, 1);
  const firstExport = await call('exportDocument', { projectId: project.id, format: 'docx' });
  inspectDocx(firstExport.path, 1);
  checkpoint('unreviewed included draft blocked; reviewed original exports; AI warning survives save');

  project.problems[0].variants[0].include = true;
  project.problems[0].variants[0].needsReview = false;
  project = await call('saveProject', project);
  process.env.EXAM_TEST_EXPORT = path.join(dataDir, 'original-and-variant.docx');
  const both = await call('exportDocument', { projectId: project.id, format: 'docx' });
  inspectDocx(both.path, 2);
  checkpoint('original and variant DOCX export with editable math, diagrams, two columns and real endnotes');

  project.problems[0].original.body += ' 주어진 조건을 모두 이용하시오.';
  project = await call('saveProject', project);
  assert.equal(project.problems[0].original.needsReview, true);
  assert.equal(project.problems[0].variants[0].needsReview, true);
  await assert.rejects(call('exportDocument', { projectId: project.id, format: 'docx' }), /재확인/);
  const correctedBody = project.problems[0].original.body;
  project = (await call('chat', { projectId: project.id, problemId: pid, text: 'fixture:reply' })).project;
  assert.equal(project.problems[0].original.body, correctedBody);
  assert.equal(project.problems[0].variants[0].needsReview, true);
  assert.equal(project.problems[0].messages.length, 4);
  assert.equal(requests.at(-1).context.original.body, correctedBody);
  assert.equal(requests.at(-1).threadId, `replay-${pid}`);
  checkpoint('manual original change marks variants stale; reply-only turn preserves content and correction context');

  project = await call('addRegion', { projectId: project.id, problemId: pid, region: capture, imageDataUrl: asset.dataUrl });
  assert.equal(project.problems[0].needsReview, true);
  project = (await call('chat', { projectId: project.id, problemId: pid, text: 'fixture:reply' })).project;
  assert.equal(project.problems[0].needsReview, true);
  checkpoint('reply-only turn cannot clear stale state after additional source region');

  project = (await call('chat', { projectId: project.id, problemId: pid, text: 'fixture:recognize' })).project;
  assert.equal(project.problems[0].needsReview, false);
  for (const q of [project.problems[0].original, ...project.problems[0].variants]) { q.include = true; q.needsReview = false; }
  project = await call('saveProject', project);
  process.env.EXAM_TEST_EXPORT = path.join(dataDir, 'rechecked-final.docx');
  inspectDocx((await call('exportDocument', { projectId: project.id, format: 'docx' })).path, 2);
  checkpoint('re-recognized source and explicit review restore export');

  project = await call('addRegion', { projectId: project.id, region: capture, imageDataUrl: asset.dataUrl });
  const secondPid = project.problems[1].id;
  await assert.rejects(call('chat', { projectId: project.id, problemId: secondPid, text: 'fixture:fail' }), /의도적인/);
  project = await call('openProject', project.id);
  assert.equal(project.problems[1].threadId, `replay-${secondPid}`);
  assert.equal(project.problems[1].messages.length, 2);
  project = (await call('chat', { projectId: project.id, problemId: secondPid, text: 'fixture:reply' })).project;
  assert.equal(requests.at(-1).threadId, `replay-${secondPid}`);
  assert.equal(project.problems[1].messages.length, 4);
  checkpoint('first-turn failure persists thread and transcript; next request is not stuck busy');

  const disk = JSON.parse(fs.readFileSync(path.join(dataDir, 'projects', project.id, 'project.json'), 'utf8'));
  assert.deepEqual(disk.problems, project.problems);
  const events = await evaluate(() => window.__ipcEvents);
  assert.ok(events.some(e => e.type === 'chat-status' && e.status === 'completed'));
  assert.ok(events.some(e => e.type === 'chat-status' && e.status === 'error'));
  assert.equal(events.some(e => e.type === 'chat-delta'), false);
  report.projectId = project.id;
  checkpoint('disk persistence and status events match real preload result');
}

require('../app/main.cjs');
}
