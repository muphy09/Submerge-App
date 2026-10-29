import { expect, test } from '@playwright/test';

test('dashboard reveals cards and table together after configuration, sharing and pricing finish', async ({ page }, testInfo) => {
  await page.clock.install();
  await page.addInitScript(() => {
    window.__APP_ENV__ = { VITE_SUPABASE_URL: 'https://submerge-playwright.invalid',
      VITE_SUPABASE_ANON_KEY: 'playwright-public-placeholder', VITE_SUPABASE_ONLY: 'false' };
    localStorage.setItem('submerge-user-session', JSON.stringify({ userId: 'dashboard-owner', userName: 'Dashboard owner',
      role: 'designer', franchiseId: 'dashboard-fixture' }));
    localStorage.setItem('submerge.franchiseConfiguration.v1.dashboard-fixture', JSON.stringify({
      franchiseId: 'dashboard-fixture', configuration: { capabilities: { sharedProposals: true } } }));
  });
  const pending: Record<string, () => Promise<void>> = {};
  let holdBackground = false;
  let notificationRead = false;
  const incoming = 'PROP-SHARED-LOADING';
  const owned = 'PROP-DASHBOARD-LOCAL';
  await page.route('https://submerge-playwright.invalid/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const defer = (phase: string, json: unknown) => { pending[phase] = () => route.fulfill({ json }); };
    if (path === '/auth/v1/health') return route.fulfill({ json: {} });
    if (path.endsWith('/franchise_configuration_assignments')) return defer('configuration', { current_revision_id: 'configuration-1' });
    if (path.endsWith('/franchise_configuration_revisions')) return route.fulfill({ json: {
      id: 'configuration-1', franchise_id: 'dashboard-fixture', revision_number: 1, configuration_json: { capabilities: { sharedProposals: true } } } });
    if (path.endsWith('/proposal_collaboration_rollout')) return defer('rollout', { live_enabled: true, test_enabled: true });
    if (path.endsWith('/franchise_proposals')) return route.fulfill({ json: [{ proposal_number: incoming,
      owner_auth_user_id: 'remote-owner', content_revision: 1, collaboration_enabled: true,
      proposal_json: { proposalNumber: incoming, franchiseId: 'dashboard-fixture', designerAuthUserId: 'remote-owner',
        designerName: 'Remote owner', status: 'draft', versionId: 'original', poolSpecs: { poolType: 'shotcrete' },
        customerInfo: { customerName: 'Incoming shared customer', state: 'NC' }, createdDate: '2026-10-27T12:00:00Z', lastModified: '2026-10-27T12:00:00Z' } }] });
    if (path.endsWith('/franchise_pricing_models')) return defer('pricing', []);
    if (path.endsWith('/proposal_collaboration_shares')) {
      if (url.searchParams.has('recipient_id')) return defer('sharing', [{ id: 'incoming-share', proposal_number: incoming,
        recipient_id: 'dashboard-owner', permission: 'contribute', note: 'Please review', ended_at: null, created_at: '2026-10-27T12:00:00Z' }]);
      return route.fulfill({ json: [{ proposal_number: owned }] });
    }
    if (path.endsWith('/collab_people')) {
      const number = route.request().postDataJSON().p_number;
      return route.fulfill({ json: number === incoming
        ? [{ user_id: 'remote-owner', display_name: 'Remote owner', email: 'remote@playwright.invalid' }]
        : [{ user_id: 'dashboard-owner', display_name: 'Dashboard owner', email: 'owner@playwright.invalid' },
          { user_id: 'collaborator', display_name: 'Jordan Designer', email: 'jordan@playwright.invalid' }] });
    }
    if (path.endsWith('/proposal_collaboration_events')) {
      const events = [
        { id: 'new-share', proposal_number: incoming, event_type: 'shared', read_at: notificationRead ? '2026-10-27T13:00:00Z' : null },
        { id: 'owner-review', proposal_number: owned, event_type: 'changes_submitted', read_at: null },
      ];
      const json = events.filter(event => url.searchParams.get('read_at') === 'is.null' ? !event.read_at : event.read_at && event.event_type === 'shared');
      if (holdBackground && url.searchParams.get('read_at') === 'is.null') return defer('background', json);
      return route.fulfill({ json });
    }
    return route.fulfill({ json: [] });
  });
  const loading = page.getByRole('status').filter({ hasText: 'Dashboard loading...' });
  const assertOnlyLoading = async () => {
    await expect(loading).toBeVisible();
    await expect(page.locator('.dashboard-loading-spinner')).toBeVisible();
    await expect(page.locator('.recent-activity-card')).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
  };
  await page.goto('http://127.0.0.1:5173/tests/fixtures/dashboard-sign-in.html');
  await expect.poll(() => Boolean(pending.configuration)).toBe(true);
  await assertOnlyLoading();
  const spinner = page.locator('.dashboard-loading-spinner');
  const rotation = await spinner.evaluate(element => getComputedStyle(element).transform);
  await expect.poll(() => spinner.evaluate(element => getComputedStyle(element).transform)).not.toBe(rotation);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(spinner).toHaveCSS('animation-duration', '2s');
  await expect(spinner).toHaveCSS('animation-name', 'dashboard-loading-spin');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await pending.configuration();
  await expect.poll(() => Boolean(pending.rollout)).toBe(true);
  await assertOnlyLoading();
  await pending.rollout();
  await expect.poll(() => page.evaluate(() => (window as any).dashboardLoadStarted)).toBe(true);
  await assertOnlyLoading();
  await page.evaluate(() => (window as any).resolveFirstDashboardLoad());
  await expect.poll(() => Boolean(pending.sharing) && Boolean(pending.pricing)).toBe(true);
  await assertOnlyLoading();
  await pending.sharing();
  await assertOnlyLoading();
  await page.screenshot({ path: testInfo.outputPath('dashboard-loading.png') });
  await pending.pricing();
  await expect(loading).toHaveCount(0);
  const cards = page.locator('.recent-activity-section');
  const incomingCard = cards.getByRole('button', { name: 'Open Incoming shared customer' });
  const ownedCard = cards.getByRole('button', { name: 'Open Local sign-in customer' });
  await expect(incomingCard.getByRole('img', { name: 'Shared with you' })).toBeVisible();
  await expect(incomingCard.getByRole('img', { name: 'New shared proposal', exact: true })).toBeVisible();
  await expect(ownedCard.getByRole('img', { name: 'Shared with collaborators' })).toBeVisible();
  await expect(ownedCard.getByRole('img', { name: 'Changes awaiting review' })).toBeVisible();
  await expect(page.getByRole('row', { name: 'Open Local sign-in customer' })).toBeVisible();
  await ownedCard.getByRole('img', { name: 'Shared with collaborators' }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Shared with Jordan Designer');
  await incomingCard.getByRole('img', { name: 'Shared with you' }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Shared by Remote owner');
  await page.screenshot({ path: testInfo.outputPath('dashboard-ready-badges.png') });

  // Polling keeps the existing complete view visible and replaces it atomically.
  notificationRead = true;
  holdBackground = true;
  await page.clock.fastForward(31000);
  await expect.poll(() => Boolean(pending.background)).toBe(true);
  await expect(loading).toHaveCount(0);
  await expect(ownedCard).toBeVisible();
  await pending.sharing();
  await pending.pricing();
  await pending.background();
  await expect(incomingCard.getByRole('img', { name: 'New shared proposal', exact: true })).toHaveCount(0);
  await expect(ownedCard.getByRole('img', { name: 'Changes awaiting review' })).toBeVisible();
});
