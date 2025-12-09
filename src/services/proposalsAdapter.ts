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

const SUPABASE_REQUIRED = isEnvFlagTrue('VITE_SUPABASE_ONLY');

type SaveResult = Proposal & { lastModified: string };
type SyncStatus = 'synced' | 'pending' | 'error';
type Tombstone = { proposalNumber: string; removedAt: string };
type SaveOptions = {
  /**
   * Force a local-only save (used when the user explicitly agrees to offline mode).
   */
  forceLocal?: boolean;
  /**
   * Allow falling back to local when Supabase is unreachable.
   */
  allowLocalFallback?: boolean;
};

const PENDING_MESSAGE = 'Awaiting cloud sync';
const ONLINE_SYNC_MESSAGE = 'Synced with cloud';
const PENDING_DELETE_STORAGE_KEY = 'submerge.pendingProposalDeletes';
const DELETED_TOMBSTONES_STORAGE_KEY = 'submerge.deletedProposalTombstones';

type PendingDelete = { proposalNumber: string; franchiseId?: string | null };

function nowIso() {
  return new Date().toISOString();
}

function coerceTimestamp(value?: string | null): number {
  const ts = value ? Date.parse(value) : NaN;
  return Number.isFinite(ts) ? ts : 0;
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

function addPendingDelete(proposalNumber: string, franchiseId?: string | null) {
  const current = loadPendingDeletes().filter((r) => !!r?.proposalNumber);
  const filtered = current.filter((r) => r.proposalNumber !== proposalNumber);
  filtered.push({ proposalNumber, franchiseId: franchiseId || DEFAULT_FRANCHISE_ID });
  persistPendingDeletes(filtered);
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

function ensureProposalMetadata(proposal: Proposal, session?: UserSession | null): Proposal {
  const currentSession = session ?? readSession();
  const franchiseId = proposal.franchiseId || currentSession?.franchiseId || DEFAULT_FRANCHISE_ID;
  const designerName = (proposal as any).designerName || currentSession?.userName || 'Designer';
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

function withSyncStatus(proposal: Proposal, status: SyncStatus, message?: string): Proposal {
  return {
    ...proposal,
    syncStatus: status,
    syncMessage: message,
  };
}

function isConnectivityError(error: any) {
  if (!error) return false;
  const message = (error.message || '').toString().toLowerCase();
  return (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('abort')
  );
}

async function persistLocalProposal(proposal: Proposal) {
  if (!window.electron?.saveProposal) return;
  try {
    await window.electron.saveProposal(proposal);
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
      .filter((proposal: Proposal) =>
        includeAllFranchises
          ? true
          : (proposal.franchiseId || DEFAULT_FRANCHISE_ID) === (franchiseId || DEFAULT_FRANCHISE_ID)
      )
      .map((proposal: Proposal) => ensureProposalMetadata(proposal, session));
  } catch (error) {
    console.warn('Failed to list proposals from local store.', error);
    return [] as Proposal[];
  }
}

async function loadLocalProposal(proposalNumber: string, session?: UserSession | null): Promise<Proposal | null> {
  try {
    if (!window.electron?.getProposal) return null;
    const proposal = await window.electron.getProposal(proposalNumber);
    return proposal ? ensureProposalMetadata(proposal as Proposal, session) : null;
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
    .select('proposal_json')
    .eq('franchise_id', franchiseId || DEFAULT_FRANCHISE_ID)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => withSyncStatus(
    ensureProposalMetadata((row?.proposal_json || {}) as Proposal, session),
    'synced',
    ONLINE_SYNC_MESSAGE
  ));
}

async function fetchSupabaseProposal(proposalNumber: string, session: UserSession | null): Promise<Proposal | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('franchise_proposals')
    .select('proposal_json')
    .eq('proposal_number', proposalNumber)
    .maybeSingle();
  if (error) throw error;
  if (!data?.proposal_json) return null;
  return withSyncStatus(
    ensureProposalMetadata(data.proposal_json as Proposal, session),
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

  const normalized = ensureProposalMetadata(proposal);
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
        status: normalized.status,
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
  franchiseId?: string
) {
  for (const local of locals) {
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
  const session = readSession();
  const targetFranchiseId = franchiseId || getSessionFranchiseId();
  const supabaseOnline = await hasSupabaseConnection();
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
    await syncLocalCollectionToSupabase(localRows, supabaseMap, targetFranchiseId);
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

export async function getProposal(proposalNumber: string): Promise<Proposal | null> {
  if (isPendingDelete(proposalNumber) || isDeletedTombstone(proposalNumber)) return null;

  const session = readSession();
  const supabaseOnline = await hasSupabaseConnection();
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

  if (supabaseOnline && local && shouldSyncLocal(local, cloud)) {
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

  const best = pickNewest(cloud, local);
  if (!best) return null;

  if (!supabaseOnline) {
    const status = (best as any).syncStatus || 'pending';
    const message = (best as any).syncMessage || (status === 'synced' ? ONLINE_SYNC_MESSAGE : PENDING_MESSAGE);
    return withSyncStatus(best, status as SyncStatus, message);
  }

  return withSyncStatus(best, 'synced', ONLINE_SYNC_MESSAGE);
}

export async function saveProposal(proposal: Proposal, options: SaveOptions = {}): Promise<SaveResult> {
  const now = nowIso();
  const session = readSession();
  clearDeletedTombstone(proposal.proposalNumber);
  const normalized = ensureProposalMetadata(
    {
      ...proposal,
      franchiseId: proposal.franchiseId || getSessionFranchiseId(),
      designerName: (proposal as any).designerName || getSessionUserName(),
      designerRole: (proposal as any).designerRole || getSessionRole(),
      designerCode: (proposal as any).designerCode || getSessionFranchiseCode(),
      lastModified: proposal.lastModified || now,
    } as Proposal,
    session
  );
  const franchiseId = normalized.franchiseId || DEFAULT_FRANCHISE_ID;
  const supabaseOnline = options.forceLocal ? false : await hasSupabaseConnection();

  if (SUPABASE_REQUIRED && !supabaseOnline && !isSupabaseEnabled()) {
    throw new Error('Supabase is required but not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  if (supabaseOnline && !options.forceLocal) {
    try {
      const synced = await upsertToSupabase(normalized);
      await persistLocalProposal(synced);
      return { ...synced, lastModified: synced.lastModified || now };
    } catch (error) {
      if (!isConnectivityError(error)) {
        throw error;
      }
      console.warn('Supabase save failed due to connectivity; will fall back to local.', error);
    }
  }

  if (options.allowLocalFallback === false) {
    throw new Error('Supabase unavailable and local fallback disabled.');
  }

  if (!window.electron?.saveProposal) {
    throw new Error('No save handler available (electron bridge missing).');
  }

  const pending = withSyncStatus(
    {
      ...normalized,
      franchiseId,
      lastModified: normalized.lastModified || now,
    },
    'pending',
    PENDING_MESSAGE
  );
  await window.electron.saveProposal(pending);
  return { ...pending, lastModified: pending.lastModified || now };
}

export async function deleteProposal(proposalNumber: string, franchiseId?: string) {
  const targetFranchiseId = franchiseId || getSessionFranchiseId();
  const supabaseOnline = await hasSupabaseConnection();
  const supabaseEnabled = isSupabaseEnabled();
  let connectivityFailure = false;
  let supabaseDeleted = false;
  let tombstoneAdded = false;

  if (supabaseOnline) {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase not configured');
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
        if ((fallback.data || []).length) {
          supabaseDeleted = true;
          clearPendingDelete(proposalNumber);
        }
      } else {
        supabaseDeleted = true;
        clearPendingDelete(proposalNumber);
      }
      addDeletedTombstone(proposalNumber);
      tombstoneAdded = true;
    } catch (error) {
      connectivityFailure = isConnectivityError(error);
      if (!connectivityFailure) {
        clearDeletedTombstone(proposalNumber);
        throw error;
      }
      console.warn('Supabase delete failed due to connectivity; will remove local copy only.', error);
    }
  }

  if (!supabaseOnline || connectivityFailure || !supabaseEnabled || !supabaseDeleted) {
    if (supabaseEnabled) {
      addPendingDelete(proposalNumber, targetFranchiseId);
    }
    if (!window.electron?.deleteProposal) {
      if (!tombstoneAdded) clearDeletedTombstone(proposalNumber);
      throw new Error('No delete handler available (electron bridge missing).');
    }
    await window.electron.deleteProposal(proposalNumber);
    if (!tombstoneAdded) {
      addDeletedTombstone(proposalNumber);
      tombstoneAdded = true;
    }
    return;
  }

  clearPendingDelete(proposalNumber);
  if (window.electron?.deleteProposal) {
    try {
      await window.electron.deleteProposal(proposalNumber);
    } catch (error) {
      addPendingDelete(proposalNumber, targetFranchiseId);
      if (!tombstoneAdded) clearDeletedTombstone(proposalNumber);
      throw new Error('Failed to delete proposal from local database after Supabase delete.');
    }
  }

  if (!tombstoneAdded) {
    addDeletedTombstone(proposalNumber);
  }
}
