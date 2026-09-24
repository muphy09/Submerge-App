import { expect, test } from '@playwright/test';

const fixture = 'http://127.0.0.1:5173/tests/fixtures/shared-proposals.html';

test('collaboration card fits the summary right rail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${fixture}?mode=owner&rail=1`);
  const card = page.getByRole('region', { name: 'Collaboration' });
  await expect(card.getByRole('heading', { name: 'Collaboration' })).toBeVisible();
  await expect(card.getByText('1 change request awaiting review')).toBeVisible();
  expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(card.getByRole('button', { name: 'Review Changes' })).toBeVisible();
});

test('dashboard separates owned and shared proposals and surfaces updates', async ({ page }) => {
  await page.goto(`${fixture}?mode=dashboard`);
  await expect(page.getByRole('tab', { name: 'My Proposals (1)' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('2 collaboration items need attention')).toBeVisible();
  await expect(page.getByRole('button', { name: /Alex Owner Shared · Rivera Pool/ })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Shared with collaborators' })).toBeVisible();
  await page.getByRole('tab', { name: 'Shared with Me (1)' }).click();
  await expect(page.getByRole('heading', { name: 'Shared with Me' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Owner' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Alex Owner' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Can propose changes' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Submitted' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveClass(/dashboard-proposals-table/);
  await page.getByRole('button', { name: /Changes Submitted/ }).click();
  await expect.poll(() => page.evaluate(() => window.collaborationAction)).toBe('open-update');
});

test('shared list paginates and owner icon keeps its space beside a long name', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto(`${fixture}?mode=dashboard&many=1&long=1`);
  const icon = page.getByRole('img', { name: 'Shared with collaborators' });
  const name = page.locator('.dashboard-customer-primary .dashboard-customer-name').first();
  expect(await name.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  const nameBounds = await name.boundingBox();
  const iconBounds = await icon.boundingBox();
  expect(nameBounds && iconBounds && nameBounds.x + nameBounds.width <= iconBounds.x).toBe(true);
  await icon.hover();
  await expect(page.getByRole('tooltip')).toHaveText('Shared with Jordan Designer, Taylor Admin');
  await page.getByRole('tab', { name: 'Shared with Me (22)' }).click();
  await expect(page.getByRole('heading', { name: 'Shared with Me' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next Page' })).toBeEnabled();
  await page.getByRole('button', { name: 'Next Page' }).click();
  await expect(page.getByText(/Page 2 of/)).toBeVisible();
  await page.getByRole('tab', { name: 'My Proposals (22)' }).click();
  await expect(page.getByRole('row', { name: /Open Customer/ }).first()).toBeVisible();
});

test('owner can share with several named recipients and review all changed fields', async ({ page }) => {
  await page.goto(`${fixture}?mode=owner`);
  const collaboration = page.getByRole('region', { name: 'Collaboration' });
  await expect(collaboration.getByRole('heading', { name: 'Collaboration' })).toBeVisible();
  await expect(collaboration.getByText('Alex Owner')).toBeVisible();
  await expect(collaboration.getByText('1 change request awaiting review')).toBeVisible();
  await expect(collaboration.getByRole('button', { name: 'Review Changes' })).toHaveCount(1);
  await expect(collaboration.getByRole('button', { name: 'Share / Manage Access' })).toHaveCount(0);
  await expect(collaboration.locator('.collaboration-history')).not.toHaveAttribute('open');
  await page.getByRole('button', { name: 'Share / Manage Access' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share and manage access' });
  const recipient = dialog.getByRole('combobox', { name: 'Share with' });
  await recipient.click();
  await expect(dialog.getByRole('listbox', { name: 'Franchise users' })).toHaveCount(0);
  await recipient.fill('nobody');
  await expect(dialog.getByText('No available users match your search.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Share proposal' })).toBeDisabled();
  await recipient.fill('Taylor');
  await expect(dialog.getByRole('option', { name: /Taylor Admin/ })).toBeVisible();
  await dialog.getByRole('option', { name: /Taylor Admin/ }).click();
  await expect(recipient).toHaveValue('');
  await expect(dialog.getByText('taylor@example.com')).toBeVisible();
  await recipient.fill('Casey');
  await dialog.getByRole('option', { name: /Casey Editor/ }).click();
  await expect(dialog.getByText('casey@example.com')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'People with Access' })).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Permission for Taylor Admin' }).selectOption('contribute');
  await dialog.getByRole('combobox', { name: 'Permission for Casey Editor' }).selectOption('view');
  await dialog.getByLabel('Note (optional)').fill('Please check equipment');
  await dialog.getByRole('button', { name: 'Share 2 people' }).click();
  await expect.poll(() => dialog.locator('.collaboration-share-row').count()).toBe(3);
  await expect(dialog.locator('.collaboration-share-row').getByText('Taylor Admin')).toBeVisible();
  await expect(dialog.locator('.collaboration-share-row').getByText('Casey Editor')).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Permission for Taylor Admin' })).toHaveValue('contribute');
  await expect(dialog.getByRole('combobox', { name: 'Permission for Casey Editor' })).toHaveValue('view');
  await expect(dialog.getByRole('button', { name: 'Remove' }).first()).toHaveClass(/collaboration-remove-access/);
  await dialog.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByText('Review changes from Jordan Designer (Original).')).toBeVisible();
  await page.getByRole('button', { name: 'Review Changes' }).click();
  const review = page.getByRole('dialog', { name: 'Review proposed changes' });
  await expect(review.getByText('Longer pool requested')).toBeVisible();
  await expect(review.locator('tbody')).toContainText('Pool Specs');
  await expect(review.getByRole('columnheader', { name: 'Before' })).toBeVisible();
  await expect(review.getByRole('columnheader', { name: 'After' })).toBeVisible();
  await expect(review.locator('.collaboration-totals')).toContainText('$108,000.00');
  await expect(review.locator('.collaboration-totals')).toContainText('$129,600.00');
  await review.getByRole('button', { name: 'Apply changes to draft' }).click();
  await expect.poll(() => page.evaluate(() => window.collaborationAction)).toBe('apply:request-1:');
  page.on('dialog', (prompt) => void prompt.accept());
  await page.getByRole('button', { name: 'Restore previous draft' }).click();
  await expect.poll(() => page.evaluate(() => window.collaborationAction)).toBe('restore:request-1');
});

test('review condenses automation pricing fields into one named item', async ({ page }) => {
  await page.goto(`${fixture}?mode=owner&diff=equipment`);
  await page.getByRole('button', { name: 'Review Changes' }).click();
  const review = page.getByRole('dialog', { name: 'Review proposed changes' });
  await expect(review.getByText('Gross Profit %')).toBeVisible();
  await expect(review.getByRole('heading', { name: 'Changed Fields 1' })).toBeVisible();
  await expect(review.getByRole('row', { name: /Automation No Automation AQRS Omni - 25k with Salt and Heat \+\$5,000.00/ })).toBeVisible();
  await expect(review.getByRole('columnheader', { name: 'Price Change' })).toBeVisible();
  await page.goto(`${fixture}?mode=owner&diff=salt`);
  await page.getByRole('button', { name: 'Review Changes' }).click();
  await expect(page.getByRole('dialog', { name: 'Review proposed changes' })).toContainText('AQRS Salt System');
  await expect(page.getByRole('dialog', { name: 'Review proposed changes' }).locator('pre')).toHaveCount(0);
});

test('owner can scroll through a long change review', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 650 });
  await page.goto(`${fixture}?mode=owner&diff=longreview`);
  await page.getByRole('button', { name: 'Review Changes' }).click();
  const body = page.locator('.collaboration-review-body');
  const before = await body.evaluate((element) => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
  await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByRole('row', { name: /Fixture Option18/ })).toBeVisible();
});

test('recipient can withdraw from the summary and send saved changes for review', async ({ page }) => {
  await page.goto(`${fixture}?mode=recipient`);
  await expect(page.getByText('Your Access: Can propose changes')).toBeVisible();
  await expect(page.getByText('Jordan Designer, Taylor Admin')).toBeVisible();
  await expect(page.getByText('Your latest request:')).toHaveCount(0);
  const history = page.locator('.collaboration-history');
  await expect(history).not.toHaveAttribute('open');
  await history.locator('summary').click();
  await expect(history).toContainText('You: Submitted Changes');
  await page.getByRole('button', { name: 'Withdraw Changes' }).click();
  await expect.poll(() => page.evaluate(() => window.collaborationAction)).toBe('withdraw:request-1:');
  await expect(page.getByRole('button', { name: 'Propose changes' })).toHaveCount(0);
  await page.goto(`${fixture}?mode=recipient&working=1`);
  await page.getByRole('button', { name: 'Send changes from summary' }).click();
  const send = page.getByRole('dialog', { name: 'Send changes to owner' });
  await expect(send).toBeVisible();
  await send.getByLabel(/Note for Alex Owner/).fill('Please review the new length');
  await send.getByRole('button', { name: 'Send changes' }).click();
  await expect.poll(() => page.evaluate(() => window.collaborationAction)).toBe('send:true:Please review the new length');
});

test('viewer cannot propose changes and can leave', async ({ page }) => {
  page.on('dialog', (prompt) => void prompt.accept());
  await page.goto(`${fixture}?mode=viewer&permission=view`);
  await expect(page.getByText('Your Access: Can view')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Propose changes' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Leave Proposal' }).click();
  await expect.poll(() => page.evaluate(() => window.collaborationAction)).toBe('end:recipient-id');
});

test('stale contributor work is visibly blocked and review dialog fits a narrow screen', async ({ page }) => {
  await page.goto(`${fixture}?mode=recipient&stale=1`);
  await expect(page.getByRole('button', { name: 'Withdraw Changes' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${fixture}?mode=owner`);
  await page.getByRole('button', { name: 'Review Changes' }).click();
  const bounds = await page.getByRole('dialog', { name: 'Review proposed changes' }).boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});

test('sign-out clears account-scoped shared copies from IndexedDB', async ({ page }) => {
  await page.goto(`${fixture}?mode=recipient`);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('submerge-shared-proposals-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('copies', { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('copies', 'readwrite');
      transaction.objectStore('copies').put({
        key: 'submerge.sharedProposalCache.v1.test.recipient-id.TEST-FIXTURE-1',
        value: { proposal: { proposalNumber: 'TEST-FIXTURE-1', totalCost: 108000 } },
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    (window as any).testClearSession();
  });
  await expect.poll(() => page.evaluate(async () =>
    !(await indexedDB.databases()).some((database) => database.name === 'submerge-shared-proposals-v1'))).toBe(true);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('submerge-user-session'))).toBeNull();
});
