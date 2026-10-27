import { expect, test } from '@playwright/test';

const fixtureUrl = 'http://127.0.0.1:5173/tests/fixtures/proposal-sync-authorization.html';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__APP_ENV__ = {
      VITE_SUPABASE_URL: 'https://submerge-playwright.invalid',
      VITE_SUPABASE_ANON_KEY: 'playwright-anon-key',
    };
  });
  await page.goto(fixtureUrl);
  await expect(page.getByText('Ready')).toBeVisible();
});

async function mockCloud(page: import('@playwright/test').Page, options: {
  row?: any;
  denyPost?: boolean;
  denyPatch?: boolean;
}) {
  const writes: string[] = [];
  const writeBodies: any[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:5173') return route.continue();
    if (url.pathname === '/auth/v1/health') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (url.pathname === '/rest/v1/franchise_proposals') {
      const method = route.request().method();
      if (method !== 'GET') {
        writes.push(method);
        writeBodies.push(route.request().postDataJSON());
      }
      if (method === 'GET') {
        const rows = options.row ? [options.row] : [];
        const single = url.searchParams.has('proposal_number');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? (options.row || {}) : rows) });
      }
      if (method === 'PATCH') {
        if (options.denyPatch) {
          return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ proposal_number: options.row?.proposal_number }]) });
      }
      if (options.denyPost) {
        return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }) });
      }
      if (method === 'POST') {
        return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
      }
    }
    return route.abort();
  });
  return { writes, writeBodies };
}

test('admin cached foreign draft stays local without a background write', async ({ page }) => {
  const { writes } = await mockCloud(page, {});
  const result = await page.evaluate(() => (window as any).proposalSyncFixture.adminLoadsForeignDraft());
  expect(writes).toEqual([]);
  expect(result.numbers).toEqual(['PROP-PW-SYNC-AUTH']);
  expect(result.local.proposalNumber).toBe('PROP-PW-SYNC-AUTH');
});

test('admin review updates an existing submitted proposal without an insert', async ({ page }) => {
  const row = await page.evaluate(() => (window as any).proposalSyncFixture.cloudRow());
  const { writes, writeBodies } = await mockCloud(page, { row });
  const result = await page.evaluate(() => (window as any).proposalSyncFixture.adminReviewsSubmitted());
  expect(result.syncStatus).toBe('synced');
  expect(writes).toEqual(['PATCH']);
  expect(writeBodies[0].designer_auth_user_id).toBeUndefined();
  expect(writeBodies[0].designer_name).toBeUndefined();
  expect(writeBodies[0].franchise_id).toBeUndefined();
});

test('the proposal owner still saves a draft through the normal insert path', async ({ page }) => {
  const { writes } = await mockCloud(page, {});
  const result = await page.evaluate(() => (window as any).proposalSyncFixture.ownerSavesDraft());
  expect(result.syncStatus).toBe('synced');
  expect(writes).toEqual(['POST']);
});

test('a designer can save an owned draft', async ({ page }) => {
  const row = await page.evaluate(() => (window as any).proposalSyncFixture.cloudRow('draft'));
  const { writes, writeBodies } = await mockCloud(page, { row });
  const result = await page.evaluate(() => (window as any).proposalSyncFixture.designerSavesDraft());
  expect(result.syncStatus).toBe('synced');
  expect(writes).toEqual(['POST']);
  expect(writeBodies[0].designer_auth_user_id).toBe('playwright-designer');
});

test('a designer can backfill their account ID on a legacy draft', async ({ page }) => {
  const row = await page.evaluate(() => (window as any).proposalSyncFixture.cloudRow('draft'));
  row.designer_auth_user_id = null;
  delete row.proposal_json.designerAuthUserId;
  const { writes, writeBodies } = await mockCloud(page, { row });
  const result = await page.evaluate(() => (window as any).proposalSyncFixture.designerSavesLegacyDraft());
  expect(result.syncStatus).toBe('synced');
  expect(result.designerAuthUserId).toBe('playwright-designer');
  expect(writes).toEqual(['POST']);
  expect(writeBodies[0].designer_auth_user_id).toBe('playwright-designer');
});

test('a designer offline draft syncs when the connection returns', async ({ page }) => {
  const { writes } = await mockCloud(page, {});
  const result = await page.evaluate(() => (window as any).proposalSyncFixture.designerSyncsOfflineDraft());
  expect(result.before).toBe('pending');
  expect(result.after).toBe('synced');
  expect(result.designerAuthUserId).toBe('playwright-designer');
  expect(writes).toEqual(['POST']);
});

test('a denied admin edit stays local and does not enter automatic retry', async ({ page }) => {
  const row = await page.evaluate(() => (window as any).proposalSyncFixture.cloudRow());
  const { writes } = await mockCloud(page, { row, denyPatch: true });
  const result = await page.evaluate(() => (window as any).proposalSyncFixture.adminDeniedReview());
  expect(writes).toEqual(['PATCH']);
  expect(result.message).toContain('row-level security');
  expect(result.localStatus).toBe('error');
  expect(result.localMessage).toContain('Local changes are preserved');
});

test('a 403 preserves the local save and stops automatic retries', async ({ page }) => {
  const { writes } = await mockCloud(page, { denyPost: true });
  const result = await page.evaluate(() => (window as any).proposalSyncFixture.deniedOwnSave());
  expect(writes).toEqual(['POST']);
  expect(result.message).toContain('row-level security');
  expect(result.localStatus).toBe('error');
  expect(result.loadedStatus).toBe('error');
  expect(result.localMessage).toContain('Local changes are preserved');
});

test('master acting as owner only reads and cannot save', async ({ page }) => {
  const row = await page.evaluate(() => (window as any).proposalSyncFixture.cloudRow());
  const { writes } = await mockCloud(page, { row });
  const result = await page.evaluate(() => (window as any).proposalSyncFixture.masterInspects());
  expect(writes).toEqual([]);
  expect(result.numbers).toEqual(['PROP-PW-SYNC-AUTH']);
  expect(result.saveError).toContain('read-only');
});
