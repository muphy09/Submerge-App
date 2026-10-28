import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

// Supplied locally, never committed. Contains staging snapshots, no credentials.
const fixturePath = process.env.SUBMERGE_STAGING_PRICING_FIXTURE;
test('staging QA contributions use each owner-selected pricing revision and retain sibling versions', async ({ page }) => {
  test.skip(!fixturePath, 'Supply an isolated staging pricing snapshot export.');
  const data = JSON.parse(readFileSync(fixturePath!, 'utf8'));
  expect(data.projectId).toBe('maczvrxjnnpcsbcetabm');
  await page.addInitScript(() => { window.__APP_ENV__ = { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_SUPABASE_ONLY: 'false' }; });
  await page.goto('http://127.0.0.1:5173/tests/fixtures/proposal-sync-authorization.html');
  await expect(page.getByText('Ready')).toBeVisible();
  const results = await page.evaluate(async (fixture) => {
    const store = await import('/src/services/pricingDataStore.ts');
    const { proposalCacheEnvironment } = await import('/src/services/proposalContext.ts');
    const { prepareContribution, calculateCollaborativeVersion } = await import('/src/services/collaborationPricing.ts');
    const { contributionInputs, contributionEqual } = await import('/src/utils/contributionInputs.ts');
    const cache = (model: any) => localStorage.setItem(`submerge.pricingModelSnapshot.${proposalCacheEnvironment()}.${model.franchiseId}.${model.pricingModelId}.${model.revisionId}`, JSON.stringify(model));
    fixture.models.forEach(cache);
    const versions = [fixture.proposal, ...fixture.proposal.versions];
    const results: any[] = [];
    for (const target of versions) {
      const sourceModel = fixture.models.find((model: any) => model.revisionId === target.pricingModelRevisionId);
      const nextModel = structuredClone(sourceModel);
      nextModel.revisionId = crypto.randomUUID();
      nextModel.pricing.papDiscountRates = { ...nextModel.pricing.papDiscountRates,
        excavation: Math.min(0.5, Number(nextModel.pricing.papDiscountRates?.excavation || 0) + 0.05) };
      cache(nextModel);
      const work = structuredClone(target);
      work.poolSpecs.deckingArea += 50; work.totalCost = 1; work.pricing.digCommissionRate = 0.9;
      const request: any = { id: 'price-check', target_version_id: target.versionId, base_version_json: target,
        working_version_json: work, updated_at: '2026-10-27T00:00:00Z' };
      for (const decision of ['pending','declined','accepted']) {
        const container = structuredClone(fixture.proposal);
        const current = [container,...container.versions].find(v => v.versionId === target.versionId)!;
        if (decision === 'accepted') {
          current.pricingModelRevisionId = nextModel.revisionId;
          Object.assign(current, await calculateCollaborativeVersion(current));
        }
        current.pricingRevisionReview = { decision: decision === 'accepted' ? 'upgraded' : decision, latestRevisionId: nextModel.revisionId };
        const initial = await prepareContribution(request,container);
        const resolutions = Object.fromEntries(initial.conflicts.map(conflict => [conflict.path,
          conflict.allowed?.length === 1 ? 'owner' : 'contributor'])) as any;
        const prepared = await prepareContribution(request,container,resolutions);
        results.push({ version: target.versionId, decision, before: prepared.before.totalCost, after: prepared.after.totalCost,
          pin: prepared.after.pricingModelRevisionId, expectedPin: current.pricingModelRevisionId,
          decking: prepared.after.poolSpecs.deckingArea, expectedDecking: work.poolSpecs.deckingArea,
          digRate: prepared.after.pricing.digCommissionRate, expectedDigRate: current.pricing.digCommissionRate,
          originalWorkPreserved: work.totalCost === 1 && work.pricing.digCommissionRate === 0.9,
          metadataStayedCurrent: prepared.after.pricingRevisionReview?.decision === current.pricingRevisionReview.decision,
          siblingUnchanged: contributionEqual(contributionInputs(versions.find(v => v.versionId !== target.versionId)!),
            contributionInputs([container,...container.versions].find(v => v.versionId !== target.versionId)!)),
          conflicts: initial.conflicts.map(conflict => conflict.path), prepared, target: current, container, work });
      }
    }
    const normal = store.getPricingDataSnapshot();
    const bound = store.bindPricingEditor(normal);
    try {
      const model = fixture.models[0];
      await store.initPricingDataStore(model.franchiseId,model.pricingModelId,model.franchiseId,'normal',model.revisionId);
      results.push({ bindingPreserved: JSON.stringify(store.getPricingDataSnapshot()) === JSON.stringify(normal) });
    } finally { bound.release(); }
    return results;
  }, data);
  writeFileSync('test-results/staging-collaboration-engine-results.json',JSON.stringify(results,null,2));
  for (const result of results.filter((row: any) => row.decision)) {
    expect(result.pin).toBe(result.expectedPin);
    expect(result.decking).toBe(result.expectedDecking);
    expect(result.after).toBeGreaterThan(result.before);
    expect(result.digRate).toBe(result.expectedDigRate);
    expect(result.originalWorkPreserved).toBe(true);
    expect(result.metadataStayedCurrent).toBe(true);
    expect(result.siblingUnchanged).toBe(true);
  }
  expect(results.at(-1)?.bindingPreserved).toBe(true);
});
