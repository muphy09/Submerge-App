import { test, expect } from '@playwright/test';

test('a delayed tier change cannot replace a newer model selection or its saved pricing', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      window.__APP_ENV__ = { VITE_SUPABASE_URL: 'https://submerge-playwright.invalid', VITE_SUPABASE_ANON_KEY: 'review-placeholder', VITE_SUPABASE_ONLY: 'false' };
      localStorage.setItem('submerge-user-session', JSON.stringify({ userId: 'normal-owner', userName: 'Review owner', role: 'designer', franchiseId: 'shared-fixture', franchiseCode: '5555' }));
    });
    let holdNext = false;
    let held: (() => Promise<void>) | undefined;
    await page.route('https://submerge-playwright.invalid/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/auth/v1/health') return route.fulfill({ json: {} });
      if (path.endsWith('/franchise_pricing_models')) {
        const models = ['normal-model', 'second-model'].map((id, index) => ({ id, franchise_id: 'shared-fixture', name: index ? 'Second model' : 'Normal model', is_default: !index, version: 'v1', pricing_json: {}, current_revision_id: index ? 'second-r1' : 'normal-r1' }));
        const requested = new URL(route.request().url()).searchParams.get('id');
        const model = models.find(model => requested === `eq.${model.id}`) || models[0];
        const reply = () => route.fulfill({ json: route.request().headers().accept?.includes('object') ? model : new URL(route.request().url()).searchParams.get('limit') === '1' ? [model] : models });
        if (holdNext) { holdNext = false; held = reply; return; }
        return reply();
      }
      if (path.endsWith('/franchise_pricing_model_revisions')) {
        const second = new URL(route.request().url()).searchParams.get('pricing_model_id') === 'eq.second-model';
        return route.fulfill({ json: { id: second ? 'second-r1' : 'normal-r1', pricing_model_id: second ? 'second-model' : 'normal-model', franchise_id: 'shared-fixture', revision_number: 1, pricing_json: { misc: { taxRate: second ? 0.09 : 0.01 } } } });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto('http://127.0.0.1:5173/tests/fixtures/shared-proposal-editor.html?normalCreation');
    const tier = page.locator('.form-header-pricing--tier select');
    await expect(page.locator('select').filter({ has: page.locator('option[value="normal-model"]') })).toHaveValue('normal-model');
    await expect(tier).toBeEnabled();
    holdNext = true;
    await tier.selectOption('bronze');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect.poll(() => Boolean(held)).toBe(true);
    const model = page.locator('select').filter({ has: page.locator('option[value="second-model"]') });
    await model.selectOption('second-model');
    await expect(model).toHaveValue('second-model');
    await expect.poll(() => page.evaluate(async () => (await import('/src/services/pricingDataStore.ts')).getPricingDataSnapshot().misc.taxRate)).toBe(0.09);
    await held!();
    // Let the released response and React's next paint finish before checking
    // that the obsolete tier request did not replace the newer model snapshot.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(model).toHaveValue('second-model');
    await expect(tier).toHaveValue('normal');
    await expect(page.getByPlaceholder('Enter customer name')).toBeVisible();
    expect(await page.evaluate(async () => (await import('/src/services/pricingDataStore.ts')).getPricingDataSnapshot().misc.taxRate)).toBe(0.09);
    await page.screenshot({ path: testInfo.outputPath('model-selection-after-delayed-tier.png') });
    await page.getByPlaceholder('Enter customer name').fill('Pricing race protected');
    await page.context().setOffline(true);
    await page.getByRole('button', { name: 'Proposal Summary', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).normalSavedProposals.length)).toBeGreaterThan(0);
    const saved = await page.evaluate(() => (window as any).normalSavedProposals.at(-1));
    expect(saved.pricingModelId).toBe('second-model');
    expect(saved.pricingModelRevisionId).toBe('second-r1');
    expect(saved.pricingTierId).toBe('normal');
    expect(saved.taxRate).toBe(0.09);
});
