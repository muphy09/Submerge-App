import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

const { isNewerChannelRelease, configureReleaseComparison } = require('../../release-version');
const { createUpdateRecovery } = require('../../update-recovery');
const { planRelease } = require('../../scripts/release-plan');
const { AppUpdater } = require('electron-updater/out/AppUpdater');
const root = path.resolve(__dirname, '../..');
const west = 'franchise-5555';

test('release plans keep global, franchise and master cores aligned across subsequent releases', () => {
  const prepared = { schemaVersion: 2, bootstrapped: true, coreVersion: '3.3.8', pendingGlobalRelease: true,
    masterBuild: 1, franchises: { '5555': 1, '9724': 1 } };
  const initial = planRelease(prepared, 'global', '', 'patch');
  expect(initial.tags).toEqual(['v3.3.8', 'v3.3.8-franchise-5555.1', 'v3.3.8-franchise-9724.1', 'v3.3.8-master.1']);
  expect(initial.state.pendingGlobalRelease).toBeUndefined();
  const westRelease = planRelease(initial.state, 'franchise', '5555');
  expect(westRelease.tags).toEqual(['v3.3.8-franchise-5555.2', 'v3.3.8-master.2']);
  expect(westRelease.state.franchises['9724']).toBe(1);
  const next = planRelease(westRelease.state, 'global', '', 'patch');
  expect(next.tags).toEqual(['v3.3.9', 'v3.3.9-franchise-5555.1', 'v3.3.9-franchise-9724.1', 'v3.3.9-master.1']);
  expect(planRelease(next.state, 'global', '', 'minor').stableTag).toBe('3.4.0');
  expect(planRelease(next.state, 'global', '', 'major').stableTag).toBe('4.0.0');
  expect(() => planRelease(prepared, 'franchise', '5555')).toThrow('prepared global release');
});

test('build stamping keeps package metadata aligned and rejects mismatched release tags', async ({}, testInfo) => {
  const folder = testInfo.outputPath('build-stamping');
  mkdirSync(path.join(folder, 'scripts'), { recursive: true });
  const script = path.join(folder, 'scripts', 'set-build-version.js');
  writeFileSync(script, readFileSync(path.join(root, 'scripts', 'set-build-version.js')));
  writeFileSync(path.join(folder, 'release-state.json'), JSON.stringify({ schemaVersion: 2, coreVersion: '3.3.8', masterBuild: 1, franchises: { '5555': 1 } }));
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ version: '3.3.5' }));
  writeFileSync(path.join(folder, 'package-lock.json'), JSON.stringify({ version: '3.3.5', packages: { '': { version: '3.3.5' } } }));
  for (const version of ['3.3.8', '3.3.8-franchise-5555.1', '3.3.8-master.1']) {
    execFileSync(process.execPath, [script, version], { env: { ...process.env, RELEASE_TAG: '' } });
    expect(JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8')).version).toBe(version);
    const lock = JSON.parse(readFileSync(path.join(folder, 'package-lock.json'), 'utf8'));
    expect(lock.version).toBe(version);
    expect(lock.packages[''].version).toBe(version);
  }
  expect(() => execFileSync(process.execPath, [script, '3.3.9-franchise-5555.1'], {
    env: { ...process.env, RELEASE_TAG: '' }, stdio: 'pipe',
  })).toThrow();
  expect(JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8')).version).toBe('3.3.8-master.1');
});

test('installed Electron updater uses core and numeric revisions while retaining OS and rollout checks', async ({}, testInfo) => {
  const cases: [string, string, string, boolean][] = [
    ['3.3.5', '3.3.8-franchise-5555.1', west, true],
    ['3.3.6-franchise-5555.1', '3.3.8-franchise-5555.1', west, true],
    ['3.3.8', '3.3.8-franchise-5555.1', west, false],
    ['3.3.8', '3.3.8-franchise-5555.2', west, true],
    ['3.3.8-franchise-5555.2', '3.3.8-franchise-5555.10', west, true],
    ['3.3.8-franchise-5555.10', '3.3.8-franchise-5555.2', west, false],
    ['3.3.8', '3.3.6-franchise-5555.99', west, false],
    ['3.3.8-franchise-5555.2', '3.3.8-franchise-5555.2', west, false],
    ['3.3.8', '3.3.8-franchise-9724.2', west, false],
    ['3.3.8-franchise-5555.10', '3.3.9-franchise-5555.1', west, true],
    ['3.3.8', '3.3.8-master.2', 'master', true],
    ['3.3.8', '3.3.8', west, false],
    ['3.3.8', 'invalid', west, false],
  ];
  for (const [current, candidate, channel, available] of cases) {
    expect(isNewerChannelRelease(current, candidate, channel), `${current} -> ${candidate}`).toBe(available);
    const updater = new AppUpdater(undefined, { version: current, userDataPath: testInfo.outputPath('updater-data') });
    updater.logger = null;
    updater.allowDowngrade = true;
    configureReleaseComparison(updater, current, () => channel);
    if (candidate !== 'invalid') expect(await updater.isUpdateAvailable({ version: candidate })).toBe(available);
  }
  const state = { schemaVersion: 2, coreVersion: '3.3.8', masterBuild: 4, franchises: { '5555': 2, '9724': 3 } };
  expect(isNewerChannelRelease('3.3.8-master.4', '3.3.8-franchise-5555.2', west, state)).toBe(false);
  expect(isNewerChannelRelease('3.3.8-master.4', '3.3.8-franchise-5555.3', west, state)).toBe(true);
  expect(isNewerChannelRelease('3.3.8-franchise-5555.2', '3.3.8-master.4', 'master', state)).toBe(false);
  expect(isNewerChannelRelease('3.3.8-franchise-5555.2', '3.3.8-master.5', 'master', state)).toBe(true);
  const updater = new AppUpdater(undefined, { version: '3.3.8', userDataPath: testInfo.outputPath('rollout-data') });
  updater.logger = null;
  updater.allowDowngrade = true;
  configureReleaseComparison(updater, '3.3.8', () => west);
  expect(await updater.isUpdateAvailable({ version: '3.3.8-franchise-5555.2', minimumSystemVersion: '999.0.0' })).toBe(false);
  expect(await updater.isUpdateAvailable({ version: '3.3.8-franchise-5555.2', stagingPercentage: 0 })).toBe(false);
  // Existing clients have only SemVer comparison, so the first aligned build
  // must still be newer without installing the new comparator first.
  for (const current of ['3.3.4', '3.3.5', '3.3.6-franchise-5555.1', '3.3.6-master.1']) {
    const legacy = new AppUpdater(undefined, { version: current });
    expect(await legacy.isUpdateAvailable({ version: '3.3.8-franchise-5555.1' })).toBe(true);
  }
});

test('manual recovery with a newer or equivalent stable installer clears the obsolete pending attempt', async ({}, testInfo) => {
  for (const [old, pending, installed] of [
    ['3.3.5', '3.3.6-franchise-5555.1', '3.3.8'],
    ['3.3.5', '3.3.8-franchise-5555.1', '3.3.8'],
    ['3.3.8', '3.3.8-franchise-5555.2', '3.3.9'],
  ]) {
    const file = testInfo.outputPath(`${pending}-${installed}.json`);
    createUpdateRecovery(file, old).beginInstall(pending);
    createUpdateRecovery(file, installed);
    expect(JSON.parse(readFileSync(file, 'utf8')).pendingInstall).toBeUndefined();
    expect(JSON.parse(readFileSync(file, 'utf8')).failedVersions).not.toContain(pending);
  }
  const file = testInfo.outputPath('same-core-failure.json');
  createUpdateRecovery(file, '3.3.8').beginInstall('3.3.8-franchise-5555.2');
  expect(createUpdateRecovery(file, '3.3.8').offer('3.3.8-franchise-5555.2', west).message).toContain('Automatic retries are paused');
});

test('real Electron filters a local feed before downloading a same-core revision', async ({}, testInfo) => {
  let candidate = '3.3.8-franchise-5555.1';
  const server = createServer((_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.end(`version: ${candidate}\nfiles: []\n`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const appData = testInfo.outputPath('app-data');
  mkdirSync(appData, { recursive: true });
  const bootstrap = testInfo.outputPath('local-feed.cjs');
  writeFileSync(bootstrap, `
    // A main.js test launch otherwise reports Electron's runtime version.
    require('electron').app.getVersion = () => '3.3.8';
    const { autoUpdater } = require(${JSON.stringify(path.join(root, 'node_modules/electron-updater'))});
    autoUpdater.forceDevUpdateConfig = true;
    const setFeed = autoUpdater.setFeedURL.bind(autoUpdater);
    autoUpdater.setFeedURL = () => setFeed({ provider: 'generic', url: 'http://127.0.0.1:${port}/' });
    global.__downloads = 0;
    autoUpdater.downloadUpdate = async () => { global.__downloads++; return []; };
  `);
  const env = { ...process.env, NODE_ENV: 'production', SUBMERGE_DATA_PARTITION: 'playwright-release-version',
    SUBMERGE_TEST_USER_DATA_ROOT: appData, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ args: ['--require', bootstrap, 'main.js', '--no-sandbox'], cwd: root, env });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    const check = () => page.evaluate(() => window.electron.checkForUpdates({ channel: 'franchise-5555' }));
    expect((await check()).available).toBe(false);
    expect(await app.evaluate(() => (globalThis as any).__downloads)).toBe(0);
    candidate = '3.3.8-franchise-5555.2';
    expect((await check()).available).toBe(true);
    expect(await app.evaluate(() => (globalThis as any).__downloads)).toBe(1);
    candidate = '3.3.6-franchise-5555.99';
    expect((await check()).available).toBe(false);
    candidate = '3.3.8-franchise-9724.2';
    expect((await check()).available).toBe(false);
    expect(await app.evaluate(() => (globalThis as any).__downloads)).toBe(1);
  } finally {
    await app?.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('Settings displays aligned and historical core versions correctly', async ({ page }, testInfo) => {
  for (const [version, displayed] of [
    ['3.3.8', '3.3.8-1'],
    ['3.3.8-master.1', '3.3.8-1'],
    ['3.3.6-franchise-5555.1', '3.3.5-1'],
    ['3.4.0-franchise-5555.1', '3.4.0-1'],
    ['3.3.8-franchise-5555.2', '3.3.8-2'],
  ]) {
    await page.goto(`http://127.0.0.1:5173/tests/fixtures/settings-price-impact.html?version=${version}`);
    await expect(page.getByText(`Version ${displayed}`, { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('aligned-version.png'), animations: 'disabled' });
});
