import { expect, test } from '@playwright/test';

test('a background refresh during sign-in shows local proposals without refreshing the page', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.__APP_ENV__ = { VITE_SUPABASE_URL: 'https://submerge-playwright.invalid',
      VITE_SUPABASE_ANON_KEY: 'playwright-public-placeholder', VITE_SUPABASE_ONLY: 'false' };
    localStorage.setItem('submerge-user-session', JSON.stringify({ userId: 'dashboard-owner',
      userName: 'Dashboard owner', role: 'designer', franchiseId: 'dashboard-fixture' }));
  });
  await page.route('https://submerge-playwright.invalid/**', route => route.abort('internetdisconnected'));
  await page.goto('http://127.0.0.1:5173/tests/fixtures/dashboard-sign-in.html');
  await expect.poll(() => page.evaluate(() => (window as any).dashboardLoadStarted)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('submerge:proposal-cloud-sync')));
  await expect(page.getByRole('row', { name: 'Open Local sign-in customer' })).toBeVisible();
  await page.evaluate(() => (window as any).resolveFirstDashboardLoad());
  await expect(page.getByRole('row', { name: 'Open Local sign-in customer' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('local-proposals-after-sign-in.png') });
});


for (const recoveryEvent of ['online', 'submerge:proposal-cloud-sync']) {
  test(`sharing recovers after offline startup on ${recoveryEvent}`, async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      window.__APP_ENV__ = { VITE_SUPABASE_URL: 'https://submerge-playwright.invalid',
        VITE_SUPABASE_ANON_KEY: 'playwright-public-placeholder', VITE_SUPABASE_ONLY: 'false' };
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      localStorage.setItem('submerge-user-session', JSON.stringify({ userId: 'dashboard-owner', userName: 'Dashboard owner',
        role: 'designer', franchiseId: 'dashboard-fixture' }));
      localStorage.setItem('submerge.franchiseConfiguration.v1.dashboard-fixture', JSON.stringify({
        franchiseId: 'dashboard-fixture', configuration: { capabilities: { sharedProposals: true } } }));
    });
    let online = false;
    let rolloutReads = 0;
    const number = 'PROP-SHARED-RECOVERY';
    await page.route('https://submerge-playwright.invalid/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (!online) return route.abort('internetdisconnected');
      if (path === '/auth/v1/health') return route.fulfill({ json: {} });
      if (path.endsWith('/proposal_collaboration_rollout')) {
        rolloutReads++;
        return route.fulfill({ json: { live_enabled: true, test_enabled: true } });
      }
      if (path.endsWith('/proposal_collaboration_shares')) return route.fulfill({ json:
        url.searchParams.has('recipient_id') ? [{ id: 'recovery-share', proposal_number: number,
          recipient_id: 'dashboard-owner', permission: 'contribute', note: 'Review after reconnect', ended_at: null,
          created_at: '2026-10-27T12:00:00Z' }] : [] });
      if (path.endsWith('/franchise_proposals')) return route.fulfill({ json: [{ proposal_number: number,
        owner_auth_user_id: 'remote-owner', content_revision: 1, collaboration_enabled: true,
        proposal_json: { proposalNumber: number, franchiseId: 'dashboard-fixture', ownerAuthUserId: 'remote-owner',
          designerAuthUserId: 'remote-owner', designerName: 'Remote owner', status: 'draft', versionId: 'original',
          poolSpecs: { poolType: 'shotcrete' }, customerInfo: { customerName: 'Recovered shared proposal', state: 'NC' },
          createdDate: '2026-10-27T12:00:00Z', lastModified: '2026-10-27T12:00:00Z' } }] });
      if (path.endsWith('/collab_people')) return route.fulfill({ json: [
        { user_id: 'remote-owner', display_name: 'Remote owner', email: 'owner@playwright.invalid' }] });
      if (path.endsWith('/proposal_collaboration_events')) return route.fulfill({ json:
        url.searchParams.get('read_at') === 'is.null' ? [{ id: 'recovery-event', proposal_number: number,
          event_type: 'shared', actor_id: 'remote-owner', request_id: null, note: null,
          created_at: '2026-10-27T12:00:00Z', read_at: null }] : [] });
      return route.fulfill({ json: [] });
    });
    await page.goto('http://127.0.0.1:5173/tests/fixtures/dashboard-sign-in.html');
    await expect.poll(() => page.evaluate(() => (window as any).dashboardLoadStarted)).toBe(true);
    await page.evaluate(() => (window as any).resolveFirstDashboardLoad());
    await expect(page.getByRole('row', { name: 'Open Local sign-in customer' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Shared with Me/ })).toHaveCount(0);
    online = true;
    await page.evaluate(eventName => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      window.dispatchEvent(new Event(eventName));
    }, recoveryEvent);
    await expect(page.getByRole('tab', { name: 'Shared with Me (1)' })).toBeVisible();
    expect(rolloutReads).toBeGreaterThan(0);
    await page.getByRole('tab', { name: 'Shared with Me (1)' }).click();
    await expect(page.getByRole('row', { name: 'Open shared proposal Recovered shared proposal' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'New shared proposal', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('sharing-after-reconnect.png') });
  });
}
