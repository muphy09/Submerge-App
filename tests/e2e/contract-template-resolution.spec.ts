import { expect, test, type Page } from '@playwright/test';

const fixtureOrigin = 'http://127.0.0.1:5173';
const fixtureUrl = `${fixtureOrigin}/tests/fixtures/contract-template-resolution.html`;
const west = 'playwright-west';
const east = 'playwright-east';
const model = 'playwright-summer';
const revision = 'playwright-summer-r1';
const proposalNumber = 'PROP-PW-CONTRACT';

async function setup(page: Page, options: { edit?: boolean; delayPricing?: boolean; lawrence?: boolean } = {}) {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(({ west, model, revision, proposalNumber, edit, lawrence }) => {
    window.__APP_ENV__ = {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'playwright-public-placeholder', VITE_SUPABASE_ONLY: 'false',
    };
    localStorage.setItem('submerge-user-session', JSON.stringify({
      userId: 'playwright-master', userName: 'Playwright Master',
      userEmail: 'master@playwright.invalid', franchiseId: lawrence ? west : 'default', role: lawrence ? 'designer' : 'master', franchiseCode: lawrence ? '5555' : undefined,
    }));
    (window as any).contractFixture = {
      edit,
      proposal: {
        proposalNumber, franchiseId: lawrence ? west : 'default', designerAuthUserId: 'playwright-master',
        designerName: 'Playwright Master', designerRole: lawrence ? 'designer' : 'master', status: 'draft',
        pricingModelId: model, pricingModelName: 'Sizzlin Summer 2026',
        pricingModelFranchiseId: west, pricingModelRevisionId: revision, pricingModelRevisionNumber: 1,
        customerInfo: { customerName: lawrence ? 'State Change Regression' : 'CONTRACT TEST', state: lawrence ? 'SC' : 'NC', city: 'Charlotte' },
        ...(lawrence ? { contractTemplateId: `bundled:${west}:nc-gunite`, contractTemplateRevisionId: `bundled:${west}:nc-gunite:r1` } : {}),
        createdDate: '2026-09-10T12:00:00.000Z', lastModified: '2026-09-10T12:00:00.000Z',
        versionId: 'original', activeVersionId: 'original', isOriginalVersion: true,
      },
    };
  }, { west, model, revision, proposalNumber, edit: options.edit || false, lawrence: options.lawrence || false });

  let releasePricing = () => {};
  const pricingGate = options.delayPricing ? new Promise<void>((resolve) => { releasePricing = resolve; }) : Promise.resolve();
  let pricingRequests = 0;
  // All backend traffic is synthetic; no account or production records are used.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === fixtureOrigin) return route.continue();
    if (!url.hostname.endsWith('.supabase.co') && url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname.startsWith('/storage/v1/')) {
      if (route.request().method() === 'POST') {
        return route.fulfill({ json: { signedURL: '/object/sign/fixture.pdf' } });
      }
      return route.fulfill({ contentType: 'application/pdf', path: 'docs/Contracts/NEW 2026 Contract NC Shotcrete.pdf' });
    }
    const table = url.pathname.split('/').pop();
    const single = route.request().headers().accept?.includes('object');
    let rows: any[] = [];
    if (table === 'franchise_contract_templates' && (url.searchParams.get('franchise_id') === `eq.${east}` || url.searchParams.has('id'))) {
      rows = [{ id: 'east-template', franchise_id: east, name: 'East published contract', jurisdiction_key: '*', pool_type: 'shotcrete', current_revision_id: 'east-r1' }];
    }
    if (table === 'franchise_contract_template_revisions') {
      rows = [{ id: 'east-r1', contract_template_id: 'east-template', franchise_id: east, revision_number: 1, storage_path: 'fixture.pdf', original_file_name: 'fixture.pdf' }];
    }
    if (table === 'franchises') rows = [{ id: west, name: 'PPAS West', franchise_code: '5555' }, { id: east, name: 'PPAS East', franchise_code: '9724' }].filter(row => !url.searchParams.has('id') || url.searchParams.get('id') === `eq.${row.id}`);
    if (table === 'franchise_pricing_models') rows = [{
      id: model, franchise_id: west, name: 'Sizzlin Summer 2026', current_revision_id: revision,
      version: 'v1', is_default: true, pricing_json: {},
    }];
    if (table === 'franchise_pricing_model_revisions') {
      pricingRequests += 1;
      await pricingGate;
      rows = [{ id: revision, pricing_model_id: model, franchise_id: west, revision_number: 1, pricing_json: {} }];
    }
    // Read the local proposal through the fixture's IPC adapter. Writes stay intercepted.
    if (table === 'franchise_proposals' && route.request().method() !== 'GET') {
      const data = route.request().postDataJSON();
      rows = [Array.isArray(data) ? data[0] : data];
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? rows[0] || null : rows) });
  });
  await page.goto(fixtureUrl);
  return { errors, releasePricing, pricingRequests: () => pricingRequests };
}

test('master proposal opens the West contract and keeps its owner and pricing revision', async ({ page }, testInfo) => {
  const { errors } = await setup(page);
  await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
  const result = await page.evaluate(() => (window as any).contractFixture.check());
  expect(result.check.pinned.franchiseId).toBe(west);
  expect(result.check.pinned.contractTemplate.id).toBe('nc-gunite');
  expect(result.unchanged).toBe(true);
  expect(result.adopted.franchiseId).toBe('default');
  expect(result.adopted.pricingModelRevisionId).toBe(revision);

  await page.getByRole('button', { name: /View Contract/ }).click();
  await expect(page.getByRole('button', { name: 'Close contract' })).toBeVisible();
  await expect(page.locator('.contract-page-canvas').first()).toBeVisible();
  await expect.poll(() => page.locator('.contract-page-canvas').first().evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(300);
  await page.screenshot({ path: testInfo.outputPath('master-west-contract.png') });
  expect(errors.filter((message) => /Failed to load proposal|contract PDF|contract template/i.test(message))).toEqual([]);
});

for (const useMatching of [false, true]) {
test(`West designer ${useMatching ? 'adopts SC' : 'keeps NC'} after the proposal state changes`, async ({ page }, testInfo) => {
  await setup(page, { lawrence: true });
  await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
  const result = await page.evaluate(() => (window as any).contractFixture.check());
  expect(result.check.pinned.contractTemplate.id).toBe('nc-gunite');
  expect(result.check.pinned.jurisdictionKey).toBe('NC');
  expect(result.check.latest.contractTemplate.id).toBe('sc-gunite');
  expect(result.check.requiresReview).toBe(true);
  await page.getByRole('button', { name: /View Contract/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('2026 Contract NC Shotcrete');
  await expect(dialog).toContainText('2026 Contract SC Shotcrete');
  await page.screenshot({ path: testInfo.outputPath('state-change-review.png') });
  await dialog.getByRole('button', { name: useMatching ? 'Use Matching Template' : 'Keep Saved Template', exact: true }).click();
  await expect(page.locator('.contract-page-canvas').first()).toBeVisible();
  const saved = await page.evaluate(() => (window as any).contractFixture.saved.at(-1));
  expect(saved.franchiseId).toBe(west);
  expect(saved.contractTemplateRevisionId).toBe(`bundled:${west}:${useMatching ? 'sc' : 'nc'}-gunite:r1`);
  expect(saved.pricingModelRevisionId).toBe(revision);
});
}

test('existing West pins and ordinary franchise scope are preserved', async ({ page }) => {
  await setup(page);
  const pinned = `bundled:${west}:nc-fiberglass:r1`;
  const result = await page.evaluate(({ west, east, pinned }) => Promise.all([
    (window as any).contractFixture.check({
      contractTemplateRevisionId: pinned, poolSpecs: { poolType: 'fiberglass' },
    }),
    (window as any).contractFixture.check({ franchiseId: west, pricingModelFranchiseId: east }),
    (window as any).contractFixture.check({ pricingModelFranchiseId: undefined }),
  ]), { west, east, pinned });
  expect(result[0].check.pinned.revisionId).toBe(pinned);
  expect(result[0].check.requiresReview).toBe(true);
  expect(result[1].check.pinned.franchiseId).toBe(west);
  expect(result[2].check).toBeNull();
});

test('builder loads the exact borrowed pricing revision', async ({ page }) => {
  const { errors } = await setup(page, { edit: true });
  await expect(page.getByPlaceholder('Enter customer name')).toHaveValue('CONTRACT TEST');
  const meta = await page.evaluate(() => (window as any).contractFixture.pricingMeta());
  expect(meta.pricingModelFranchiseId).toBe(west);
  expect(meta.pricingModelRevisionId).toBe(revision);
  expect(errors.filter((message) => message.includes('Failed to load proposal'))).toEqual([]);
});

test('master proposals also resolve published East templates', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate((east) => (window as any).contractFixture.check({ pricingModelFranchiseId: east }), east);
  expect(result.check.latest.source).toBe('remote');
  expect(result.check.latest.franchiseId).toBe(east);
  expect(result.adopted.franchiseId).toBe('default');
});

test('changed pool types preserve the saved contract and invalid pins report a revision error', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async ({ west, east }) => {
    const changed = await (window as any).contractFixture.check({
      contractTemplateRevisionId: `bundled:${west}:nc-gunite:r1`, poolSpecs: { poolType: 'fiberglass' },
    });
    const errors = [];
    for (const pin of [`bundled:${west}:nc-gunite:r99`, `bundled:${east}:nc-gunite:r1`]) {
      try { await (window as any).contractFixture.check({ contractTemplateRevisionId: pin }); }
      catch (error) { errors.push(String(error)); }
    }
    return { changed, errors };
  }, { west, east });
  expect(result.changed.check.pinned.contractTemplate.id).toBe('nc-gunite');
  expect(result.changed.check.latest.contractTemplate.id).toBe('nc-fiberglass');
  expect(result.changed.check.requiresReview).toBe(true);
  expect(result.errors).toHaveLength(2);
  expect(result.errors.every(message => message.includes('saved contract revision could not be loaded'))).toBe(true);
});

test('leaving a loading builder for the summary cancels obsolete loads', async ({ page }) => {
  const fixture = await setup(page, { edit: true, delayPricing: true });
  await expect.poll(fixture.pricingRequests).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Go to test summary' }).click();
  fixture.releasePricing();
  await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
  expect(fixture.errors.filter((message) => message.includes('Failed to load proposal'))).toEqual([]);
});
