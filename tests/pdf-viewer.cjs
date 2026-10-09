'use strict';
// node tests/pdf-viewer.cjs — actual PDF.js viewer + pointer cropping, no AI calls.
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(__dirname, '..');

if (process.versions.electron) {
  const { app } = require('electron');
  class NoInferenceBridge {
    constructor({ onEvent }) { this.onEvent = onEvent; }
    async getAccount() { return { account: { type: 'chatgpt', email: 'pdf-ui-test@example.invalid', planType: 'test' }, models: [{ model: 'gpt-6-astra' }], rateLimits: null }; }
    async run({ context }) { return { threadId: `pdf-test-${context.id}`, result: { reply: 'PDF 선택 영역을 저장했습니다. 이 UI 검증에서는 AI 모델을 호출하지 않았습니다.', original: null, variants: [], replaceVariants: false, warnings: [] } }; }
    async cancel() { return false; }
    close() {}
  }
  require('../app/codex.cjs').CodexBridge = NoInferenceBridge;
  app.on('browser-window-created', (event, window) => window.setSkipTaskbar(true));
  require('../app/main.cjs');
} else {
  const assert = require('node:assert/strict');
  const sharp = require('sharp');
  const bundle = path.join(process.env.USERPROFILE, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules');
  const { _electron: electron } = require(path.join(bundle, 'playwright'));

  async function main() {
    const artifacts = path.join(__dirname, 'artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    const validation = path.join(ROOT, 'data', 'validation');
    fs.mkdirSync(validation, { recursive: true });
    const dataDir = fs.mkdtempSync(path.join(validation, 'pdf-viewer-'));
    let source = path.join(ROOT, '소스', '광희중 학교프린트(이등변~외내심).pdf');
    if (!fs.existsSync(source)) {
      const { PDFDocument, StandardFonts } = require(path.join(bundle, 'pdf-lib'));
      const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
      for (let i = 1; i <= 2; i++) { const page = doc.addPage([595.28, 841.89]); page.drawText(`Geometry test page ${i}`, { x: 55, y: 780, size: 24, font }); page.drawLine({ start: { x: 60, y: 560 }, end: { x: 250, y: 680 }, thickness: 2 }); }
      source = path.join(dataDir, 'two-page-fixture.pdf'); fs.writeFileSync(source, await doc.save());
    }
    const env = { ...process.env, EXAM_DATA_DIR: dataDir, EXAM_TEST_SOURCE: source };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({ executablePath: require('electron'), args: [__filename], cwd: ROOT, env, timeout: 30000 });
    const report = { source, dataDir, aiCalls: 0, checks: [], crops: [] };
    const errors = [];
    try {
      const page = await app.firstWindow();
      page.on('pageerror', error => errors.push(error.message));
      await page.waitForSelector('#emptyImport');
      await page.locator('#importSource').click();
      await page.waitForFunction(() => !document.querySelector('#pageStage').hidden && !document.querySelector('#nextPage').disabled && document.querySelector('#pageCanvas').width > 100, null, { timeout: 30000 });
      report.pages = Number((await page.locator('#pageTotal').textContent()).replace(/\D/g, ''));
      assert.ok(report.pages >= 2);
      report.checks.push('actual multipage PDF import and PDF.js render');
      for (const [button, number] of [['nextPage', 2], ['previousPage', 1], ['nextPage', 2]]) {
        await page.locator(`#${button}`).click();
        await page.waitForFunction(n => Number(document.querySelector('#pageNumber').value) === n, number);
      }
      report.checks.push('next/previous page controls preserve correct page number');

      async function captureAtCurrentZoom(expectedCount) {
        const box = await page.locator('#selectionLayer').boundingBox();
        assert.ok(box && box.width > 100 && box.height > 100);
        const zoom = await page.locator('#zoomLabel').textContent();
        const start = { x: box.x + box.width * .08, y: box.y + box.height * .05 };
        const end = { x: box.x + box.width * .40, y: box.y + box.height * .29 };
        report.lastDrag = { box, start, end, hit: await page.evaluate(({ x, y }) => { const node = document.elementFromPoint(x, y); return { tag: node?.tagName, id: node?.id, className: node?.className }; }, start) };
        // Shift deliberately starts a new selection even over an existing region.
        await page.keyboard.down('Shift');
        await page.mouse.move(start.x, start.y); await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
        await page.keyboard.up('Shift');
        let project;
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
          project = await page.evaluate(() => window.exam.boot());
          if (project.project?.problems.length === expectedCount && project.project.problems.at(-1).messages.some(m => m.role === 'assistant') && await page.locator('#zoomIn').isEnabled()) break;
          await page.waitForTimeout(100);
        }
        assert.equal(project.project?.problems.length, expectedCount, 'pointer drag must create a problem');
        const problem = project.project.problems.at(-1), region = problem.regions[0];
        const crop = await sharp(problem.cropPaths[0]).metadata();
        assert.equal(region.page, 2);
        assert.ok(crop.width > box.width * region.width * 1.5, 'crop must be rendered above the display resolution');
        assert.ok(crop.height > 100);
        const result = { zoom, displayPageWidth: box.width, displayPageHeight: box.height, region, width: crop.width, height: crop.height, path: problem.cropPaths[0] };
        report.crops.push(result);
        return result;
      }

      const before = await captureAtCurrentZoom(1);
      await page.locator('#zoomIn').click();
      await page.waitForFunction(old => document.querySelector('#zoomLabel').textContent !== old, before.zoom);
      const intermediateZoom = await page.locator('#zoomLabel').textContent();
      await page.locator('#zoomIn').click();
      await page.waitForFunction(old => document.querySelector('#zoomLabel').textContent !== old, intermediateZoom);
      const after = await captureAtCurrentZoom(2);
      assert.ok(after.displayPageWidth > before.displayPageWidth * 1.3);
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before.region[key] - after.region[key]) < .003, `normalized ${key} stays stable despite integer input pixels`);
      assert.ok(Math.abs(before.width - after.width) <= 4, 'crop width is independent of viewer zoom');
      assert.ok(Math.abs(before.height - after.height) <= 4, 'crop height is independent of viewer zoom');
      report.checks.push('same normalized region at two zoom levels retains source crop pixel dimensions');
      report.checks.push('both crops use original PDF page rendering above screen resolution');

      await page.locator('#fitWidth').click();
      await page.waitForFunction(old => document.querySelector('#zoomLabel').textContent !== old, after.zoom);
      await page.screenshot({ path: path.join(artifacts, 'pdf-viewer.png') });
      assert.deepEqual(errors, []);
      report.checks.push('fit-width restored, screenshot saved and no renderer errors');
      report.ok = true;
      fs.writeFileSync(path.join(artifacts, 'pdf-viewer.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
    } catch (error) {
      report.ok = false; report.error = error.stack; report.rendererErrors = errors;
      try { await (await app.firstWindow()).screenshot({ path: path.join(artifacts, 'pdf-viewer-failure.png') }); } catch {}
      fs.writeFileSync(path.join(artifacts, 'pdf-viewer.json'), JSON.stringify(report, null, 2));
      throw error;
    } finally { await app.close(); }
  }
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
