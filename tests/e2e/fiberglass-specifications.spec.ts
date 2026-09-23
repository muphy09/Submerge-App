import { expect, test, type Page } from '@playwright/test';

const url = 'http://127.0.0.1:5173/tests/fixtures/fiberglass-specifications.html';
const select = (page: Page, label: string) => page.locator('.spec-field').filter({ hasText: new RegExp(`^${label}`) }).locator('select').first();

test('new proposal locks complete fiberglass specifications and totals separate water volumes', async ({ page }) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Fiberglass', exact: true }).first().click();
  await select(page, 'Fiberglass Size').selectOption('small');
  await select(page, 'Fiberglass Model').selectOption('Apollo 14');
  const pool = page.locator('.spec-block').filter({ has: page.getByRole('heading', { name: 'Pool Dimensions' }) });
  await expect(pool.locator('input[readonly]')).toHaveCount(8);
  const specs = await page.evaluate(() => (window as any).fiberglassFixturePoolSpecs);
  expect(specs).toMatchObject({
    perimeter: 87, surfaceArea: 391, shallowDepth: 3.5, maxWidth: 13.8333,
    maxLength: 32, totalStepsAndBench: 53, approximateGallons: 7700,
  });
  await expect(pool.locator('input').nth(7)).not.toHaveAttribute('readonly');
  await select(page, 'Fiberglass Tanning Ledge').selectOption('Hermosa Tanning Ledge');
  await page.getByRole('button', { name: 'Fiberglass Spa' }).click();
  await select(page, 'Fiberglass Spa Option').selectOption('Mystic');
  const updated = await page.evaluate(() => (window as any).fiberglassFixturePoolSpecs);
  expect(updated.fiberglassSpaSpecifications).toMatchObject({ perimeter: 28, gallons: 950 });
  expect(updated.fiberglassLedgeSpecifications).toMatchObject({ perimeter: 27, gallons: 250 });
  expect(updated.fiberglassSpaSpecsAutoFilled).toBe(true);
  expect(updated.fiberglassLedgeSpecsAutoFilled).toBe(true);
  expect(await page.evaluate(() => (window as any).fiberglassFixtureWaterGallons)).toBe(8900);
  expect(await page.evaluate(() => (window as any).fiberglassFixtureWaterTruckLine()?.details?.totalGallons)).toBe(8900);
});

test('unmatched shell remains manually editable', async ({ page }) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Fiberglass', exact: true }).first().click();
  await select(page, 'Fiberglass Size').selectOption('small');
  await select(page, 'Fiberglass Model').selectOption('Hydura Lido 20XT');
  const pool = page.locator('.spec-block').filter({ has: page.getByRole('heading', { name: 'Pool Dimensions' }) });
  await expect(pool.locator('input[readonly]')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).fiberglassFixturePoolSpecs.fiberglassPoolSpecsAutoFilled)).toBe(false);
});

test('new franchise does not inherit specifications unless a populated model was copied', async ({ page }) => {
  await page.goto(`${url}?franchise=new-franchise`);
  await page.getByRole('button', { name: 'Fiberglass', exact: true }).first().click();
  await select(page, 'Fiberglass Size').selectOption('small');
  await select(page, 'Fiberglass Model').selectOption('Apollo 14');
  expect(await page.evaluate(() => (window as any).fiberglassFixturePoolSpecs.fiberglassPoolSpecsAutoFilled)).toBe(false);
  await page.goto(`${url}?franchise=new-franchise&copy`);
  await page.getByRole('button', { name: 'Fiberglass', exact: true }).first().click();
  await select(page, 'Fiberglass Size').selectOption('small');
  await select(page, 'Fiberglass Model').selectOption('Apollo 14');
  expect(await page.evaluate(() => (window as any).fiberglassFixturePoolSpecs.fiberglassPoolSpecsAutoFilled)).toBe(true);
});

test('admin catalog preview stays compact and editor exposes complete specs', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${url}?admin`);
  await page.getByRole('button', { name: 'FS Fiberglass Shells' }).click();
  const table = page.getByRole('table').filter({ hasText: 'Apollo 14' }).first();
  await expect(table.locator('thead th')).toContainText(['', 'Name', 'Size', 'Price', 'Specs']);
  await expect(table).toContainText('Complete');
  await expect(table).toContainText('Missing');
  await table.getByText('Apollo 14').click();
  await expect(page.getByRole('heading', { name: 'Specifications', exact: true })).toBeVisible();
  await expect(page.getByText('Complete — ready to autofill').last()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('fiberglass-spec-admin.png') });
  const details = page.locator('.fiberglass-spec-editor').last();
  await details.locator('label.pricing-field').filter({ hasText: 'Gallons' }).locator('input').fill('7650');
  await expect.poll(() => page.evaluate(() => (window as any).getFiberglassFixturePricing().fiberglass.poolModels.small[0].specifications.gallons)).toBe(7650);
  await page.getByRole('button', { name: /Publish Revision/ }).last().click();
  await expect.poll(() => page.evaluate(() => (window as any).getFiberglassFixtureSavedPricing().fiberglass.poolModels.small[0].specifications.gallons)).toBe(7650);
});

test('specification-only revisions show information without changing pricing review decisions', async ({ page }) => {
  await page.goto(url);
  const result = await page.evaluate(() => (window as any).testFiberglassRevisionProtection());
  expect(result).toEqual({
    specificationOnly: true,
    informationalNotice: true,
    genuinePriceChange: true,
    afterDecliningPriceChange: true,
    declinedInformationalNotice: true,
  });
  await page.goto(`${url}?specNotice`);
  await expect(page.getByRole('heading', { name: 'This model has been updated to work with Fiberglass Dimensions' })).toBeVisible();
  await expect(page.getByText('Your saved proposal dimensions and pricing are unchanged.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compare Difference' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue with saved proposal' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('contract Spa Perimeter uses manufacturer measurements', async ({ page }) => {
  await page.goto(url);
  expect(await page.evaluate(() => (window as any).testFiberglassContractSpaPerimeter())).toBe('28');
});

test('admin saves incomplete specs as shared model data across pricing tiers', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${url}?admin`);
  await page.getByRole('button', { name: 'FS Fiberglass Shells' }).click();
  await page.getByRole('table').filter({ hasText: 'Hydura Lido 20XT' }).first().getByText('Hydura Lido 20XT').click();
  const details = page.locator('.fiberglass-spec-editor').last();
  await details.locator('.fiberglass-spec-editor__dimension').first().locator('input').first().fill('12');
  await expect(page.getByText('Incomplete — manual proposal entry').last()).toBeVisible();
  await page.getByRole('combobox', { name: 'Pricing Tier' }).selectOption('bronze');
  await expect.poll(() => page.evaluate(() => (window as any).getFiberglassFixturePricing().fiberglass.poolModels.small[1].specifications.widthFeet)).toBe(12);
  await page.getByRole('button', { name: /Publish Revision/ }).last().click();
  await expect.poll(() => page.evaluate(() => (window as any).getFiberglassFixtureSavedPricing().fiberglass.poolModels.small[1].specifications.widthFeet)).toBe(12);
});

test('a separate ledge does not trigger the tanning shelf gallon deduction', async ({ page }) => {
  await page.goto(url);
  expect(await page.evaluate(() => (window as any).testSeparateLedgeNoDeduction())).toEqual({ pool: 3040, total: 3290 });
  expect(await page.evaluate(() => (window as any).testHistoricalGallons())).toBe(2190);
});
