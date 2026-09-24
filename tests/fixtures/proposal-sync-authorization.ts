import { getDefaultProposal } from '../../src/utils/proposalDefaults';
import {
  getProposal,
  listProposals,
  saveProposal,
  syncPendingProposals,
} from '../../src/services/proposalsAdapter';

const sessionKey = 'submerge-user-session';
const ownerKey = 'submerge.localProposalOwners.v1';
const impersonationKey = 'submerge-master-impersonation';
const franchiseId = 'playwright-franchise';
const proposalNumber = 'PROP-PW-SYNC-AUTH';
const adminId = 'playwright-admin';
const designerId = 'playwright-designer';
let disk: any[] = [];

(window as any).electron = {
  getAllProposals: async () => structuredClone(disk),
  getAllProposalsWithReport: async () => ({
    entries: structuredClone(disk).map((proposal: any) => ({ proposal })),
    issues: [],
  }),
  getProposal: async (number: string) => structuredClone(disk.find((item) => item.proposalNumber === number) || null),
  saveProposal: async (proposal: any) => {
    disk = [...disk.filter((item) => item.proposalNumber !== proposal.proposalNumber), structuredClone(proposal)];
    return 1;
  },
};

function proposal(ownerId: string, status: string, syncStatus: string = 'synced') {
  const defaults = getDefaultProposal();
  return {
    ...defaults,
    proposalNumber,
    franchiseId,
    designerAuthUserId: ownerId,
    designerName: ownerId === adminId ? 'Playwright Admin' : 'Playwright Designer',
    designerRole: ownerId === adminId ? 'admin' : 'designer',
    status,
    workflow: { ...defaults.workflow, status },
    createdDate: '2026-08-01T00:00:00.000Z',
    lastModified: '2026-09-22T00:00:00.000Z',
    syncStatus,
    versionId: 'original',
    versionName: 'Original Version',
    isOriginalVersion: true,
    activeVersionId: 'original',
    versions: [],
  };
}

function setSession(role: 'admin' | 'designer' | 'master', actingAsOwner = false) {
  const designer = role === 'designer';
  localStorage.setItem(sessionKey, JSON.stringify({
    userId: designer ? designerId : adminId,
    userEmail: designer ? 'designer@playwright.invalid' : 'admin@playwright.invalid',
    userName: designer ? 'Playwright Designer' : 'Playwright Admin',
    franchiseId: role === 'master' ? 'default' : franchiseId,
    role,
  }));
  if (actingAsOwner) {
    localStorage.setItem(impersonationKey, JSON.stringify({ franchiseId, actingRole: 'owner' }));
  } else {
    localStorage.removeItem(impersonationKey);
  }
}

function setLocal(value: any, cachedByAdmin = false) {
  disk = [structuredClone(value)];
  localStorage.setItem(ownerKey, JSON.stringify(cachedByAdmin ? {
    [proposalNumber]: { proposalNumber, userId: adminId, franchiseId, updatedAt: new Date().toISOString() },
  } : {}));
}

(window as any).proposalSyncFixture = {
  proposalNumber,
  cloudRow: (status: string = 'needs_approval') => {
    const value = proposal(designerId, status);
    return {
      proposal_number: proposalNumber,
      franchise_id: franchiseId,
      designer_auth_user_id: designerId,
      designer_name: 'Playwright Designer',
      designer_role: 'designer',
      status,
      proposal_json: value,
    };
  },
  adminLoadsForeignDraft: async () => {
    setSession('admin');
    setLocal({ ...proposal(designerId, 'draft', 'pending'), lastModified: '2026-09-23T00:00:00.000Z' }, true);
    const rows = await listProposals(franchiseId);
    return { numbers: rows.map((row) => row.proposalNumber), local: structuredClone(disk[0]) };
  },
  adminReviewsSubmitted: async () => {
    setSession('admin');
    setLocal(proposal(designerId, 'needs_approval'), true);
    return saveProposal(proposal(designerId, 'needs_approval') as any, { requireOnline: true });
  },
  adminDeniedReview: async () => {
    setSession('admin');
    setLocal(proposal(designerId, 'needs_approval'), true);
    let message = '';
    try {
      await saveProposal(proposal(designerId, 'needs_approval') as any);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    await syncPendingProposals();
    return { message, localStatus: disk[0]?.syncStatus, localMessage: disk[0]?.syncMessage };
  },
  ownerSavesDraft: async () => {
    setSession('admin');
    setLocal(proposal(adminId, 'draft'));
    return saveProposal(proposal(adminId, 'draft') as any, { requireOnline: true });
  },
  designerSavesDraft: async () => {
    setSession('designer');
    setLocal(proposal(designerId, 'draft'));
    return saveProposal(proposal(designerId, 'draft') as any, { requireOnline: true });
  },
  designerSavesLegacyDraft: async () => {
    setSession('designer');
    const legacy = proposal(designerId, 'draft') as any;
    delete legacy.designerAuthUserId;
    setLocal(legacy);
    return saveProposal(legacy, { requireOnline: true });
  },
  designerSyncsOfflineDraft: async () => {
    setSession('designer');
    setLocal(proposal(designerId, 'draft'));
    const local = await saveProposal(proposal(designerId, 'draft') as any, { localOnly: true });
    await syncPendingProposals();
    return { before: local.syncStatus, after: disk[0]?.syncStatus, designerAuthUserId: disk[0]?.designerAuthUserId };
  },
  deniedOwnSave: async () => {
    setSession('designer');
    setLocal(proposal(designerId, 'draft'));
    let message = '';
    try {
      await saveProposal(proposal(designerId, 'draft') as any);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    await syncPendingProposals();
    const loaded = await getProposal(proposalNumber);
    return { message, localStatus: disk[0]?.syncStatus, loadedStatus: loaded?.syncStatus, localMessage: disk[0]?.syncMessage };
  },
  masterInspects: async () => {
    setSession('master', true);
    setLocal(proposal(designerId, 'needs_approval'), true);
    const rows = await listProposals(franchiseId);
    let saveError = '';
    try {
      await saveProposal(proposal(designerId, 'needs_approval') as any);
    } catch (error) {
      saveError = error instanceof Error ? error.message : String(error);
    }
    return { numbers: rows.map((row) => row.proposalNumber), saveError };
  },
};

document.querySelector('#fixture-status')!.textContent = 'Ready';
