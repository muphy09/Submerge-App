import { expect, test } from '@playwright/test';

test('selecting an alternate version preserves proposal-level contributor access and revision', async ({ page }) => {
  await page.addInitScript(() => { window.__APP_ENV__ = { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }; });
  await page.goto('http://127.0.0.1:5173/tests/fixtures/proposal-sync-authorization.html');
  await expect(page.getByText('Ready')).toBeVisible();
  const result = await page.evaluate(() => (window as any).proposalSyncFixture.sharedAlternateAccess());
  for (const version of [result.active, result.normalized, ...result.versions]) {
    expect(version).toMatchObject({ ownerAuthUserId: 'playwright-designer', contentRevision: 7,
      collaborationEnabled: true, sharedPermission: 'contribute' });
  }
});

for (const stale of [false, true]) {
  test(stale ? 'shared owner rejects a stale version save before sending changes'
    : 'shared owner saves an alternate model without replacing the original version identity', async ({ page }) => {
    await page.addInitScript(() => {
      window.__APP_ENV__ = {
        VITE_SUPABASE_URL: 'https://submerge-playwright.invalid',
        VITE_SUPABASE_ANON_KEY: 'playwright-anon-key',
      };
    });
    const requests: any[] = [];
    await page.route('https://submerge-playwright.invalid/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/auth/v1/health') {
        return route.fulfill({ json: {} });
      }
      if (url.pathname === '/rest/v1/franchise_proposals' && route.request().method() === 'GET') {
        return route.fulfill({ json: { proposal_json: { versionId: 'original' }, content_revision: stale ? 8 : 7 } });
      }
      if (url.pathname === '/rest/v1/rpc/collab_owner_save') {
        requests.push(route.request().postDataJSON());
        return route.fulfill({ json: 8 });
      }
      return route.abort();
    });
    await page.goto('http://127.0.0.1:5173/tests/fixtures/proposal-sync-authorization.html');
    await expect(page.getByText('Ready')).toBeVisible();
    const result = await page.evaluate(async () => {
      try { return { saved: await (window as any).proposalSyncFixture.ownerSavesAlternateVersion() }; }
      catch (error) { return { error: (error as Error).message }; }
    });
    if (stale) {
      expect(result.error).toContain('COLLAB_CONFLICT');
      expect(requests).toHaveLength(0);
      return;
    }
    expect(requests).toHaveLength(1);
    const payload = requests[0].p_proposal;
    expect(payload.versionId).toBe('original');
    expect(payload.createdDate).toBe('2026-08-01T00:00:00.000Z');
    expect(payload.totalCost).toBe(83360);
    expect(payload.pricingModelRevisionId).toBe('summer-pin');
    expect(payload.activeVersionId).toBe('alternate');
    expect(payload.versions).toHaveLength(1);
    expect(payload.versions[0]).toMatchObject({ versionId: 'alternate', totalCost: 92000,
      createdDate: '2026-10-27T19:00:00.000Z', pricingModelId: 'june-model', pricingModelRevisionId: 'june-pin' });
    expect(payload.ownerAuthUserId).toBe('playwright-designer');
    expect(payload.contentRevision).toBe(7);
    expect(requests[0].p_expected).toBe(7);
    expect(result.saved).toMatchObject({ versionId: 'alternate', contentRevision: 8 });
  });
}
