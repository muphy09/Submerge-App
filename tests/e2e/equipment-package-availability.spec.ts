import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('fixed package components are available only for the selected package and included quantity', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/tests/fixtures/shared-proposals.html?mode=owner');
  const result = await page.evaluate(async () => {
    const { unavailableEquipment } = await import('/src/utils/collaborationEquipment.ts');
    const { getRetiredEquipmentFlags } = await import('/src/utils/retiredEquipment.ts');
    const { withTemporaryPricingSnapshot, getPricingDataSnapshot } = await import('/src/services/pricingDataStore.ts');
    const pricing = structuredClone(getPricingDataSnapshot());
    pricing.equipment.packageOptions = [{ id: 'fixed', mode: 'fixed', enabled: true, name: 'Fixed',
      includedPumpName: 'Package-only pump', includedPumpQuantity: 1 }] as any;
    const base: any = { equipment: { packageSelectionId: 'fixed', pump: { name: 'Package-only pump', price: 0 }, pumpQuantity: 1 } };
    const check = (equipment: any) => unavailableEquipment({ ...base, equipment }, pricing).map(item => item.field);
    return { included: check(base.equipment), retired: withTemporaryPricingSnapshot(pricing, () => getRetiredEquipmentFlags(base.equipment).pump),
      custom: check({ ...base.equipment, packageSelectionId: 'custom' }),
      excess: check({ ...base.equipment, pumpQuantity: 2 }),
      extra: check({ ...base.equipment, additionalPumps: [base.equipment.pump] }),
      changed: check({ ...base.equipment, pump: { name: 'Invented pump', price: 0 } }) };
  });
  expect(result).toEqual({ included: [], retired: false, custom: ['pump'], excess: ['pump'], extra: ['additionalPumps'], changed: ['pump'] });
});

test('light removal reads None while older saved light selections remain understandable', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/tests/fixtures/shared-proposals.html?mode=owner');
  const result = await page.evaluate(async () => {
    const { reviewRows } = await import('/src/utils/contributionReview.ts');
    const base: any = { equipment: { spaLights: [{ name: 'Hydura Spa Light' }], includeSpaLights: true, hasSpaLight: true } };
    const work = { equipment: { spaLights: [], includeSpaLights: true, hasSpaLight: false } };
    const old = { equipment: { hasSpaLight: true } };
    return { removed: reviewRows({ base_version_json: base, working_version_json: work } as any),
      older: reviewRows({ base_version_json: old, working_version_json: { equipment: { hasSpaLight: false } } } as any) };
  });
  expect(result.removed[0]).toMatchObject({ label: 'Spa Lights', before: 'Hydura Spa Light', after: 'None' });
  expect(result.older[0]).toMatchObject({ before: 'Spa light (Qty: 1)', after: 'None' });
});

test('exported staging request reviews the actual heater and spa removal without a false package pump warning', async ({ page }, testInfo) => {
  const fixturePath = process.env.SUBMERGE_PACKAGE_REVIEW_FIXTURE;
  test.skip(!fixturePath, 'Supply a credential-free staging request and pinned snapshot export.');
  const data = JSON.parse(readFileSync(fixturePath!, 'utf8'));
  expect(data.request.base_version_json.pricingModelRevisionId).toBe(data.request.working_version_json.pricingModelRevisionId);
  await page.addInitScript(data => {
    window.__APP_ENV__ = { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_SUPABASE_ONLY: 'false' };
    const owner = data.owner;
    localStorage.setItem('contribution-review-fixture', JSON.stringify({ owner,
      baseline: data.request.base_version_json, work: data.request.working_version_json }));
    localStorage.setItem(`submerge.pricingModelSnapshot.local.${owner.franchiseId}.${owner.pricingModelId}.${owner.pricingModelRevisionId}`,
      JSON.stringify({ franchiseId: owner.franchiseId, pricingModelId: owner.pricingModelId, revisionId: owner.pricingModelRevisionId, pricing: data.pricing }));
  }, data);
  await page.goto('http://127.0.0.1:5173/tests/fixtures/contribution-review.html');
  await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review proposed changes' });
  await expect(dialog.getByText('Preparing a comparison using the owner’s current pricing…')).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Overwrite current version with these changes' }).check();
  await expect(dialog.getByRole('button', { name: 'Apply Changes' })).toBeEnabled();
  const prepared = await page.evaluate(() => (window as any).preparedContribution);
  const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const cogs = dialog.locator('.collaboration-total').filter({ has: page.getByText('COGS', { exact: true }) });
  await expect(cogs).toHaveText(`COGS${money(data.owner.pricing.totalCOGS)} → ${money(prepared.after.pricing.totalCOGS)}`);
  expect(data.owner.pricing.totalCOGS).toBeCloseTo(74586.31, 2);
  // Removing a spa also normalizes dependent inputs; that explicit review remains.
  expect(prepared.conflicts.map((conflict: any) => conflict.path)).toEqual(['catalog']);
  expect(prepared.warnings.filter((warning: any) => warning.path === 'equipment.pump')).toEqual([]);
  expect(prepared.after.equipment.pump).toEqual(data.owner.equipment.pump);
  expect(prepared.before.equipment.heater.name).toBe('Hayward HDFS400');
  expect(prepared.after.equipment.heater.name).toBe('Hayward HP31205T Heat/Chill');
  await expect(dialog.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Spa Lights', exact: true }) }).getByRole('cell').nth(1)).toHaveText('None');
  await expect(dialog).not.toContainText('Legacy spa light');
  await expect(dialog).not.toContainText('Hayward 1.65 HP: unavailable');
  await dialog.locator('.collaboration-review-body').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: testInfo.outputPath('actual-staging-equipment-review.png') });
});
