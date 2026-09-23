import { mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import MasterPricingEngine from '../../src/services/masterPricingEngine';
import { getDefaultProposal } from '../../src/utils/proposalDefaults';
import { getBundledContractTemplateRevision } from '../../src/services/contractTemplates';

const workspaceRoot = path.resolve(__dirname, '..', '..');
const sessionStorageKey = 'submerge-user-session';
const supabaseAuthStorageKey = 'sb-127-auth-token';
const changelogPromptStorageKey = 'submerge-changelog-prompt';
const createdDate = '2026-05-13T13:51:22.159Z';

const testSession = {
  userId: 'playwright-proposal-safety-user',
  userEmail: 'proposal-safety@playwright.invalid',
  userName: 'Playwright Designer',
  franchiseId: 'playwright-franchise',
  franchiseName: 'Playwright Franchise',
  franchiseCode: 'PWTEST',
  role: 'designer',
  isTestAccount: true,
  testAccountId: 'playwright-proposal-safety-account',
};

function encodeJwtPart(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function buildLocalSupabaseSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const accessToken = [
    encodeJwtPart({ alg: 'none', typ: 'JWT' }),
    encodeJwtPart({
      aud: 'authenticated',
      exp: expiresAt,
      sub: testSession.userId,
      email: testSession.userEmail,
      role: 'authenticated',
    }),
    'playwright',
  ].join('.');

  return {
    access_token: accessToken,
    refresh_token: 'playwright-refresh-token',
    token_type: 'bearer',
    expires_in: 24 * 60 * 60,
    expires_at: expiresAt,
    user: {
      id: testSession.userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: testSession.userEmail,
      app_metadata: {},
      user_metadata: {},
      created_at: createdDate,
    },
  };
}

function buildLocalProposal(proposalNumber: string, customerName: string, invalidPinnedPricing = false) {
  const defaults = getDefaultProposal();
  return {
    ...defaults,
    proposalNumber,
    createdDate,
    lastModified: '2026-08-24T18:12:58.079Z',
    customerInfo: {
      ...defaults.customerInfo,
      customerName,
      city: 'Charlotte',
      state: 'NC',
    },
    franchiseId: testSession.franchiseId,
    designerName: testSession.userName,
    designerRole: testSession.role,
    designerCode: testSession.franchiseCode,
    status: 'draft',
    versionId: 'original',
    versionName: 'Original Version',
    isOriginalVersion: true,
    activeVersionId: 'original',
    versions: [],
    totalCost: 75_000,
    pricing: { retailPrice: 75_000 },
    ...(invalidPinnedPricing
      ? {
          pricingModelId: 'missing-old-pricing-model',
          pricingModelName: 'Missing Old Pricing Model',
          pricingModelFranchiseId: testSession.franchiseId,
          pricingModelRevisionId: 'missing-old-pricing-revision',
          pricingModelRevisionNumber: 1,
        }
      : {}),
  };
}

function buildPositiveHistoricalAdjustmentProposal(proposalNumber: string, customerName: string) {
  const proposal = buildLocalProposal(proposalNumber, customerName);
  const pricingInput = {
    ...proposal,
    poolSpecs: {
      ...proposal.poolSpecs,
      maxWidth: 15,
      maxLength: 40,
      shallowDepth: 3.5,
      endDepth: 6,
      surfaceArea: 600,
      perimeter: 110,
    },
    historicalPricingAdjustment: 4_088.88,
  };
  const calculation = MasterPricingEngine.calculateCompleteProposal(pricingInput as any);

  return {
    ...pricingInput,
    costBreakdown: calculation.costBreakdown,
    pricing: calculation.pricing,
    subtotal: calculation.subtotal,
    taxRate: calculation.taxRate,
    taxAmount: calculation.taxAmount,
    totalCost: calculation.totalCost,
  };
}

async function launchIsolatedApp(appDataDirectory: string) {
  mkdirSync(appDataDirectory, { recursive: true });
  const electronEnvironment = { ...process.env };
  delete electronEnvironment.ELECTRON_RUN_AS_NODE;
  Object.assign(electronEnvironment, {
    APPDATA: appDataDirectory,
    LOCALAPPDATA: appDataDirectory,
    NODE_ENV: 'production',
    SUBMERGE_DATA_PARTITION: 'playwright-e2e-proposal-safety',
    SUBMERGE_TEST_USER_DATA_ROOT: appDataDirectory,
  });

  const electronApp = await electron.launch({
    // The managed test environment cannot initialize Electron 29's Chromium
    // child-process sandbox. Production launches do not use this switch.
    args: ['main.js', '--no-sandbox'],
    cwd: workspaceRoot,
    env: electronEnvironment,
    timeout: 30_000,
  });
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { electronApp, window };
}

async function seedSessionAndProposals(window: Page, proposals: unknown[]) {
  await window.evaluate(
    async ({ sessionKey, authKey, changelogKey, session, authSession, proposalFixtures }) => {
      localStorage.setItem(sessionKey, JSON.stringify(session));
      localStorage.setItem(authKey, JSON.stringify(authSession));
      const appVersion = window.electron.appVersion || '3.2.6';
      localStorage.setItem(changelogKey, JSON.stringify({
        lastLaunchedVersion: appVersion,
        pendingChangelogVersion: null,
        acknowledgedChangelogVersion: appVersion,
      }));
      for (const proposal of proposalFixtures) {
        await window.electron.saveProposal(proposal);
      }
    },
    {
      sessionKey: sessionStorageKey,
      authKey: supabaseAuthStorageKey,
      changelogKey: changelogPromptStorageKey,
      session: testSession,
      authSession: buildLocalSupabaseSession(),
      proposalFixtures: proposals,
    }
  );
}

test('locks a partially loaded existing proposal and preserves its local file', async ({}, testInfo) => {
  const proposalNumber = 'TEST-PWTEST-LOAD-GUARD';
  const original = buildLocalProposal(proposalNumber, 'Protected Existing Customer', true);
  let electronApp: ElectronApplication | null = null;

  try {
    const launched = await launchIsolatedApp(testInfo.outputPath('app-data'));
    electronApp = launched.electronApp;
    const window = launched.window;
    await seedSessionAndProposals(window, [original]);
    await window.context().setOffline(true);

    await window.evaluate((route) => {
      window.location.hash = route;
      window.location.reload();
    }, `/proposal/edit/${proposalNumber}`);

    await expect(window.getByTestId('proposal-load-safety-error')).toBeVisible({ timeout: 20_000 });
    await expect(window.getByRole('heading', { name: 'Proposal could not be opened safely' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Proposal Summary' })).toHaveCount(0);
    await window.waitForTimeout(1_800);

    const afterFailedLoad = await window.evaluate((number) => window.electron.getProposal(number), proposalNumber);
    expect(afterFailedLoad.customerInfo.customerName).toBe(original.customerInfo.customerName);
    expect(afterFailedLoad.createdDate).toBe(createdDate);
    expect(afterFailedLoad.totalCost).toBe(75_000);
    expect(afterFailedLoad.pricingModelRevisionId).toBe('missing-old-pricing-revision');

    const screenshotPath = testInfo.outputPath('proposal-load-protected.png');
    await window.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('Protected proposal load failure', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  } finally {
    await electronApp?.close().catch(() => undefined);
  }
});

test('still opens and saves a normal existing proposal without changing its identity', async ({}, testInfo) => {
  const proposalNumber = 'TEST-PWTEST-NORMAL-SAVE';
  const original = buildLocalProposal(proposalNumber, 'Normal Existing Customer');
  let electronApp: ElectronApplication | null = null;

  try {
    const launched = await launchIsolatedApp(testInfo.outputPath('app-data'));
    electronApp = launched.electronApp;
    const window = launched.window;
    await seedSessionAndProposals(window, [original]);
    await window.context().setOffline(true);

    await window.evaluate((route) => {
      window.location.hash = route;
      window.location.reload();
    }, `/proposal/edit/${proposalNumber}`);

    const customerNameInput = window.getByPlaceholder('Enter customer name');
    await expect(customerNameInput).toHaveValue('Normal Existing Customer', { timeout: 20_000 });
    await customerNameInput.fill('Normal Existing Customer Updated');
    await window.getByRole('button', { name: 'Proposal Summary' }).click();
    await expect(window).toHaveURL(new RegExp(`#\/proposal\/view\/${proposalNumber}$`), { timeout: 20_000 });

    const saved = await window.evaluate((number) => window.electron.getProposal(number), proposalNumber);
    expect(saved.customerInfo.customerName).toBe('Normal Existing Customer Updated');
    expect(saved.createdDate).toBe(createdDate);
    expect(saved.proposalNumber).toBe(proposalNumber);
  } finally {
    await electronApp?.close().catch(() => undefined);
  }
});

test('West contract revision choices stay with separate locally saved proposals', async ({}, testInfo) => {
  const firstNumber = 'TEST-PWTEST-CONTRACT-CHOICE-A';
  const secondNumber = 'TEST-PWTEST-CONTRACT-CHOICE-B';
  const oldRevision = `bundled:${testSession.franchiseId}:nc-gunite:r1`;
  const newRevision = 'remote-nc-gunite-r2';
  const makeProposal = (number: string, name: string) => ({
    ...buildLocalProposal(number, name),
    designerCode: '5555',
    contractTemplateId: `bundled:${testSession.franchiseId}:nc-gunite`,
    contractTemplateRevisionId: oldRevision,
    contractTemplateRevisionNumber: 1,
  });
  let electronApp: ElectronApplication | null = null;

  try {
    const launched = await launchIsolatedApp(testInfo.outputPath('app-data'));
    electronApp = launched.electronApp;
    const window = launched.window;
    await seedSessionAndProposals(window, [
      makeProposal(firstNumber, 'First Contract Choice Customer'),
      makeProposal(secondNumber, 'Second Contract Choice Customer'),
    ]);
    await window.evaluate((sessionKey) => {
      const session = JSON.parse(localStorage.getItem(sessionKey) || '{}');
      localStorage.setItem(sessionKey, JSON.stringify({ ...session, franchiseCode: '5555' }));
    }, sessionStorageKey);
    const pdfBytes = readFileSync(path.join(workspaceRoot, 'docs', 'Contracts', 'NEW 2026 Contract NC Shotcrete.pdf'));
    const checksum = createHash('sha256').update(pdfBytes).digest('hex');
    const revisions = [1, 2].map((number) => {
      const source = getBundledContractTemplateRevision('nc-gunite', number)!;
      return {
        id: `remote-nc-gunite-r${number}`,
        contract_template_id: 'remote-nc-gunite', franchise_id: testSession.franchiseId,
        revision_number: number, storage_path: `playwright/nc-gunite/r${number}.pdf`,
        original_file_name: 'NEW 2026 Contract NC Shotcrete.pdf', file_checksum: checksum,
        field_layout_json: source.contractTemplate.fields,
        autofill_rules_json: {
          schemaVersion: 2, renderProfile: 'ppas-west-2026-v1',
          defaultFieldValues: source.contractTemplate.defaultFieldValues,
          changeNotes: [...(source.changeNotes || [])], effectivePublishedAt: source.publishedAt,
          legacyBundledId: `bundled:${testSession.franchiseId}:nc-gunite:r${number}`,
        },
        published_at: source.publishedAt,
      };
    });
    await window.evaluate(async ({ franchiseId, revisions: cachedRevisions, pdfBase64 }) => {
      localStorage.setItem(`submerge-contract-template-catalog-v1:${franchiseId}`, JSON.stringify({
        templates: [{
          id: 'remote-nc-gunite', franchise_id: franchiseId, name: '2026 Contract NC Shotcrete',
          jurisdiction_key: 'NC', pool_type: 'shotcrete', current_revision_id: 'remote-nc-gunite-r2',
          is_active: false, remote_client_published: true,
        }],
        revisions: cachedRevisions,
      }));
      const bytes = Uint8Array.from(atob(pdfBase64), (char) => char.charCodeAt(0));
      for (const revision of cachedRevisions) {
        await window.electron.saveContractRevisionPdf({
          franchiseId, revisionId: revision.id, bytes,
        });
      }
    }, { franchiseId: testSession.franchiseId, revisions, pdfBase64: pdfBytes.toString('base64') });
    let firstVisit = true;
    const visit = async (number: string) => {
      await window.evaluate(({ route, reload }) => {
        window.location.hash = route;
        if (reload) window.location.reload();
      }, { route: `/proposal/view/${number}`, reload: firstVisit });
      firstVisit = false;
      await expect(window.getByRole('button', { name: /View Contract/ })).toBeVisible({ timeout: 20_000 });
    };
    await visit(firstNumber);
    await window.context().setOffline(true);
    await window.getByRole('button', { name: /View Contract/ }).click();
    await window.getByRole('dialog').getByRole('button', { name: 'Apply Update' }).click();
    await expect(window.locator('[data-field-id="p1_36"] input')).toHaveValue('3');
    await window.getByRole('button', { name: 'Close contract' }).click();

    await visit(secondNumber);
    await window.getByRole('button', { name: /View Contract/ }).click();
    await window.getByRole('dialog').getByRole('button', { name: 'Keep Current' }).click();
    await expect(window.locator('[data-field-id="p1_36"] input')).toHaveValue('4');
    await window.getByRole('button', { name: 'Close contract' }).click();

    await visit(firstNumber);
    await window.getByRole('button', { name: /View Contract/ }).click();
    await expect(window.getByRole('dialog')).toHaveCount(0);
    await expect(window.locator('[data-field-id="p1_36"] input')).toHaveValue('3');
    const decisions = await window.evaluate(async ([a, b]) => {
      const first = await window.electron.getProposal(a);
      const second = await window.electron.getProposal(b);
      return [first, second].map((proposal) => ({
        number: proposal.proposalNumber,
        revision: proposal.contractTemplateRevisionId,
        decision: proposal.contractRevisionReview?.decision,
      }));
    }, [firstNumber, secondNumber]);
    expect(decisions).toEqual([
      { number: firstNumber, revision: newRevision, decision: 'upgraded' },
      { number: secondNumber, revision: oldRevision, decision: 'declined' },
    ]);
  } finally {
    await electronApp?.close().catch(() => undefined);
  }
});

test('does not display a positive historical price adjustment as negative customer savings', async ({}, testInfo) => {
  const proposalNumber = 'TEST-PWTEST-SAVINGS-SUMMARY';
  const proposal = buildPositiveHistoricalAdjustmentProposal(
    proposalNumber,
    'Savings Summary Regression Customer'
  );
  let electronApp: ElectronApplication | null = null;

  try {
    const launched = await launchIsolatedApp(testInfo.outputPath('app-data'));
    electronApp = launched.electronApp;
    const window = launched.window;
    await seedSessionAndProposals(window, [proposal]);
    await window.context().setOffline(true);

    await window.evaluate((route) => {
      window.location.hash = route;
      window.location.reload();
    }, `/proposal/view/${proposalNumber}`);

    const customerSummary = window.locator('.summary-tile.customer-tile');
    await expect(customerSummary).toBeVisible({ timeout: 20_000 });

    const retailPrice = customerSummary.locator('.metric-row').filter({ hasText: 'Retail Price:' });
    const retailSalePrice = customerSummary.locator('.metric-row').filter({ hasText: 'Retail Sale Price:' });
    const totalSavings = customerSummary.locator('.metric-row').filter({ hasText: 'Total Savings:' });
    const totalSavingsPercent = customerSummary.locator('.metric-row').filter({ hasText: 'Total Savings %:' });

    await expect(retailPrice.locator('.metric-value')).toHaveText(
      Number(proposal.totalCost).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    );
    await expect(retailSalePrice.locator('.metric-value')).toHaveText(
      Number(proposal.totalCost).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    );
    await expect(totalSavings.locator('.metric-value')).toHaveText('$0.00');
    await expect(totalSavingsPercent.locator('.metric-value')).toHaveText('0.0%');

    const screenshotPath = testInfo.outputPath('proposal-savings-summary.png');
    await customerSummary.screenshot({ path: screenshotPath });
    await testInfo.attach('Corrected proposal savings summary', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  } finally {
    await electronApp?.close().catch(() => undefined);
  }
});

test('creates and saves a new proposal version with its own creation date', async ({}, testInfo) => {
  const proposalNumber = 'TEST-PWTEST-NEW-VERSION';
  const original = buildLocalProposal(proposalNumber, 'Versioned Existing Customer');
  let electronApp: ElectronApplication | null = null;

  try {
    const launched = await launchIsolatedApp(testInfo.outputPath('app-data'));
    electronApp = launched.electronApp;
    const window = launched.window;
    await seedSessionAndProposals(window, [original]);
    await window.context().setOffline(true);

    await window.evaluate((route) => {
      window.location.hash = route;
      window.location.reload();
    }, `/proposal/view/${proposalNumber}`);

    await window.getByRole('button', { name: 'Build Another Version' }).click();
    const versionNameInput = window.getByLabel('Version Name');
    await expect(versionNameInput).toBeVisible({ timeout: 20_000 });
    await versionNameInput.fill('Safety Guard Regression Version');
    await window.getByRole('button', { name: 'Create', exact: true }).click();

    const versionNavigationItem = window.getByRole('button', {
      name: /Safety Guard Regression Version/,
    });
    await expect(versionNavigationItem).toBeVisible({ timeout: 20_000 });
    await versionNavigationItem.click();
    await window.getByRole('button', { name: 'Edit Proposal' }).click();

    const customerNameInput = window.getByPlaceholder('Enter customer name');
    await expect(customerNameInput).toHaveValue('Versioned Existing Customer', { timeout: 20_000 });
    await customerNameInput.fill('Versioned Existing Customer Updated');
    await window.getByRole('button', { name: 'Proposal Summary' }).click();
    await expect(window).toHaveURL(new RegExp(`#\/proposal\/view\/${proposalNumber}$`), { timeout: 20_000 });

    const saved = await window.evaluate((number) => window.electron.getProposal(number), proposalNumber);
    const allVersions = [saved, ...(saved.versions || [])];
    const createdVersion = allVersions.find(
      (version) => version.versionName === 'Safety Guard Regression Version'
    );
    expect(createdVersion).toBeTruthy();
    expect(createdVersion.customerInfo.customerName).toBe('Versioned Existing Customer Updated');
    expect(createdVersion.createdDate).not.toBe(createdDate);
    expect(allVersions.find((version) => version.versionId === 'original')?.createdDate).toBe(createdDate);
  } finally {
    await electronApp?.close().catch(() => undefined);
  }
});
