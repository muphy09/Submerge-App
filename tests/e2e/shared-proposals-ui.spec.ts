import { expect, test } from '@playwright/test';

const fixture = 'http://127.0.0.1:5173/tests/fixtures/shared-proposals.html';

test('collaboration history combines access and request events newest first', async ({ page }) => {
  await page.goto(`${fixture}?mode=owner&history=1`);
  await page.getByText('Collaboration History', { exact: true }).click();
  const entries = page.locator('.collaboration-history li');
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0)).toContainText('Left Proposal');
  await expect(entries.nth(1)).toContainText('Declined Changes');
  await expect(entries.nth(2)).toContainText('Submitted Changes');
});

test('review is modal above the sticky toolbar and restores interaction on close', async ({ page }, testInfo) => {
  await page.goto(`${fixture}?mode=owner&rail=1`);
  const toolbarButton = page.getByRole('button', { name: 'Share / Manage Access' });
  const toolbarBounds = await toolbarButton.boundingBox();
  await page.getByRole('button', { name: 'Review Changes' }).click();
  const review = page.getByRole('dialog', { name: 'Review proposed changes' });
  await expect(review).toBeVisible();
  await expect(page.locator('dialog:modal')).toHaveCount(1);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.view-actions') !== null,
    { x: toolbarBounds!.x + 5, y: toolbarBounds!.y + 5 })).toBe(false);
  await toolbarButton.evaluate((element: HTMLButtonElement) => element.focus());
  expect(await toolbarButton.evaluate((element) => document.activeElement === element)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('review-above-toolbar.png') });
  await page.keyboard.press('Escape');
  await expect(review).toHaveCount(0);
  await toolbarButton.click();
  await expect(page.getByRole('dialog', { name: 'Share and manage access' })).toBeVisible();
});

test('collaboration card fits the summary right rail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${fixture}?mode=owner&rail=1`);
  const card = page.getByRole('region', { name: 'Collaboration' });
  await expect(card.getByRole('heading', { name: 'Collaboration' })).toBeVisible();
  await expect(card.getByText('1 change request awaiting review')).toBeVisible();
  expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(card.getByRole('button', { name: 'Review Changes' })).toBeVisible();
});

test('dashboard shows proposal attention dots without an updates feed', async ({ page }, testInfo) => {
  await page.goto(`${fixture}?mode=dashboard`);
  await expect(page.getByRole('tab', { name: 'My Proposals (1)' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.dashboard-collaboration-updates')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'New shared proposals', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Changes awaiting review', exact: true })).toHaveCount(2);
  await expect(page.getByRole('img', { name: 'Shared with collaborators' })).toBeVisible();
  await page.getByRole('tab', { name: 'Shared with Me (1)' }).click();
  await expect(page.getByRole('heading', { name: 'Shared with Me' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Owner' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Alex Owner' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Can propose changes' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Submitted' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveClass(/dashboard-proposals-table/);
  await expect(page.getByRole('img', { name: 'New shared proposals', exact: true })).toHaveCount(0);
  const dot = page.getByRole('img', { name: 'New shared proposal', exact: true });
  await expect(dot).toBeVisible();
  const dotBounds = await dot.boundingBox();
  const titleBounds = await page.locator('.dashboard-shared-table .dashboard-customer-name').boundingBox();
  expect(Math.abs(dotBounds!.y + dotBounds!.height / 2 - titleBounds!.y - titleBounds!.height / 2)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('dashboard-shared-attention.png') });
  await page.getByRole('row', { name: 'Open shared proposal Rivera Pool' }).press('Enter');
  await expect.poll(() => page.evaluate(() => window.collaborationAction)).toBe('open-proposal');
});

test('shared list paginates and owner icon keeps its space beside a long name', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto(`${fixture}?mode=dashboard&many=1&long=1`);
  const icon = page.getByRole('img', { name: 'Shared with collaborators' });
  const name = page.locator('.dashboard-proposals-body .dashboard-customer-primary .dashboard-customer-name').first();
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
  await review.getByRole('radio', { name: 'Overwrite current version with these changes' }).check();
  await review.getByRole('button', { name: 'Apply Changes' }).click();
  await expect.poll(() => page.evaluate(() => window.collaborationAction)).toBe('apply:request-1:');
  await expect(page.getByRole('button', { name: 'Restore previous draft' })).toHaveCount(0);
  await expect(page.locator('.collaboration-restore')).toHaveCount(0);
});

test('review condenses automation pricing fields into one named item', async ({ page }) => {
  await page.goto(`${fixture}?mode=owner&diff=equipment`);
  await page.getByRole('button', { name: 'Review Changes' }).click();
  const review = page.getByRole('dialog', { name: 'Review proposed changes' });
  await expect(review.getByText('Gross Profit %')).toBeVisible();
  await expect(review.getByRole('heading', { name: 'Changed Fields 1' })).toBeVisible();
  const automation = review.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Automation', exact: true }) });
  await expect(automation).toContainText('No Automation');
  await expect(automation).toContainText('AQRS Omni - 25k with Salt and Heat');
  await expect(automation).toContainText('+$5,000.00');
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

test('pending contributor work is frozen and review dialog fits a narrow screen', async ({ page }) => {
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

test('owner must resolve overlapping changes before applying the current comparison', async ({ page }, testInfo) => {
  await page.goto(`${fixture}?mode=owner&conflict=1`);
  await page.getByRole('button', { name: 'Review Changes' }).click();
  const review = page.getByRole('dialog', { name: 'Review proposed changes' });
  await expect(review.getByText('The owner also changed this field.')).toBeVisible();
  await expect(review.getByRole('button', { name: 'Apply Changes' })).toBeDisabled();
  await review.getByRole('radio', { name: 'Overwrite current version with these changes' }).check();
  await review.getByRole('radio', { name: 'Use proposed changes with current pricing' }).check();
  await expect(review.getByRole('button', { name: 'Apply Changes' })).toBeEnabled();
  await review.screenshot({ path: testInfo.outputPath('owner-conflict-review.png') });
  await review.getByRole('button', { name: 'Apply Changes' }).click();
  await expect.poll(() => page.evaluate(() => window.collaborationAction)).toBe('apply:request-1:');
});

test('the real apply service sends the selected destination without changing the reviewed version identity', async ({ page }) => {
  await page.addInitScript(() => {
    window.__APP_ENV__ = { VITE_SUPABASE_URL: 'https://submerge-playwright.invalid', VITE_SUPABASE_ANON_KEY: 'playwright-public-placeholder' };
  });
  const calls: any[] = [];
  await page.route('https://submerge-playwright.invalid/**', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/collab_apply_review_v3')) {
      const args = route.request().postDataJSON(); calls.push(args);
      return route.fulfill({ json: { destination: args.p_destination, versionId: args.p_destination === 'new-draft' ? 'server-created' : 'original' } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(`${fixture}?mode=owner`);
  const results = await page.evaluate(async () => {
    const { applyChangeRequest } = await import('/src/services/proposalCollaboration.ts');
    const prepared: any = { before: { versionId: 'original' }, after: { versionId: 'original' },
      expectedRevision: 8, requestUpdatedAt: '2026-10-27T21:00:00Z', conflicts: [], resolutions: {} };
    return [await applyChangeRequest('request', prepared, 'new-draft'), await applyChangeRequest('request', prepared, 'overwrite')];
  });
  expect(calls.map(call => call.p_destination)).toEqual(['new-draft','overwrite']);
  for (const call of calls) expect(call).toMatchObject({ p_result: { versionId: 'original' }, p_expected: 8 });
  expect(results.map(value => value.versionId)).toEqual(['server-created','original']);
});

test('review uses Shotcrete for stored construction type values', async ({ page }) => {
  await page.goto(`${fixture}?mode=owner&diff=spa`);
  await page.getByRole('button', { name: 'Review Changes' }).click();
  const review = page.getByRole('dialog', { name: 'Review proposed changes' });
  await expect(review.locator('tbody')).toContainText('Shotcrete');
  await expect(review).not.toContainText(/gunite/i);
});

for (const destination of ['new-draft','overwrite']) {
test(`review keeps the comparison visible and sends the ${destination} destination`, async ({ page }, testInfo) => {
  await page.goto(`${fixture}?mode=owner&diff=equipment`);
  await page.getByRole('button', { name: 'Review Changes' }).click();
  const review = page.getByRole('dialog', { name: 'Review proposed changes' });
  await expect(review.getByText('Review the changes made by Jordan Designer and decide how to proceed.')).toBeVisible();
  await expect(review.getByText('Original, current, and proposed values')).toHaveCount(0);
  await expect(review.getByText('Keep the owner’s saved draft')).toHaveCount(0);
  await expect(review.getByRole('button', { name: 'Apply Changes' })).toBeDisabled();
  const rows = await review.locator('tbody').innerText();
  for (const label of ['Create a new draft with these changes','Overwrite current version with these changes']) {
    await review.getByRole('radio', { name: label }).check();
    expect(await review.locator('tbody').innerText()).toBe(rows);
    const radio = await review.getByRole('radio', { name: label }).boundingBox();
    const text = await review.getByText(label, { exact: true }).boundingBox();
    expect(Math.abs((radio!.y + radio!.height / 2) - (text!.y + text!.height / 2))).toBeLessThan(4);
  }
  await review.getByRole('radio', { name: destination === 'new-draft' ? 'Create a new draft with these changes' : 'Overwrite current version with these changes' }).check();
  await review.screenshot({ path: testInfo.outputPath('application-choice.png') });
  await review.getByRole('button', { name: 'Apply Changes' }).click();
  expect(await page.evaluate(() => (window as any).collaborationDestination)).toBe(destination);
});
}

test('saved contributor work remains sendable after the owner changes pricing', async ({ page }) => {
  await page.goto(`${fixture}?mode=recipient&working=1&stale=1`);
  await page.getByRole('button', { name: 'Send changes from summary' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send changes to owner' });
  await expect(dialog.getByText(/Your proposed edits are preserved/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Send changes', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Send changes', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.collaborationAction)).toBe('send:true:');
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


test('recipient sees the owner sharing note on the summary', async ({ page }, testInfo) => {
  await page.goto(`${fixture}?mode=recipient`);
  const message = page.getByRole('status').filter({ hasText: 'Message from Alex Owner' });
  await expect(message).toContainText('Please review');
  await page.screenshot({ path: testInfo.outputPath('recipient-sharing-message.png') });
});


test('opening a shared summary clears its new dot on subsequent dashboard visits', async ({ page }) => {
  await page.goto(`${fixture}?mode=dashboard`);
  await expect(page.getByRole('img', { name: 'New shared proposals', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Shared with Me (1)' }).click();
  await expect(page.getByRole('img', { name: 'New shared proposal', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('fixture-event-read'))).toBeNull();
  await page.getByRole('row', { name: 'Open shared proposal Rivera Pool' }).click();
  await page.goto(`${fixture}?mode=recipient`);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('fixture-event-read'))).toBe('fixture-unread');
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Message from Alex Owner' })).toContainText('Please review');
  await page.goto(`${fixture}?mode=dashboard`);
  await expect(page.getByRole('img', { name: 'New shared proposals', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Shared with Me (1)' }).click();
  await expect(page.getByRole('img', { name: 'New shared proposal', exact: true })).toHaveCount(0);
});


test('permission updates do not make an already-opened shared proposal new again', async ({ page }) => {
  await page.goto(`${fixture}?mode=dashboard&opened=1`);
  await expect(page.getByRole('img', { name: 'New shared proposals', exact: true })).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Changes awaiting review', exact: true })).toHaveCount(2);
  await page.getByRole('tab', { name: 'Shared with Me (1)' }).click();
  await expect(page.getByRole('img', { name: 'New shared proposal', exact: true })).toHaveCount(0);
});

test('notification queries retain recipient and mode guards and page beyond the recent feed limit', async ({ page }) => {
  await page.addInitScript(() => {
    window.__APP_ENV__ = { VITE_SUPABASE_URL: 'https://submerge-playwright.invalid', VITE_SUPABASE_ANON_KEY: 'playwright-public-placeholder' };
  });
  const queries: string[] = [];
  await page.route('https://submerge-playwright.invalid/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/proposal_collaboration_events')) {
      queries.push(url.search);
      const offset = Number(url.searchParams.get('offset') || 0);
      const read = url.searchParams.get('read_at') === 'not.is.null';
      const rows = read ? [{ id: 'old', proposal_number: 'PROP-OPENED', event_type: 'shared', read_at: '2026-10-27T12:00:00Z' }]
        : offset === 0 ? [{ id: 'one' }, { id: 'two' }] : [{ id: 'three' }];
      return route.fulfill({ json: rows });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(`${fixture}?mode=recipient`);
  const result = await page.evaluate(async () => {
    const { listCollaborationEvents } = await import('/src/services/proposalCollaboration.ts');
    return { unread: await listCollaborationEvents(2, { unreadOnly: true, proposalNumber: 'PROP-OPENED' }),
      read: await listCollaborationEvents(2, { readSharesOnly: true }) };
  });
  expect(result.unread.map(event => event.id)).toEqual(['one', 'two', 'three']);
  expect(result.read.map(event => event.id)).toEqual(['old']);
  expect(queries).toHaveLength(3);
  for (const query of queries) {
    const params = new URLSearchParams(query);
    expect(params.get('recipient_id')).toBe('eq.recipient-id');
    expect(params.get('is_test')).toBe('eq.false');
  }
  expect(new URLSearchParams(queries[0]).get('proposal_number')).toBe('eq.PROP-OPENED');
  expect(new URLSearchParams(queries[0]).get('read_at')).toBe('is.null');
  expect(new URLSearchParams(queries[2]).get('event_type')).toBe('eq.shared');
});


test('changing a permission preserves the original sharing message', async ({ page }) => {
  await page.goto(`${fixture}?mode=owner`);
  await page.getByRole('button', { name: 'Share / Manage Access' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share and manage access' });
  const permission = dialog.getByRole('combobox', { name: 'Permission for Jordan Designer' });
  await permission.selectOption('view');
  await expect(permission).toHaveValue('view');
  await expect.poll(() => page.evaluate(() => window.collaborationAction)).toBe('share:recipient-id:view:Please review');
  expect(await page.evaluate(() => (window as any).collaborationShares()[0].note)).toBe('Please review');
  await permission.selectOption('contribute');
  await expect.poll(() => page.evaluate(() => window.collaborationAction)).toBe('share:recipient-id:contribute:Please review');
  expect(await page.evaluate(() => (window as any).collaborationShares()[0].note)).toBe('Please review');
});
