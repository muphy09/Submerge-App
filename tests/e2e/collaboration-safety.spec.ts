import { test, expect } from '@playwright/test';

test('legacy eligibility checks every raw version and rejects protected or unpinned versions', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/tests/fixtures/shared-proposals.html?mode=owner');
  const result = await page.evaluate(async () => {
    const { getDefaultProposal } = await import('/src/utils/proposalDefaults.ts');
    const { collaborationSharingBlockedReason: check } = await import('/src/utils/collaborationSafety.ts');
    const base: any = { ...getDefaultProposal(), pricingModelId: 'model', pricingModelRevisionId: 'pin' };
    return { modern: check(base), legacy: check({ ...base, pricingEngineVersion: undefined }),
      protected: check({ ...base, historicalPricingAdjustment: -2000 }),
      missing: check({ ...base, pricingModelRevisionId: undefined }),
      sibling: check({ ...base, versions: [{ ...base, versionName: 'Old alternative', pricingEngineVersion: undefined }] }) };
  });
  expect(result.modern).toBeNull();
  for (const key of ['legacy', 'protected', 'missing', 'sibling'] as const) expect(result[key]).toBeTruthy();
  expect(result.sibling).toContain('Old alternative');
});

test('phone-only contribution preserves unavailable equipment and blocks baseline drift or unavailable replacements', async ({ page }, testInfo) => {
  await page.addInitScript(() => { window.__APP_ENV__ = { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_SUPABASE_ONLY: 'false' }; });
  await page.goto('http://127.0.0.1:5173/tests/fixtures/proposal-sync-authorization.html');
  const result = await page.evaluate(async () => {
    const { getDefaultProposal } = await import('/src/utils/proposalDefaults.ts');
    const store = await import('/src/services/pricingDataStore.ts');
    const { proposalCacheEnvironment } = await import('/src/services/proposalContext.ts');
    const { calculateCollaborativeVersion, prepareContribution } = await import('/src/services/collaborationPricing.ts');
    const pricing = store.getPricingDataSnapshot();
    const base: any = { ...getDefaultProposal(), proposalNumber: 'SAFETY', versionId: 'original', franchiseId: 'audit',
      pricingModelId: 'model', pricingModelFranchiseId: 'audit', pricingModelRevisionId: 'pin', contentRevision: 1 };
    base.equipment.pump = { name: 'Discontinued saved pump', model: 'Saved model', price: 1234, basePrice: 1000 };
    localStorage.setItem(`submerge.pricingModelSnapshot.${proposalCacheEnvironment()}.audit.model.pin`,
      JSON.stringify({ franchiseId: 'audit', pricingModelId: 'model', revisionId: 'pin', version: 'v1', pricing }));
    Object.assign(base, await calculateCollaborativeVersion(base));
    const work = structuredClone(base); work.customerInfo.phone = '555-0100';
    const request: any = { target_version_id: 'original', base_version_json: base, working_version_json: work, updated_at: 'now' };
    const prepared = await prepareContribution(request, base);
    let drift = '';
    try { await prepareContribution(request, { ...base, totalCost: base.totalCost - 2000 }); }
    catch (error) { drift = (error as Error).message; }
    const replacement = structuredClone(work); replacement.equipment.pump = { name: 'Invented unavailable pump', price: 1 };
    const blocked = await prepareContribution({ ...request, working_version_json: replacement }, base);
    localStorage.setItem('contribution-review-fixture', JSON.stringify({ baseline: base, work, owner: { ...base, designerAuthUserId: 'owner' } }));
    return { prepared, base, blocked, drift };
  });
  expect(result.prepared.after.totalCost).toBe(result.base.totalCost);
  expect(result.prepared.after.equipment.pump).toEqual(result.base.equipment.pump);
  expect(result.prepared.conflicts).toEqual([]);
  expect(result.prepared.warnings?.some(warning => warning.path === 'equipment.pump')).toBe(true);
  expect(result.drift).toContain('saved total');
  expect(result.blocked.conflicts.some(conflict => conflict.path === 'catalog:equipment.pump')).toBe(true);
  expect(result.blocked.after.equipment.pump).toEqual(result.base.equipment.pump);
  await page.goto('http://127.0.0.1:5173/tests/fixtures/contribution-review.html');
  await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review proposed changes' });
  await expect(dialog.getByText(/Discontinued saved pump: unavailable/)).toBeVisible();
  await expect(dialog.getByRole('row').filter({ hasText: 'Phone' })).toContainText('$0.00');
  await dialog.locator('.collaboration-review-body').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: testInfo.outputPath('unavailable-equipment-review.png') });
});

test('legacy sharing is explained in the dialog and disabled', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/tests/fixtures/shared-proposals.html?mode=owner&legacy=1&rail=1');
  await page.getByRole('button', { name: 'Share / Manage Access' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share and manage access' });
  await expect(dialog.getByText(/Legacy proposal versions cannot be shared/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Share proposal', exact: true })).toBeDisabled();
});

test('service rejects legacy sharing and starting work before mutation RPCs', async ({ page }) => {
  await page.addInitScript(() => { window.__APP_ENV__ = { VITE_SUPABASE_URL: 'https://submerge-playwright.invalid', VITE_SUPABASE_ANON_KEY: 'playwright-public-placeholder' }; });
  const mutations: string[] = [];
  await page.route('https://submerge-playwright.invalid/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/rpc/')) mutations.push(path);
    return route.fulfill({ json: path.endsWith('/franchise_proposals') ? { proposal_json: { versionId: 'original' } } : {} });
  });
  await page.goto('http://127.0.0.1:5173/tests/fixtures/shared-proposals.html?mode=owner');
  const errors = await page.evaluate(async () => {
    const { shareProposal, beginWorkingCopy } = await import('/src/services/proposalCollaboration.ts');
    const errors: string[] = [];
    for (const action of [() => shareProposal('legacy', 'recipient', 'contribute'), () => beginWorkingCopy('legacy', 'original', 1)]) {
      try { await action(); } catch (error) { errors.push((error as Error).message); }
    }
    return errors;
  });
  expect(errors).toHaveLength(2);
  expect(errors.every(error => error.includes('Legacy'))).toBe(true);
  expect(mutations).toEqual([]);
});

test('review shows model and legacy quantity details', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/tests/fixtures/shared-proposals.html?mode=owner');
  const rows = await page.evaluate(async () => {
    const { reviewRows } = await import('/src/utils/contributionReview.ts');
    return reviewRows({ base_version_json: { equipment: { additionalPumps: [{ name: 'Pump', model: 'A', quantity: 1 }], numberOfLights: 1 } },
      working_version_json: { equipment: { additionalPumps: [{ name: 'Pump', model: 'B', quantity: 2 }], numberOfLights: 3 } } } as any);
  });
  expect(rows.find(row => row.key === 'equipment.additionalPumps')).toMatchObject({ before: expect.stringContaining('Model: A'), after: expect.stringContaining('Model: B') });
  expect(rows.find(row => row.key === 'equipment.poolLights')).toMatchObject({ before: expect.stringContaining('1'), after: expect.stringContaining('3') });
});
