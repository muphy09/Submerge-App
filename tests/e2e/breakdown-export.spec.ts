import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

for (const { mode, franchise, height } of [
  { mode: 'combined', franchise: 'playwright-west', height: 768 },
  { mode: 'warranty', franchise: 'playwright-east', height: 900 },
  { mode: 'cost', franchise: 'playwright-other', height: 1080 },
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
      await expect(page.locator('.export-breakdown-page--warranty')).toHaveCount(mode === 'cost' ? 0 : 6);
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
      const expectedPages = mode === 'combined' ? 7 : mode === 'warranty' ? 6 : 1;
      const texts: string[] = await page.evaluate(({ data, lastPage }) => (window as any).breakdownFixture.readPdf(data, lastPage), { data: bytes, lastPage: expectedPages });
      // The hidden proposal screen can leave trailing blank pages in native print.
      // Verify every content page; blank-page cleanup is outside this regression.
      const contentPages = texts.filter((text) => text.trim());
      expect(contentPages).toHaveLength(expectedPages);
      expect(contentPages.every((text) => text.includes('Export Regression Customer'))).toBe(true);
      if (mode !== 'cost') {
        for (let section = 1; section <= 12; section++) {
          for (let item = 1; item <= 5; item++) {
            expect(texts.join(' ')).toContain(`Coverage ${section} item ${item}`);
            expect(texts.join(' ')).toContain(`Complete installation specification for section ${section} item ${item}.`);
          }
          expect(texts.join(' ')).toContain(`Warranty benefit ${section}`);
        }
      }
      if (mode !== 'warranty') {
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
