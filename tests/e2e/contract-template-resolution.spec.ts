import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getBundledContractTemplateRevision } from '../../src/services/contractTemplates';
import { withWestConstructionTiming } from '../../src/services/westContractConstructionTiming';

const fixtureOrigin = process.env.SUBMERGE_TEST_ORIGIN || 'http://127.0.0.1:5173';
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

async function setup(page: Page, options: { viewerRole?: 'admin' | 'owner' | 'bookkeeper' | 'designer' | 'master'; ownsProposal?: boolean; newerPricing?: boolean; edit?: boolean; delayPricing?: boolean; lawrence?: boolean; westContract?: boolean; manualReturns?: boolean; oldFiberglass?: boolean; twoProposals?: boolean; futureWestRevision?: boolean; offContract?: boolean; signed?: boolean; submitted?: boolean; orderPackageId?: string; multiVersionSubmittedOffContract?: boolean; newTreeTimingRevision?: boolean; retailDraft?: string } = {}) {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(({ west, model, revision, proposalNumber, edit, lawrence, westContract, manualReturns, oldFiberglass, twoProposals, offContract, signed, submitted, orderPackageId, multiVersionSubmittedOffContract, viewerRole, ownsProposal, retailDraft }) => {
    window.__APP_ENV__ = {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'playwright-public-placeholder', VITE_SUPABASE_ONLY: 'false',
    };
    localStorage.setItem('submerge-user-session', JSON.stringify({
      userId: 'playwright-master', userName: 'Playwright Master',
      userEmail: 'master@playwright.invalid', franchiseId: lawrence || westContract ? west : 'default', role: viewerRole || (lawrence || westContract ? 'designer' : 'master'), franchiseCode: lawrence || westContract ? '5555' : undefined,
    }));
    (window as any).contractFixture = {
      edit, retailDraft,
      multiVersionSubmittedOffContract,
      secondProposalNumber: twoProposals ? `${proposalNumber}-B` : undefined,
      proposal: {
        proposalNumber, franchiseId: lawrence || westContract ? west : 'default', designerAuthUserId: ownsProposal === false ? 'original-designer' : 'playwright-master',
        designerName: ownsProposal === false ? 'Original Designer' : 'Playwright Master', designerRole: lawrence || westContract ? 'designer' : 'master', status: signed ? 'signed' : submitted ? 'needs_approval' : 'draft',
        ...(signed ? { versionLocked: true, versionLockedAt: '2026-09-20T00:00:00.000Z', versionSubmittedAt: '2026-09-20T00:00:00.000Z', workflow: { status: 'signed', signedVersionId: 'original', signedAt: '2026-09-20T00:00:00.000Z' } } : {}),
        ...(submitted ? { versionSubmittedAt: '2026-09-20T00:00:00.000Z', workflow: {
          status: 'needs_approval', reviewVersionId: 'original', submittedVersionId: 'original',
          submittedAt: '2026-09-20T00:00:00.000Z', history: [{ id: 'submitted-original', type: 'submitted', versionId: 'original', createdAt: '2026-09-20T00:00:00.000Z' }],
        } } : {}),
        pricingModelId: model, pricingModelName: 'Sizzlin Summer 2026',
        pricingModelFranchiseId: west, pricingModelRevisionId: revision, pricingModelRevisionNumber: 1,
        ...(orderPackageId ? { equipment: { packageSelectionId: orderPackageId, packageSelectionTouched: true } } : {}),
        customerInfo: { customerName: lawrence ? 'State Change Regression' : 'CONTRACT TEST', state: lawrence ? 'SC' : 'NC', city: 'Charlotte' },
        ...(oldFiberglass ? { poolSpecs: { poolType: 'fiberglass' } } : {}),
        ...(lawrence || westContract ? {
          contractTemplateId: `bundled:${west}:nc-${oldFiberglass ? 'fiberglass' : 'gunite'}`,
          contractTemplateRevisionId: `bundled:${west}:nc-${oldFiberglass ? 'fiberglass' : 'gunite'}:r1`,
        } : {}),
        ...(manualReturns ? { contractOverrides: { p1_36: '5' } } : {}),
        ...(offContract ? {
          excavation: { customOptions: [{ name: 'Separate excavation', description: 'Addendum only', laborCost: 0, materialCost: 0, totalCost: 1000, isOffContract: true }] },
          pricing: { retailPrice: 100000, totalCOGS: 60000, offContractTotal: 1000, manualAdjustmentsTotal: 1000 },
          totalCost: 100000,
          contractOverrides: { p1_7: '$100,000.00', p1_pay_excavation: '$29,000.00' },
        } : {}),
        createdDate: lawrence || westContract ? '2026-09-10T12:00:00.000Z' : '2026-09-23T00:00:00.000Z',
        lastModified: '2026-09-10T12:00:00.000Z',
        versionId: 'original', activeVersionId: 'original', isOriginalVersion: true,
      },
    };
  }, { west, model, revision, proposalNumber, retailDraft: options.retailDraft, viewerRole: options.viewerRole, ownsProposal: options.ownsProposal, edit: options.edit || false, lawrence: options.lawrence || false, westContract: options.westContract || false, manualReturns: options.manualReturns || false, oldFiberglass: options.oldFiberglass || false, twoProposals: options.twoProposals || false, offContract: options.offContract || false, signed: options.signed || false, submitted: options.submitted || false, orderPackageId: options.orderPackageId, multiVersionSubmittedOffContract: options.multiVersionSubmittedOffContract || false });

  let releasePricing = () => {};
  const pricingGate = options.delayPricing ? new Promise<void>((resolve) => { releasePricing = resolve; }) : Promise.resolve();
  let pricingRequests = 0;
  const templates = options.futureWestRevision
    ? westTemplates.map((row) => row.id === 'west-nc-gunite' ? { ...row, current_revision_id: 'west-nc-gunite-r3' } : row)
    : westTemplates;
  let revisions = options.futureWestRevision
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
  if (options.newTreeTimingRevision) {
    revisions = [...revisions, ...westTypes.map(([id, , , latest]) => {
      const base = westRevisions.find((row) => row.id === `west-${id}-r${latest}`)!;
      const template = withWestConstructionTiming(getBundledContractTemplateRevision(id)!.contractTemplate, id);
      return { ...base, id: `west-${id}-r${latest + 1}`, revision_number: latest + 1,
        field_layout_json: template.fields,
        autofill_rules_json: { ...base.autofill_rules_json, legacyBundledId: undefined,
          newProposalTreesOnly: true, westConstructionTimingVersion: 'permit-and-dig-v1',
          effectivePublishedAt: null, staticPatches: template.staticPatches,
          changeNotes: ['Construction timing changed for new proposal trees only.'] },
        published_at: '2026-10-13T00:00:00.000Z' };
    })];
  }
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
      id: model, franchise_id: west, name: 'Sizzlin Summer 2026', current_revision_id: options.newerPricing ? 'playwright-summer-r2' : revision,
      version: 'v1', is_default: true, pricing_json: {},
    }];
    if (table === 'franchise_pricing_model_revisions') {
      pricingRequests += 1;
      await pricingGate;
      rows = [{ id: revision, pricing_model_id: model, franchise_id: west, revision_number: 1, pricing_json: {} },
        ...(options.newerPricing ? [{ id: 'playwright-summer-r2', pricing_model_id: model, franchise_id: west, revision_number: 2, pricing_json: { overheadMultiplier: 1.5 } }] : [])];
      const requestedRevision = url.searchParams.get('id');
      if (requestedRevision) rows = rows.filter((row) => requestedRevision === 'eq.' + row.id);
    }
    // Read the local proposal through the fixture's IPC adapter. Writes stay intercepted.
    if ((table === 'franchise_proposals' || table === 'master_dev_proposals') &&
        route.request().method() === 'GET' && options.ownsProposal === false) {
      const stored = await page.evaluate(() => {
        const fixture = (window as any).contractFixture;
        return fixture.storedProposals?.get(fixture.proposal.proposalNumber) || fixture.proposal;
      });
      rows = [{ proposal_json: stored, franchise_id: stored.franchiseId,
        designer_auth_user_id: stored.designerAuthUserId, designer_name: stored.designerName,
        designer_role: stored.designerRole, status: stored.status }];
    }
    if (table === 'franchise_proposals' && route.request().method() !== 'GET') {
      const data = route.request().postDataJSON();
      rows = [Array.isArray(data) ? data[0] : data];
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? rows[0] || null : rows) });
  });
  await page.goto(fixtureUrl);
  return { errors, releasePricing, pricingRequests: () => pricingRequests };
}

for (const baseline of ['current', 'historical']) {
  test(`retail draft updates live and only persists on Save Changes (${baseline})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1500, height: 1100 });
    await setup(page, { retailDraft: baseline });
    const open = async () => {
      await page.locator('.tile-title').filter({ hasText: /Customer Cost/ }).first().click();
      await expect(page.locator('.adjustment-cost-input').first()).toBeVisible();
    };
    await open();
    const stored = () => page.evaluate(() => JSON.stringify([...((window as any).contractFixture.storedProposals).entries()]));
    const initialStored = await stored();
    const saveCount = await page.evaluate(() => (window as any).contractFixture.saved.length);
    const total = page.locator('.cost-breakdown-container .subtotal-row span').last();
    const margin = page.locator('.cost-breakdown-container .proposal-gp-indicator');
    const initialTotal = await total.innerText();
    const initialMargin = await margin.innerText();
    const amount = page.locator('.adjustment-cost-input').first();
    for (const adjustment of [-1250.25, 2000.50, 0]) {
      const expected = await page.evaluate((value) => {
        const draft = (window as any).contractFixture.expectedRetailDraft(value);
        return { total: draft.pricing.retailPrice, margin: draft.pricing.grossProfitMargin };
      }, adjustment);
      await amount.fill(adjustment === 0 ? '' : String(adjustment));
      await expect(amount).toBeFocused();
      await expect(total).toHaveText(`$${expected.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      const sign = expected.margin < 0 ? '-' : '';
      await expect(margin).toHaveText(`Proposal #26${sign}${Math.abs(expected.margin).toFixed(2).padStart(5, '0')}`);
      expect(await stored()).toBe(initialStored);
      expect(await page.evaluate(() => (window as any).contractFixture.saved.length)).toBe(saveCount);
    }
    await amount.fill('-1250.25');
    await expect(total).not.toHaveText(initialTotal);
    await expect(margin).not.toHaveText(initialMargin);
    await page.evaluate(() => {
      (window as any).contractFixture.pdfExports = 0;
      (window as any).electron.exportBreakdownPdf = async () => {
        (window as any).contractFixture.pdfExports += 1;
        return { canceled: true };
      };
    });
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('option', { name: 'PDF', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).contractFixture.pdfExports)).toBe(1);
    expect(await stored()).toBe(initialStored);
    expect(await page.evaluate(() => (window as any).contractFixture.saved.length)).toBe(saveCount);
    await expect(page.getByRole('button', { name: 'Save Changes', exact: true })).toBeEnabled();
    await page.locator('.cost-summary-section').screenshot({ path: testInfo.outputPath(`live-retail-${baseline}.png`) });
    await page.getByRole('button', { name: /Close customer cost/ }).click();
    await page.getByRole('button', { name: 'No, discard', exact: true }).click();
    expect(await stored()).toBe(initialStored);
    await open();
    await expect(total).toHaveText(initialTotal);
    await expect(margin).toHaveText(initialMargin);
    await amount.fill('-1250.25');
    const previewTotal = await total.innerText();
    const previewMargin = await margin.innerText();
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).contractFixture.saved.length)).toBeGreaterThan(saveCount);
    await expect(total).toHaveText(previewTotal);
    await expect(margin).toHaveText(previewMargin);
    await page.getByRole('button', { name: /Close customer cost/ }).click();
    await open();
    await expect(amount).toHaveValue('-1250.25');
    await expect(total).toHaveText(previewTotal);
    await expect(margin).toHaveText(previewMargin);
  });
}

test('retail preview retains signed version locks', async ({ page }) => {
  await setup(page, { retailDraft: 'current', signed: true });
  await page.locator('.tile-title').filter({ hasText: /Customer Cost/ }).first().click();
  await expect(page.getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled();
  await expect(page.locator('.adjustment-cost-input')).toHaveCount(0);
});

test('Additional digging matches proposal, pricing and all 5555/9724 contract PDFs', async ({ page }) => {
  await setup(page);
  const results = await page.evaluate(() => (window as any).contractFixture.diggingChecks());
  expect(results).toHaveLength(8);
  for (const result of results) {
    expect(result.zeroPriceChange).toBe(0);
    expect(result.field).toBe('3');
    expect(result.pdfField).toBe('3');
    expect(result.charge.quantity).toBe(2);
    expect(result.charge.unitPrice).toBe(350);
    expect(result.charge.total).toBe(700);
    expect(result.impact).toBeCloseTo(700, 2);
    expect(result.manual.hasAdditionalDigging).toBe(true);
    expect(result.manual.additionalDiggingDays).toBe(3);
    expect(result.manualOverrides.p1_7).toBe('$123');
    expect(result.signedUnchanged).toBe(true);
    expect(result.baseUnchanged).toBe(true);
  }
});

test('saving manual contract excavation days updates the proposal and survives reopening', async ({ page }) => {
  await setup(page, { westContract: true });
  await page.getByRole('button', { name: /View Contract/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep Current', exact: true }).click();
  const input = page.locator('[data-field-id="p1_30"] input');
  await expect(input).toHaveValue('1');
  const saveCount = await page.evaluate(() => (window as any).contractFixture.saved.length);
  await input.fill('1.5');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page.getByText('Excavation days must be a whole number of at least 1.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).contractFixture.saved.length)).toBe(saveCount);
  await input.fill('4');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).contractFixture.saved.at(-1)?.excavation?.additionalDiggingDays)).toBe(3);
  const saved = await page.evaluate(() => (window as any).contractFixture.saved.at(-1));
  expect(saved.excavation.hasAdditionalDigging).toBe(true);
  expect(saved.contractOverrides.p1_30).toBeUndefined();
  await expect(input).toHaveValue('4');
  await page.getByRole('button', { name: 'Close contract' }).click();
  await page.getByRole('button', { name: /View Contract/ }).click();
  await expect(input).toHaveValue('4');
  await input.fill('1');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).contractFixture.saved.at(-1)?.excavation?.hasAdditionalDigging)).toBe(false);
  expect((await page.evaluate(() => (window as any).contractFixture.saved.at(-1))).excavation.additionalDiggingDays).toBe(1);
  await page.getByRole('button', { name: 'Close contract' }).click();
  await page.evaluate((number) => (window as any).contractFixture.navigateToEditor(number), proposalNumber);
  await page.locator('.nav-item.excavation-item').click();
  const row = page.locator('.excavation-option-row').filter({ hasText: 'Additional Digging (Days)' });
  await expect(row.getByRole('switch')).not.toBeChecked();
  await row.getByRole('switch').click();
  await row.getByRole('spinbutton', { name: 'Additional Digging (Days)' }).fill('2');
  await page.getByRole('button', { name: 'Proposal Summary', exact: true }).click();
  await expect(page.getByRole('button', { name: /View Contract/ })).toBeVisible();
  await page.getByRole('button', { name: /View Contract/ }).click();
  await expect(input).toHaveValue('3');
});

for (const viewerRole of ['admin', 'owner', 'bookkeeper', 'master'] as const) {
  test(`${viewerRole} reviewing another designer's proposal keeps saved revisions without prompting or saving`, async ({ page }, testInfo) => {
    await setup(page, { westContract: true, submitted: true, viewerRole, ownsProposal: false, newerPricing: true });
    await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const cachedBefore = await page.evaluate(() => (window as any).contractFixture.saved.length);
    await page.getByRole('button', { name: /View Contract/ }).click();
    await expect(page.getByRole('button', { name: 'Close contract' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.contract-page-canvas').first()).toBeVisible();
    const result = await page.evaluate(async () => {
      const fixture = (window as any).contractFixture;
      return { saved: fixture.saved, meta: fixture.pricingMeta(), contract: await fixture.returnValues() };
    });
    expect(result.saved).toHaveLength(cachedBefore);
    for (const cached of result.saved) {
      expect(cached.pricingModelRevisionId).toBe(revision);
      expect(cached.contractTemplateRevisionId).toBe(`bundled:${west}:nc-gunite:r1`);
      expect(cached.pricingRevisionReview).toBeFalsy();
      expect(cached.contractRevisionReview).toBeFalsy();
    }
    expect(result.meta.pricingModelRevisionId).toBe(revision);
    expect(result.contract.pinned).toBe('4');
    expect(result.contract.latest).toBe('3');
    if (viewerRole === 'admin') await page.screenshot({ path: testInfo.outputPath('admin-saved-contract.png') });
  });
}

test('admin still receives pricing revision choices on their own proposal', async ({ page }) => {
  await setup(page, { westContract: true, viewerRole: 'admin', newerPricing: true });
  await expect(page.getByRole('button', { name: 'Compare Difference' })).toBeVisible();
});

test('admin can choose a contract update on their own proposal', async ({ page }) => {
  await setup(page, { westContract: true, viewerRole: 'admin' });
  await page.getByRole('button', { name: /View Contract/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply Update' }).click();
  await expect(page.getByRole('button', { name: 'Close contract' })).toBeVisible();
  const saved = await page.evaluate(() => (window as any).contractFixture.saved.at(-1));
  expect(saved.contractTemplateRevisionId).toBe('west-nc-gunite-r2');
  expect(saved.pricingModelRevisionId).toBe(revision);
});

test('foreign proposal builder does not offer a previously declined pricing upgrade', async ({ page }) => {
  await setup(page, { westContract: true, submitted: true, viewerRole: 'admin', ownsProposal: false, newerPricing: true });
  await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
  await page.evaluate((number) => {
    const fixture = (window as any).contractFixture;
    fixture.storedProposals.get(number).pricingRevisionReview = {
      decision: 'declined', latestRevisionId: 'playwright-summer-r2',
      pricingModelId: fixture.proposal.pricingModelId,
      baselineRevisionId: fixture.proposal.pricingModelRevisionId,
    };
    fixture.navigateToEditor(number);
  }, proposalNumber);
  await expect(page.getByRole('combobox', { name: /^Pricing Model/ })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: /^Pricing Tier/ })).toBeDisabled();
  await expect(page.locator('.form-header-pricing-upgrade-actions')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).contractFixture.pricingMeta().pricingModelRevisionId)).toBe(revision);
});

for (const selectedRevision of ['west-nc-gunite-r2', undefined]) {
  test(`admin opening a foreign contract preserves ${selectedRevision || 'the unpinned historical template'} without saving`, async ({ page }) => {
    await setup(page, { westContract: true, submitted: true, viewerRole: 'admin', ownsProposal: false });
    await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
    await page.evaluate(({ number, selectedRevision }) => {
      const fixture = (window as any).contractFixture;
      const stored = fixture.storedProposals.get(number);
      stored.contractTemplateRevisionId = selectedRevision;
      fixture.remountSummary();
    }, { number: proposalNumber, selectedRevision });
    await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
    const cachedBefore = await page.evaluate(() => (window as any).contractFixture.saved.length);
    await page.getByRole('button', { name: /View Contract/ }).click();
    await expect(page.getByRole('button', { name: 'Close contract' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const result = await page.evaluate((number) => {
      const fixture = (window as any).contractFixture;
      return { saved: fixture.saved, stored: fixture.storedProposals.get(number) };
    }, proposalNumber);
    expect(result.saved).toHaveLength(cachedBefore);
    expect(result.stored.contractTemplateRevisionId).toBe(selectedRevision);
    expect(result.stored.pricingModelRevisionId).toBe(revision);
  });
}

for (const [orderPackageId, shortName] of [
  ['pmf03-standard-automation', 'PMF03'],
  ['pfm01-basic-chlorine', 'PFM01'],
  ['custom', 'Custom'],
] as const) {
  test(`Materials order tile shows ${shortName} without item groups`, async ({ page }) => {
    await setup(page, { orderPackageId });
    const tile = page.locator('.summary-tile.materials-order-tile');
    await expect(tile).toBeVisible();
    await expect(tile.locator('.metric-row')).toHaveCount(1);
    await expect(tile.locator('.metric-label')).toHaveText('Equipment Package:');
    await expect(tile.locator('.metric-value')).toHaveText(shortName);
    await expect(tile).not.toContainText('Item Groups');
  });
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

test('Off Contract total correction requires consent and preserves the saved contract version', async ({ page }, testInfo) => {
  await setup(page, { westContract: true, offContract: true });
  const prompt = page.getByRole('dialog', {
    name: 'Contract Total has been updated to remove Off-Contract items. Would you like to apply these changes?',
  });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('$100,000.00');
  await expect(prompt).toContainText('$99,000.00');
  await page.getByRole('button', { name: 'Go to test summary' }).evaluate((button) => {
    (button as HTMLElement).style.display = 'none';
  });
  await page.screenshot({ path: testInfo.outputPath('off-contract-consent.png') });
  await prompt.getByRole('button', { name: 'Not now' }).click();
  await expect(prompt).not.toBeVisible();
  const before = await page.evaluate((number) => (window as any).contractFixture.storedProposals.get(number), proposalNumber);
  expect(before.pricing.retailPrice).toBe(100000);
  expect(before.pricing.totalCOGS).toBe(60000);
  expect(before.versions).toEqual([]);
});

test('accepting the Off Contract correction updates the current draft version', async ({ page }) => {
  await setup(page, { westContract: true, offContract: true });
  const prompt = page.getByRole('dialog', {
    name: 'Contract Total has been updated to remove Off-Contract items. Would you like to apply these changes?',
  });
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Update this version' }).click();
  await expect(prompt).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Contract Retail Price:/ })).toContainText('$99,000.00');
  const after = await page.evaluate((number) => (window as any).contractFixture.storedProposals.get(number), proposalNumber);
  expect(after.pricing.retailPrice).toBe(99000);
  expect(after.totalCost).toBe(99000);
  expect(after.pricing.offContractTotal).toBe(1000);
  expect(after.pricing.offContractSeparated).toBe(true);
  expect(after.pricing.totalCOGS).toBe(60000);
  expect(after.contractOverrides.p1_7).toBeUndefined();
  expect(after.contractOverrides.p1_pay_excavation).toBeUndefined();
  expect(after.versionId).toBe('original');
  expect(after.status).toBe('draft');
  expect(after.versions).toEqual([]);
});

for (const status of ['draft', 'submitted', 'signed'] as const) {
  test(`declining Off Contract correction stays declined after remount and reload for ${status}`, async ({ page }, testInfo) => {
    // Reload recreates synthetic records; keep their workflow normalization timestamps stable.
    await page.clock.setFixedTime(new Date('2026-10-01T12:00:00.000Z'));
    await setup(page, { westContract: true, offContract: true, twoProposals: true,
      submitted: status === 'submitted', signed: status === 'signed' });
    const prompt = page.getByRole('dialog', {
      name: 'Contract Total has been updated to remove Off-Contract items. Would you like to apply these changes?',
    });
    await expect(prompt).toBeVisible();
    const before = await page.evaluate((number) => (window as any).contractFixture.storedProposals.get(number), proposalNumber);
    await prompt.getByRole('button', { name: 'Not now' }).click();
    await expect(prompt).not.toBeVisible();

    // A background remount can occur without the designer navigating anywhere.
    await page.evaluate(() => (window as any).contractFixture.remountSummary());
    await expect(page.getByTestId('fixture-route')).toHaveText(`/proposal/view/${proposalNumber}`);
    await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
    await expect(prompt).not.toBeVisible();
    expect(await page.evaluate((number) => (window as any).contractFixture.storedProposals.get(number), proposalNumber)).toEqual(before);

    // Reproduce the old edit -> summary redirect. The builder save guard remains intact.
    if (status === 'draft' || status === 'submitted') {
      await page.evaluate((number) => (window as any).contractFixture.navigateToEditor(number), proposalNumber);
      await expect(page.getByTestId('fixture-route')).toHaveText(`/proposal/view/${proposalNumber}`);
      await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
      await expect(prompt).not.toBeVisible();
      await page.getByRole('button', { name: 'Open Read-Only Builder', exact: true }).click();
      await expect(page.getByTestId('fixture-route')).toHaveText(`/proposal/edit/${proposalNumber}`);
      await expect(page.getByRole('group', { name: 'Read-only proposal builder' }).getByRole('textbox', { name: 'Enter customer name' })).toBeDisabled();
      await expect(page.locator('.proposal-builder-readonly-note')).toContainText('preserves the saved contract total');
      await page.getByRole('button', { name: 'Go to test summary' }).click();
      await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
      await expect(prompt).not.toBeVisible();
    }

    // A decline is scoped to one proposal/version, not all of the designer's proposals.
    await page.getByRole('button', { name: 'Go to second proposal' }).click();
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Not now' }).click();
    await page.getByRole('button', { name: 'Go to test summary' }).click();
    await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
    await expect(prompt).not.toBeVisible();
    expect(await page.evaluate((number) => (window as any).contractFixture.storedProposals.get(number), proposalNumber)).toEqual(before);

    await page.reload();
    await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
    await expect(prompt).not.toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`off-contract-declined-${status}.png`) });
    expect(await page.evaluate((number) => (window as any).contractFixture.storedProposals.get(number), proposalNumber)).toEqual(before);
    await page.getByRole('button', { name: 'Review Contract Total Correction', exact: true }).click();
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('$100,000.00');
    await expect(prompt).toContainText('$99,000.00');
    await prompt.getByRole('button', { name: 'Not now' }).click();
    await expect(prompt).not.toBeVisible();
    expect(await page.evaluate((number) => (window as any).contractFixture.storedProposals.get(number), proposalNumber)).toEqual(before);
    if (status === 'draft') {
      await page.getByRole('button', { name: 'Review Contract Total Correction', exact: true }).click();
      await prompt.getByRole('button', { name: 'Update this version' }).click();
      await expect(prompt).not.toBeVisible();
      await expect(page.getByRole('button', { name: /Contract Retail Price:/ })).toContainText('$99,000.00');
      await expect(page.getByRole('button', { name: 'Edit Proposal', exact: true })).toBeVisible();
    }
  });
}

test('Off Contract decline survives route remount when local storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key.startsWith('submerge.offContractReview.declined.')) throw new Error('Storage unavailable');
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('submerge.offContractReview.declined.')) throw new Error('Storage unavailable');
      return setItem.call(this, key, value);
    };
  });
  await setup(page, { westContract: true, offContract: true });
  const prompt = page.getByRole('dialog', {
    name: 'Contract Total has been updated to remove Off-Contract items. Would you like to apply these changes?',
  });
  await expect(prompt).toBeVisible();
  const before = await page.evaluate((number) => (window as any).contractFixture.storedProposals.get(number), proposalNumber);
  await prompt.getByRole('button', { name: 'Not now' }).click();
  await page.getByRole('button', { name: 'Open Read-Only Builder', exact: true }).click();
  await expect(page.locator('.proposal-builder-readonly-note')).toBeVisible();
  await page.getByRole('button', { name: 'Go to test summary' }).click();
  await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
  await expect(prompt).not.toBeVisible();
  expect(await page.evaluate((number) => (window as any).contractFixture.storedProposals.get(number), proposalNumber)).toEqual(before);
});

test('submitted West Off Contract decking decline preserves all seven versions and approval state', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00.000Z'));
  await setup(page, { westContract: true, offContract: true, submitted: true, multiVersionSubmittedOffContract: true });
  const prompt = page.getByRole('dialog', {
    name: 'Contract Total has been updated to remove Off-Contract items. Would you like to apply these changes?',
  });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('$130,000.00');
  await expect(prompt).toContainText('$112,925.80');
  const before = await page.evaluate((number) => (window as any).contractFixture.storedProposals.get(number), proposalNumber);
  expect(before.workflow.reviewVersionId).toBe('submitted-decking');
  expect(before.versions).toHaveLength(6);
  const savesBeforeDecline = await page.evaluate(() => (window as any).contractFixture.saved.length);
  await prompt.getByRole('button', { name: 'Not now' }).click();
  await expect(prompt).not.toBeVisible();
  expect(await page.evaluate(() => (window as any).contractFixture.saved.length)).toBe(savesBeforeDecline);
  await page.evaluate(() => (window as any).contractFixture.remountSummary());
  await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
  await expect(prompt).not.toBeVisible();
  expect(await page.evaluate((number) => (window as any).contractFixture.storedProposals.get(number), proposalNumber)).toEqual(before);
  await page.evaluate(() => (window as any).contractFixture.selectVersion('sibling-1'));
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('$131,958.20');
  await prompt.getByRole('button', { name: 'Not now' }).click();
  await page.evaluate(() => (window as any).contractFixture.selectVersion('submitted-decking'));
  await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
  await expect(prompt).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('submitted-west-seven-versions-declined.png') });
  expect(await page.evaluate((number) => (window as any).contractFixture.storedProposals.get(number), proposalNumber)).toEqual(before);
});

test('accepting the Off Contract correction returns the submitted version to draft for resubmission', async ({ page }) => {
  await setup(page, { westContract: true, offContract: true, submitted: true });
  const prompt = page.getByRole('dialog', {
    name: 'Contract Total has been updated to remove Off-Contract items. Would you like to apply these changes?',
  });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('must be resubmitted for approval');
  await prompt.getByRole('button', { name: 'Update this version' }).click();
  await expect(prompt).not.toBeVisible();
  const after = await page.evaluate((number) => (window as any).contractFixture.storedProposals.get(number), proposalNumber);
  expect(after.versionId).toBe('original');
  expect(after.versions).toEqual([]);
  expect(after.pricing.retailPrice).toBe(99000);
  expect(after.pricing.totalCOGS).toBe(60000);
  expect(after.status).toBe('draft');
  expect(after.workflow.status).toBe('draft');
  expect(after.workflow.reviewVersionId).toBeNull();
  expect(after.versionSubmittedAt).toBeNull();
  expect(after.workflow.history.some((entry: any) => entry.type === 'submitted')).toBe(true);
});

test('signed Off Contract contract remains frozen while correction creates an addendum draft', async ({ page }) => {
  await setup(page, { westContract: true, offContract: true, signed: true });
  const prompt = page.getByRole('dialog', {
    name: 'Contract Total has been updated to remove Off-Contract items. Would you like to apply these changes?',
  });
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Create addendum draft' }).click();
  await expect(prompt).not.toBeVisible();
  const after = await page.evaluate((number) => (window as any).contractFixture.storedProposals.get(number), proposalNumber);
  expect(after.workflow.signedVersionId).toBe('original');
  expect(after.workflow.status).toBe('signed');
  expect(after.pricing.retailPrice).toBe(99000);
  expect(after.versionName).toBe('Proposal Addendum 1');
  const signed = after.versions.find((entry: any) => entry.versionId === 'original');
  expect(signed.status).toBe('signed');
  expect(signed.versionLocked).toBe(true);
  expect(signed.pricing.retailPrice).toBe(100000);
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

for (const [id, state, poolType, latest] of westTypes) {
  test(`West construction timing: ${id} preserves autofill and every pixel outside the two lines`, async ({ page }, testInfo) => {
    await setup(page, { newTreeTimingRevision: true });
    // Summary loading selects the pricing snapshot shared by the generator.
    await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
    const result = await page.evaluate(({ state, poolType }) => (window as any).contractFixture.timingChecks({
      createdDate: '2026-10-13T12:00:00.000Z',
      contractTemplateRevisionId: undefined,
      westConstructionTimingVersion: 'permit-and-dig-v1',
      customerInfo: { customerName: 'TIMING EXPORT TEST', state, city: 'Charlotte', address: '123 Test Street' },
      poolSpecs: { poolType, surfaceArea: 500, perimeter: 100, maxLength: 25, maxWidth: 20, shallowDepth: 3, endDepth: 6 },
      contractOverrides: { p1_8: '10/18/2026', p1_9: '4/18/2027', p1_36: '5', p1_pay_excavation: '$25,000.00' },
    }, true), { state, poolType });
    expect(result.dateFields).toEqual([]);
    expect(result.editableDateFieldNames).toEqual([]);
    expect(result.requiresReview).toBe(false);
    expect(result.revisionId).toBe(`west-${id}-r${latest + 1}`);
    expect(result.otherFieldDifferences).toEqual([]);
    expect(result.flattenedFields).toBe(0);
    expect(result.pageCount).toBe(6);
    expect(result.changedPixelsOutsideTiming).toBe(0);
    expect(result.changedPixelsInsideTiming).toBeGreaterThan(0);
    expect(result.text).toContain('Construction to substantially commence approximately 2-4 weeks after the permit is issued and full HOA approval.');
    expect(result.text).toContain('Construction to be substantially complete approximately 8-12 weeks from the dig date.');
    expect(result.versions).toEqual([
      { mode: 'scratch', marker: 'permit-and-dig-v1', dateFieldCount: 0 },
      { mode: 'copy', marker: 'permit-and-dig-v1', dateFieldCount: 0 },
    ]);
    const screenshotPath = testInfo.outputPath(`${id}-construction-timing.png`);
    writeFileSync(screenshotPath, Buffer.from(result.image, 'base64'));
    await testInfo.attach('Exported contract page one', { path: screenshotPath, contentType: 'image/png' });
  });
}

test('West construction timing: older trees, signed contracts and new scratch/copy versions keep dates', async ({ page }) => {
  await setup(page, { newTreeTimingRevision: true });
  const results = await page.evaluate(async () => {
    const fixture = (window as any).contractFixture;
    return Promise.all([false, true].map((signed) => fixture.timingChecks({
      createdDate: '2026-09-23T00:00:00.000Z',
      contractTemplateRevisionId: 'west-nc-gunite-r2',
      westConstructionTimingVersion: undefined,
      status: signed ? 'signed' : 'draft', versionLocked: signed,
      contractOverrides: { p1_8: '10/18/2026', p1_9: '4/18/2027' },
    })));
  });
  for (const result of results) {
    expect(result.requiresReview).toBe(false);
    expect(result.patches).toEqual([]);
    expect(result.dateFields.map((field: any) => field.value)).toEqual(['10/18/2026', '4/18/2027']);
    expect(result.versions).toEqual([
      { mode: 'scratch', marker: null, dateFieldCount: 2 },
      { mode: 'copy', marker: null, dateFieldCount: 2 },
    ]);
  }
});

test('West construction timing: East ignores the marker even in a master proposal', async ({ page }) => {
  await setup(page, { newTreeTimingRevision: true });
  const results = await page.evaluate(async (east) => {
    const fixture = (window as any).contractFixture;
    return Promise.all([east, 'default'].map((franchiseId) => fixture.timingChecks({
      franchiseId, pricingModelFranchiseId: east,
      westConstructionTimingVersion: 'permit-and-dig-v1',
    })));
  }, east);
  for (const result of results) {
    expect(result.dateFields).toHaveLength(2);
    expect(result.patches).toEqual([]);
  }
});

test('West construction timing: editor shows plain timing text without date pickers or a revision prompt', async ({ page }, testInfo) => {
  await setup(page, { westContract: true, newTreeTimingRevision: true });
  await page.evaluate(() => {
    const fixture = (window as any).contractFixture;
    const input = fixture.storedProposals.get(fixture.proposal.proposalNumber);
    Object.assign(input, { westConstructionTimingVersion: 'permit-and-dig-v1',
      createdDate: '2026-10-13T12:00:00.000Z', contractTemplateRevisionId: undefined });
    fixture.remountSummary();
  });
  await page.getByRole('button', { name: /View Contract/ }).click();
  await expect(page.locator('[data-field-id="p1_36"] input')).toBeVisible();
  await expect(page.locator('[data-field-id="p1_8"], [data-field-id="p1_9"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Keep Current', exact: true })).toHaveCount(0);
  await page.locator('.contract-page').first().screenshot({ path: testInfo.outputPath('west-timing-editor.png') });
});

test('West construction timing: only starting a new proposal marks the format, and saving preserves it', async ({ page }) => {
  await setup(page, { westContract: true, newTreeTimingRevision: true });
  await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
  await page.evaluate(() => (window as any).contractFixture.navigateToNewProposal());
  await expect(page.locator('.proposal-form')).toBeVisible();
  await expect(page.getByTestId('fixture-route')).toHaveText('/proposal/new');
  await page.getByRole('button', { name: 'Proposal Summary', exact: true }).click();
  await expect.poll(() => page.evaluate((oldNumber) =>
    (window as any).contractFixture.saved.some((entry: any) => entry.proposalNumber !== oldNumber), proposalNumber)).toBe(true);
  const saved = await page.evaluate((oldNumber) =>
    (window as any).contractFixture.saved.findLast((entry: any) => entry.proposalNumber !== oldNumber), proposalNumber);
  expect(saved.westConstructionTimingVersion).toBe('permit-and-dig-v1');
  expect(saved.proposalNumber).not.toBe(proposalNumber);
  await page.evaluate((number) => (window as any).contractFixture.navigateToEditor(number), saved.proposalNumber);
  await expect(page.locator('.proposal-form')).toBeVisible();
  await page.getByRole('button', { name: 'Proposal Summary', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).contractFixture.saved.at(-1)?.westConstructionTimingVersion))
    .toBe('permit-and-dig-v1');
});

test('West construction timing: opening and saving an old proposal never marks it', async ({ page }) => {
  await setup(page, { westContract: true, edit: true, newTreeTimingRevision: true });
  await expect(page.locator('.proposal-form')).toBeVisible();
  await page.getByRole('button', { name: 'Proposal Summary', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).contractFixture.saved.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).contractFixture.saved.at(-1)?.westConstructionTimingVersion)).toBeUndefined();
});

test('West construction timing: an older client and an unmarked future-dated proposal both retain the legacy head', async ({ page }) => {
  await setup(page, { newTreeTimingRevision: true });
  const result = await page.evaluate(async (west) => {
    const check = await (window as any).contractFixture.check({
      createdDate: '2030-01-01T00:00:00.000Z', westConstructionTimingVersion: undefined,
    });
    const catalog = JSON.parse(localStorage.getItem(`submerge-contract-template-catalog-v1:${west}`)!);
    const template = catalog.templates.find((row: any) => row.id === 'west-nc-gunite');
    // Reproduce the older client's original creation-date inference, which
    // knows nothing about the new-proposal-only rule or proposal marker.
    const atCreation = catalog.revisions.filter((row: any) => row.contract_template_id === template.id &&
      Date.parse(row.autofill_rules_json.effectivePublishedAt || '') <= Date.parse('2030-01-01T00:00:00.000Z'))
      .sort((left: any, right: any) => left.revision_number - right.revision_number);
    return { check: check.check, legacyCurrent: template.current_revision_id, legacyInferred: atCreation.at(-1)?.id };
  }, west);
  expect(result.check.pinned.revisionId).toBe('west-nc-gunite-r2');
  expect(result.check.latest.revisionId).toBe('west-nc-gunite-r2');
  expect(result.check.requiresReview).toBe(false);
  expect(result.check.changeNotes).toEqual([]);
  expect(result.legacyCurrent).toBe('west-nc-gunite-r2');
  expect(result.legacyInferred).toBe('west-nc-gunite-r2');
});

test('West construction timing: cached new revisions keep their own fields and text offline', async ({ page }) => {
  await setup(page, { westContract: true, newTreeTimingRevision: true });
  await expect(page.locator('.summary-tile.customer-tile')).toBeVisible();
  await page.evaluate(() => (window as any).contractFixture.prefetchWest());
  const result = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    return (window as any).contractFixture.timingChecks({ westConstructionTimingVersion: 'permit-and-dig-v1',
      createdDate: '2026-10-13T12:00:00.000Z', contractTemplateRevisionId: 'west-nc-gunite-r3' });
  });
  expect(result.revisionId).toBe('west-nc-gunite-r3');
  expect(result.dateFields).toEqual([]);
  expect(result.requiresReview).toBe(false);
  expect(result.patches[0].texts.map((text: any) => text.text)).toEqual([
    'Construction to substantially commence approximately 2-4 weeks after the permit is issued and full HOA approval.',
    'Construction to be substantially complete approximately 8-12 weeks from the dig date.',
  ]);
});
