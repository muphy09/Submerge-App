import { test, expect } from '@playwright/test';

const fixture = 'http://127.0.0.1:5173/tests/fixtures/shared-proposals.html';

test('material selections display once with complete prices and readable values', async ({ page }, testInfo) => {
  await page.goto(`${fixture}?mode=owner&diff=materials`);
  await page.getByRole('button', { name: 'Review Changes' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review proposed changes' });
  await expect(dialog.getByRole('heading', { name: 'Changed Fields 5' })).toBeVisible();
  const row = (label: string) => dialog.getByRole('row').filter({ has: page.getByRole('rowheader', { name: label, exact: true }) });
  const tile = row('Tile Level');
  await expect(tile.getByRole('cell').nth(0)).toHaveText('1');
  await expect(tile.getByRole('cell').nth(1)).toHaveText('3');
  const expected = await page.evaluate(() => (window as any).reviewExpected);
  const money = (value: number) => `${value > 0 ? '+' : ''}${value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`;
  await expect(tile.getByRole('cell').nth(2)).toHaveText(money(expected.tilePrice));
  await expect(row('Coping')).toContainText('Travertine - Level 2 (12x24)');
  await expect(row('Trim Tile')).toContainText('Default Trim Tile');
  await expect(row('Decking')).toContainText('Off-Contract');
  await expect(row('Additional Decking')).toContainText('Concrete; 100 sq ft; On Contract');
  await expect(dialog.locator('tbody')).not.toContainText(/Option Id|level1|level3|Is Decking Off Contract|travertine-level/);
  const priceCells = dialog.locator('tbody tr').filter({ has: page.locator('th[scope="row"]') }).locator('td:last-child');
  await expect(priceCells).toHaveCount(5);
  await expect.poll(async () => (await priceCells.allTextContents()).every(value => value !== '—')).toBe(true);
  const sum = (await priceCells.allTextContents()).reduce((total, value) => total + Number(value.replace(/[^0-9.+-]/g, '')), 0);
  expect(sum).toBeCloseTo(expected.totalPrice, 2);
  await dialog.locator('.collaboration-review-body').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: testInfo.outputPath('readable-material-review.png') });
});

test('comparison groups linked controls and preserves independent edits and custom details', async ({ page }) => {
  await page.goto(`${fixture}?mode=owner`);
  const cases = await page.evaluate(async () => {
    const { reviewRows, proposalWithReviewRow } = await import('/src/utils/contributionReview.ts');
    const { getDefaultProposal } = await import('/src/utils/proposalDefaults.ts');
    const { withAdditionalDeckingSelections } = await import('/src/utils/decking.ts');
    const base: any = getDefaultProposal();
    base.equipment.automation = { name: 'Automation A', price: 100 };
    base.equipment.automationQuantity = 1;
    const results: any[] = [];
    const check = (name: string, change: (p: any) => void) => {
      const work = structuredClone(base);
      change(work);
      const original = JSON.stringify(base);
      const rows = reviewRows({ base_version_json: base, working_version_json: work } as any);
      let replay = base;
      for (const row of rows) replay = proposalWithReviewRow(replay, work, row);
      results.push({ name, rows, unchanged: JSON.stringify(base) === original, replay });
    };
    check('trim', p => { p.tileCopingDecking.hasTrimTileOnSteps = true; p.tileCopingDecking.trimTileOptionId = 'default-trim-tile'; });
    check('cover', p => { p.poolSpecs.hasAutomaticCover = true; p.poolSpecs.automaticCoverManufacturerCost = 5000; });
    check('ledge', p => { p.poolSpecs.hasTanningShelf = true; p.poolSpecs.fiberglassTanningLedgeName = 'Sun Ledge'; });
    check('spa', p => { p.poolSpecs.spaType = 'fiberglass'; p.poolSpecs.spaFiberglassModelName = 'Round Spa'; });
    check('coping', p => { p.tileCopingDecking.copingType = 'paver'; p.tileCopingDecking.copingSize = '12x24'; });
    check('decking', p => { p.poolSpecs.deckingArea = 450; p.tileCopingDecking.deckingArea = 450; p.tileCopingDecking.deckingType = 'paver'; p.tileCopingDecking.isDeckingOffContract = true; });
    check('additionalDecking', p => { p.tileCopingDecking = withAdditionalDeckingSelections(p.tileCopingDecking, [{ deckingType: 'concrete', area: 80 }]); });
    check('automation', p => { p.equipment.automation = { name: 'Automation B', price: 500 }; p.equipment.automationQuantity = 2; });
    check('quantityOnly', p => { p.equipment.automationQuantity = 3; });
    check('automationZones', p => { p.equipment.automation.zones = 3; });
    check('autoFill', p => { p.equipment.autoFillSystem = { name: 'Automatic Fill', price: 100 }; p.equipment.autoFillSystemQuantity = 2; p.equipment.hasAutoFill = true; });
    check('gravel', p => { p.excavation.hasGravelInstall = true; p.excavation.gravelInstallQuantity = 2; });
    check('digging', p => { p.excavation.hasAdditionalDigging = true; p.excavation.additionalDiggingDays = 3; });
    check('columns', p => { p.excavation.columns = { count: 2, width: 2, depth: 2, height: 3, facing: 'stacked-stone' }; });
    check('finish', p => { p.interiorFinish.finishType = 'pebble'; p.interiorFinish.color = 'Blue'; });
    check('runs', p => { p.plumbing.runs.gasRun = 55; p.plumbing.runs.skimmerRun = 30; });
    check('metadata', p => { p.poolSpecs.approximateGallons = 23000; p.equipment.totalCost = 123; p.tileCopingDecking.cost = 500; p.equipment.packageSelectionTouched = true; });
    base.customFeatures.features = [{ name: 'Custom patio', description: 'Old description', laborCost: 100, materialCost: 100, totalCost: 200 }];
    check('custom', p => { p.customFeatures.features[0].description = 'New description'; p.customFeatures.features[0].laborCost = 300; p.customFeatures.features[0].totalCost = 400; });
    return results;
  });
  for (const entry of cases) {
    expect(entry.unchanged, entry.name).toBe(true);
    expect(entry.rows.length, entry.name).toBe(entry.name === 'metadata' ? 0 : entry.name === 'runs' ? 2 : 1);
    for (const row of entry.rows) expect(row.before, entry.name).not.toEqual(row.after);
  }
  const byName = (name: string) => cases.find(entry => entry.name === name);
  expect(byName('automation').rows[0].after).toContain('Automation B (Qty: 2)');
  expect(byName('quantityOnly').rows[0].after).toContain('Qty: 3');
  expect(byName('automationZones').rows[0].after).toContain('Additional Zones: 3');
  expect(byName('autoFill').rows[0].after).toContain('Qty: 2');
  expect(byName('custom').rows[0].after).toContain('New description');
  expect(byName('custom').rows[0].after).toContain('Labor: $300.00');
  expect(byName('decking').replay.poolSpecs.deckingArea).toBe(450);
  expect(byName('additionalDecking').replay.tileCopingDecking.additionalDeckingArea).toBe(80);
});

test('legacy levels and pinned catalog names remain readable without changing saved data', async ({ page }) => {
  await page.goto(`${fixture}?mode=owner`);
  const result = await page.evaluate(async () => {
    const { reviewRows, proposalWithReviewRow } = await import('/src/utils/contributionReview.ts');
    const { getDefaultProposal } = await import('/src/utils/proposalDefaults.ts');
    const { getPricingDataSnapshot } = await import('/src/services/pricingDataStore.ts');
    const base: any = getDefaultProposal();
    delete base.tileCopingDecking.tileOptionId;
    const work = structuredClone(base);
    work.tileCopingDecking.tileLevel = 3;
    const request: any = { base_version_json: base, working_version_json: work };
    const legacy = reviewRows(request);
    const replay = proposalWithReviewRow(base, work, legacy[0]);
    const pricing: any = getPricingDataSnapshot();
    pricing.tileCoping.tile.options = [{ id: 'custom-tile', name: 'Ocean Glass', materialRate: 20, laborRate: 10 }];
    pricing.interiorFinish.finishes = [{ id: 'custom-finish', name: 'Deep Blue Pebble', colors: ['Blue'] }];
    work.tileCopingDecking.tileOptionId = 'custom-tile';
    work.interiorFinish.finishType = 'custom-finish';
    work.interiorFinish.color = 'Blue';
    return { legacy, replay, named: reviewRows(request, pricing) };
  });
  expect(result.legacy).toMatchObject([{ label: 'Tile Level', before: '1', after: '3' }]);
  expect(result.replay.tileCopingDecking.tileLevel).toBe(3);
  expect(result.replay.tileCopingDecking.tileOptionId).toBeUndefined();
  expect(result.named.find(row => row.label === 'Tile Level')?.after).toBe('Ocean Glass');
  expect(result.named.find(row => row.label === 'Interior Finish')?.after).toBe('Deep Blue Pebble — Blue');
});
