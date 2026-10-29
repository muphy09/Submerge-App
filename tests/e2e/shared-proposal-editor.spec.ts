import { test, expect } from '@playwright/test';

test('normal proposal creation and save survive session refresh during pricing initialization and editing', async ({ page }) => {
  await page.addInitScript(() => {
    window.__APP_ENV__ = { VITE_SUPABASE_URL: 'https://submerge-playwright.invalid',
      VITE_SUPABASE_ANON_KEY: 'playwright-public-placeholder', VITE_SUPABASE_ONLY: 'false' };
    localStorage.setItem('submerge-user-session', JSON.stringify({ userId: 'normal-owner',
      userName: 'Normal owner', role: 'designer', franchiseId: 'shared-fixture', franchiseCode: '5555' }));
  });
  const errors: string[] = [];
  page.on('console', message => {
    if (/Unable to initialize pricing|signed-in account or workspace changed|Failed to save proposal/.test(message.text())) errors.push(message.text());
  });
  let refreshes = 0;
  await page.route('https://submerge-playwright.invalid/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/health') return route.fulfill({ json: {} });
    if (path.endsWith('/franchise_pricing_models')) {
      await page.evaluate(async () => {
        const session = await import('/src/services/session.ts');
        session.saveSession({ ...session.readSession(), userName: 'Refreshed owner' });
      });
      refreshes++;
      const model = { id: 'normal-model', franchise_id: 'shared-fixture', name: 'Normal model',
        is_default: true, version: 'v1', pricing_json: {}, current_revision_id: 'normal-r1' };
      return route.fulfill({ json: route.request().headers().accept?.includes('object') ? model : [model] });
    }
    if (path.endsWith('/franchise_pricing_model_revisions')) return route.fulfill({ json: {
      id: 'normal-r1', pricing_model_id: 'normal-model', franchise_id: 'shared-fixture', revision_number: 1, pricing_json: {} } });
    return route.fulfill({ json: [] });
  });
  await page.goto('http://127.0.0.1:5173/tests/fixtures/shared-proposal-editor.html?normalCreation');
  const input = page.getByPlaceholder('Enter customer name');
  await expect(input).toBeEnabled();
  await expect.poll(() => refreshes).toBeGreaterThan(0);
  await expect(page.locator('select').filter({ has: page.locator('option[value="normal-model"]') })).toHaveValue('normal-model');
  await input.fill('Normal new customer');
  await page.evaluate(async () => {
    const session = await import('/src/services/session.ts');
    session.updateSession({ userName: 'Refreshed again', passwordResetRequired: false });
  });
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Proposal Summary', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).normalSavedProposals.length)).toBeGreaterThan(0);
  const saved = await page.evaluate(() => (window as any).normalSavedProposals.at(-1));
  expect(saved.customerInfo.customerName).toBe('Normal new customer');
  expect(saved.pricingModelId).toBe('normal-model');
  expect(saved.pricingModelRevisionId).toBe('normal-r1');
  expect(errors).toEqual([]);
});

for (const resumeExisting of [false, true]) {
test(resumeExisting ? 'a late-discovered working copy keeps its older pricing pin when owner pricing has advanced'
  : 'an admin contributor sees the pending revision and can save private edits using owner pricing', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.__APP_ENV__ = { VITE_SUPABASE_URL: 'https://submerge-playwright.invalid',
      VITE_SUPABASE_ANON_KEY: 'playwright-public-placeholder', VITE_SUPABASE_ONLY: 'false' };
    localStorage.setItem('submerge-user-session', JSON.stringify({ userId: 'contributor', userName: 'Contributor Admin',
      role: 'admin', franchiseId: 'shared-fixture', franchiseCode: '5555', digCommissionRate: 0.1, closeoutCommissionRate: 0.1 }));
  });
  let request: any = null;
  let savedWork: any = null;
  let ownerWrites = 0;
  await page.route('https://submerge-playwright.invalid/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const proposal = await page.evaluate(() => (window as any).sharedEditorFixture?.proposal);
    const single = route.request().headers().accept?.includes('object');
    let rows: any[] = [];
    if (path === '/auth/v1/health') return route.fulfill({ json: {} });
    if (path.endsWith('/franchise_proposals')) {
      if (route.request().method() !== 'GET') { ownerWrites++; return route.abort(); }
      rows = [{ proposal_json: proposal, franchise_id: 'shared-fixture', owner_auth_user_id: 'owner',
        designer_auth_user_id: 'owner', content_revision: 3, collaboration_enabled: true, status: 'draft' }];
    }
    if (path.endsWith('/proposal_collaboration_shares')) rows = [{ id: 'share', proposal_number: 'PROP-SHARED-EDITOR',
      recipient_id: 'contributor', permission: 'contribute', franchise_id: 'shared-fixture', ended_at: null }];
    if (path.endsWith('/franchise_pricing_models')) rows = [{ id: 'model-a', franchise_id: 'shared-fixture',
      name: 'Owner pricing', is_default: true, version: 'v1', pricing_json: {}, current_revision_id: 'r2' }];
    if (path.endsWith('/franchise_pricing_model_revisions')) {
      rows = [{ id: 'r0', pricing_model_id: 'model-a', franchise_id: 'shared-fixture', revision_number: 0, pricing_json: { papDiscountRates: { excavation: 0.25 } } },
        { id: 'r1', pricing_model_id: 'model-a', franchise_id: 'shared-fixture', revision_number: 1, pricing_json: {} },
        { id: 'r2', pricing_model_id: 'model-a', franchise_id: 'shared-fixture', revision_number: 2,
          pricing_json: { papDiscountRates: { excavation: 0.5 } } }];
      if (url.searchParams.has('id')) rows = rows.filter(row => url.searchParams.get('id') === `eq.${row.id}`);
    }
    if (path.endsWith('/collab_people')) rows = [{ user_id: 'owner', display_name: 'Owner', email: 'owner@playwright.invalid' }];
    if (path.endsWith('/collab_begin_work')) {
      const args = route.request().postDataJSON();
      expect(args.p_expected).toBe(3);
      request = { id: 'request', proposal_number: proposal.proposalNumber, target_version_id: 'original',
        contributor_id: 'contributor', base_revision: 3, base_version_json: proposal, working_version_json: proposal,
        protocol_version: 2, status: 'working', updated_at: '2026-10-27T12:00:00Z', created_at: '2026-10-27T12:00:00Z' };
      if (resumeExisting) {
        const old = { ...structuredClone(proposal), pricingModelRevisionId: 'r0', pricingModelRevisionNumber: 0 };
        request.base_version_json = old; request.working_version_json = old;
      }
      return route.fulfill({ json: request });
    }
    if (path.endsWith('/collab_save_work_v2')) {
      const args = route.request().postDataJSON(); savedWork = args.p_work;
      request = { ...request, working_version_json: savedWork, updated_at: '2026-10-27T13:00:00Z' };
      return route.fulfill({ json: request });
    }
    if (path.endsWith('/proposal_collaboration_requests')) rows = request ? [request] : [];
    if (path.endsWith('/collab_owner_save') || path.endsWith('/collab_apply_review')) { ownerWrites++; return route.abort(); }
    return route.fulfill({ json: single ? rows[0] || null : rows });
  });
  await page.goto('http://127.0.0.1:5173/tests/fixtures/shared-proposal-editor.html');
  await expect(page.getByText(/A pricing model revision is awaiting owner review/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Propose Changes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compare Difference' })).toHaveCount(0);
  const customerInput = page.getByPlaceholder('Enter customer name');
  const viewOnlyTip = page.getByRole('tooltip').filter({ hasText: 'VIEW ONLY' });
  const customerLabel = page.locator('.spec-label').filter({ hasText: /^Customer Name$/ });
  await customerLabel.hover();
  await expect(viewOnlyTip).toHaveCount(0);
  await customerInput.hover();
  await expect(viewOnlyTip).toBeVisible();
  await expect.poll(async () => {
    const input = await customerInput.boundingBox();
    const tip = await viewOnlyTip.boundingBox();
    return input!.y - tip!.y - tip!.height;
  }).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => {
    const input = await customerInput.boundingBox();
    const tip = await viewOnlyTip.boundingBox();
    return input!.y - tip!.y - tip!.height;
  }).toBeLessThan(24);
  await customerLabel.hover();
  await expect(viewOnlyTip).toHaveCount(0);
  await page.getByRole('heading', { name: 'Customer Information', exact: true }).hover();
  await expect(viewOnlyTip).toHaveCount(0);
  const cityInput = page.getByPlaceholder('Enter city');
  await cityInput.hover();
  await expect.poll(async () => {
    const input = await cityInput.boundingBox();
    const tip = await viewOnlyTip.boundingBox();
    return Math.abs(tip!.x + tip!.width / 2 - input!.x - input!.width / 2);
  }).toBeLessThan(2);
  await customerInput.hover();
  await customerInput.click();
  await customerInput.press('x');
  await expect(customerInput).toHaveValue('Shared editor test');
  for (const control of [page.locator('.form-header-pricing').first(), page.locator('.form-header-pricing--tier')]) {
    await expect(control).toHaveAttribute('data-tooltip', 'Pricing selections are controlled by the proposal owner.');
  }
  await page.screenshot({ path: testInfo.outputPath('view-only-input-tooltip.png') });
  await page.getByRole('button', { name: 'Propose Changes', exact: true }).click();
  await expect(page.getByText(/Shared Proposal · Editing Original Version Copy/)).toBeVisible();
  await expect(page.getByPlaceholder('Enter customer name')).toBeEnabled();
  await page.getByPlaceholder('Enter customer name').fill('Private contributor change');
  await expect(page.getByRole('heading', { name: 'Proposal Builder - Private contributor change' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('pending-revision-contributor-editor.png') });
  await page.getByRole('button', { name: 'Proposal Summary', exact: true }).click();
  await expect.poll(() => savedWork?.customerInfo?.customerName).toBe('Private contributor change');
  expect(savedWork.pricingModelRevisionId).toBe(resumeExisting ? 'r0' : 'r1');
  if (resumeExisting) expect(savedWork.papDiscounts.excavation).toBe(0.25);
  expect(savedWork.pricing).toMatchObject({ digCommissionRate: 0.01, closeoutCommissionRate: 0.02 });
  expect(ownerWrites).toBe(0);
  expect(await page.evaluate(() => (window as any).sharedEditorFixture.proposal.customerInfo.customerName)).toBe('Shared editor test');
  const toolbar = page.locator('.view-actions');
  await expect(toolbar.getByRole('heading', { name: 'Proposal Summary', exact: true })).toBeVisible();
  await expect(page.locator('.proposal-summary-header')).toHaveCount(0);
  await expect(page.locator('.hero-header .summary-selected-version')).toContainText('Version:');
  const share = toolbar.getByRole('button', { name: 'Share / Manage Access' });
  const complete = toolbar.getByRole('button', { name: 'Complete Proposal', exact: true });
  await expect(share).toBeDisabled();
  await expect(complete).toBeDisabled();
  for (const button of [share, complete]) {
    await button.locator('..').hover();
    await expect(page.getByRole('tooltip')).toHaveText('Owner action');
  }
  const toggle = toolbar.getByRole('switch');
  const wasChecked = await toggle.getAttribute('aria-checked');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', wasChecked === 'true' ? 'false' : 'true');
  const toggleBounds = await toggle.boundingBox();
  const shareBounds = await share.boundingBox();
  expect(toggleBounds!.x).toBeLessThan(shareBounds!.x);
  await page.screenshot({ path: testInfo.outputPath('collaborator-summary-toolbar.png') });
});
}
