import { expect, test } from '@playwright/test';

test('proposal tabs replay the Settings transition and preserve search state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('http://127.0.0.1:5173/tests/fixtures/shared-proposals.html?mode=dashboard');
  const mine = page.locator('.dashboard-proposals-body');
  const shared = page.locator('.dashboard-shared-table-shell');
  await mine.getByPlaceholder('Customer Name').fill('saved search');
  for (let round = 0; round < 2; round++) {
    await page.getByRole('tab', { name: 'Shared with Me (1)' }).click();
    await expect(mine).toBeHidden();
    await expect(shared).toHaveCSS('animation-name', 'submerge-panel-enter');
    await expect(shared).toHaveCSS('animation-duration', '0.3s');
    await page.getByRole('tab', { name: 'My Proposals (1)' }).click();
    await expect(shared).toBeHidden();
    await expect(mine).toHaveCSS('animation-name', 'submerge-panel-enter');
    await expect(mine.getByPlaceholder('Customer Name')).toHaveValue('saved search');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(mine).toHaveCSS('animation-name', 'none');
});

test('Messages uses the same entrance as Settings and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('http://127.0.0.1:5173/tests/fixtures/settings-price-impact.html');
  await expect(page.locator('.settings-page')).toHaveCSS('animation-name', 'submerge-panel-enter');
  await page.goto('http://127.0.0.1:5173/tests/fixtures/message-center-ui.html?mode=owner-composer');
  await expect(page.locator('.messages-page')).toHaveCSS('animation-name', 'submerge-panel-enter');
  await expect(page.locator('.messages-page')).toHaveCSS('animation-duration', '0.3s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.messages-page')).toHaveCSS('animation-name', 'none');
});
