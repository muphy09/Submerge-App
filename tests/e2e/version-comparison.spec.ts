import { test, expect } from '@playwright/test';
const fixture = 'http://127.0.0.1:5173/tests/fixtures/version-comparison.html';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.__APP_ENV__ = { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_SUPABASE_ONLY: 'false' }; });
});
test('multiple saved versions compare against one baseline without mutating snapshots', async ({ page }, testInfo) => {
  await page.goto(fixture);
  const saved = await page.evaluate(() => JSON.stringify((window as any).comparisonVersions));
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Compare Versions', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Version 2' }).check();
  await page.getByRole('checkbox', { name: 'Version 3' }).check();
  await page.getByRole('button', { name: 'Compare Versions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Version Comparison' })).toBeVisible();
  await expect(page.getByRole('columnheader')).toHaveCount(6);
  await expect(page.getByRole('region', { name: 'Saved financial summary' })).toContainText('$');
  await expect(page.getByText(/Item prices are unavailable/)).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Show COGS', exact: true }).check();
  await page.locator('.vc-summary summary').first().click();
  await expect(page.getByText('Total COGS', {exact:true}).first()).toBeVisible();
  await expect(page.getByRole('rowheader', { name: /^Pump/ }).first()).toBeVisible();
  await expect(page.getByRole('tabpanel')).not.toContainText('Has Been Edited');
  await page.getByRole('tab', { name: 'Item Prices' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('$');
  await page.screenshot({ path: testInfo.outputPath('multi-version-comparison.png') });
  await page.getByRole('button', { name: 'Change Selections' }).click();
  await page.getByLabel('Baseline', { exact: true }).selectOption('v1');
  await page.getByRole('button', { name: 'Compare Versions', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: /Version 2 \(Baseline\)/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify((window as any).comparisonVersions))).toBe(saved);
});

test('saved prices reconcile across quantities, adjustments, cover, discounts and pricing revisions', async ({ page }) => {
  await page.goto(fixture);
  const result = await page.evaluate(async () => {
    const { savedVersionPrices, savedContractPrice, eligibleComparisonVersion } = await import('/src/utils/versionComparison.ts');
    const { default: Engine } = await import('/src/services/masterPricingEngine.ts');
    const { getPricingDataSnapshot, withTemporaryPricingSnapshot } = await import('/src/services/pricingDataStore.ts');
    const seed = structuredClone((window as any).comparisonVersions[0]);
    const cases: any[] = [];
    for (let index = 0; index < 4; index++) {
      const p = structuredClone(seed);
      p.poolSpecs.hasAutomaticCover = index > 0;
      p.poolSpecs.automaticCoverManufacturerCost = 5000;
      p.customFeatures.features = [{ name: 'Credit', laborCost: -125, materialCost: 0, totalCost: -125 }];
      p.retailAdjustments = [{ name: 'Promotion', amount: -75 }];
      p.pricing.discountAmount = -100;
      const pricing = getPricingDataSnapshot();
      pricing.pricingDefaults.targetMargin = 0.7 - index * 0.05;
      Object.assign(p, withTemporaryPricingSnapshot(pricing, () => Engine.calculateCompleteProposal(p)));
      const result = savedVersionPrices(p);
      cases.push({ warning: result.warning, total: p.totalCost, sum: result.rows.reduce((sum, row) => sum + Math.round(row.price! * 100) / 100, 0) });
    }
    const bad = structuredClone(seed); bad.totalCost += 2000;
    return { cases, bad: savedVersionPrices(bad),
      contract: savedContractPrice({ ...seed, contractOverrides: { p1_7: '$123,456.00' } }),
      legacy: eligibleComparisonVersion({ ...seed, pricingEngineVersion: undefined }) };
  });
  for (const entry of result.cases) { expect(entry.warning).toBeNull(); expect(entry.sum).toBeCloseTo(entry.total, 2); }
  expect(result.bad.warning).toContain('does not reconcile');
  expect(result.bad.rows.every(row => row.price === null)).toBe(true);
  expect(result.contract).toBe(123456);
  expect(result.legacy).toBe(false);
});

test('item prices use each saved revision and exclude archived, hidden and legacy versions', async ({ page }) => {
  await page.goto(fixture);
  const result = await page.evaluate(async () => {
    const { savedVersionPrices, selectComparisonVersions, priceDifference } = await import('/src/utils/versionComparison.ts');
    const seed = (window as any).comparisonVersions[0];
    const make = (id: string, quantity: number, cost: number, margin: number) => ({ ...seed, versionId: id,
      totalCost: cost * 1.1 / margin,
      pricing: { ...seed.pricing, totalCostsBeforeOverhead: cost, overheadMultiplier: 1.1, targetMargin: margin,
        baseRetailPrice: cost * 1.1 / margin, manualAdjustmentsTotal: 0, discountAmount: 0, g3UpgradeCost: 0 },
      costBreakdown: { equipmentOrdered: [{ category: 'Equipment', description: 'Pump X', quantity, unitPrice: cost / quantity, total: cost }] } });
    const base = make('base', 1, 1000, 0.5), quantity = make('quantity', 2, 2000, 0.5), revision = make('revision', 1, 1200, 0.5);
    const archived = make('archive', 1, 1000, 0.5), hidden = make('hidden', 1, 1000, 0.5);
    const legacy = { ...make('legacy', 1, 1000, 0.5), pricingEngineVersion: undefined };
    const before = savedVersionPrices(base).rows[0].price;
    return { base: before, quantity: priceDifference(before, savedVersionPrices(quantity).rows[0].price),
      revision: priceDifference(before, savedVersionPrices(revision).rows[0].price),
      eligible: selectComparisonVersions([base, quantity, revision, archived, hidden, legacy], new Set(['base', 'quantity', 'revision', 'legacy'])).map(v => v.versionId) };
  });
  expect(result).toEqual({ base: 2200, quantity: 2200, revision: 440, eligible: ['base', 'quantity', 'revision'] });
});
for (const viewport of [{ width: 2559, height: 1439 }, { width: 1280, height: 800 }, { width: 900, height: 700 }]) {
  test(`readable comparison fits ${viewport.width} by ${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto(fixture);
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Version 2' }).check();
    await page.getByRole('checkbox', { name: 'Version 3' }).check();
    await page.getByRole('button', { name: 'Compare Versions', exact: true }).click();
    const dialog = await page.getByRole('dialog').boundingBox();
    expect(dialog!.x).toBeGreaterThan(0);
    expect(Math.abs(dialog!.x + dialog!.width / 2 - viewport.width / 2)).toBeLessThan(2);
    expect(Math.abs(dialog!.y + dialog!.height / 2 - viewport.height / 2)).toBeLessThan(2);
    await expect(page.getByRole('rowheader', { name: 'Pump', exact: true })).toBeVisible();
    await expect(page.getByRole('tabpanel')).toContainText('Model 0');
    await expect(page.getByRole('tabpanel')).toContainText('Model 1');
    await expect(page.getByRole('tabpanel')).not.toContainText('Auto Filled');
    const columns = await page.getByRole('columnheader').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
    expect(columns[1].left).toBeCloseTo(columns[0].right, 0);
    expect(columns[2].left).toBeCloseTo(columns[1].right, 0);
    await page.screenshot({ path: testInfo.outputPath('readable-changes.png') });
    await page.getByLabel('Search comparison').fill('Pump');
    await expect(page.getByRole('rowheader')).toHaveCount(1);
    await page.getByLabel('Search comparison').fill('no matching item');
    await expect(page.getByText('No matching items. Try another search.')).toBeVisible();
    await page.getByLabel('Search comparison').fill('');
    await page.getByRole('tab', { name: 'Item Prices' }).click();
    await page.getByRole('tabpanel').evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await expect(page.getByRole('columnheader', { name: 'Version 3' })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('readable-prices.png') });
  });
}

test('normalizes saved selection labels, empty choices, quantities and contract exceptions', async ({ page }, testInfo) => {
  await page.goto(fixture);
  const result = await page.evaluate(async () => {
    const { proposalSelectionRows } = await import('/src/utils/contributionReview.ts');
    const p = structuredClone((window as any).comparisonVersions[0]);
    Object.assign(p.poolSpecs, { poolShape: 'freeform', spaShape: 'round', raisedSpaFacing: 'stone', hasTanningShelf: false,
      hasAutomaticCover: false, automaticCoverManufacturerCost: 5000, needsFiberglassCrane: false,
      needsFiberglassSpaCrane: false, fiberglassCraneOption: 'no-crane' });
    Object.assign(p.equipment, { heater: { name: 'Heater X', model: 'HX', btu: 2500000 }, heaterQuantity: 2,
      filter: { name: 'Filter X', model: 'FX', sqft: 500 }, filterQuantity: 1,
      saltSystem: { name: 'Salt X', model: 'None' }, saltSystemQuantity: 1,
      autoFillSystem: undefined, heaterChiller: { name: 'No Heater Chiller' }, sanitationAccessory: undefined,
      auxiliaryPumps: [], auxiliaryPump: undefined, poolLights: [], spaLights: [], includePoolLights: false, includeSpaLights: false });
    Object.assign(p.tileCopingDecking, { additionalDeckingSelections: [], additionalDeckingType: '', additionalDeckingArea: 0,
      isAdditionalDeckingWasteRemoved: false, isDeckingOffContract: false });
    const beforeJson = JSON.stringify(p);
    const base = proposalSelectionRows(p);
    const map = (rows: any[]) => Object.fromEntries(rows.map(r => [r.key, r.after]));
    const unchanged = beforeJson === JSON.stringify(p);
    p.poolSpecs.needsFiberglassSpaCrane = true;
    p.poolSpecs.hasAutomaticCover = true;
    p.equipment.includePoolLights = true;
    p.equipment.includeSpaLights = true;
    p.equipment.poolLights = [{ name: 'Pool LED' }, { name: 'Pool LED' }];
    p.equipment.spaLights = [{ name: 'Spa LED' }];
    p.equipment.auxiliaryPumps = [{ name: 'Blower X' }, { name: 'Blower X' }];
    p.tileCopingDecking.isDeckingOffContract = true;
    return { base: map(base), changed: map(proposalSelectionRows(p)), craneCount: base.filter(r => /crane/i.test(r.key)).length, unchanged };
  });
  expect(result.unchanged).toBe(true);
  expect(result.craneCount).toBe(1);
  expect(result.base['poolSpecs.poolShape']).toBe('Freeform');
  expect(result.base['poolSpecs.spaShape']).toBe('Round');
  expect(result.base['poolSpecs.raisedSpaFacing']).toBe('Stone');
  for (const key of ['poolSpecs.tanningShelf', 'poolSpecs.automaticCover', 'poolSpecs.fiberglassCrane', 'tileCopingDecking.additionalDecking',
    'equipment.autoFillSystem', 'equipment.heaterChiller', 'equipment.sanitationAccessory', 'equipment.auxiliaryPumps', 'equipment.poolLights', 'equipment.spaLights']) {
    expect(result.base[key], key).toBe('None');
  }
  expect(result.base['equipment.heater']).toBe('Heater X (Qty: 2); HX');
  expect(result.base['equipment.filter']).toBe('Filter X (Qty: 1); FX');
  expect(result.base['equipment.saltSystem']).toBe('Salt X (Qty: 1)');
  expect(Object.values(result.base).join(' ')).not.toContain('On Contract');
  expect(result.changed['poolSpecs.automaticCover']).toBe('Yes');
  expect(result.changed['poolSpecs.fiberglassCrane']).toBe('Yes');
  expect(result.changed['equipment.poolLights']).toBe('Pool LED (Qty: 2)');
  expect(result.changed['equipment.spaLights']).toBe('Spa LED (Qty: 1)');
  expect(result.changed['equipment.auxiliaryPumps']).toBe('Blower X (Qty: 2)');
  expect(result.changed['tileCopingDecking.decking']).toContain('; Off-Contract');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Version 2' }).check();
  await page.getByRole('button', { name: 'Compare Versions', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show All Items' }).check();
  await page.getByLabel('Search comparison').fill('crane');
  await expect(page.getByRole('rowheader')).toHaveCount(1);
  await expect(page.getByRole('rowheader')).toHaveText('Fiberglass Crane');
  await page.screenshot({ path: testInfo.outputPath('normalized-selections.png') });
});

test('summary cards share detail expansion and match their columns', async ({ page }, testInfo) => {
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Version 2' }).check();
  await page.getByRole('checkbox', { name: 'Version 3' }).check();
  await page.getByRole('button', { name: 'Compare Versions', exact: true }).click();
  const cards = page.getByRole('region', { name: 'Saved financial summary' });
  await expect(page.getByText('Saved proposal total', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Every difference is compared/)).toHaveCount(0);
  await cards.locator('summary').nth(1).click();
  await expect(cards.locator('details[open]')).toHaveCount(3);
  await expect(cards).not.toContainText('Revision');
  const colors = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.vc-summary article')];
    const cells = [...document.querySelectorAll('.version-compare-scroll tbody tr:not(.vc-category)')][0].querySelectorAll('td[data-version-value]');
    return cards.map((card, i) => [getComputedStyle(card).backgroundColor, getComputedStyle(cells[i]).backgroundColor]);
  });
  for (const [card, cell] of colors) expect(card).toBe(cell);
  await page.screenshot({ path: testInfo.outputPath('synchronized-summary-cards.png') });
  await cards.locator('summary').nth(2).focus();
  await page.keyboard.press('Enter');
  await expect(cards.locator('details[open]')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Show COGS', exact: true }).check();
  await expect(cards.locator('details[open]')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Show COGS', exact: true }).uncheck();
  await expect(cards.locator('details[open]')).toHaveCount(0);
  await cards.locator('summary').first().click();
  await page.getByRole('checkbox', { name: 'Show COGS', exact: true }).check();
  await expect(cards.locator('details[open]')).toHaveCount(3);
  await page.getByRole('checkbox', { name: 'Show COGS', exact: true }).uncheck();
  await expect(cards.locator('details[open]')).toHaveCount(3);
});

test('comparison and proposal summary share the active COGS setting', async ({ page }) => {
  await page.goto(fixture);
  const summary = page.getByRole('checkbox', { name: 'Summary Show COGS', exact: true });
  const open = async () => {
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Version 2' }).check();
    await page.getByRole('button', { name: 'Compare Versions', exact: true }).click();
  };
  await summary.check();
  await open();
  await expect(page.getByRole('checkbox', { name: 'Show COGS', exact: true })).toBeChecked();
  await expect(page.locator('.vc-summary details[open]')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Show COGS', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(summary).not.toBeChecked();
  await open();
  await expect(page.getByRole('checkbox', { name: 'Show COGS', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Show COGS', exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(summary).toBeChecked();
});

for (const role of ['owner', 'collaborator']) {
  test(`versions header keeps title clear for ${role}`, async ({ page }, testInfo) => {
    await page.goto(`${fixture}?header=${role}`);
    const heading = page.getByRole('heading', { name: 'Versions & Addendums' });
    const compare = page.getByRole('button', { name: 'Compare', exact: true });
    await expect(heading).toBeVisible();
    const titleBox = (await heading.boundingBox())!;
    const compareBox = (await compare.boundingBox())!;
    expect(compareBox.y).toBeGreaterThan(titleBox.y + titleBox.height);
    const fits = await heading.evaluate(el => el.scrollWidth <= el.clientWidth);
    expect(fits).toBe(true);
    await compare.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Compare saved versions');
    await expect(compare).not.toHaveAttribute('title');
    const actions = (await page.locator('.proposal-versions-actions').boundingBox())!;
    if (role === 'owner') {
      const build = (await page.getByRole('button', { name: 'Build Another Version' }).boundingBox())!;
      expect(build.x).toBeGreaterThan(compareBox.x + compareBox.width);
      expect(build.y).toBeCloseTo(compareBox.y, 0);
      await page.getByRole('button', { name: 'Build Another Version' }).hover();
      await expect(page.getByRole('tooltip')).toHaveText('Create a new version inside this proposal tree');
    } else {
      await expect(page.getByRole('button', { name: 'Build Another Version' })).toHaveCount(0);
      expect(compareBox.width).toBeCloseTo(actions.width, 0);
    }
    await page.screenshot({ path: testInfo.outputPath(`versions-header-${role}.png`) });
  });
}

test('five versions have distinct matching card and column colors that survive baseline changes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1800, height: 1100 });
  await page.goto(`${fixture}?five`);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  for (const number of [2, 3, 4, 5]) await page.getByRole('checkbox', { name: `Version ${number}` }).check();
  await page.getByRole('button', { name: 'Compare Versions', exact: true }).click();
  const colors = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.vc-summary article')];
    const headers = [...document.querySelectorAll('.version-compare-scroll thead th:not(.vc-price-column)')].slice(1);
    const cells = document.querySelector('.version-compare-scroll tbody tr:not(.vc-category)')!.querySelectorAll('td[data-version-value]');
    return cards.map((card, i) => ({ name: card.querySelector('strong')!.textContent, card: getComputedStyle(card).backgroundColor,
      header: getComputedStyle(headers[i]).backgroundColor, cell: getComputedStyle(cells[i]).backgroundColor }));
  });
  expect(new Set(colors.map(c => c.card)).size).toBe(5);
  for (const color of colors) { expect(color.card).toBe(color.cell); expect(color.card).toBe(color.header); }
  await page.screenshot({ path: testInfo.outputPath('five-version-colors.png') });
  await page.getByRole('tab', { name: 'Item Prices' }).click();
  await page.getByRole('tabpanel').evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await page.screenshot({ path: testInfo.outputPath('five-version-prices-scrolled.png') });
  await page.getByRole('button', { name: 'Change Selections' }).click();
  await page.getByLabel('Baseline', { exact: true }).selectOption('v4');
  await page.getByRole('button', { name: 'Compare Versions', exact: true }).click();
  const newBaseline = await page.locator('.vc-summary article').first().evaluate(el => getComputedStyle(el).backgroundColor);
  expect(newBaseline).toBe(colors[4].card);
});

test('category titles stick below column headings and yield to the next category', async ({ page }, testInfo) => {
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Version 2' }).check();
  await page.getByRole('button', { name: 'Compare Versions', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show All Items' }).check();
  for (const tab of ['Changes', 'Item Prices']) {
    await page.getByRole('tab', { name: tab, exact: tab === 'Item Prices' }).click();
    const panel = page.getByRole('tabpanel');
    await panel.evaluate(el => { el.scrollTop = 0; });
    const positions = await panel.evaluate(el => {
      const groups = el.querySelectorAll('tbody');
      const head = el.querySelector('thead')!.getBoundingClientRect();
      const first = groups[0].getBoundingClientRect();
      return { headerHeight: head.height, firstHeight: first.height };
    });
    await panel.evaluate((el, y) => { el.scrollTop = y; }, Math.min(40, positions.firstHeight / 3));
    let geometry = await panel.evaluate(el => ({ header: el.querySelector('thead th')!.getBoundingClientRect().bottom,
      category: el.querySelector('.vc-category')!.getBoundingClientRect().top }));
    expect(geometry.category).toBeCloseTo(geometry.header, 0);
    await panel.evaluate((el, y) => { el.scrollTop = y; }, positions.firstHeight + 10);
    const next = await panel.evaluate(el => ({ header: el.querySelector('thead th')!.getBoundingClientRect().bottom,
      category: el.querySelectorAll('.vc-category')[1].getBoundingClientRect().top }));
    expect(next.category).toBeCloseTo(next.header, 0);
    await page.screenshot({ path: testInfo.outputPath(`sticky-category-${tab}.png`) });
  }
});

test('wheel scrolling advances a full row below the sticky category', async ({ page }, testInfo) => {
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Version 2' }).check();
  await page.getByRole('button', { name: 'Compare Versions', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show All Items' }).check();
  const panel = page.getByRole('tabpanel');
  await panel.hover();
  const topRow = () => panel.evaluate(el => {
    const headerBottom = el.querySelector('thead th')!.getBoundingClientRect().bottom;
    const categoryHeight = el.querySelector('.vc-category')!.getBoundingClientRect().height;
    const top = headerBottom + categoryHeight;
    const rows = [...el.querySelectorAll('tbody tr:not(.vc-category)')];
    const index = rows.findIndex(row => row.getBoundingClientRect().bottom > top + 1);
    return { index, gap: rows[index].getBoundingClientRect().top - top };
  });
  const before = await topRow();
  await page.mouse.wheel(0, 500);
  await expect.poll(async () => (await topRow()).index).toBe(before.index + 1);
  await expect.poll(async () => Math.abs((await topRow()).gap)).toBeLessThan(2);
  // Cross multiple category boundaries in both directions, including unequal row heights.
  for (const direction of [1, -1]) {
    for (let step = 0; step < 12; step++) {
      const current = await topRow();
      await page.mouse.wheel(0, direction * 500);
      await expect.poll(async () => (await topRow()).index).toBe(current.index + direction);
      await expect.poll(async () => Math.abs((await topRow()).gap)).toBeLessThan(2);
    }
  }
  const burstStart = await topRow();
  await panel.evaluate(el => {
    for (let i = 0; i < 5; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
  });
  await expect.poll(async () => (await topRow()).index).toBe(burstStart.index + 5);
  await expect.poll(async () => Math.abs((await topRow()).gap)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('row-scrolling.png') });
});

test('selection price columns use saved heater and tile amounts and leave geometry unpriced', async ({ page }, testInfo) => {
  await page.goto(fixture);
  const result = await page.evaluate(async () => {
    const { savedSelectionAmount, savedVersionPrices, priceDifference } = await import('/src/utils/versionComparison.ts');
    const seed = structuredClone((window as any).comparisonVersions[0]);
    const make = (heaterName: string, heaterCost: number, tileCost: number, margin: number) => {
      const p = structuredClone(seed);
      p.equipment.heater = { name: heaterName, btu: 400000 }; p.equipment.heaterQuantity = 1;
      p.costBreakdown = { equipmentOrdered: [{ category: 'Equipment', description: heaterName, quantity: 1, total: heaterCost, unitPrice: heaterCost }],
        tileMaterial: [{ category: 'Tile Material', description: 'Level 2 Tile', quantity: 100, total: tileCost, unitPrice: tileCost / 100 }] };
      p.totalCost = (heaterCost + tileCost) * 1.1 / margin;
      Object.assign(p.pricing, { totalCostsBeforeOverhead: heaterCost + tileCost, overheadMultiplier: 1.1, targetMargin: margin,
        baseRetailPrice: p.totalCost, manualAdjustmentsTotal: 0, discountAmount: 0, g3UpgradeCost: 0 });
      return p;
    };
    const a = make('Heater A', 1000, 500, .5), b = make('Heater B', 1500, 900, .55);
    const ar = savedVersionPrices(a), br = savedVersionPrices(b);
    const difference = (key: string, cogs = false) => priceDifference(savedSelectionAmount(a, ar.rows, key, cogs), savedSelectionAmount(b, br.rows, key, cogs));
    return { heater: difference('equipment.heater'), tile: difference('tileCopingDecking.tile'),
      heaterCogs: difference('equipment.heater', true), perimeter: difference('poolSpecs.perimeter'), warnings: [ar.warning, br.warning] };
  });
  expect(result).toEqual({ heater: 800, tile: 700, heaterCogs: 550, perimeter: null, warnings: [null, null] });
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Version 2' }).check();
  await page.getByRole('button', { name: 'Compare Versions', exact: true }).click();
  await expect(page.locator('.vc-model-pill')).toHaveCount(2);
  await expect(page.locator('.vc-model-pill').first()).toHaveText('October 2026');
  await expect(page.getByRole('columnheader', { name: 'Retail Cost', exact: true })).toHaveCount(1);
  await expect(page.getByRole('row', { name: /^Perimeter/ }).locator('.vc-price-column')).toHaveText('—');
  const pump = page.getByRole('row', { name: /^Pump/ });
  await expect(pump.locator('.vc-price-column')).toContainText('$');
  const fill = await pump.locator('td').evaluateAll(cells => cells.map(el => getComputedStyle(el).backgroundColor));
  expect(fill[1]).toBe(fill[2]);
  await page.screenshot({ path: testInfo.outputPath('selection-price-columns.png') });
});

test('price tooltips render inside the modal top layer', async ({ page }, testInfo) => {
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Version 2' }).check();
  await page.getByRole('button', { name: 'Compare Versions', exact: true }).click();
  const row = page.getByRole('row', { name: /^Perimeter/ });
  await row.locator('.vc-price-column .app-tooltip-anchor').hover();
  const tooltip = page.getByRole('dialog').getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveCSS('opacity', '1');
  await expect(tooltip).toContainText('no separately identifiable saved item price');
  await page.screenshot({ path: testInfo.outputPath('price-tooltip-above-dialog.png') });
  await page.getByRole('dialog').locator('.vc-model-pill').first().hover();
  await expect(page.getByRole('dialog').getByRole('tooltip')).toHaveText('October 2026');
});
