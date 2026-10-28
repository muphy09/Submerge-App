import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

test('review preserves every untouched section and nested field when only perimeter changes', async ({ page }, testInfo) => {
  await page.addInitScript(() => { window.__APP_ENV__ = { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_SUPABASE_ONLY: 'false' }; });
  await page.goto('http://127.0.0.1:5173/tests/fixtures/proposal-sync-authorization.html');
  await expect(page.getByText('Ready')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { getDefaultProposal } = await import('/src/utils/proposalDefaults.ts');
    const store = await import('/src/services/pricingDataStore.ts');
    const { proposalCacheEnvironment } = await import('/src/services/proposalContext.ts');
    const { prepareContribution, calculateCollaborativeVersion } = await import('/src/services/collaborationPricing.ts');
    const { contributionSections, mergeContribution } = await import('/src/utils/contributionInputs.ts');
    const pricing = store.getPricingDataSnapshot();
    pricing.equipment.pumps = [{ name: 'Pinned pump', model: 'Catalog specification', basePrice: 1730.64, addCost1: 290, addCost2: 90, overheadMultiplier: 0, price: 2310 }];
    const base: any = { ...getDefaultProposal(), proposalNumber: 'PRESERVE', versionId: 'original', franchiseId: 'audit',
      designerAuthUserId: 'owner', ownerAuthUserId: 'owner', collaborationEnabled: true,
      pricingModelId: 'model', pricingModelFranchiseId: 'audit', pricingModelRevisionId: 'pin', contentRevision: 1 };
    base.poolSpecs = { ...base.poolSpecs, perimeter: 20, surfaceArea: 200 };
    base.equipment.pump = { name: 'Pinned pump', model: 'Saved specification', basePrice: 1730.64, addCost1: 290, addCost2: 90, price: 2321.704 };
    base.equipment.filter = { ...base.equipment.filter, price: 642.87, basePrice: 642.87 };
    base.equipment.hasBeenEdited = true;
    // Saved metadata and optional fields must survive even if normalization adds defaults.
    base.excavation.cost = 123;
    base.masonry = { ...base.masonry, totalCost: 44, columnCost: 22 };
    base.notes = 'Keep exactly';
    localStorage.setItem(`submerge.pricingModelSnapshot.${proposalCacheEnvironment()}.audit.model.pin`,
      JSON.stringify({ franchiseId: 'audit', pricingModelId: 'model', revisionId: 'pin', version: 'v1', pricing }));
    const calculated = await calculateCollaborativeVersion(base);
    for (const key of ['pricing','costBreakdown','subtotal','taxRate','taxAmount','totalCost','papDiscounts']) base[key] = (calculated as any)[key];
    const work = structuredClone(base); work.poolSpecs.perimeter = 25;
    // Embedded contributor prices must still never become authoritative.
    work.equipment.pump.basePrice = 999999; work.equipment.hasBeenEdited = false;
    const request: any = { target_version_id: 'original', base_version_json: base, working_version_json: work, updated_at: 'now' };
    const prepared = await prepareContribution(request, base);
    const unchanged = await prepareContribution({ ...request, working_version_json: base }, base);
    const expected = structuredClone(base); expected.poolSpecs.perimeter = 25;
    localStorage.setItem('contribution-review-fixture', JSON.stringify({ baseline: base, work, owner: base }));
    return { before: prepared.before, after: prepared.after, conflicts: prepared.conflicts,
      rawMerged: mergeContribution(base, work, base).proposal,
      sections: contributionSections, expected, unchanged: unchanged.after, base };
  });
  for (const section of result.sections) {
    expect((result.rawMerged as any)[section], `merged ${section}`).toEqual(result.expected[section]);
    expect((result.after as any)[section], `reviewed ${section}`).toEqual(result.expected[section]);
    expect((result.unchanged as any)[section], `no-op ${section}`).toEqual(result.base[section]);
  }
  expect(result.after.totalCost).toBeGreaterThan(result.before.totalCost);
  expect(result.conflicts).toEqual([]);
  await page.goto('http://127.0.0.1:5173/tests/fixtures/contribution-review.html');
  await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review proposed changes' });
  await dialog.getByRole('radio', { name: 'Overwrite current version with these changes' }).check();
  await expect(dialog.getByRole('button', { name: 'Apply Changes' })).toBeEnabled();
  await expect(dialog.locator('tbody tr:not(.collaboration-diff-group)')).toHaveCount(1);
  await expect(dialog.locator('tbody')).toContainText('Perimeter');
  await expect(dialog.locator('tbody')).not.toContainText('Equipment');
  await page.screenshot({ path: testInfo.outputPath('perimeter-only-review.png') });
  await dialog.getByRole('button', { name: 'Apply Changes' }).click();
  const applied = await page.evaluate(() => (window as any).appliedContribution);
  for (const section of result.sections) expect(applied[section], `applied ${section}`).toEqual(result.expected[section]);
});

test('input merge preserves nested owner data, existing array members, deletions and explicit manual prices', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/tests/fixtures/proposal-sync-authorization.html');
  const results = await page.evaluate(async () => {
    const { contributionSections, mergeContribution } = await import('/src/utils/contributionInputs.ts');
    const results: any[] = [];
    for (const section of contributionSections.filter(key => !['notes','warrantySections','retailAdjustments'].includes(key))) {
      const base: any = { [section]: { option: 'original', price: 101, cost: 202, totalCost: 303,
        nested: { quantity: 1, name: 'Same item', basePrice: 404, overheadMultiplier: 1.1 } } };
      const work = structuredClone(base); work[section].nested.quantity = 2;
      const owner = structuredClone(base); owner[section].ownerOnly = 'keep';
      const merged = mergeContribution(base, work, owner).proposal as any;
      const expected = structuredClone(owner); expected[section].nested.quantity = 2;
      results.push({ section, merged, expected });
    }
    const base: any = { equipment: { poolLights: [{ name: 'A', basePrice: 50, price: 60 }], hasBeenEdited: true },
      notes: 'Delete', manualAdjustments: { positive1: 20 }, retailAdjustments: [{ name: 'A', amount: 30 }] };
    const work = structuredClone(base); delete work.notes;
    work.equipment.poolLights.push({ name: 'B', basePrice: 999999, price: 999999 });
    work.manualAdjustments.positive1 = 40;
    return { results, arrays: mergeContribution(base, work, base).proposal };
  });
  for (const item of results.results) expect(item.merged, item.section).toEqual(item.expected);
  expect(results.arrays.equipment.poolLights).toEqual([{ name: 'A', basePrice: 50, price: 60 }, { name: 'B' }]);
  expect(results.arrays.equipment.hasBeenEdited).toBe(true);
  expect(results.arrays.manualAdjustments.positive1).toBe(40);
  expect(results.arrays).not.toHaveProperty('notes');
});

test('real selection changes receive pinned costs while unchanged array entries and owner edits survive', async ({ page }) => {
  await page.addInitScript(() => { window.__APP_ENV__ = { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_SUPABASE_ONLY: 'false' }; });
  await page.goto('http://127.0.0.1:5173/tests/fixtures/proposal-sync-authorization.html');
  const result = await page.evaluate(async () => {
    const { getDefaultProposal } = await import('/src/utils/proposalDefaults.ts');
    const store = await import('/src/services/pricingDataStore.ts');
    const { proposalCacheEnvironment } = await import('/src/services/proposalContext.ts');
    const { prepareContribution, calculateCollaborativeVersion } = await import('/src/services/collaborationPricing.ts');
    const pricing = store.getPricingDataSnapshot();
    pricing.equipment.pumps = [{ name: 'A', basePrice: 100, addCost1: 10 }, { name: 'B', basePrice: 500, addCost1: 20 }];
    pricing.equipment.lights.poolLights = [{ name: 'Light A', type: 'pool', basePrice: 100 }, { name: 'Light B', type: 'pool', basePrice: 200 }];
    pricing.equipment.heaters = [{ name: 'No Heater', basePrice: 0 }, { name: 'Required spa heater', basePrice: 300, btu: 400000 }];
    const base: any = { ...getDefaultProposal(), proposalNumber: 'CATALOG', versionId: 'original', franchiseId: 'audit',
      pricingModelId: 'model', pricingModelFranchiseId: 'audit', pricingModelRevisionId: 'pin', contentRevision: 1 };
    base.poolSpecs = { ...base.poolSpecs, perimeter: 20, surfaceArea: 200 };
    base.equipment.pump = { name: 'A', basePrice: 100, addCost1: 10, price: 121, model: 'Saved A' };
    base.equipment.pumpQuantity = 1;
    base.equipment.poolLights = [{ name: 'Light A', type: 'pool', basePrice: 100, price: 111, savedDetail: 'retain' }];
    base.equipment.includePoolLights = true;
    localStorage.setItem(`submerge.pricingModelSnapshot.${proposalCacheEnvironment()}.audit.model.pin`,
      JSON.stringify({ franchiseId: 'audit', pricingModelId: 'model', revisionId: 'pin', version: 'v1', pricing }));
    const calculated = await calculateCollaborativeVersion(base);
    for (const key of ['pricing','costBreakdown','subtotal','taxRate','taxAmount','totalCost','papDiscounts']) base[key] = (calculated as any)[key];
    const current = structuredClone(base); current.notes = 'Owner edited notes'; current.contentRevision = 2;
    const work = structuredClone(base);
    work.equipment.pump = { name: 'B', basePrice: 999999, price: 999999 };
    work.equipment.poolLights.push({ name: 'Light B', type: 'pool', basePrice: 999999, price: 999999 });
    const request: any = { target_version_id: 'original', base_version_json: base, working_version_json: work, updated_at: 'now' };
    const prepared = await prepareContribution(request, current);
    const spaWork = structuredClone(base); spaWork.poolSpecs.spaType = 'gunite'; spaWork.poolSpecs.spaLength = 5; spaWork.poolSpecs.spaWidth = 5;
    const dependency = await prepareContribution({ ...request, working_version_json: spaWork }, base);
    const manualWork = structuredClone(base); manualWork.equipment.customOptions = [{ name: 'Manual item', laborCost: 125, materialCost: 175, quantity: 1 }];
    const manual = await prepareContribution({ ...request, working_version_json: manualWork }, base);
    return { prepared, originalLight: base.equipment.poolLights[0], dependency, manual,
      workPump: work.equipment.pump, baseEquipment: base.equipment };
  });
  expect(result.prepared.after.equipment.pump).toMatchObject({ name: 'B', basePrice: 500, addCost1: 20 });
  expect(result.prepared.after.equipment.pump).not.toHaveProperty('price', 999999);
  expect(result.prepared.after.equipment.pump).not.toHaveProperty('model', 'Saved A');
  expect(result.prepared.after.equipment.poolLights[0]).toEqual(result.originalLight);
  expect(result.prepared.after.equipment.poolLights[1]).toMatchObject({ name: 'Light B', basePrice: 200 });
  expect(result.prepared.after.notes).toBe('Owner edited notes');
  expect(result.workPump.basePrice).toBe(999999);
  expect(result.dependency.after.equipment.heater).toMatchObject({ name: 'Required spa heater', basePrice: 300 });
  expect(result.dependency.conflicts.some((item: any) => item.path === 'catalog')).toBe(true);
  expect(result.manual.after.equipment.customOptions).toEqual([{ name: 'Manual item', laborCost: 125, materialCost: 175, quantity: 1 }]);
  expect(result.manual.after.equipment.pump).toEqual(result.baseEquipment.pump);
});

test('exported staging perimeter request preserves saved information in the actual review and approval payload', async ({ page }, testInfo) => {
  const fixturePath = process.env.SUBMERGE_CONTRIBUTION_PRESERVATION_FIXTURE;
  test.skip(!fixturePath, 'Supply a credential-free staging request/snapshot export.');
  const fixture = JSON.parse(readFileSync(fixturePath!, 'utf8'));
  expect(fixture.projectId).toBe('maczvrxjnnpcsbcetabm');
  await page.addInitScript((data) => {
    window.__APP_ENV__ = { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_SUPABASE_ONLY: 'false' };
    localStorage.setItem('contribution-review-fixture', JSON.stringify(data));
    const model = data.model;
    localStorage.setItem(`submerge.pricingModelSnapshot.local.${model.franchiseId}.${model.pricingModelId}.${model.revisionId}`, JSON.stringify(model));
  }, fixture);
  await page.goto('http://127.0.0.1:5173/tests/fixtures/contribution-review.html');
  await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review proposed changes' });
  await dialog.getByRole('radio', { name: 'Overwrite current version with these changes' }).check();
  await expect(dialog.getByRole('button', { name: 'Apply Changes' })).toBeEnabled();
  await expect(dialog.locator('tbody tr:not(.collaboration-diff-group)')).toHaveCount(1);
  await expect(dialog.locator('tbody')).toContainText('Perimeter');
  await page.screenshot({ path: testInfo.outputPath('staging-perimeter-only-review.png') });
  const prepared = await page.evaluate(() => (window as any).preparedContribution);
  const expected = structuredClone(fixture.owner); expected.poolSpecs.perimeter = 25;
  const sections = ['customerInfo','poolSpecs','excavation','plumbing','electrical','tileCopingDecking','drainage','equipment',
    'waterFeatures','customFeatures','masonry','interiorFinish','manualAdjustments','retailAdjustments','notes','contractOverrides','warrantySections'];
  for (const section of sections) expect(prepared.after[section], section).toEqual(expected[section]);
  expect(prepared.before.totalCost).toBe(62960);
  expect(prepared.after.totalCost).toBe(64660);
  expect(prepared.conflicts).toEqual([]);
  writeFileSync('test-results/perimeter-prepared-review.json', JSON.stringify(prepared));
  await dialog.getByRole('button', { name: 'Apply Changes' }).click();
  expect(await page.evaluate(() => (window as any).appliedContribution)).toEqual(prepared.after);
});
