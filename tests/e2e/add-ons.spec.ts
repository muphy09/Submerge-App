import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const url = `${process.env.SUBMERGE_TEST_BASE_URL || 'http://127.0.0.1:5173'}/tests/fixtures/add-ons.html`;
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const target = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(target.hostname) || target.protocol === 'blob:' ? route.continue() : route.abort();
  });
});

test('admin edits independent add-on catalogs, both costs, defaults and package permission', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${url}?view=admin`);
  await page.getByRole('button', { name: /^E Equipment$/ }).click();
  const table = page.locator('.pricing-table').filter({ hasText: 'Equipment Fixture Add-on' });
  await expect(table).toContainText('Cost 1');
  await expect(table).toContainText('Cost 2');
  await expect(table).toContainText('Include by Default');
  await table.getByText('Equipment Fixture Add-on', { exact: true }).click();
  const name = page.locator('label.pricing-field').filter({ hasText: 'Add-On Name' }).locator('input:visible');
  await name.fill('Updated Equipment Add-on');
  await page.locator('label.pricing-field').filter({ hasText: 'Cost 1' }).locator('input:visible').fill('175');
  await page.locator('label.pricing-field').filter({ hasText: 'Cost 2' }).locator('input:visible').fill('25');
  await page.getByRole('checkbox', { name: 'Include by Default', exact: true }).uncheck();
  await expect.poll(() => page.evaluate(() => (window as any).getAddOnPricing().equipment.addOns[0])).toMatchObject({ name: 'Updated Equipment Add-on', cost1: 175, cost2: 25, includeByDefault: false });
  await page.getByRole('button', { name: 'Add add-on', exact: true }).click();
  await name.fill('New Equipment Add-on');
  await expect.poll(() => page.evaluate(() => (window as any).getAddOnPricing().equipment.addOns.length)).toBe(3);
  await page.screenshot({ path: testInfo.outputPath('admin-add-ons.png'), fullPage: true });

  const addOnControls = page.locator('label').filter({ hasText: /^Add-ons$/ });
  await expect(addOnControls.first()).toBeVisible();
  await addOnControls.first().locator('input').uncheck();
  await expect.poll(() => page.evaluate(() => (window as any).getAddOnPricing().equipment.packageOptions.find((pkg: any) => pkg.id === 'allowed').allowAddOns)).toBe(false);
  await page.getByRole('button', { name: /^IF Interior Finish$/ }).click();
  const interiorTable = page.locator('.pricing-table').filter({ hasText: 'Add-On Name' });
  await expect(interiorTable).toContainText('Finish Fixture Add-on');
  await expect(interiorTable).not.toContainText('Updated Equipment Add-on');
  await page.evaluate(() => (window as any).saveAddOnPricing());
  await expect.poll(() => page.evaluate(() => (window as any).savedAddOnPricing?.equipment?.addOns?.[0]?.cost1)).toBe(175);
});

test('equipment cards toggle, show actual price impact, respect packages and survive serialization', async ({ page }, testInfo) => {
  await page.goto(url);
  const block = page.getByTestId('equipment-add-ons');
  await expect(block.getByRole('switch', { name: 'Equipment Fixture Add-on', exact: true })).toBeChecked();
  await expect(block.getByRole('switch', { name: 'Second Equipment Add-on', exact: true })).not.toBeChecked();
  await block.getByRole('button', { name: 'Show Price Impact for Equipment Fixture Add-on', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Price Impact for Equipment Fixture Add-on', exact: true })).toContainText('Equipment Fixture Add-on');
  await page.keyboard.press('Escape');
  await block.getByRole('switch', { name: 'Second Equipment Add-on', exact: true }).check();
  await page.getByRole('button', { name: 'Save and reload', exact: true }).click();
  await expect(block.getByRole('switch', { name: 'Second Equipment Add-on', exact: true })).toBeChecked();
  await block.screenshot({ path: testInfo.outputPath('equipment-add-ons.png') });
  await page.getByRole('combobox', { name: 'Fixture package' }).selectOption('restricted');
  await expect(block.getByRole('switch').first()).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (window as any).getAddOnProposal().costBreakdown.equipmentOrdered.filter((item: any) => item.details?.addOnId).length)).toBe(0);
  await page.getByRole('combobox', { name: 'Fixture package' }).selectOption('allowed');
  await expect(block.getByRole('switch').first()).toBeEnabled();
});

test('interior finish add-ons remain available with fiberglass and show price impact', async ({ page }, testInfo) => {
  await page.goto(`${url}?view=interiorFinish&fiberglass=1`);
  const block = page.getByTestId('interiorFinish-add-ons');
  await expect(block.getByRole('switch', { name: 'Finish Fixture Add-on', exact: true })).toBeChecked();
  await block.getByRole('button', { name: 'Show Price Impact for Finish Fixture Add-on', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Price Impact for Finish Fixture Add-on', exact: true })).toContainText(/Finish Fixture Add[ -]On/i);
  await page.keyboard.press('Escape');
  await block.getByRole('switch', { name: 'Finish Fixture Add-on', exact: true }).uncheck();
  await expect.poll(() => page.evaluate(() => (window as any).getAddOnProposal().costBreakdown.interiorFinish.filter((item: any) => item.details?.addOnId).length)).toBe(0);
  await block.screenshot({ path: testInfo.outputPath('finish-add-ons.png') });
});

test('contract overflow renders continuation pages and exports every specification', async ({ page }, testInfo) => {
  await page.goto(`${url}?view=contract&overflow=1`);
  await expect(page.locator('.contract-page-canvas')).toHaveCount(4);
  const exported = await page.evaluate(async () => (window as any).buildAddOnPdf(true));
  expect(exported.pages).toBe(4);
  expect(exported.textPages[2]).toContain('Additional Specifications - Continued');
  expect(exported.textPages[3]).toContain('Equipment Add-on: Equipment Fixture Add-on');
  expect(exported.textPages[3]).toContain('Interior Finish Add-on: Finish Fixture Add-on');
  expect(exported.values).toContain('Equipment Add-on: Equipment Fixture Add-on');
  expect(exported.values).toContain('Interior Finish Add-on: Finish Fixture Add-on');
  expect(exported.fields.filter((field: any) => field.name.startsWith('additional_spec_continuation_')).length).toBe(36);
  await writeFile(testInfo.outputPath('contract-add-ons.pdf'), Buffer.from(exported.pdf));
  await expect.poll(() => page.locator('.contract-page-canvas').nth(2).evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, Math.floor(canvas.height * 0.12)).data;
    return pixels.some((value, index) => index % 4 !== 3 && value < 150 && pixels[index - index % 4 + 3] > 0);
  })).toBe(true);
  await page.locator('.contract-page-shell').nth(2).screenshot({ path: testInfo.outputPath('contract-continuation.png') });
  const form = await page.evaluate(async () => (window as any).buildAddOnPdf(false));
  expect(form.pages).toBe(4);
  expect(form.fields.map((field: any) => field.pageIndex)).toContain(3);
});


test('COGS groups selected add-ons under their own subcategory', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${url}?view=cogs`);
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  const details = page.locator('.cogs-report-page--detail');
  await expect(details).toContainText('Equipment Fixture Add-on');
  await expect(details).toContainText('Finish Fixture Add-on');
  await expect(details.getByText('Add-ons', { exact: true })).toHaveCount(2);
  await expect(details).not.toContainText('Second Equipment Add-on');
  await details.screenshot({ path: testInfo.outputPath('add-ons-cogs.png') });
});
