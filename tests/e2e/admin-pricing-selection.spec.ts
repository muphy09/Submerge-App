import { expect, test } from '@playwright/test';

test('Edit opens the chosen franchise pricing model and its pricing', async ({ page }, testInfo) => {
  await page.goto(`${process.env.SUBMERGE_TEST_ORIGIN || 'http://127.0.0.1:5173'}/tests/fixtures/admin-pricing-selection.html#/admin`);
  await page.getByRole('button', { name: 'Franchise Pricing', exact: true }).click();
  await page.locator('.admin-resource-row').filter({ hasText: 'Chosen model' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page).toHaveURL(/#\/admin\/pricing\?model=chosen-model$/);
  const selector = page.getByRole('combobox', { name: 'Select Pricing Model', exact: true });
  await expect(selector).toBeEnabled();
  await expect(selector).toHaveValue('chosen-model');
  expect(await page.evaluate(async () => (await import('/src/services/pricingDataStore.ts')).getPricingDataSnapshot().misc.taxRate)).toBe(0.09);
  await page.screenshot({ path: testInfo.outputPath('chosen-model-editor.png') });
});
