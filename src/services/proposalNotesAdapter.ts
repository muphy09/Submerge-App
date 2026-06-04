import { isEnvFlagTrue } from './env';
import { logLedgerEventSafe } from './ledger';
import {
  normalizeProposalNoteOverrides,
  type ProposalNoteOverrides,
} from '../utils/proposalNotes';
import { getSupabaseClient } from './supabaseClient';
import { readSession } from './session';

export type FranchiseProposalNotesRecord = {
  franchiseId: string;
  notes: ProposalNoteOverrides;
  updatedAt?: string | null;
  updatedBy?: string | null;
  fetchedAt: number;
};

type SaveFranchiseProposalNotesPayload = {
  franchiseId: string;
  notes: ProposalNoteOverrides;
  updatedBy?: string | null;
};

const DEFAULT_FRANCHISE_ID = 'default';
const PROPOSAL_NOTES_TABLE = 'franchise_proposal_notes';
const STORAGE_PREFIX = 'submerge.proposalNotes';
const PROPOSAL_NOTES_UPDATED_EVENT = 'submerge-proposal-notes-updated';
const CACHE_TTL_MS = 5 * 60 * 1000;
const SUPABASE_REQUIRED = isEnvFlagTrue('VITE_SUPABASE_ONLY');

const memoryCache = new Map<string, FranchiseProposalNotesRecord | null>();
const pendingLoads = new Map<string, Promise<FranchiseProposalNotesRecord | null>>();

function storageKey(franchiseId: string) {
  return `${STORAGE_PREFIX}.${franchiseId || DEFAULT_FRANCHISE_ID}`;
}

function requireSupabase() {
  if (SUPABASE_REQUIRED) {
    throw new Error('Supabase is required but not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
}

function getUpdatedByValue(explicit?: string | null) {
  const normalizedExplicit = String(explicit || '').trim();
  if (normalizedExplicit) return normalizedExplicit;
  const session = readSession();
  return session?.userEmail || session?.userName || null;
}

function buildRecord(raw?: Partial<FranchiseProposalNotesRecord> | null): FranchiseProposalNotesRecord {
  return {
    franchiseId: String(raw?.franchiseId || DEFAULT_FRANCHISE_ID),
    notes: normalizeProposalNoteOverrides(raw?.notes),
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null,
    updatedBy: typeof raw?.updatedBy === 'string' ? raw.updatedBy : null,
    fetchedAt: typeof raw?.fetchedAt === 'number' ? raw.fetchedAt : 0,
  };
}

function persistCache(franchiseId: string, record: FranchiseProposalNotesRecord | null) {
  const targetFranchiseId = franchiseId || DEFAULT_FRANCHISE_ID;
  memoryCache.set(targetFranchiseId, record);
  if (typeof localStorage === 'undefined') return;

  try {
    const key = storageKey(targetFranchiseId);
    if (!record) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(record));
  } catch (error) {
    console.warn('Unable to persist proposal notes cache:', error);
  }
}

export function getCachedFranchiseProposalNotes(
  franchiseId: string
): FranchiseProposalNotesRecord | null | undefined {
  const targetFranchiseId = franchiseId || DEFAULT_FRANCHISE_ID;
  if (memoryCache.has(targetFranchiseId)) {
    return memoryCache.get(targetFranchiseId) ?? null;
  }
  if (typeof localStorage === 'undefined') return undefined;

  try {
    const raw = localStorage.getItem(storageKey(targetFranchiseId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<FranchiseProposalNotesRecord> | null;
    if (!parsed) return undefined;
    const record = buildRecord(parsed);
    memoryCache.set(targetFranchiseId, record);
    return record;
  } catch (error) {
    console.warn('Unable to read proposal notes cache:', error);
    return undefined;
  }
}

function isCacheFresh(record: FranchiseProposalNotesRecord | null | undefined) {
  if (!record) return false;
  return Date.now() - record.fetchedAt < CACHE_TTL_MS;
}

function emitProposalNotesUpdate(franchiseId: string, notes: ProposalNoteOverrides) {
  if (typeof window === 'undefined' || !window.dispatchEvent) return;
  window.dispatchEvent(
    new CustomEvent(PROPOSAL_NOTES_UPDATED_EVENT, {
      detail: {
        franchiseId: franchiseId || DEFAULT_FRANCHISE_ID,
        notes: normalizeProposalNoteOverrides(notes),
      },
    })
  );
}

export function subscribeToFranchiseProposalNotesUpdates(
  franchiseId: string,
  callback: (notes: ProposalNoteOverrides) => void
) {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {};
  const targetFranchiseId = franchiseId || DEFAULT_FRANCHISE_ID;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ franchiseId: string; notes: ProposalNoteOverrides }>).detail;
    if (!detail || detail.franchiseId !== targetFranchiseId) return;
    callback(normalizeProposalNoteOverrides(detail.notes));
  };
  window.addEventListener(PROPOSAL_NOTES_UPDATED_EVENT, handler as EventListener);
  return () => window.removeEventListener(PROPOSAL_NOTES_UPDATED_EVENT, handler as EventListener);
}

export async function loadFranchiseProposalNotes(
  franchiseId: string,
  options: { force?: boolean } = {}
): Promise<FranchiseProposalNotesRecord | null> {
  const targetFranchiseId = franchiseId || DEFAULT_FRANCHISE_ID;
  const cached = getCachedFranchiseProposalNotes(targetFranchiseId);
  if (!options.force && cached !== undefined && isCacheFresh(cached)) {
    return cached ?? null;
  }

  const pending = pendingLoads.get(targetFranchiseId);
  if (pending) return pending;

  const loadPromise = (async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      requireSupabase();
      return cached ?? null;
    }

    const { data, error } = await supabase
      .from(PROPOSAL_NOTES_TABLE)
      .select('franchise_id, notes_json, updated_at, updated_by')
      .eq('franchise_id', targetFranchiseId)
      .maybeSingle();

    if (error && (error as any).code !== 'PGRST116') {
      throw error;
    }

    const record: FranchiseProposalNotesRecord = {
      franchiseId: targetFranchiseId,
      notes: normalizeProposalNoteOverrides(data?.notes_json),
      updatedAt: data?.updated_at ?? null,
      updatedBy: data?.updated_by ?? null,
      fetchedAt: Date.now(),
    };

    persistCache(targetFranchiseId, record);
    emitProposalNotesUpdate(targetFranchiseId, record.notes);
    return record;
  })();

  pendingLoads.set(targetFranchiseId, loadPromise);
  try {
    return await loadPromise;
  } finally {
    pendingLoads.delete(targetFranchiseId);
  }
}

export async function saveFranchiseProposalNotes(
  payload: SaveFranchiseProposalNotesPayload
): Promise<FranchiseProposalNotesRecord> {
  if (!payload.franchiseId) {
    throw new Error('Franchise ID is required to save proposal notes.');
  }

  const targetFranchiseId = payload.franchiseId || DEFAULT_FRANCHISE_ID;
  const notes = normalizeProposalNoteOverrides(payload.notes);
  const nowIso = new Date().toISOString();
  const updatedBy = getUpdatedByValue(payload.updatedBy);
  const supabase = getSupabaseClient();

  if (!supabase) {
    requireSupabase();
  } else {
    const { error } = await supabase
      .from(PROPOSAL_NOTES_TABLE)
      .upsert(
        {
          franchise_id: targetFranchiseId,
          notes_json: notes,
          updated_at: nowIso,
          updated_by: updatedBy,
        },
        { onConflict: 'franchise_id', ignoreDuplicates: false }
      );
    if (error) throw error;
  }

  const record: FranchiseProposalNotesRecord = {
    franchiseId: targetFranchiseId,
    notes,
    updatedAt: nowIso,
    updatedBy,
    fetchedAt: Date.now(),
  };

  persistCache(targetFranchiseId, record);
  emitProposalNotesUpdate(targetFranchiseId, notes);

  await logLedgerEventSafe({
    franchiseId: targetFranchiseId,
    action: 'Proposal notes updated',
    targetType: 'proposal_notes',
    targetId: targetFranchiseId,
    details: {
      franchiseId: targetFranchiseId,
      overrideCount: Object.keys(notes).length,
    },
  });

  return record;
}
