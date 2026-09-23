import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getBundledContractTemplateRevision } from '../../src/services/contractTemplates';

const fixtureOrigin = 'http://127.0.0.1:5173';
const fixtureUrl = `${fixtureOrigin}/tests/fixtures/contract-template-resolution.html`;
const west = 'playwright-west';
const east = 'playwright-east';
const model = 'playwright-summer';
const revision = 'playwright-summer-r1';
const proposalNumber = 'PROP-PW-CONTRACT';
const fixturePdf = resolve('docs/Contracts/NEW 2026 Contract NC Shotcrete.pdf');
const fixtureChecksum = createHash('sha256').update(readFileSync(fixturePdf)).digest('hex');
const westTypes = [
  ['nc-gunite', 'NC', 'shotcrete', 2],
  ['nc-fiberglass', 'NC', 'fiberglass', 3],
  ['sc-gunite', 'SC', 'shotcrete', 2],
  ['sc-fiberglass', 'SC', 'fiberglass', 3],
] as const;
const westTemplates = westTypes.map(([id, state, pool, latest]) => ({
  id: `west-${id}`, franchise_id: west, name: getBundledContractTemplateRevision(id)?.contractTemplate.label,
  jurisdiction_key: state, pool_type: pool, current_revision_id: `west-${id}-r${latest}`,
  is_active: false, remote_client_published: true,
}));
const westRevisions = westTypes.flatMap(([id, , , latest]) =>
  Array.from({ length: latest }, (_, index) => {
    const number = index + 1;
    const bundled = getBundledContractTemplateRevision(id, number)!;
    return {
      id: `west-${id}-r${number}`, contract_template_id: `west-${id}`, franchise_id: west,
      revision_number: number, storage_path: `fixture/${id}/r${number}.pdf`,
      original_file_name: `${id}-r${number}.pdf`, file_checksum: fixtureChecksum,
      field_layout_json: bundled.contractTemplate.fields,
      autofill_rules_json: {
        schemaVersion: 2, renderProfile: 'ppas-west-2026-v1',
        defaultFieldValues: bundled.contractTemplate.defaultFieldValues,
        changeNotes: bundled.changeNotes || [], effectivePublishedAt: bundled.publishedAt || null,
        legacyBundledId: `bundled:${west}:${id}:r${number}`,
      },
      published_at: bundled.publishedAt || '2026-01-01T00:00:00.000Z',
    };
  })
);

async function setup(page: Page, options: { edit?: boolean; delayPricing?: boolean; lawrence?: boolean; westContract?: boolean; manualReturns?: boolean; oldFiberglass?: boolean; twoProposals?: boolean; futureWestRevision?: boolean } = {}) {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(({ west, model, revision, proposalNumber, edit, lawrence, westContract, manualReturns, oldFiberglass, twoProposals }) => {
    window.__APP_ENV__ = {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'playwright-public-placeholder', VITE_SUPABASE_ONLY: 'false',
    };
    localStorage.setItem('submerge-user-session', JSON.stringify({
      userId: 'playwright-master', userName: 'Playwright Master',
      userEmail: 'master@playwright.invalid', franchiseId: lawrence || westContract ? west : 'default', role: lawrence || westContract ? 'designer' : 'master', franchiseCode: lawrence || westContract ? '5555' : undefined,
    }));
    (window as any).contractFixture = {
      edit,
      secondProposalNumber: twoProposals ? `${proposalNumber}-B` : undefined,
      proposal: {
        proposalNumber, franchiseId: lawrence || westContract ? west : 'default', designerAuthUserId: 'playwright-master',
        designerName: 'Playwright Master', designerRole: lawrence || westContract ? 'designer' : 'master', status: 'draft',
        pricingModelId: model, pricingModelName: 'Sizzlin Summer 2026',
        pricingModelFranchiseId: west, pricingModelRevisionId: revision, pricingModelRevisionNumber: 1,
        customerInfo: { customerName: lawrence ? 'State Change Regression' : 'CONTRACT TEST', state: lawrence ? 'SC' : 'NC', city: 'Charlotte' },
        ...(oldFiberglass ? { poolSpecs: { poolType: 'fiberglass' } } : {}),
        ...(lawrence || westContract ? {
          contractTemplateId: `bundled:${west}:nc-${oldFiberglass ? 'fiberglass' : 'gunite'}`,
          contractTemplateRevisionId: `bundled:${west}:nc-${oldFiberglass ? 'fiberglass' : 'gunite'}:r1`,
        } : {}),
        ...(manualReturns ? { contractOverrides: { p1_36: '5' } } : {}),
        createdDate: lawrence || westContract ? '2026-09-10T12:00:00.000Z' : '2026-09-23T00:00:00.000Z',
        lastModified: '2026-09-10T12:00:00.000Z',
        versionId: 'original', activeVersionId: 'original', isOriginalVersion: true,
      },
    };
  }, { west, model, revision, proposalNumber, edit: options.edit || false, lawrence: options.lawrence || false, westContract: options.westContract || false, manualReturns: options.manualReturns || false, oldFiberglass: options.oldFiberglass || false, twoProposals: options.twoProposals || false });

  let releasePricing = () => {};
  const pricingGate = options.delayPricing ? new Promise<void>((resolve) => { releasePricing = resolve; }) : Promise.resolve();
  let pricingRequests = 0;
  const templates = options.futureWestRevision
    ? westTemplates.map((row) => row.id === 'west-nc-gunite' ? { ...row, current_revision_id: 'west-nc-gunite-r3' } : row)
    : westTemplates;
  const revisions = options.futureWestRevision
    ? [...westRevisions, {
        ...westRevisions.find((row) => row.id === 'west-nc-gunite-r2')!,
        id: 'west-nc-gunite-r3', revision_number: 3,
        storage_path: 'fixture/nc-gunite/r3.pdf',
        autofill_rules_json: {
          schemaVersion: 2, renderProfile: 'ppas-west-2026-v1',
          defaultFieldValues: { p1_36: '3' }, changeNotes: ['The warranty wording changed.'],
          effectivePublishedAt: '2026-10-01T00:00:00.000Z', legacyBundledId: undefined,
        },
        published_at: '2026-10-01T00:00:00.000Z',
      }]
    : westRevisions;
  // All backend traffic is synthetic; no account or production records are used.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === fixtureOrigin) return route.continue();
    if (!url.hostname.endsWith('.supabase.co') && url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname.startsWith('/storage/v1/')) {
      if (route.request().method() === 'POST') {
        return route.fulfill({ json: { signedURL: '/object/sign/fixture.pdf' } });
      }
      return route.fulfill({ contentType: 'application/pdf', path: fixturePdf });
    }
    const table = url.pathname.split('/').pop();
    const single = route.request().headers().accept?.includes('object');
    let rows: any[] = [];
    if (table === 'franchise_contract_templates') rows = url.searchParams.get('franchise_id') === `eq.${west}`
      ? templates
      : url.searchParams.get('franchise_id') === `eq.${east}`
      ? [{ id: 'east-template', franchise_id: east, name: 'East published contract', jurisdiction_key: '*', pool_type: 'shotcrete', current_revision_id: 'east-r1', is_active: true, remote_client_published: false }]
      : [];
    if (table === 'franchise_contract_template_revisions') {
      rows = url.searchParams.get('franchise_id') === `eq.${west}`
        ? revisions
        : url.searchParams.get('franchise_id') === `eq.${east}`
        ? [{ id: 'east-r1', contract_template_id: 'east-template', franchise_id: east, revision_number: 1,
          storage_path: 'fixture.pdf', original_file_name: 'fixture.pdf', file_checksum: fixtureChecksum,
          field_layout_json: getBundledContractTemplateRevision('nc-gunite')!.contractTemplate.fields,
          autofill_rules_json: {}, published_at: '2026-01-01T00:00:00.000Z' }]
        : [];
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
  expect(result.check.pinned.contractTemplate.id).toBe('west-nc-gunite');
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
  expect(result.check.pinned.contractTemplate.id).toBe('west-nc-gunite');
  expect(result.check.pinned.jurisdictionKey).toBe('NC');
  expect(result.check.latest.contractTemplate.id).toBe('west-sc-gunite');
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
  expect(saved.contractTemplateRevisionId).toBe(useMatching ? 'west-sc-gunite-r2' : `bundled:${west}:nc-gunite:r1`);
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

test('West contract revisions preserve 4 on saved versions and use 3 only on the latest revision', async ({ page }) => {
  await setup(page);
  for (const state of ['NC', 'SC']) {
    for (const [poolType, templateKind, savedRevision] of [
      ['gunite', 'gunite', 1],
      ['fiberglass', 'fiberglass', 2],
    ] as const) {
      const values = await page.evaluate(({ west, east, state, poolType, templateKind, savedRevision }) =>
        (window as any).contractFixture.returnValues({
          franchiseId: west,
          pricingModelFranchiseId: east,
          customerInfo: { state },
          poolSpecs: { poolType },
          contractTemplateRevisionId: `bundled:${west}:${state.toLowerCase()}-${templateKind}:r${savedRevision}`,
        }), { west, east, state, poolType, templateKind, savedRevision });
      expect(values.pinned).toBe('4');
      expect(values.latest).toBe('3');
      expect(values.requiresReview).toBe(true);
      expect(values.afterDeclineRequiresReview).toBe(false);
      expect(values.changeNotes).toEqual(['The default Surface Returns quantity changed from 4 to 3.']);
    }
  }
  const eastValues = await page.evaluate((east) =>
    (window as any).contractFixture.returnValues({ pricingModelFranchiseId: east }), east);
  expect(eastValues.latest).toBe('4');
  expect(eastValues.changeNotes).toEqual([]);
  const olderFiberglass = await page.evaluate((west) =>
    (window as any).contractFixture.returnValues({
      franchiseId: west,
      customerInfo: { state: 'NC' },
      poolSpecs: { poolType: 'fiberglass' },
      contractTemplateRevisionId: `bundled:${west}:nc-fiberglass:r1`,
    }), west);
  expect(olderFiberglass.changeNotes).toEqual([
    'The fiberglass contract payment schedule wording changed on pages 1 and 5.',
    'The default Surface Returns quantity changed from 4 to 3.',
  ]);
  const unpinned = await page.evaluate(async ({ west }) => ({
    older: await (window as any).contractFixture.returnValues({
      franchiseId: west, contractTemplateRevisionId: undefined,
      createdDate: '2026-09-10T12:00:00.000Z',
    }),
    newer: await (window as any).contractFixture.returnValues({
      franchiseId: west, contractTemplateRevisionId: undefined,
      createdDate: '2026-09-23T00:00:00.000Z',
    }),
  }), { west });
  expect(unpinned.older.pinned).toBe('4');
  expect(unpinned.older.requiresReview).toBe(true);
  expect(unpinned.newer.latest).toBe('3');
  expect(unpinned.newer.requiresReview).toBe(false);
});

test('an identical remote copy preserves an accepted or declined bundled choice without another prompt', async ({ page }) => {
  await setup(page);
  const accepted = await page.evaluate((west) => (window as any).contractFixture.check({
    contractTemplateRevisionId: `bundled:${west}:nc-gunite:r2`,
    contractRevisionReview: {
      decision: 'upgraded', latestRevisionId: `bundled:${west}:nc-gunite:r2`, detectedAt: '2026-09-22T00:00:00.000Z',
    },
  }), west);
  expect(accepted.check.pinned.revisionId).toBe(`bundled:${west}:nc-gunite:r2`);
  expect(accepted.check.pinned.remoteRevisionId).toBe('west-nc-gunite-r2');
  expect(accepted.check.requiresReview).toBe(false);
  const declined = await page.evaluate((west) => (window as any).contractFixture.check({
    contractTemplateRevisionId: `bundled:${west}:nc-gunite:r1`,
    contractRevisionReview: {
      decision: 'declined', latestRevisionId: `bundled:${west}:nc-gunite:r2`, detectedAt: '2026-09-22T00:00:00.000Z',
    },
  }), west);
  expect(declined.check.requiresReview).toBe(false);
  expect(declined.check.pinned.revisionId).toBe(`bundled:${west}:nc-gunite:r1`);
});

test('a later remote revision asks again and includes changes since a declined bundled revision', async ({ page }) => {
  await setup(page, { futureWestRevision: true });
  const result = await page.evaluate((west) => (window as any).contractFixture.check({
    contractTemplateRevisionId: `bundled:${west}:nc-gunite:r1`,
    contractRevisionReview: {
      decision: 'declined', latestRevisionId: `bundled:${west}:nc-gunite:r2`, detectedAt: '2026-09-22T00:00:00.000Z',
    },
  }), west);
  expect(result.check.requiresReview).toBe(true);
  expect(result.check.changeNotes).toEqual([
    'The default Surface Returns quantity changed from 4 to 3.',
    'The warranty wording changed.',
  ]);
});

test('West contracts open offline after the full history has been cached', async ({ page }) => {
  await setup(page, { westContract: true });
  await page.evaluate(() => (window as any).contractFixture.prefetchWest());
  await page.context().setOffline(true);
  const result = await page.evaluate(() => (window as any).contractFixture.returnValues());
  expect(result.pinned).toBe('4');
  expect(result.latest).toBe('3');
});

test('West designer can keep the saved 4-return revision without being prompted again', async ({ page }, testInfo) => {
  await setup(page, { westContract: true });
  await page.getByRole('button', { name: /View Contract/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('The default Surface Returns quantity changed from 4 to 3. Apply the updated contract revision or keep your current contract?');
  await dialog.screenshot({ path: testInfo.outputPath('surface-returns-revision-prompt.png') });
  await dialog.getByRole('button', { name: 'Keep Current' }).click();
  await expect(page.locator('[data-field-id="p1_36"] input')).toHaveValue('4');
  const saved = await page.evaluate(() => (window as any).contractFixture.saved.at(-1));
  expect(saved.contractRevisionReview.decision).toBe('declined');
  expect(saved.contractTemplateRevisionId).toBe(`bundled:${west}:nc-gunite:r1`);
  await page.getByRole('button', { name: 'Close contract' }).click();
  await page.getByRole('button', { name: /View Contract/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-field-id="p1_36"] input')).toHaveValue('4');
});

test('accepting the West contract revision on one proposal survives declining it on another', async ({ page }) => {
  test.setTimeout(30_000);
  await setup(page, { westContract: true, twoProposals: true });
  await page.getByRole('button', { name: /View Contract/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply Update' }).click();
  await expect(page.locator('[data-field-id="p1_36"] input')).toHaveValue('3');
  await page.getByRole('button', { name: 'Close contract' }).click();

  await page.getByRole('button', { name: 'Go to second proposal' }).click();
  await expect(page.getByTestId('fixture-route')).toHaveText(`/proposal/view/${proposalNumber}-B`);
  await expect(page.getByRole('button', { name: /View Contract/ })).toBeVisible();
  await page.getByRole('button', { name: /View Contract/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep Current' }).click();
  await expect(page.locator('[data-field-id="p1_36"] input')).toHaveValue('4');
  // Route changes can arrive while a contract preview is still mounted.
  await page.evaluate((number) => (window as any).contractFixture.navigateTo(number), proposalNumber);
  await expect(page.getByTestId('fixture-route')).toHaveText(`/proposal/view/${proposalNumber}`);
  await expect(page.getByRole('button', { name: /View Contract/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close contract' })).toHaveCount(0);
  await page.getByRole('button', { name: /View Contract/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-field-id="p1_36"] input')).toHaveValue('3');
  await page.getByRole('button', { name: 'Close contract' }).click();
  await page.getByRole('button', { name: 'Go to second proposal' }).click();
  await page.getByRole('button', { name: /View Contract/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-field-id="p1_36"] input')).toHaveValue('4');
  await page.getByRole('button', { name: 'Close contract' }).click();
  await page.getByRole('button', { name: 'Go to test summary' }).click();
  await page.getByRole('button', { name: /View Contract/ }).click();
  await expect(page.locator('[data-field-id="p1_36"] input')).toHaveValue('3');
  const decisions = await page.evaluate(() => [...(window as any).contractFixture.storedProposals.values()].map((item: any) => ({
    number: item.proposalNumber,
    revision: item.contractTemplateRevisionId,
    decision: item.contractRevisionReview?.decision,
  })));
  expect(decisions).toEqual(expect.arrayContaining([
    { number: proposalNumber, revision: 'west-nc-gunite-r2', decision: 'upgraded' },
    { number: `${proposalNumber}-B`, revision: `bundled:${west}:nc-gunite:r1`, decision: 'declined' },
  ]));
});

test('West designer sees every change since an older saved fiberglass revision', async ({ page }) => {
  await setup(page, { westContract: true, oldFiberglass: true });
  await page.getByRole('button', { name: /View Contract/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('The fiberglass contract payment schedule wording changed on pages 1 and 5.');
  await expect(dialog).toContainText('The default Surface Returns quantity changed from 4 to 3.');
});

for (const manualReturns of [false, true]) {
  test(`West designer can apply the 3-return revision${manualReturns ? ' and retain a saved manual quantity' : ''}`, async ({ page }) => {
    await setup(page, { westContract: true, manualReturns });
    await page.getByRole('button', { name: /View Contract/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply Update' }).click();
    await expect(page.locator('[data-field-id="p1_36"] input')).toHaveValue(manualReturns ? '5' : '3');
    const saved = await page.evaluate(() => (window as any).contractFixture.saved.at(-1));
    expect(saved.contractTemplateRevisionId).toBe('west-nc-gunite-r2');
    expect(saved.contractRevisionReview.decision).toBe('upgraded');
    expect(saved.contractOverrides?.p1_36).toBe(manualReturns ? '5' : undefined);
  });
}

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
  expect(result.changed.check.pinned.contractTemplate.id).toBe('west-nc-gunite');
  expect(result.changed.check.latest.contractTemplate.id).toBe('west-nc-fiberglass');
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
