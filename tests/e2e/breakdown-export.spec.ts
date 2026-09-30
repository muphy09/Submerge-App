import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('Materials and Equipment stays on one continuous page in the app', async ({ page }, testInfo) => {
  await page.goto('http://127.0.0.1:5173/tests/fixtures/breakdown-export.html?mode=materials-viewer&franchise=playwright-west');
  const viewer = page.locator('.materials-order-modal');
  await expect(viewer.locator('.materials-order-page--viewer')).toHaveCount(1);
  await expect(viewer.getByRole('heading', { name: 'Materials and Equipment' })).toBeVisible();
  const metaWidths = await viewer.locator('.materials-order-meta > div').evaluateAll((blocks) =>
    blocks.map((block) => block.getBoundingClientRect().width));
  expect(metaWidths).toHaveLength(3);
  expect(Math.max(...metaWidths) - Math.min(...metaWidths)).toBeLessThan(1);
  const metaScreenshot = testInfo.outputPath('materials-order-header-blocks.png');
  await viewer.locator('.materials-order-meta').screenshot({ path: metaScreenshot });
  await testInfo.attach('Equal order form header blocks', { path: metaScreenshot, contentType: 'image/png' });
  await expect(viewer.locator('.materials-order-group')).toHaveCount(6);
  const excavation = viewer.locator('.materials-order-group').filter({ has: page.getByRole('heading', { name: 'Excavation', exact: true }) });
  await expect(excavation.getByRole('heading', { name: 'Excavation', exact: true })).toBeVisible();
  await expect(excavation.locator('.materials-order-item--facing')).toHaveCount(7);
  await expect(excavation.locator('.materials-order-item').filter({ hasText: 'Retaining Wall 1:' })).toContainText('10 LF');
  const totals = viewer.locator('.materials-order-group--totals');
  await expect(totals.getByRole('heading', { name: 'Excavation Material Totals' })).toBeVisible();
  await expect(totals.locator('.materials-order-item')).toHaveCount(5);
  expect(await totals.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe('2px');
  const totalsScreenshot = testInfo.outputPath('materials-order-excavation-totals.png');
  await totals.screenshot({ path: totalsScreenshot });
  await testInfo.attach('Excavation material totals', { path: totalsScreenshot, contentType: 'image/png' });
  await expect(viewer.getByRole('heading', { name: 'Facing & Rockwork' })).toHaveCount(0);
  const excavationScreenshot = testInfo.outputPath('materials-order-excavation.png');
  await excavation.screenshot({ path: excavationScreenshot });
  await testInfo.attach('Excavation order section', { path: excavationScreenshot, contentType: 'image/png' });
  await expect(viewer.getByRole('heading', { name: 'Equipment Package: PMF03 Standard Automation Package' })).toBeVisible();
  await expect(viewer.locator('.materials-order-footer')).not.toContainText('Page 1 of');
  await expect(viewer.locator('.materials-order-group h3').filter({ hasText: '(continued)' })).toHaveCount(0);
  const scrollArea = viewer.locator('.modal-body-scroll');
  expect(await scrollArea.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await scrollArea.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(viewer.getByRole('heading', { name: 'Equipment Package: PMF03 Standard Automation Package' })).toBeInViewport();
  await expect(viewer.locator('.materials-order-footer')).toBeInViewport();
  const screenshot = testInfo.outputPath('materials-order-viewer-bottom.png');
  await scrollArea.screenshot({ path: screenshot });
  await testInfo.attach('Continuous materials order form bottom', { path: screenshot, contentType: 'image/png' });
});

for (const { mode, franchise, height } of [
  { mode: 'combined', franchise: 'playwright-west', height: 768 },
  { mode: 'warranty', franchise: 'playwright-east', height: 900 },
  { mode: 'cost', franchise: 'playwright-other', height: 1080 },
  { mode: 'materials', franchise: 'playwright-west', height: 900 },
  { mode: 'materials-custom', franchise: 'playwright-east', height: 900 },
]) {
  test(`Electron exports the complete ${mode} breakdown with the modal open (${franchise})`, async ({}, testInfo) => {
    const appData = testInfo.outputPath('app-data');
    mkdirSync(appData, { recursive: true });
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    Object.assign(env, {
      APPDATA: appData, LOCALAPPDATA: appData, NODE_ENV: 'production',
      SUBMERGE_DATA_PARTITION: 'playwright-e2e', SUBMERGE_TEST_USER_DATA_ROOT: appData,
    });
    const app = await electron.launch({ args: ['main.js', '--no-sandbox'], cwd: path.resolve(__dirname, '../..'), env });
    try {
      const page = await app.firstWindow();
      // Permit Vite's development preamble only in this isolated test process.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.session.webRequest.onHeadersReceived(null));
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width: 1280, height });
      await page.route('**/*', (route) => {
        const url = route.request().url();
        return url.startsWith('http://127.0.0.1:5173/') || url.startsWith('data:')
          ? route.continue() : route.abort();
      });
      await page.goto(`http://127.0.0.1:5173/tests/fixtures/breakdown-export.html?mode=${mode}&franchise=${franchise}`);
      await expect(page.locator('body')).toHaveClass(/app-modal-scroll-locked/);
      await expect(page.locator('.export-breakdown-page--warranty')).toHaveCount(mode === 'cost' || mode.startsWith('materials') ? 0 : 6);
      const screenOverflow = () => page.evaluate(() => [document.documentElement, document.body].map((node) => getComputedStyle(node).overflow));
      expect(await screenOverflow()).toEqual(['hidden', 'hidden']);
      await page.evaluate(async () => {
        await document.fonts.ready;
        document.body.classList.add('breakdown-print-mode');
      });
      const pdfPath = testInfo.outputPath('breakdown.pdf');
      // Exercise the real export IPC and printToPDF options; replace only the OS
      // save dialog so output remains in Playwright's isolated artifact directory.
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, pdfPath);
      const result = await page.evaluate(() => window.electron!.exportBreakdownPdf!({ filename: 'breakdown.pdf', landscape: false }));
      expect(result.filePath).toBe(pdfPath);
      const bytes = Array.from(readFileSync(pdfPath));
      await testInfo.attach('Exported breakdown', { path: pdfPath, contentType: 'application/pdf' });
      const expectedPages = mode === 'combined' ? 7 : mode === 'warranty' ? 6 : mode.startsWith('materials') ? await page.locator('.materials-order-page').count() : 1;
      const texts: string[] = await page.evaluate(({ data, lastPage }) => (window as any).breakdownFixture.readPdf(data, lastPage), { data: bytes, lastPage: expectedPages });
      // The hidden proposal screen can leave trailing blank pages in native print.
      // Verify every content page; blank-page cleanup is outside this regression.
      const contentPages = texts.filter((text) => text.trim());
      expect(contentPages).toHaveLength(expectedPages);
      expect(contentPages.every((text) => text.includes('Export Regression Customer'))).toBe(true);
      if (mode.startsWith('materials')) {
        const metaWidths = await page.locator('.export-print-area .materials-order-page').first().locator('.materials-order-meta > div')
          .evaluateAll((blocks) => blocks.map((block) => block.getBoundingClientRect().width));
        expect(metaWidths).toHaveLength(3);
        expect(Math.max(...metaWidths) - Math.min(...metaWidths)).toBeLessThan(1);
        const allText = texts.join(' ');
        expect(allText).toContain('Tile SF based on Pool Perimeter');
        expect(allText).toMatch(/PRICE MODEL\s+Test Price Model/);
        expect(allText).toMatch(mode === 'materials-custom' ? /TIER\s+Bronze/ : /TIER\s+Standard/);
        expect(allText).not.toContain('Linear Feet');
        expect(allText).not.toContain('ORDER-100');
        expect(allText).toContain('Automatic Cover');
        expect(allText).toContain('Excavation');
        expect(allText).toContain('Retaining Wall 1: 12" High - Standard');
        expect(allText).toContain('Exposed Pool Wall Stacked Stone Facing');
        expect(allText).toContain('Exposed Pool Wall Panel Ledge Facing');
        expect(allText).toContain('Column Panel Ledge Facing');
        expect(allText).toContain('Excavation Material Totals');
        expect(allText).toContain('Total Panel Ledge Facing');
        expect(allText).toContain('Total Retaining Wall: 24" High - Standard');
        expect(allText).toContain('Actual LF');
        expect(allText).toContain('LF with Waste');
        expect(allText).not.toContain('Facing & Rockwork');
        expect(allText).toContain('Extra Filter');
        expect(allText).toContain('Valve actuator: No');
        expect(allText).not.toContain('RETAIL PRICE:');
        if (mode === 'materials') {
          expect(allText).toContain('PMF03 Standard Automation Package');
          expect(allText).toContain('Equipment Package: PMF03 Standard Automation Package');
          expect(allText).toContain('Additional or Changed Equipment');
        } else {
          expect(allText).toContain('Equipment Package: Custom');
          expect(allText).toContain('Custom Package Pump');
          expect(allText).toContain('Custom Package Filter');
        }
        const data = await page.evaluate(() => (window as any).breakdownFixture.orderData());
        expect(data.groups[0].items.find((item: any) => item.name.startsWith('Pool Tile')).measures).toEqual([
          { label: 'Actual SF', value: 100, unit: 'SF' },
          { label: 'SF with Waste', value: 100, unit: 'SF' },
        ]);
        const excavation = data.groups.find((group: any) => group.title === 'Excavation');
        expect(excavation.items.map((item: any) => item.name)).toEqual([
          'RBB 1: 18" High', '18" RBB Panel Ledge Facing', 'Backside Panel Ledge Facing',
          'RBB 2: 18" High', '18" RBB Panel Ledge Facing',
          'Exposed Pool Wall 1: 24" High', 'Exposed Pool Wall Stacked Stone Facing',
          'Exposed Pool Wall 2: 12" High', 'Exposed Pool Wall Panel Ledge Facing',
          'Columns: 2', 'Column Panel Ledge Facing',
          'Retaining Wall 1: 12" High - Standard',
          'Retaining Wall 2: 12" High - Standard',
          'Retaining Wall 3: 24" High - Standard',
          'Raised Spa: 18" High', 'Raised Spa Tile Facing',
        ]);
        expect(excavation.items[1].measures.map((measure: any) => measure.value)).toEqual([30, 34.5]);
        expect(excavation.items[4].measures.map((measure: any) => measure.value)).toEqual([15, 17.25]);
        expect(excavation.items[6].measures.map((measure: any) => measure.value)).toEqual([20, 23]);
        expect(excavation.items[8].measures.map((measure: any) => measure.value)).toEqual([10, 11.5]);
        expect(excavation.items[11].measures).toEqual([
          { label: 'Actual LF', value: 10, unit: 'LF' },
          { label: 'LF with Waste', value: 10, unit: 'LF' },
        ]);
        expect(excavation.items[12].measures.map((measure: any) => measure.value)).toEqual([5, 5]);
        expect(excavation.items[13].measures.map((measure: any) => measure.value)).toEqual([4, 4]);
        expect(excavation.items[15].measures.map((measure: any) => measure.value)).toEqual([15, 19.55]);
        expect(excavation.items.filter((item: any) => !item.name.startsWith('Retaining Wall'))
          .every((item: any) => item.measures.map((measure: any) => measure.label).join('|') === 'Actual SF|SF with Waste')).toBe(true);
        const totals = data.groups.find((group: any) => group.title === 'Excavation Material Totals');
        expect(totals.kind).toBe('totals');
        expect(data.groups.indexOf(totals)).toBe(data.groups.indexOf(excavation) + 1);
        expect(totals.items.map((item: any) => [item.name, ...item.measures.map((measure: any) => measure.value)])).toEqual([
          ['Total Panel Ledge Facing', 133, 152.95],
          ['Total Stacked Stone Facing', 20, 23],
          ['Total Tile Facing', 15, 19.55],
          ['Total Retaining Wall: 12" High - Standard', 15, 15],
          ['Total Retaining Wall: 24" High - Standard', 4, 4],
        ]);
        expect(totals.items.filter((item: any) => item.name.startsWith('Total Retaining Wall'))
          .every((item: any) => item.measures.map((measure: any) => `${measure.label}:${measure.unit}`).join('|') === 'Actual LF:LF|LF with Waste:LF')).toBe(true);
      }
      if (mode !== 'cost' && !mode.startsWith('materials')) {
        for (let section = 1; section <= 12; section++) {
          for (let item = 1; item <= 5; item++) {
            expect(texts.join(' ')).toContain(`Coverage ${section} item ${item}`);
            expect(texts.join(' ')).toContain(`Complete installation specification for section ${section} item ${item}.`);
          }
          expect(texts.join(' ')).toContain(`Warranty benefit ${section}`);
        }
      }
      if (mode !== 'warranty' && !mode.startsWith('materials')) {
        expect(texts[0]).toContain('JOB COST SUMMARY');
        expect(texts[0]).toContain('RETAIL PRICE:');
      }
      expect(await page.evaluate(() => (window as any).breakdownFixture.unchanged())).toBe(true);
      await page.evaluate(() => document.body.classList.remove('breakdown-print-mode'));
      expect(await screenOverflow()).toEqual(['hidden', 'hidden']);
      const screenshot = testInfo.outputPath('last-exported-page.png');
      await page.locator('#pdf-render').screenshot({ path: screenshot });
      await testInfo.attach('Last exported PDF page', { path: screenshot, contentType: 'image/png' });
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  });
}
