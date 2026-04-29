import { Proposal } from '../types/proposal-new';
import { getSupabaseClient, hasSupabaseConnection, isSupabaseEnabled } from './supabaseClient';
import {
  DEFAULT_FRANCHISE_ID,
  UserSession,
  getSessionFranchiseCode,
  getSessionFranchiseId,
  getSessionRole,
  getSessionUserName,
  readSession,
} from './session';
import { isEnvFlagTrue } from './env';
import { applyActiveVersion } from '../utils/proposalVersions';
import { sanitizeEditableProposalVersions } from '../utils/proposalSelectionSanitizer';
import { removeHardcodedPapDiscountsFromProposal } from '../utils/papDiscounts';
import { logLedgerEventSafe } from './ledger';
import { upgradeProposalContractTemplateRevision } from './contractTemplateUpgrade';
import { countUnreadWorkflowEvents, ensureProposalWorkflow, getWorkflowStatus } from './proposalWorkflow';

const SUPABASE_REQUIRED = isEnvFlagTrue('VITE_SUPABASE_ONLY');
const OFFLINE_ERROR_MESSAGE = 'No internet connection. Please reconnect to continue.';

type SaveResult = Proposal & { lastModified: string };
type SyncStatus = 'synced' | 'pending' | 'error';
type SaveProposalOptions = {
  ledgerAction?: 'proposal_submitted';
  requireOnline?: boolean;
};
type Tombstone = { proposalNumber: string; removedAt: string };
type StoredProposalRow = {
  proposal_json?: Proposal;
  franchise_id?: string | null;
  designer_name?: string | null;
  designer_role?: UserSession['role'] | null;
  designer_code?: string | null;
  status?: string | null;
};
type WorkflowUnreadProjectionRow = {
  proposal_number?: string | null;
  status?: string | null;
  workflow?: Proposal['workflow'] | null;
  versions?: Proposal['versions'] | null;
  version_id?: string | null;
  proposal_status?: string | null;
};

const PENDING_MESSAGE = 'Awaiting cloud sync';
const ONLINE_SYNC_MESSAGE = 'Synced with cloud';
const PENDING_DELETE_STORAGE_KEY = 'submerge.pendingProposalDeletes';
const DELETED_TOMBSTONES_STORAGE_KEY = 'submerge.deletedProposalTombstones';
const LOCAL_PROPOSAL_OWNERS_STORAGE_KEY = 'submerge.localProposalOwners.v1';

type PendingDelete = { proposalNumber: string; franchiseId?: string | null };
type LocalProposalOwner = {
  proposalNumber: string;
  userId?: string | null;
  userEmail?: string | null;
  franchiseId?: string | null;
  updatedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function coerceTimestamp(value?: string | null): number {
  const ts = value ? Date.parse(value) : NaN;
  return Number.isFinite(ts) ? ts : 0;
}

function normalizeIdentity(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUserKey(session?: UserSession | null) {
  return normalizeIdentity(session?.userId || session?.userEmail);
}

function getCurrentUserIdentity(session?: UserSession | null) {
  const currentSession = session ?? readSession();
  return normalizeIdentity(currentSession?.userName || currentSession?.userEmail);
}

function getEffectiveRole(session?: UserSession | null) {
  const role = getSessionRole((session?.role || 'designer') as any);
  return String(role || session?.role || 'designer').trim().toLowerCase();
}

function isOwnProposal(proposal: Proposal, session?: UserSession | null) {
  const proposalDesigner = normalizeIdentity((proposal as any).designerName);
  const currentUserName = getCurrentUserIdentity(session);
  return Boolean(proposalDesigner && currentUserName && proposalDesigner === currentUserName);
}

function isSubmittedStatus(status?: string | null) {
  const normalized = normalizeIdentity(status);
  return (
    normalized === 'submitted' ||
    normalized === 'approved' ||
    normalized === 'signed' ||
    normalized === 'needs_approval' ||
    normalized === 'changes_requested'
  );
}

function canAttemptProposalWrite(proposal: Proposal, session?: UserSession | null, franchiseId?: string) {
  const role = getEffectiveRole(session);
  const targetFranchiseId = proposal.franchiseId || franchiseId || session?.franchiseId || DEFAULT_FRANCHISE_ID;
  const activeFranchiseId = getSessionFranchiseId();

  if (role !== 'master' && targetFranchiseId !== activeFranchiseId) {
    return false;
  }

  if (role === 'master' || role === 'owner' || role === 'admin') {
    return true;
  }

  if (!normalizeIdentity((proposal as any).designerName)) {
    return true;
  }

  const currentUserName = getCurrentUserIdentity(session) || normalizeIdentity(getSessionUserName());
  return !currentUserName || isOwnProposal(proposal, session);
}

function canReadProposal(proposal: Proposal, session?: UserSession | null) {
  const role = getEffectiveRole(session);
  if (role === 'master') return true;
  if (isOwnProposal(proposal, session)) return true;
  if (role === 'owner' || role === 'admin') {
    return isSubmittedStatus(getWorkflowStatus(proposal)) || getWorkflowStatus(proposal) === 'completed';
  }
  if (role === 'bookkeeper') {
    const status = getWorkflowStatus(proposal);
    return (
      status === 'submitted' ||
      status === 'approved' ||
      status === 'signed' ||
      status === 'needs_approval' ||
      status === 'changes_requested' ||
      status === 'completed'
    );
  }
  return false;
}

let localProposalOwnerCache: Record<string, LocalProposalOwner> | null = null;

function loadLocalProposalOwners(): Record<string, LocalProposalOwner> {
  if (localProposalOwnerCache) return localProposalOwnerCache;
  if (typeof localStorage === 'undefined') {
    localProposalOwnerCache = {};
    return localProposalOwnerCache;
  }
  try {
    const raw = localStorage.getItem(LOCAL_PROPOSAL_OWNERS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, LocalProposalOwner>) : {};
    localProposalOwnerCache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Unable to read local proposal owners from localStorage:', error);
    localProposalOwnerCache = {};
  }
  return localProposalOwnerCache;
}

function persistLocalProposalOwners(records: Record<string, LocalProposalOwner>) {
  localProposalOwnerCache = records;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_PROPOSAL_OWNERS_STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.warn('Unable to persist local proposal owners to localStorage:', error);
  }
}

function getLocalProposalOwner(proposalNumber?: string | null) {
  if (!proposalNumber) return null;
  return loadLocalProposalOwners()[proposalNumber] || null;
}

function setLocalProposalOwner(proposalNumber: string, session?: UserSession | null, franchiseId?: string | null) {
  if (!proposalNumber) return;
  const currentSession = session ?? readSession();
  const userId = normalizeIdentity(currentSession?.userId);
  const userEmail = normalizeIdentity(currentSession?.userEmail);
  if (!userId && !userEmail) return;

  const records = { ...loadLocalProposalOwners() };
  records[proposalNumber] = {
    proposalNumber,
    userId: userId || undefined,
    userEmail: userEmail || undefined,
    franchiseId: franchiseId || currentSession?.franchiseId || undefined,
    updatedAt: nowIso(),
  };
  persistLocalProposalOwners(records);
}

function clearLocalProposalOwner(proposalNumber: string) {
  const records = loadLocalProposalOwners();
  if (!records[proposalNumber]) return;
  const next = { ...records };
  delete next[proposalNumber];
  persistLocalProposalOwners(next);
}

function isLocalProposalVisibleToSession(proposal: Proposal, session?: UserSession | null) {
  const currentSession = session ?? readSession();
  if (!currentSession) return false;

  const owner = getLocalProposalOwner(proposal.proposalNumber);
  const sessionUserKey = normalizeUserKey(currentSession);
  const ownerUserKey = normalizeIdentity(owner?.userId || owner?.userEmail);
  if (sessionUserKey && ownerUserKey) {
    return sessionUserKey === ownerUserKey;
  }

  // Backward compatibility for proposals cached before owner tracking existed.
  return isOwnProposal(proposal, currentSession);
}

let pendingDeleteCache: PendingDelete[] | null = null;

function loadPendingDeletes(): PendingDelete[] {
  if (pendingDeleteCache) return pendingDeleteCache;
  if (typeof localStorage === 'undefined') {
    pendingDeleteCache = [];
    return pendingDeleteCache;
  }
  try {
    const raw = localStorage.getItem(PENDING_DELETE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as PendingDelete[]) : [];
    pendingDeleteCache = Array.isArray(parsed) ? parsed.filter((r) => !!r?.proposalNumber) : [];
  } catch (error) {
    console.warn('Unable to read pending deletes from localStorage:', error);
    pendingDeleteCache = [];
  }
  return pendingDeleteCache;
}

function persistPendingDeletes(records: PendingDelete[]) {
  pendingDeleteCache = records;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PENDING_DELETE_STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.warn('Unable to persist pending deletes to localStorage:', error);
  }
}

function clearPendingDelete(proposalNumber: string) {
  const current = loadPendingDeletes();
  const filtered = current.filter((r) => r.proposalNumber !== proposalNumber);
  if (filtered.length !== current.length) {
    persistPendingDeletes(filtered);
  }
}

function isPendingDelete(proposalNumber: string) {
  return loadPendingDeletes().some((r) => r.proposalNumber === proposalNumber);
}

function getPendingDeleteSet(): Set<string> {
  return new Set(loadPendingDeletes().map((r) => r.proposalNumber));
}

let tombstoneCache: Tombstone[] | null = null;

function loadDeletedTombstones(): Tombstone[] {
  if (tombstoneCache) return tombstoneCache;
  if (typeof localStorage === 'undefined') {
    tombstoneCache = [];
    return tombstoneCache;
  }
  try {
    const raw = localStorage.getItem(DELETED_TOMBSTONES_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Tombstone[]) : [];
    tombstoneCache = Array.isArray(parsed) ? parsed.filter((r) => !!r?.proposalNumber) : [];
  } catch (error) {
    console.warn('Unable to read delete tombstones from localStorage:', error);
    tombstoneCache = [];
  }
  return tombstoneCache;
}

function persistDeletedTombstones(records: Tombstone[]) {
  tombstoneCache = records;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DELETED_TOMBSTONES_STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.warn('Unable to persist delete tombstones to localStorage:', error);
  }
}

function addDeletedTombstone(proposalNumber: string) {
  const now = nowIso();
  const current = loadDeletedTombstones().filter((r) => !!r?.proposalNumber);
  const filtered = current.filter((r) => r.proposalNumber !== proposalNumber);
  filtered.push({ proposalNumber, removedAt: now });
  persistDeletedTombstones(filtered);
}

function clearDeletedTombstone(proposalNumber: string) {
  const current = loadDeletedTombstones();
  const filtered = current.filter((r) => r.proposalNumber !== proposalNumber);
  if (filtered.length !== current.length) {
    persistDeletedTombstones(filtered);
  }
}

function getDeletedTombstoneSet(): Set<string> {
  return new Set(loadDeletedTombstones().map((r) => r.proposalNumber));
}

function isDeletedTombstone(proposalNumber: string) {
  return getDeletedTombstoneSet().has(proposalNumber);
}

function ensureProposalReadMetadata(
  proposal: Proposal,
  session?: UserSession | null,
  stored?: StoredProposalRow
): Proposal {
  const currentSession = session ?? readSession();
  const franchiseId = proposal.franchiseId || stored?.franchise_id || currentSession?.franchiseId || DEFAULT_FRANCHISE_ID;
  const status = getWorkflowStatus(proposal) || (stored?.status as any) || 'draft';
  const designerName = (proposal as any).designerName || stored?.designer_name || undefined;
  const designerRole = (proposal as any).designerRole || stored?.designer_role || undefined;
  const designerCode = (proposal as any).designerCode || stored?.designer_code || undefined;

  return {
    ...proposal,
    franchiseId,
    status,
    ...(designerName ? { designerName } : {}),
    ...(designerRole ? { designerRole } : {}),
    ...(designerCode ? { designerCode } : {}),
  };
}

function ensureProposalWriteMetadata(proposal: Proposal, session?: UserSession | null): Proposal {
  const currentSession = session ?? readSession();
  const franchiseId = proposal.franchiseId || currentSession?.franchiseId || DEFAULT_FRANCHISE_ID;
  const designerName = (proposal as any).designerName || currentSession?.userName || currentSession?.userEmail || 'Designer';
  const designerRole = (proposal as any).designerRole || currentSession?.role || 'designer';
  const designerCode = (proposal as any).designerCode || currentSession?.franchiseCode;

  return {
    ...proposal,
    franchiseId,
    designerName,
    designerRole,
    designerCode,
  };
}

function normalizeForConsumption(proposal: Proposal, session?: UserSession | null, stored?: StoredProposalRow): Proposal {
  const withMeta = removeHardcodedPapDiscountsFromProposal(
    upgradeProposalContractTemplateRevision(ensureProposalReadMetadata(proposal, session, stored))
  );
  const active = ensureProposalWorkflow(applyActiveVersion(withMeta));
  const normalizedActive = ensureProposalWorkflow(
    upgradeProposalContractTemplateRevision(ensureProposalReadMetadata(active, session, stored))
  );
  const normalizedVersions = (normalizedActive.versions || []).map((v) =>
    ensureProposalWorkflow(upgradeProposalContractTemplateRevision(ensureProposalReadMetadata(v, session, stored)))
  );
  return {
    ...normalizedActive,
    versions: normalizedVersions,
  };
}

function withSyncStatus(proposal: Proposal, status: SyncStatus, message?: string): Proposal {
  return {
    ...proposal,
    syncStatus: status,
    syncMessage: message,
  };
}

async function persistLocalProposal(proposal: Proposal) {
  if (!window.electron?.saveProposal) return;
  try {
    const upgradedProposal = removeHardcodedPapDiscountsFromProposal(
      upgradeProposalContractTemplateRevision(proposal)
    );
    setLocalProposalOwner(upgradedProposal.proposalNumber, readSession(), upgradedProposal.franchiseId);
    await window.electron.saveProposal(upgradedProposal);
  } catch (error) {
    console.warn('Failed to persist proposal locally:', error);
  }
}

async function loadLocalProposals(
  franchiseId?: string,
  session?: UserSession | null,
  includeAllFranchises = false
): Promise<Proposal[]> {
  try {
    if (!window.electron?.getAllProposals) return [] as Proposal[];
    const rows = await window.electron.getAllProposals();
    return (rows || [])
      .map((proposal: Proposal) => normalizeForConsumption(proposal, session))
      .filter((proposal: Proposal) => isLocalProposalVisibleToSession(proposal, session))
      .filter((proposal: Proposal) =>
        includeAllFranchises
          ? true
          : (proposal.franchiseId || DEFAULT_FRANCHISE_ID) === (franchiseId || DEFAULT_FRANCHISE_ID)
      );
  } catch (error) {
    console.warn('Failed to list proposals from local store.', error);
    return [] as Proposal[];
  }
}

async function loadLocalProposal(proposalNumber: string, session?: UserSession | null): Promise<Proposal | null> {
  try {
    if (!window.electron?.getProposal) return null;
    const proposal = await window.electron.getProposal(proposalNumber);
    if (!proposal) return null;
    const normalized = normalizeForConsumption(proposal as Proposal, session);
    return isLocalProposalVisibleToSession(normalized, session) ? normalized : null;
  } catch (error) {
    console.warn('Failed to load proposal from local store.', error);
    return null;
  }
}

async function fetchSupabaseProposals(franchiseId: string, session: UserSession | null): Promise<Proposal[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('franchise_proposals')
    .select('proposal_json, franchise_id, designer_name, designer_role, designer_code, status')
    .eq('franchise_id', franchiseId || DEFAULT_FRANCHISE_ID)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: StoredProposalRow) => withSyncStatus(
    normalizeForConsumption((row?.proposal_json || {}) as Proposal, session, row),
    'synced',
    ONLINE_SYNC_MESSAGE
  ));
}

async function fetchSupabaseProposal(proposalNumber: string, session: UserSession | null): Promise<Proposal | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('franchise_proposals')
    .select('proposal_json, franchise_id, designer_name, designer_role, designer_code, status')
    .eq('proposal_number', proposalNumber)
    .maybeSingle();
  if (error) throw error;
  if (!(data as StoredProposalRow | null)?.proposal_json) return null;
  return withSyncStatus(
    normalizeForConsumption((data as StoredProposalRow).proposal_json as Proposal, session, data as StoredProposalRow),
    'synced',
    ONLINE_SYNC_MESSAGE
  );
}

function pickNewest(a?: Proposal | null, b?: Proposal | null): Proposal | null {
  if (a && !b) return a;
  if (b && !a) return b;
  if (!a || !b) return null;
  const aTs = coerceTimestamp(a.lastModified || a.createdDate);
  const bTs = coerceTimestamp(b.lastModified || b.createdDate);
  return bTs > aTs ? b : a;
}

function shouldSyncLocal(local: Proposal, remote?: Proposal | null) {
  if (!remote) return true;
  const remoteTs = coerceTimestamp(remote.lastModified || remote.createdDate);
  const localTs = coerceTimestamp(local.lastModified || local.createdDate);
  return localTs > remoteTs || (local.syncStatus === 'pending' && localTs >= remoteTs);
}

async function upsertToSupabase(proposal: Proposal): Promise<Proposal> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');

  const normalized = removeHardcodedPapDiscountsFromProposal(
    ensureProposalWorkflow(
      upgradeProposalContractTemplateRevision(ensureProposalWriteMetadata(applyActiveVersion(proposal)))
    )
  );
  const now = nowIso();

  const { error } = await supabase
    .from('franchise_proposals')
    .upsert(
      {
        proposal_number: normalized.proposalNumber,
        franchise_id: normalized.franchiseId || DEFAULT_FRANCHISE_ID,
        designer_name: normalized.designerName,
        designer_role: normalized.designerRole,
        designer_code: normalized.designerCode,
        status: getWorkflowStatus(normalized),
        pricing_model_id: normalized.pricingModelId || null,
        pricing_model_name: normalized.pricingModelName || null,
        last_modified: normalized.lastModified || now,
        created_date: normalized.createdDate || now,
        updated_at: normalized.lastModified || now,
        proposal_json: {
          ...normalized,
          syncStatus: 'synced',
          syncMessage: ONLINE_SYNC_MESSAGE,
        },
      },
      { onConflict: 'proposal_number', ignoreDuplicates: false }
    );

  if (error) {
    console.error('Supabase proposal upsert failed', {
      message: error.message,
      details: (error as any).details,
      hint: (error as any).hint,
      code: (error as any).code,
    });
    const wrapped = new Error(error.message || 'Supabase upsert failed');
    (wrapped as any).code = (error as any).code;
    (wrapped as any).details = (error as any).details;
    (wrapped as any).hint = (error as any).hint;
    throw wrapped;
  }

  return withSyncStatus(
    { ...normalized, lastModified: normalized.lastModified || now },
    'synced',
    ONLINE_SYNC_MESSAGE
  );
}

async function syncLocalCollectionToSupabase(
  locals: Proposal[],
  supabaseMap: Map<string, Proposal>,
  franchiseId?: string,
  session?: UserSession | null
) {
  for (const local of locals) {
    if (!canAttemptProposalWrite(local, session, franchiseId)) continue;
    const existing = supabaseMap.get(local.proposalNumber);
    if (!shouldSyncLocal(local, existing)) continue;
    try {
      const synced = await upsertToSupabase({
        ...local,
        franchiseId: local.franchiseId || franchiseId || DEFAULT_FRANCHISE_ID,
      });
      supabaseMap.set(local.proposalNumber, synced);
      await persistLocalProposal(synced);
    } catch (error) {
      console.warn('Failed to sync local proposal to Supabase', local.proposalNumber, error);
      const pending = withSyncStatus(
        { ...local, franchiseId: local.franchiseId || franchiseId || DEFAULT_FRANCHISE_ID },
        'pending',
        PENDING_MESSAGE
      );
      await persistLocalProposal(pending);
    }
  }
}

let syncingPending = false;

export async function syncPendingProposals() {
  if (syncingPending) return;
  syncingPending = true;
  try {
    const supabaseOnline = await hasSupabaseConnection(true);
    if (!supabaseOnline) return;
    const session = readSession();
    const locals = await loadLocalProposals(undefined, session, true);
    const pending = (locals || []).filter((p) => p.syncStatus === 'pending');
    if (!pending.length) return;
    for (const proposal of pending) {
      if (!canAttemptProposalWrite(proposal, session)) continue;
      try {
        const remote = await fetchSupabaseProposal(proposal.proposalNumber, session);
        const remoteTs = coerceTimestamp(remote?.lastModified || remote?.createdDate);
        const localTs = coerceTimestamp(proposal.lastModified || proposal.createdDate);
        if (remote && remoteTs >= localTs) {
          await persistLocalProposal(withSyncStatus(remote, 'synced', ONLINE_SYNC_MESSAGE));
          continue;
        }
        const synced = await upsertToSupabase(proposal);
        await persistLocalProposal(synced);
      } catch (error) {
        console.warn('Still unable to sync pending proposal', proposal.proposalNumber, error);
      }
    }
  } finally {
    syncingPending = false;
  }
}

let syncingPendingDeletes = false;

export async function syncPendingDeletes() {
  if (syncingPendingDeletes) return;
  if (!isSupabaseEnabled()) return;

  const supabaseOnline = await hasSupabaseConnection(true);
  if (!supabaseOnline) return;

  const pendingDeletes = loadPendingDeletes();
  if (!pendingDeletes.length) return;

  const supabase = getSupabaseClient();
  if (!supabase) return;

  const session = readSession();
  syncingPendingDeletes = true;
  try {
    for (const record of pendingDeletes) {
      try {
        addDeletedTombstone(record.proposalNumber);
        const franchiseId = record.franchiseId || session?.franchiseId || DEFAULT_FRANCHISE_ID;
        const { error, data } = await supabase
          .from('franchise_proposals')
          .delete()
          .eq('proposal_number', record.proposalNumber)
          .eq('franchise_id', franchiseId || DEFAULT_FRANCHISE_ID)
          .select('proposal_number');
        if (error) throw error;

        const deletedCount = (data || []).length;
        if (!deletedCount) {
          const fallback = await supabase
            .from('franchise_proposals')
            .delete()
            .eq('proposal_number', record.proposalNumber)
            .select('proposal_number');
          if (fallback.error) throw fallback.error;
          if ((fallback.data || []).length) {
            clearPendingDelete(record.proposalNumber);
          }
        } else {
          clearPendingDelete(record.proposalNumber);
        }
      } catch (error) {
        console.warn('Failed to sync pending proposal delete', record.proposalNumber, error);
      }
    }
  } finally {
    syncingPendingDeletes = false;
  }
}

function registerOnlineSyncListener() {
  if (typeof window === 'undefined') return;
  const anyWindow = window as any;
  if (anyWindow.__submergeSyncListenerRegistered) return;
  anyWindow.__submergeSyncListenerRegistered = true;
  window.addEventListener('online', () => {
    void syncPendingProposals();
    void syncPendingDeletes();
  });
}

registerOnlineSyncListener();

export async function listProposals(franchiseId?: string): Promise<Proposal[]> {
  if (SUPABASE_REQUIRED && !isSupabaseEnabled()) {
    throw new Error('Supabase is required but not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  const session = readSession();
  const targetFranchiseId = franchiseId || getSessionFranchiseId();
  const supabaseOnline = await hasSupabaseConnection(true);
  if (supabaseOnline) {
    await syncPendingDeletes();
  }
  const pendingDeletes = getPendingDeleteSet();
  const deletedTombstones = getDeletedTombstoneSet();
  const hiddenProposals = new Set<string>([...pendingDeletes, ...deletedTombstones]);

  const supabasePromise = (async () => {
    if (!supabaseOnline) return [] as Proposal[];
    try {
      const rows = await fetchSupabaseProposals(targetFranchiseId || DEFAULT_FRANCHISE_ID, session);
      return rows.filter((p) => !hiddenProposals.has(p.proposalNumber));
    } catch (error) {
      console.warn('Failed to list proposals from Supabase; using local copies.', error);
      return [] as Proposal[];
    }
  })();

  const localPromise = (async () => {
    const rows = await loadLocalProposals(targetFranchiseId, session);
    return rows.filter((p) => !hiddenProposals.has(p.proposalNumber));
  })();

  const [supabaseRows, localRows] = await Promise.all([supabasePromise, localPromise]);
  const supabaseMap = new Map<string, Proposal>();
  supabaseRows.forEach((p) => {
    if (p?.proposalNumber) supabaseMap.set(p.proposalNumber, p);
  });

  if (supabaseOnline && localRows.length) {
    await syncPendingProposals();
    await syncLocalCollectionToSupabase(localRows, supabaseMap, targetFranchiseId, session);
  }

  const merged = new Map<string, Proposal>();
  const upsert = (proposal: Proposal) => {
    if (!proposal?.proposalNumber) return;
    const existing = merged.get(proposal.proposalNumber);
    if (!existing) {
      merged.set(proposal.proposalNumber, proposal);
      return;
    }
    const chosen = pickNewest(existing, proposal) || existing;
    merged.set(proposal.proposalNumber, chosen);
  };

  supabaseMap.forEach((p) => upsert(withSyncStatus(p, 'synced', ONLINE_SYNC_MESSAGE)));
  localRows.forEach((local) => {
    const cloud = supabaseMap.get(local.proposalNumber);
    if (supabaseOnline && shouldSyncLocal(local, cloud || null)) {
      upsert(withSyncStatus(local, 'pending', PENDING_MESSAGE));
    } else if (!supabaseOnline) {
      const status = (local as any).syncStatus || 'pending';
      const message = (local as any).syncMessage || (status === 'synced' ? ONLINE_SYNC_MESSAGE : PENDING_MESSAGE);
      upsert(withSyncStatus(local, status, message));
    } else {
      upsert(local);
    }
  });

  return Array.from(merged.values()).sort(
    (a, b) => coerceTimestamp(b.lastModified || b.createdDate) - coerceTimestamp(a.lastModified || a.createdDate)
  );
}

export async function listDashboardProposals(franchiseId?: string): Promise<Proposal[]> {
  const session = readSession();
  if (!session) return [];
  const proposals = await listProposals(franchiseId);
  return proposals.filter((proposal) => isOwnProposal(proposal, session));
}

export async function getWorkflowUnreadCount(franchiseId: string, userId?: string | null): Promise<number> {
  const normalizedUserId = normalizeIdentity(userId);
  if (!normalizedUserId) return 0;

  const supabaseOnline = await hasSupabaseConnection();
  if (!supabaseOnline) return 0;

  const supabase = getSupabaseClient();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('franchise_proposals')
    .select(
      'proposal_number,status,workflow:proposal_json->workflow,versions:proposal_json->versions,version_id:proposal_json->versionId,proposal_status:proposal_json->status'
    )
    .eq('franchise_id', franchiseId || DEFAULT_FRANCHISE_ID);
  if (error) throw error;

  return (data || []).reduce((sum, row) => {
    const entry = row as WorkflowUnreadProjectionRow;
    const proposal = {
      proposalNumber: entry.proposal_number || '',
      status: entry.proposal_status || entry.status || 'draft',
      versionId: entry.version_id || 'original',
      workflow: entry.workflow || undefined,
      versions: Array.isArray(entry.versions) ? entry.versions : [],
    } as Proposal;
    if (!canReadProposal(proposal)) return sum;
    return sum + countUnreadWorkflowEvents(proposal, normalizedUserId);
  }, 0);
}

export async function getProposal(proposalNumber: string): Promise<Proposal | null> {
  if (SUPABASE_REQUIRED && !isSupabaseEnabled()) {
    throw new Error('Supabase is required but not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  if (isPendingDelete(proposalNumber) || isDeletedTombstone(proposalNumber)) return null;

  const session = readSession();
  const supabaseOnline = await hasSupabaseConnection(true);
  if (supabaseOnline) {
    await syncPendingDeletes();
    if (isPendingDelete(proposalNumber) || isDeletedTombstone(proposalNumber)) return null;
  }

  const supabasePromise = (async () => {
    if (!supabaseOnline) return null;
    try {
      return await fetchSupabaseProposal(proposalNumber, session);
    } catch (error) {
      console.warn('Failed to load proposal from Supabase, will try local.', error);
      return null;
    }
  })();

  const localPromise = loadLocalProposal(proposalNumber, session);

  const [cloud, local] = await Promise.all([supabasePromise, localPromise]);

  const best = pickNewest(cloud, local);
  if (!best) return null;
  if (!canReadProposal(best, session)) return null;

  if (supabaseOnline && local && canAttemptProposalWrite(local, session) && shouldSyncLocal(local, cloud)) {
    try {
      const synced = await upsertToSupabase(local);
      await persistLocalProposal(synced);
      return synced;
    } catch (error) {
      console.warn('Unable to sync newer local proposal to Supabase', proposalNumber, error);
    }
  }

  if (supabaseOnline && cloud && local && !shouldSyncLocal(local, cloud)) {
    await persistLocalProposal(cloud);
  }

  if (!supabaseOnline) {
    const status = (best as any).syncStatus || 'pending';
    const message = (best as any).syncMessage || (status === 'synced' ? ONLINE_SYNC_MESSAGE : PENDING_MESSAGE);
    return withSyncStatus(best, status as SyncStatus, message);
  }

  return withSyncStatus(best, 'synced', ONLINE_SYNC_MESSAGE);
}

export async function saveProposal(proposal: Proposal, options: SaveProposalOptions = {}): Promise<SaveResult> {
  const now = nowIso();
  const session = readSession();
  clearDeletedTombstone(proposal.proposalNumber);
  const normalized = ensureProposalWriteMetadata(
    ensureProposalWorkflow(applyActiveVersion({
      ...proposal,
      franchiseId: proposal.franchiseId || getSessionFranchiseId(),
      designerName: (proposal as any).designerName || getSessionUserName(),
      designerRole: (proposal as any).designerRole || getSessionRole(),
      designerCode: (proposal as any).designerCode || getSessionFranchiseCode(),
      lastModified: now,
    } as Proposal)),
    session
  );
  const normalizedWithVersions: Proposal = {
    ...normalized,
    versions: (normalized.versions || []).map((v) => ensureProposalWriteMetadata(v, session)),
  };
  const persistenceReady = removeHardcodedPapDiscountsFromProposal(
    upgradeProposalContractTemplateRevision(
      sanitizeEditableProposalVersions(normalizedWithVersions)
    )
  );
  const franchiseId = persistenceReady.franchiseId || DEFAULT_FRANCHISE_ID;

  if (SUPABASE_REQUIRED && !isSupabaseEnabled()) {
    throw new Error('Supabase is required but not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  const supabaseOnline = await hasSupabaseConnection(true);
  if (!supabaseOnline) {
    if (options.requireOnline) {
      throw new Error(OFFLINE_ERROR_MESSAGE);
    }
    const pending = withSyncStatus(
      { ...persistenceReady, franchiseId, lastModified: persistenceReady.lastModified || now },
      'pending',
      PENDING_MESSAGE
    );
    await persistLocalProposal(pending);
    return { ...pending, lastModified: pending.lastModified || now };
  }

  try {
    const synced = await upsertToSupabase(persistenceReady);
    await persistLocalProposal({ ...synced, franchiseId });
    if (options.ledgerAction === 'proposal_submitted') {
      await logLedgerEventSafe({
        franchiseId,
        action: 'Proposal submitted',
        targetType: 'proposal',
        targetId: synced.proposalNumber,
        details: {
          proposalNumber: synced.proposalNumber,
          customerName: synced.customerInfo?.customerName || null,
          designerName: synced.designerName || null,
          status: synced.status || 'submitted',
        },
      });
    }
    return { ...synced, lastModified: synced.lastModified || now };
  } catch (error) {
    if (options.requireOnline) {
      throw error;
    }
    const pending = withSyncStatus(
      { ...persistenceReady, franchiseId, lastModified: persistenceReady.lastModified || now },
      'pending',
      PENDING_MESSAGE
    );
    await persistLocalProposal(pending);
    return { ...pending, lastModified: pending.lastModified || now };
  }
}

export async function deleteProposal(proposalNumber: string, franchiseId?: string) {
  const targetFranchiseId = franchiseId || getSessionFranchiseId();
  if (SUPABASE_REQUIRED && !isSupabaseEnabled()) {
    throw new Error('Supabase is required but not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  const supabaseOnline = await hasSupabaseConnection(true);
  if (!supabaseOnline) {
    throw new Error(OFFLINE_ERROR_MESSAGE);
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  const existing = await supabase
    .from('franchise_proposals')
    .select('proposal_number,franchise_id,designer_name,status,proposal_json')
    .eq('proposal_number', proposalNumber)
    .eq('franchise_id', targetFranchiseId || DEFAULT_FRANCHISE_ID)
    .maybeSingle();
  if (existing.error && (existing.error as any).code !== 'PGRST116') {
    throw existing.error;
  }

  const { error, data } = await supabase
    .from('franchise_proposals')
    .delete()
    .eq('proposal_number', proposalNumber)
    .eq('franchise_id', targetFranchiseId || DEFAULT_FRANCHISE_ID)
    .select('proposal_number');
  if (error) throw error;

  const deletedCount = (data || []).length;
  if (!deletedCount) {
    const fallback = await supabase
      .from('franchise_proposals')
      .delete()
      .eq('proposal_number', proposalNumber)
      .select('proposal_number');
    if (fallback.error) throw fallback.error;
  }

  clearPendingDelete(proposalNumber);
  addDeletedTombstone(proposalNumber);
  clearLocalProposalOwner(proposalNumber);

  if (window.electron?.deleteProposal) {
    try {
      await window.electron.deleteProposal(proposalNumber);
    } catch (error) {
      throw new Error('Failed to delete proposal from local database after Supabase delete.');
    }
  }

  const existingProposal = (existing.data as any)?.proposal_json as Proposal | undefined;
  await logLedgerEventSafe({
    franchiseId: (existing.data as any)?.franchise_id || targetFranchiseId || DEFAULT_FRANCHISE_ID,
    action: 'Proposal deleted',
    targetType: 'proposal',
    targetId: proposalNumber,
    details: {
      proposalNumber,
      customerName: existingProposal?.customerInfo?.customerName || null,
      designerName: (existing.data as any)?.designer_name || existingProposal?.designerName || null,
      status: (existing.data as any)?.status || existingProposal?.status || null,
    },
  });
}
