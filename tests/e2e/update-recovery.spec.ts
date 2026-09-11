import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';

const { createUpdateRecovery, handOffUpdateInstall } = require('../../update-recovery');
const root = path.resolve(__dirname, '../..');
const target = '3.3.8-franchise-5555.2';

test('Windows waits for installer launch and keeps the app open when launch is blocked', async () => {
  let quits = 0;
  let release: (value: string) => void = () => {};
  const handoff = handOffUpdateInstall({
    platform: 'win32', updater: { installerPath: 'verified-update.exe' },
    openPath: () => new Promise<string>(resolve => { release = resolve; }),
    quit: () => { quits++; },
  });
  expect(quits).toBe(0);
  const rejected = expect(handoff).rejects.toThrow('Installation blocked');
  release('Installation blocked');
  await rejected;
  expect(quits).toBe(0);
  await handOffUpdateInstall({
    platform: 'win32', updater: { installerPath: 'verified-update.exe' },
    openPath: async (file: string) => { expect(file).toBe('verified-update.exe'); return ''; },
    quit: () => { quits++; },
  });
  expect(quits).toBe(1);
});

test('recovery remembers failed installs, allows explicit retry and clears a successful install', async ({}, testInfo) => {
  const statePath = testInfo.outputPath('recovery.json');
  const initial = createUpdateRecovery(statePath, '3.3.4');
  expect(initial.offer('3.3.5-franchise-5555.1', 'franchise-5555').available).toBe(false);
  expect(initial.offer('3.3.5-franchise-5555.2', 'franchise-5555').available).toBe(true);
  expect(initial.offer(target, 'franchise-9724').available).toBe(false);
  initial.beginInstall(target);
  const restarted = createUpdateRecovery(statePath, '3.3.4');
  expect(restarted.offer(target, 'franchise-5555').message).toContain('Automatic retries are paused');
  expect(restarted.offer(target, 'franchise-5555', true).available).toBe(true);
  restarted.beginInstall(target);
  const updated = createUpdateRecovery(statePath, target);
  expect(updated.offer(target, 'franchise-5555').available).toBe(false);
  expect(updated.offer('3.3.8-franchise-5555.3', 'franchise-5555').available).toBe(true);
});

async function launch(appData: string, bootstrap: string) {
  const env = { ...process.env, NODE_ENV: 'production', SUBMERGE_DATA_PARTITION: 'playwright-update-recovery',
    SUBMERGE_TEST_USER_DATA_ROOT: appData, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['--require', bootstrap, 'main.js', '--no-sandbox'], cwd: root, env });
  await (await app.firstWindow()).waitForLoadState('domcontentloaded');
  return app;
}

test('Electron does not repeat a failed restart and only retries when requested', async ({}, testInfo) => {
  const appData = testInfo.outputPath('app-data');
  mkdirSync(appData, { recursive: true });
  const bootstrap = testInfo.outputPath('fake-updater.cjs');
  writeFileSync(bootstrap, `
    // Model an installed stable app, not Electron's runtime version.
    require('electron').app.getVersion = () => '3.3.8';
    const { EventEmitter } = require('events');
    const Module = require('module');
    const fake = new EventEmitter();
    Object.assign(fake, {
      downloads: 0, installs: 0,
      setFeedURL() {},
      isUpdateSupported: async () => true,
      async checkForUpdates() {
        const updateInfo = { version: '${target}' };
        if (!await this.isUpdateSupported(updateInfo)) {
          this.emit('update-not-available', updateInfo);
          return { isUpdateAvailable: false, updateInfo };
        }
        this.emit('update-available', updateInfo);
        return { isUpdateAvailable: true, updateInfo };
      },
      async downloadUpdate() { this.downloads++; this.emit('update-downloaded', { version: '${target}' }); },
      quitAndInstall() { this.installs++; },
    });
    global.__updateTestFake = fake;
    const original = Module._load;
    Module._load = function(name, ...args) {
      return name === 'electron-updater' ? { autoUpdater: fake } : original.call(this, name, ...args);
    };
  `);
  let app: ElectronApplication | undefined;
  try {
    app = await launch(appData, bootstrap);
    let page = await app.firstWindow();
    expect(await app.evaluate(() => (globalThis as any).__updateTestFake.autoInstallOnAppQuit)).toBe(false);
    const result = await page.evaluate(() => window.electron.checkForUpdates({ channel: 'franchise-5555' }));
    expect(result.available).toBe(true);
    await expect(page.getByText('Update downloaded. Install when you are ready; you can keep working.')).toBeVisible();
    await page.getByRole('button', { name: 'Install Update' }).click();
    expect(await app.evaluate(() => (globalThis as any).__updateTestFake.installs)).toBe(1);
    await app.close();
    app = await launch(appData, bootstrap);
    page = await app.firstWindow();
    const failed = await page.evaluate(() => window.electron.checkForUpdates({ channel: 'franchise-5555' }));
    expect(failed.available).toBe(false);
    expect(failed.message).toContain('Automatic retries are paused');
    expect(await app.evaluate(() => (globalThis as any).__updateTestFake.downloads)).toBe(0);
    await expect(page.getByText(/Automatic retries are paused/)).toBeVisible();
    const width = await page.evaluate(() => window.innerWidth);
    await expect.poll(async () => {
      const notice = await page.locator('.update-notification').boundingBox();
      return notice!.x + notice!.width;
    }).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath('update-recovery.png') });
    const retried = await page.evaluate(() => window.electron.checkForUpdates({ channel: 'franchise-5555', retryFailedUpdate: true }));
    expect(retried.available).toBe(true);
    expect(await app.evaluate(() => (globalThis as any).__updateTestFake.downloads)).toBe(1);
  } finally {
    await app?.close();
  }
});

test('Settings respects a paused franchise without starting a manual download', async ({ page }) => {
  await page.addInitScript(() => {
    window.__APP_ENV__ = { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'playwright-public-placeholder' };
  });
  await page.route('http://127.0.0.1:54321/**', async route => {
    const assignment = route.request().url().includes('/franchise_release_assignments');
    await route.fulfill({ json: assignment ? [{ update_enabled: false, release_channel: 'stable' }] : [] });
  });
  await page.goto('http://127.0.0.1:5173/tests/fixtures/settings-price-impact.html');
  await page.evaluate(() => {
    (window as any).updateChecks = 0;
    window.electron.checkForUpdates = async () => { (window as any).updateChecks++; return { available: false }; };
  });
  await page.getByRole('button', { name: 'Check for Updates' }).click();
  await expect(page.getByText('Updates are temporarily paused for your franchise. You can keep using the current app.')).toBeVisible();
  expect(await page.evaluate(() => (window as any).updateChecks)).toBe(0);
});
