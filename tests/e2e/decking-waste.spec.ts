import { expect, test } from '@playwright/test';
const url = 'http://127.0.0.1:5173/tests/fixtures/decking-waste.html';

test('admin can edit off-contract material waste as a percentage', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(url);
  await page.getByRole('button', { name: 'Tile, Coping & Decking', exact: true }).click();
  await page.getByRole('heading', { name: 'Off Contract Decking', exact: true }).scrollIntoViewIfNeeded();
  const field = page.locator('label.pricing-field').filter({ hasText: 'Material Waste' });
  await expect(field.locator('input')).toHaveValue('10');
  await field.locator('input').fill('12.5');
  await expect.poll(() => page.evaluate(() => (window as any).getWastePricing().tileCoping.offContractDecking.materialWasteRate)).toBe(0.125);
  for (const label of ['Quantity Waste', 'Freeform Waste']) {
    const input = page.locator('label.pricing-field').filter({ hasText: label }).locator('input');
    await expect(input).toHaveValue('5');
    await input.fill('7.5');
  }
  await expect.poll(() => page.evaluate(() => (window as any).getWastePricing().tileCoping.onContractDecking)).toEqual({ quantityWasteRate: 0.075, freeformWasteRate: 0.075 });
  await field.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('decking-waste-editor.png') });
});

for (const franchise of ['5555', '9724']) {
  for (const decision of ['keep', 'accept']) {
    test(`${franchise}: compare before ${decision} preserves saved pricing until accepted`, async ({ page }, testInfo) => {
      await page.goto(`${url}?review&franchise=${franchise}`);
      await expect(page.getByTestId('revision')).toHaveText('old');
      await expect(page.getByRole('button', { name: 'Upgrade to newest version' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Compare Difference' }).click();
      await expect(page.getByRole('table')).toContainText('Off Contract Material Waste');
      expect(await page.evaluate(() => JSON.stringify((window as any).wasteProposal) === JSON.stringify((window as any).initialWasteProposal))).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('decking-waste-comparison.png') });
      if (decision === 'keep') {
        await page.getByRole('button', { name: 'No, keep current pricing' }).click();
        await expect(page.getByTestId('decision')).toHaveText('declined');
        await expect(page.getByTestId('revision')).toHaveText('old');
        expect(await page.evaluate(() => JSON.stringify((window as any).wasteProposal.pricing) === JSON.stringify((window as any).initialWasteProposal.pricing))).toBe(true);
      } else {
        await page.getByRole('button', { name: 'Upgrade to newest version' }).click();
        await expect(page.getByTestId('revision')).toHaveText('new');
        expect(await page.evaluate(() => (window as any).wasteProposal.pricing.offContractTotal > (window as any).initialWasteProposal.pricing.offContractTotal)).toBe(true);
      }
    });
  }
}

test('an unavailable saved revision cannot fall back to current pricing', async ({ page }) => {
  await page.goto(`${url}?review`);
  await expect(page.getByTestId('revision')).toHaveText('old');
  expect(await page.evaluate(async () => {
    try { await (window as any).testMissingRevision(); return 'unsafe fallback'; }
    catch (error: any) { return error.message; }
  })).toContain('saved pricing revision');
});

test('accepting pricing on one proposal does not change a second proposal that keeps its revision', async ({ page }) => {
  await page.goto(`${url}?review&franchise=5555`);
  await expect(page.getByTestId('revision')).toHaveText('old');
  const result = await page.evaluate(() => (window as any).testPricingDecisionIsolation());
  expect(result).toEqual({
    a: { revision: 'new', decision: 'upgraded', snapshotRevision: 'new' },
    b: { revision: 'old', decision: 'declined', snapshotRevision: 'old' },
  });
});
