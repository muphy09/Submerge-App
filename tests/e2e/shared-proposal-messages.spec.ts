import { expect, test } from '@playwright/test';

test('the real summary greets its recipient and navigates to the dashboard after leaving', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.__APP_ENV__ = { VITE_SUPABASE_URL: 'https://submerge-playwright.invalid',
      VITE_SUPABASE_ANON_KEY: 'playwright-public-placeholder', VITE_SUPABASE_ONLY: 'false' };
    localStorage.setItem('submerge-user-session', JSON.stringify({ userId: 'contributor', userName: 'Contributor',
      role: 'designer', franchiseId: 'shared-fixture', franchiseCode: '5555' }));
  });
  let left = false;
  let acknowledged = false;
  let forbiddenReads = 0;
  await page.route('https://submerge-playwright.invalid/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const proposal = await page.evaluate(() => (window as any).sharedEditorFixture?.proposal);
    const single = route.request().headers().accept?.includes('object');
    const reply = (rows: unknown[]) => route.fulfill({ json: single ? rows[0] || null : rows });
    if (path === '/auth/v1/health') return route.fulfill({ json: {} });
    if (path.endsWith('/franchise_proposals')) return reply([{ proposal_number: proposal.proposalNumber,
      proposal_json: proposal, franchise_id: 'shared-fixture', owner_auth_user_id: 'owner', designer_auth_user_id: 'owner',
      content_revision: 3, collaboration_enabled: true, status: 'draft' }]);
    if (path.endsWith('/proposal_collaboration_shares')) return reply(left ? [] : [{ id: 'share',
      proposal_number: proposal.proposalNumber, recipient_id: 'contributor', permission: 'contribute',
      note: 'Please review the equipment choices.', franchise_id: 'shared-fixture', ended_at: null }]);
    if (path.endsWith('/collab_people')) return route.fulfill({ json: [
      { user_id: 'owner', display_name: 'Original Owner', email: 'owner@playwright.invalid' },
      { user_id: 'contributor', display_name: 'Contributor', email: 'contributor@playwright.invalid' }] });
    if (path.endsWith('/proposal_collaboration_requests')) {
      if (left) forbiddenReads++;
      return reply([]);
    }
    if (path.endsWith('/proposal_collaboration_events')) return reply(acknowledged ? [] : [{ id: 'message-event',
      proposal_number: proposal.proposalNumber, event_type: 'shared', actor_id: 'owner', note: 'Please review the equipment choices.',
      created_at: '2026-10-27T12:00:00Z', read_at: null }]);
    if (path.endsWith('/collab_mark_event_read')) {
      expect(route.request().postDataJSON().p_event).toBe('message-event');
      acknowledged = true;
      return route.fulfill({ json: null });
    }
    if (path.endsWith('/collab_end_share')) {
      expect(route.request().postDataJSON()).toMatchObject({ p_number: proposal.proposalNumber, p_recipient: 'contributor' });
      left = true;
      return route.fulfill({ json: null });
    }
    if (path.endsWith('/franchise_pricing_models')) return reply([{ id: 'model-a', franchise_id: 'shared-fixture',
      name: 'Owner pricing', is_default: true, version: 'v1', pricing_json: {}, current_revision_id: 'r1' }]);
    if (path.endsWith('/franchise_pricing_model_revisions')) return reply([{ id: 'r1', pricing_model_id: 'model-a',
      franchise_id: 'shared-fixture', revision_number: 1, pricing_json: {} }]);
    return reply([]);
  });
  await page.goto('http://127.0.0.1:5173/tests/fixtures/shared-proposal-editor.html?summary');
  const message = page.getByRole('dialog', { name: 'Message from Original Owner' });
  await expect(message).toContainText('Please review the equipment choices.');
  expect(acknowledged).toBe(false);
  await expect(message.getByRole('button')).toHaveCount(1);
  await message.getByRole('button', { name: 'Okay' }).click();
  await expect(message).toHaveCount(0);
  await expect.poll(() => acknowledged).toBe(true);
  const viewProposal = page.getByRole('button', { name: 'View Proposal', exact: true });
  await viewProposal.hover();
  await expect(page.getByRole('tooltip')).toHaveText('Open the proposal in the builder.');
  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const header = page.locator('.proposal-nav-card-header');
    await expect(header).toHaveClass(/is-without-build/);
    await expect(header.locator('.proposal-nav-build-action')).toHaveCount(0);
    const heading = header.getByRole('heading', { name: 'Versions & Addendums', exact: true });
    await expect(heading).toHaveCSS('font-size', '20px');
    expect(await heading.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await header.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const copy = await header.locator('.proposal-nav-heading-copy').boundingBox();
    const title = await heading.boundingBox();
    expect(title!.width).toBeCloseTo(copy!.width, 0);
    await header.screenshot({ path: testInfo.outputPath(`shared-summary-header-${width}.png`) });
  }
  await page.getByRole('button', { name: 'Leave Proposal', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Leave proposal?' });
  await expect(confirm.locator('.confirm-modal')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('summary-leave-confirmation.png') });
  await confirm.getByRole('button', { name: 'Leave Proposal' }).click();
  await expect(page.locator('.dashboard-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My Proposals', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Proposal Summary', exact: true })).toHaveCount(0);
  expect(left).toBe(true);
  expect(forbiddenReads).toBe(0);
});
