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

test('collaboration access sits under the title and leave stays beside the current collaborator', async ({ page }, testInfo) => {
  for (const [mode, permission, access] of [['owner', 'contribute', 'Owner'], ['recipient', 'contribute', 'Can propose changes'], ['recipient', 'view', 'Can view']]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fixture}?mode=${mode}&permission=${permission}&rail=1`);
    const card = page.getByRole('region', { name: 'Collaboration' });
    const title = card.getByRole('heading', { name: 'Collaboration', exact: true });
    const accessNote = card.locator('.proposal-side-card-header').getByText(`Your Access: ${access}`, { exact: true });
    await expect(accessNote).toBeVisible();
    const titleBounds = (await title.boundingBox())!;
    const accessBounds = (await accessNote.boundingBox())!;
    expect(accessBounds.y).toBeGreaterThanOrEqual(titleBounds.y + titleBounds.height);
    expect(accessBounds.x).toBe(titleBounds.x);
    const leave = card.getByRole('button', { name: 'Leave Proposal', exact: true });
    if (mode === 'owner') {
      await expect(leave).toHaveCount(0);
    } else {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const row = card.locator('.collaboration-contributor-row').filter({ hasText: 'Jordan Designer' });
        await expect(row.getByRole('button', { name: 'Leave Proposal' })).toBeVisible();
        const nameBounds = (await row.locator('strong').boundingBox())!;
        const buttonBounds = (await leave.boundingBox())!;
        expect(buttonBounds.x).toBeGreaterThanOrEqual(nameBounds.x + nameBounds.width);
        expect(buttonBounds.y).toBeLessThan(nameBounds.y + nameBounds.height);
        expect(buttonBounds.y + buttonBounds.height).toBeGreaterThan(nameBounds.y);
        expect(buttonBounds.width).toBeLessThan(140);
        const withdrawBounds = (await card.getByRole('button', { name: 'Withdraw Changes', exact: true }).boundingBox())!;
        expect(withdrawBounds.x).toBe(buttonBounds.x);
        expect(withdrawBounds.width).toBe(buttonBounds.width);
        expect(withdrawBounds.height).toBe(buttonBounds.height);
        expect(withdrawBounds.y + withdrawBounds.height).toBeLessThan(buttonBounds.y);
        expect(nameBounds.height).toBeLessThan(50);
        expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
      await expect(card.locator('.collaboration-contributor-row').filter({ hasText: 'Taylor Admin' }).getByRole('button')).toHaveCount(0);
    }
    await card.screenshot({ path: testInfo.outputPath(`collaboration-access-${mode}-${permission}.png`) });
  }
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

test('dashboard tabs keep the same table width and full-width dividers', async ({ page }, testInfo) => {
  for (const width of [1440, 2057]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${fixture}?mode=dashboard`);
    const measure = () => page.locator('.dashboard-proposals-panel').evaluate(panel => {
      const body = panel.querySelector<HTMLElement>('.dashboard-proposals-body:not([hidden]), .dashboard-shared-table-shell:not([hidden])')!;
      const rect = (selector: string) => {
        const bounds = body.querySelector(selector)!.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right };
      };
      return { toolbar: rect('.dashboard-proposals-toolbar'), table: rect('table'), pagination: rect('.proposal-table-pagination'),
        bodyLeft: body.getBoundingClientRect().left, bodyRight: body.getBoundingClientRect().right };
    });
    await expect(page.getByRole('table')).toBeVisible();
    const mine = await measure();
    await page.getByRole('tab', { name: 'Shared with Me (1)' }).click();
    await expect(page.getByRole('columnheader', { name: 'Owner', exact: true })).toBeVisible();
    const shared = await measure();
    expect(shared).toEqual(mine);
    expect(shared.toolbar.left).toBe(shared.bodyLeft);
    expect(shared.toolbar.right).toBe(shared.bodyRight);
    expect(shared.pagination.left).toBe(shared.bodyLeft);
    expect(shared.pagination.right).toBe(shared.bodyRight);
    await page.screenshot({ path: testInfo.outputPath(`shared-table-alignment-${width}.png`) });
  }
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

test('review waits for preparation and pricing before revealing a complete comparison', async ({ page }, testInfo) => {
  await page.goto(`${fixture}?mode=owner&diff=equipment&slowReview=1`);
  await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review proposed changes' });
  const loading = review.getByRole('status');
  await expect(loading).toHaveText('Preparing a comparison using the owner’s current pricing…');
  await expect(review.locator('.collaboration-totals')).toHaveCount(0);
  await expect(review.getByRole('table')).toHaveCount(0);
  await expect(review.getByRole('button', { name: 'Apply Changes' })).toBeDisabled();
  await review.screenshot({ path: testInfo.outputPath('comparison-loading.png') });
  await page.waitForFunction(() => typeof (window as any).finishReviewPreparation === 'function');
  await page.evaluate(() => (window as any).finishReviewPreparation());
  await page.waitForFunction(() => typeof (window as any).finishReviewPricing === 'function');
  await expect(loading).toBeVisible();
  await expect(review.locator('.collaboration-totals')).toHaveCount(0);
  await expect(review.getByRole('table')).toHaveCount(0);
  await page.evaluate(() => (window as any).finishReviewPricing());
  await expect(review.locator('.collaboration-review-body')).toHaveAttribute('aria-busy', 'false');
  await expect(review.getByRole('table')).toBeVisible();
  await expect(review.locator('.collaboration-totals')).toContainText('$106,050.00');
  const content = await review.locator('.collaboration-review-body').textContent();
  const bounds = await review.boundingBox();
  await page.getByRole('radio', { name: 'Create a new draft with these changes' }).check();
  await page.getByRole('radio', { name: 'Overwrite current version with these changes' }).check();
  await expect(review.locator('.collaboration-review-body')).toHaveAttribute('aria-busy', 'false');
  expect(await review.locator('.collaboration-review-body').textContent()).toBe(content);
  expect(await review.boundingBox()).toEqual(bounds);
  await review.screenshot({ path: testInfo.outputPath('comparison-ready.png') });
});

test('closing a loading comparison ignores its late result when another review opens', async ({ page }) => {
  await page.goto(`${fixture}?mode=owner&slowReview=1`);
  await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review proposed changes' });
  await page.waitForFunction(() => typeof (window as any).finishReviewPreparation === 'function');
  await page.evaluate(() => { (window as any).previousPreparation = (window as any).finishReviewPreparation; });
  await review.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
  await page.waitForFunction(() => (window as any).finishReviewPreparation !== (window as any).previousPreparation);
  await page.evaluate(() => (window as any).previousPreparation());
  await expect(review.getByRole('status')).toBeVisible();
  await expect(review.getByRole('table')).toHaveCount(0);
  await page.evaluate(() => (window as any).finishReviewPreparation());
  await page.waitForFunction(() => typeof (window as any).finishReviewPricing === 'function');
  await page.evaluate(() => (window as any).finishReviewPricing());
  await expect(review.getByRole('table')).toBeVisible();
});

test('failed comparison preparation shows an error without exposing an unprepared review', async ({ page }, testInfo) => {
  await page.goto(`${fixture}?mode=owner&reviewFailure=1`);
  await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review proposed changes' });
  await expect(review.getByRole('alert')).toHaveText('The comparison could not be prepared. Reopen it to try again.');
  await expect(review.getByRole('table')).toHaveCount(0);
  await expect(review.locator('.collaboration-totals')).toHaveCount(0);
  await expect(review.getByRole('button', { name: 'Apply Changes' })).toBeDisabled();
  await review.screenshot({ path: testInfo.outputPath('comparison-load-error.png') });
  await review.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(review).toHaveCount(0);
});

test('review shows COGS including overhead and labels the retail total', async ({ page }, testInfo) => {
  await page.goto(`${fixture}?mode=owner&diff=equipment`);
  await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
  const totals = page.getByRole('dialog', { name: 'Review proposed changes' }).locator('.collaboration-totals');
  const cogs = totals.locator('.collaboration-total').filter({ has: page.getByText('COGS', { exact: true }) });
  await expect(cogs).toHaveText('COGS$101,000.00 → $106,050.00');
  const retail = totals.locator('.collaboration-total').filter({ has: page.getByText('Retail Total', { exact: true }) });
  await expect(retail).toHaveText('Retail Total$108,000.00 → $113,000.00');
  await expect(totals.getByText('Subtotal', { exact: true })).toHaveCount(0);
  await expect(totals.getByText('Gross Profit %', { exact: true })).toBeVisible();
  await totals.screenshot({ path: testInfo.outputPath('review-cogs-retail-totals.png') });
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
  await expect(review.getByText('Item price changes could not be reconciled with the total difference. Review the saved totals above.')).toBeVisible();
  await expect(automation.getByRole('cell').last()).toHaveText('—');
  const dash = automation.getByRole('cell').last().getByTitle('Multiple items impact this price', { exact: true });
  await expect(dash).toHaveText('—');
  await dash.hover();
  await expect(dash).toHaveAttribute('title', 'Multiple items impact this price');
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
  await expect(page.locator('.collaboration-contributor-row strong')).toHaveText(['Jordan Designer', 'Taylor Admin', 'Casey Editor']);
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

test('viewer uses the app confirmation to leave and returns to the dashboard', async ({ page }, testInfo) => {
  await page.goto(`${fixture}?mode=viewer&permission=view`);
  await expect(page.getByText('Your Access: Can view')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Propose changes' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Leave Proposal' }).click();
  const confirm = page.getByRole('dialog', { name: 'Leave proposal?' });
  await expect(confirm.locator('.confirm-modal')).toBeVisible();
  await expect(confirm.locator('.confirm-actions')).toHaveCSS('justify-content', 'flex-end');
  await expect(confirm.getByRole('button', { name: 'Leave Proposal' })).toHaveCSS('background-color', 'rgb(12, 34, 67)');
  await expect(confirm).toContainText('Your unfinished or pending changes will be canceled.');
  await page.screenshot({ path: testInfo.outputPath('leave-proposal-confirmation.png') });
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  expect(await page.evaluate(() => window.collaborationAction)).toBe('');
  await page.getByRole('button', { name: 'Leave Proposal' }).click();
  await confirm.getByRole('button', { name: 'Leave Proposal' }).click();
  await expect(page).toHaveURL(/mode=dashboard/);
  await expect(page.getByRole('tab', { name: 'My Proposals (1)' })).toBeVisible();
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
  let safetyFixture: any;
  const calls: any[] = [];
  await page.route('https://submerge-playwright.invalid/**', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/collab_apply_review_v3')) {
      const args = route.request().postDataJSON(); calls.push(args);
      return route.fulfill({ json: { destination: args.p_destination, versionId: args.p_destination === 'new-draft' ? 'server-created' : 'original' } });
    }
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/proposal_collaboration_requests')) return route.fulfill({ json: safetyFixture.request });
    if (path.endsWith('/franchise_proposals')) return route.fulfill({ json: { proposal_json: safetyFixture.base, content_revision: 8, owner_auth_user_id: 'owner-id' } });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${fixture}?mode=owner`);
  safetyFixture = await page.evaluate(async () => {
    const { getDefaultProposal } = await import('/src/utils/proposalDefaults.ts');
    const { calculateCollaborativeVersion, prepareContribution } = await import('/src/services/collaborationPricing.ts');
    const base: any = await calculateCollaborativeVersion({ ...getDefaultProposal(), versionId: 'original', proposalNumber: 'TEST-FIXTURE-1',
      franchiseId: 'fixture-franchise', pricingModelId: 'fixture-model', pricingModelRevisionId: 'fixture-revision', contentRevision: 8 });
    const work = structuredClone(base); work.customerInfo.phone = '555-0100';
    const request: any = { id: 'request', proposal_number: base.proposalNumber, target_version_id: 'original', base_version_json: base,
      working_version_json: work, updated_at: '2026-10-27T21:00:00Z' };
    return { base, request, prepared: await prepareContribution(request, base) };
  });
  const results = await page.evaluate(async prepared => {
    const { applyChangeRequest } = await import('/src/services/proposalCollaboration.ts');
    return [await applyChangeRequest('request', prepared, 'new-draft'), await applyChangeRequest('request', prepared, 'overwrite')];
  }, safetyFixture.prepared);
  expect(calls.map(call => call.p_destination)).toEqual(['new-draft','overwrite']);
  for (const call of calls) expect(call).toMatchObject({ p_result: { versionId: 'original' }, p_expected: 8 });
  expect(results.map(value => value.versionId)).toEqual(['server-created','original']);
  safetyFixture.base.totalCost -= 2000;
  await expect(page.evaluate(async prepared => {
    const { applyChangeRequest } = await import('/src/services/proposalCollaboration.ts');
    return applyChangeRequest('request', prepared, 'overwrite');
  }, safetyFixture.prepared)).rejects.toThrow('saved total');
  expect(calls).toHaveLength(2);
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


test('unseen sharing notes require Okay, survive an interrupted first visit, and stay dismissed on return', async ({ page }, testInfo) => {
  await page.goto(`${fixture}?mode=recipient&note=1&rail=1`);
  const message = page.getByRole('dialog', { name: 'Message from Alex Owner' });
  await expect(message).toContainText('Please review');
  await expect(message.getByRole('button')).toHaveCount(1);
  await expect(message.getByRole('button', { name: 'Okay', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('fixture-event-read'))).toBeNull();
  await page.keyboard.press('Escape');
  await expect(message).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(message).toBeVisible();
  await page.reload();
  await expect(message).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('sharing-note-greeting.png') });
  await message.getByRole('button', { name: 'Okay', exact: true }).click();
  await expect(message).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('fixture-event-read'))).toBe('fixture-unread');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Collaboration' })).toBeVisible();
  await expect(message).toHaveCount(0);
  await page.goto(`${fixture}?mode=recipient&note=Please%20check%20the%20new%20equipment`);
  await expect(message).toContainText('Please check the new equipment');
  await message.getByRole('button', { name: 'Okay', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Collaboration' })).toBeVisible();
  await expect(message).toHaveCount(0);
});

test('opening a shared summary clears its new dot after acknowledging the sharing message', async ({ page }) => {
  await page.goto(`${fixture}?mode=dashboard`);
  await expect(page.getByRole('img', { name: 'New shared proposals', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Shared with Me (1)' }).click();
  await expect(page.getByRole('img', { name: 'New shared proposal', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('fixture-event-read'))).toBeNull();
  await page.goto(`${fixture}?mode=recipient&note=1`);
  await page.getByRole('dialog', { name: 'Message from Alex Owner' }).getByRole('button', { name: 'Okay' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('fixture-event-read'))).toBe('fixture-unread');
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


test('failed leave keeps the confirmation and proposal available for retry', async ({ page }) => {
  await page.goto(`${fixture}?mode=recipient&leaveFailure=1`);
  await page.getByRole('button', { name: 'Leave Proposal' }).click();
  const confirm = page.getByRole('dialog', { name: 'Leave proposal?' });
  await confirm.getByRole('button', { name: 'Leave Proposal' }).click();
  await expect(confirm.locator('.confirm-error')).toHaveText('Connection interrupted. Try leaving again.');
  await expect(page).not.toHaveURL(/mode=dashboard/);
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Leave Proposal' })).toBeEnabled();
});

test('an earlier client reading the alert does not consume a sharing note greeting', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fixture-event-read', 'fixture-unread'));
  await page.goto(`${fixture}?mode=recipient&note=1`);
  const message = page.getByRole('dialog', { name: 'Message from Alex Owner' });
  await expect(message).toContainText('Please review');
  await message.getByRole('button', { name: 'Okay' }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Collaboration' })).toBeVisible();
  await expect(message).toHaveCount(0);
});

test('dismissed note receipts contain no note text and do not carry across accounts', async ({ page }) => {
  await page.goto(`${fixture}?mode=recipient&note=Private%20sharing%20message`);
  await page.getByRole('dialog', { name: 'Message from Alex Owner' }).getByRole('button', { name: 'Okay' }).click();
  const result = await page.evaluate(async () => {
    const { collaborationNoteReceiptKey, hasCollaborationNoteReceipt } = await import('/src/services/collaborationNoteReceipts.ts');
    const key = await collaborationNoteReceiptKey('TEST-FIXTURE-1', 'share-1', 'Private sharing message');
    const seen = hasCollaborationNoteReceipt(key);
    const session = JSON.parse(localStorage.getItem('submerge-user-session')!);
    localStorage.setItem('submerge-user-session', JSON.stringify({ ...session, userId: 'other-recipient' }));
    const other = await collaborationNoteReceiptKey('TEST-FIXTURE-1', 'share-1', 'Private sharing message');
    return { seen, otherSeen: hasCollaborationNoteReceipt(other), key, other,
      receipts: Object.entries(localStorage).filter(([name]) => name.startsWith('submerge.collaborationNoteSeen')) };
  });
  expect(result.seen).toBe(true);
  expect(result.otherSeen).toBe(false);
  expect(result.key).not.toBe(result.other);
  expect(JSON.stringify(result.receipts)).not.toContain('Private sharing message');
});
