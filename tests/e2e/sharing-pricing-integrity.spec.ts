import { test, expect } from '@playwright/test';
const fixture = 'http://127.0.0.1:5173/tests/fixtures/proposal-sync-authorization.html';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.__APP_ENV__ = { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_SUPABASE_ONLY: 'false' }; });
  await page.goto(fixture);
  await expect(page.getByText('Ready')).toBeVisible();
});

test('routine session refresh preserves proposal context while authority changes invalidate it', async ({ page }) => {
  await page.evaluate(async () => {
    const session = await import('/src/services/session.ts');
    const context = await import('/src/services/proposalContext.ts');
    const original = { userId: 'owner', userEmail: 'owner@playwright.invalid', appSessionId: 'lease',
      franchiseId: 'franchise', role: 'designer' as const, isTestAccount: false };
    session.saveSession(original);
    const captured = context.captureProposalContext();
    session.saveSession({ ...original });
    session.updateSession({ userName: 'Refreshed name', passwordResetRequired: false, digCommissionRate: 0.03 });
    context.assertProposalContext(captured);
    for (const change of [{ userId: 'other' }, { appSessionId: 'other' }, { franchiseId: 'other' },
      { role: 'admin' as const }, { isTestAccount: true }, { testAccountId: 'other' }]) {
      session.saveSession(original);
      const before = context.captureProposalContext();
      session.updateSession(change);
      session.saveSession(original);
      let rejected = false;
      try { context.assertProposalContext(before); } catch { rejected = true; }
      if (!rejected) throw Error(`Authority transition was missed: ${JSON.stringify(change)}`);
    }
    const beforeLogout = context.captureProposalContext();
    session.clearSession(); session.saveSession(original);
    let rejected = false;
    try { context.assertProposalContext(beforeLogout); } catch { rejected = true; }
    if (!rejected) throw Error('Sign-out and same-account login must invalidate old work');
  });
});

test('three-way contribution merge retains unrelated owner fields and rejects contributor financial outputs', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { mergeContribution } = await import('/src/utils/contributionInputs.ts');
    const base: any = { customerInfo: { city: 'A', customerName: 'Original' }, poolSpecs: { maxWidth: 20 },
      pricingModelRevisionId: 'r1', pricing: { digCommissionRate: 0.01 }, totalCost: 100 };
    const work: any = { ...base, customerInfo: { ...base.customerInfo, city: 'B' },
      totalCost: 1, pricing: { digCommissionRate: 0.9 }, papDiscounts: { excavation: 0.99 } };
    const current: any = { ...base, poolSpecs: { maxWidth: 25 }, pricingModelRevisionId: 'r2',
      pricing: { digCommissionRate: 0.02 }, totalCost: 120 };
    return mergeContribution(base, work, current);
  });
  expect(result.conflicts).toEqual([]);
  expect(result.proposal).toMatchObject({ customerInfo: { city: 'B' }, poolSpecs: { maxWidth: 25 },
    pricingModelRevisionId: 'r2', pricing: { digCommissionRate: 0.02 }, totalCost: 120 });
  expect(result.proposal.papDiscounts).toBeUndefined();
});

test('overlapping fields and arrays require an explicit resolution; deleted fields stay deleted', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { mergeContribution } = await import('/src/utils/contributionInputs.ts');
    const base: any = { customerInfo: { city: 'A', state: 'NC' }, retailAdjustments: [{ name: 'A', amount: 10 }], notes: 'old' };
    const work: any = { customerInfo: { city: 'B' }, retailAdjustments: [{ name: 'B', amount: 20 }] };
    const current: any = { ...base, customerInfo: { city: 'C', state: 'NC' }, retailAdjustments: [{ name: 'C', amount: 30 }] };
    return { unresolved: mergeContribution(base,work,current), resolved: mergeContribution(base,work,current,
      { 'customerInfo.city': 'contributor', retailAdjustments: 'owner' }) };
  });
  expect(result.unresolved.conflicts.map((c: any) => c.path)).toEqual(['customerInfo.city','retailAdjustments']);
  expect(result.unresolved.proposal.customerInfo.city).toBe('C');
  expect(result.resolved.proposal.customerInfo).toEqual({ city: 'B' });
  expect(result.resolved.proposal.retailAdjustments).toEqual([{ name: 'C', amount: 30 }]);
  expect(result.resolved.proposal).not.toHaveProperty('notes');
});

test('malformed cached pricing cannot supply a different model or franchise', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { proposalCacheEnvironment } = await import('/src/services/proposalContext.ts');
    localStorage.setItem(`submerge.pricingModelSnapshot.${proposalCacheEnvironment()}.audit.model-a.pin-a`, JSON.stringify({
      franchiseId: 'wrong', pricingModelId: 'model-b', revisionId: 'pin-a', pricing: { overheadMultiplier: 9 }, version: 'v1' }));
    const adapter = await import('/src/services/pricingModelsAdapter.ts');
    try { await adapter.loadPricingModel('audit','model-a','pin-a'); return 'accepted'; }
    catch (error) { return (error as Error).message; }
  });
  expect(result).toContain('saved pricing revision is not cached');
});

test('canonical owner review uses the accepted pin and saved commissions; contributor totals are discarded', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { getDefaultProposal } = await import('/src/utils/proposalDefaults.ts');
    const store = await import('/src/services/pricingDataStore.ts');
    const { proposalCacheEnvironment } = await import('/src/services/proposalContext.ts');
    const { prepareContribution, calculateCollaborativeVersion } = await import('/src/services/collaborationPricing.ts');
    const base: any = { ...getDefaultProposal(), proposalNumber: 'PROP-AUDIT', franchiseId: 'audit',
      versionId: 'original', pricingModelId: 'model-a', pricingModelFranchiseId: 'audit', pricingModelRevisionId: 'r1',
      pricing: { digCommissionRate: 0.01, closeoutCommissionRate: 0.02 }, contentRevision: 1 };
    base.poolSpecs = { ...base.poolSpecs, perimeter: 100, surfaceArea: 600, shallowDepth: 3.5, endDepth: 6 };
    const current = { ...base, pricingModelRevisionId: 'r2', contentRevision: 2, versions: [] };
    for (const revision of ['r1','r2']) {
      const pricing = store.getPricingDataSnapshot();
      pricing.papDiscountRates = { ...pricing.papDiscountRates, excavation: revision === 'r1' ? 0 : 0.5 };
      localStorage.setItem(`submerge.pricingModelSnapshot.${proposalCacheEnvironment()}.audit.model-a.${revision}`,
        JSON.stringify({ franchiseId: 'audit', pricingModelId: 'model-a', revisionId: revision, pricing, version: 'v1' }));
    }
    const request: any = { target_version_id: 'original', base_version_json: base,
      working_version_json: { ...base, customerInfo: { ...base.customerInfo, city: 'Contributor edit' },
        totalCost: 1, pricing: { digCommissionRate: 0.9, closeoutCommissionRate: 0.9 } }, updated_at: '2026-10-27' };
    const prepared = await prepareContribution(request,await calculateCollaborativeVersion(current));
    return { after: prepared.after, before: prepared.before, original: request.working_version_json };
  });
  expect(result.after.pricingModelRevisionId).toBe('r2');
  expect(result.after.papDiscounts.excavation).toBe(0.5);
  expect(result.after.pricing).toMatchObject({ digCommissionRate: 0.01, closeoutCommissionRate: 0.02 });
  expect(result.after.totalCost).toBe(result.before.totalCost);
  expect(result.after.totalCost).not.toBe(1);
  expect(result.after.customerInfo.city).toBe('Contributor edit');
  expect(result.original.totalCost).toBe(1);
});

test('grouped feature prices come from the owner catalog while manual custom prices remain proposed inputs', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { getDefaultProposal } = await import('/src/utils/proposalDefaults.ts');
    const store = await import('/src/services/pricingDataStore.ts');
    const { proposalCacheEnvironment } = await import('/src/services/proposalContext.ts');
    const { prepareContribution, calculateCollaborativeVersion } = await import('/src/services/collaborationPricing.ts');
    const pricing = store.getPricingDataSnapshot();
    pricing.customFeatures.groupedOptions = [{ id: 'water-wall', name: 'Water Wall', description: 'Catalog feature', totalPrice: 1000, pricingMode: 'total' }];
    const base: any = { ...getDefaultProposal(), proposalNumber: 'PROP-GROUPED', franchiseId: 'audit',
      versionId: 'original', pricingModelId: 'model-a', pricingModelFranchiseId: 'audit', pricingModelRevisionId: 'r1',
      contentRevision: 1 };
    localStorage.setItem(`submerge.pricingModelSnapshot.${proposalCacheEnvironment()}.audit.model-a.r1`,
      JSON.stringify({ franchiseId: 'audit', pricingModelId: 'model-a', revisionId: 'r1', version: 'v1', pricing }));
    const current = await calculateCollaborativeVersion(base);
    const work = structuredClone(current);
    work.customFeatures.features = [
      { source: 'grouped', groupedOptionId: 'water-wall', name: 'Water Wall', totalCost: 999999, groupedPricePerSqft: 9999, laborCost: 0, materialCost: 0, description: '' },
      { source: 'manual', name: 'Intentional manual option', laborCost: 100, materialCost: 150, totalCost: 250, description: '' },
    ];
    const request: any = { target_version_id: 'original', base_version_json: current, working_version_json: work, updated_at: 'now' };
    const prepared = await prepareContribution(request,current);
    work.customFeatures.features[0].groupedOptionId = 'removed-feature';
    const missing = await prepareContribution(request,current);
    return { features: prepared.after.customFeatures.features, originalAmount: request.working_version_json.customFeatures.features[0].totalCost,
      missing: missing.conflicts.find(conflict => conflict.path === 'catalog:customFeatures') };
  });
  expect(result.features[0].totalCost).toBe(1000);
  expect(result.features[1].totalCost).toBe(250);
  expect(result.originalAmount).toBe(999999);
  expect(result.missing?.allowed).toEqual(['owner']);
});

test('a delayed shared load is rejected after sign-out and cannot populate the next account cache', async ({ page }) => {
  await page.addInitScript(() => {
    window.__APP_ENV__ = { VITE_SUPABASE_URL: 'https://submerge-playwright.invalid',
      VITE_SUPABASE_ANON_KEY: 'playwright-anon-key', VITE_SUPABASE_ONLY: 'false' };
    localStorage.setItem('submerge-user-session', JSON.stringify({ userId: 'account-a',
      franchiseId: 'playwright-franchise', role: 'designer' }));
  });
  let peopleReached!: () => void;
  let releasePeople!: () => void;
  const reached = new Promise<void>(resolve => { peopleReached = resolve; });
  const release = new Promise<void>(resolve => { releasePeople = resolve; });
  await page.route('https://submerge-playwright.invalid/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/health') return route.fulfill({ json: {} });
    if (path === '/rest/v1/proposal_collaboration_shares') return route.fulfill({ json: [{
      id: 'share-a', proposal_number: 'PROP-AUDIT', recipient_id: 'account-a',
      franchise_id: 'playwright-franchise', permission: 'contribute', ended_at: null,
    }] });
    if (path === '/rest/v1/franchise_proposals') return route.fulfill({ json: {
      proposal_json: { proposalNumber: 'PROP-AUDIT', franchiseId: 'playwright-franchise' },
      owner_auth_user_id: 'owner', content_revision: 1, collaboration_enabled: true,
    } });
    if (path === '/rest/v1/rpc/collab_people') {
      peopleReached(); await release; return route.fulfill({ json: [] });
    }
    return route.abort();
  });
  await page.goto('http://127.0.0.1:5173/tests/fixtures/proposal-sync-authorization.html');
  await expect(page.getByText('Ready')).toBeVisible();
  await page.evaluate(async () => {
    const collaboration = await import('/src/services/proposalCollaboration.ts');
    (window as any).auditPending = collaboration.getSharedProposal('PROP-AUDIT').then(value => ({ value }), error => ({ error: error.message }));
  });
  await reached;
  await page.evaluate(async () => {
    const session = await import('/src/services/session.ts');
    session.clearSession();
    localStorage.setItem('submerge-user-session', JSON.stringify({ userId: 'account-b',
      franchiseId: 'playwright-franchise', role: 'designer' }));
  });
  releasePeople();
  const entries = await page.evaluate(async () => {
    const result = await (window as any).auditPending;
    if (!result.error?.includes('signed-in account')) throw new Error('The late response was not rejected');
    return await new Promise<any[]>((resolve, reject) => {
      const open = indexedDB.open('submerge-shared-proposals-v1');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        if (!open.result.objectStoreNames.contains('copies')) { open.result.close(); resolve([]); return; }
        const request = open.result.transaction('copies', 'readonly').objectStore('copies').getAll();
        request.onsuccess = () => { open.result.close(); resolve(request.result); };
      };
    });
  });
  expect(entries).toHaveLength(0);
});

