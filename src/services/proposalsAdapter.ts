import { Proposal } from '../types/proposal-new';
import { getSupabaseClient, isSupabaseEnabled } from './supabaseClient';
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

function withFallback<T>(supabaseFn: () => Promise<T>, fallbackFn: () => Promise<T>) {
  const enabled = isSupabaseEnabled();
  if (enabled) return supabaseFn();
  if (SUPABASE_REQUIRED) {
    throw new Error('Supabase is required but not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return fallbackFn();
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

function coerceTimestamp(value?: string | null): number {
  const ts = value ? Date.parse(value) : NaN;
  return Number.isFinite(ts) ? ts : 0;
}

export async function listProposals(franchiseId?: string): Promise<Proposal[]> {
  const session = readSession();
  const targetFranchiseId = franchiseId || getSessionFranchiseId();

  const supabasePromise = (async () => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) return [] as Proposal[];
      const { data, error } = await supabase
        .from('franchise_proposals')
        .select('proposal_json')
        .eq('franchise_id', targetFranchiseId || DEFAULT_FRANCHISE_ID)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) =>
        ensureProposalMetadata((row?.proposal_json || {}) as Proposal, session)
      );
    } catch (error) {
      console.warn('Failed to list proposals from Supabase, will fall back to local only.', error);
      return [] as Proposal[];
    }
  })();

  const localPromise = (async () => {
    try {
      if (!window.electron?.getAllProposals) return [] as Proposal[];
      const rows = await window.electron.getAllProposals();
      return (rows || [])
        .filter(
          (proposal: Proposal) =>
            (proposal.franchiseId || DEFAULT_FRANCHISE_ID) === (targetFranchiseId || DEFAULT_FRANCHISE_ID)
        )
        .map((proposal: Proposal) => ensureProposalMetadata(proposal, session));
    } catch (error) {
      console.warn('Failed to list proposals from local store.', error);
      return [] as Proposal[];
    }
  })();

  const [supabaseRows, localRows] = await Promise.all([supabasePromise, localPromise]);

  // Merge by proposalNumber, prefer newest lastModified
  const merged = new Map<string, Proposal>();
  const upsert = (p: Proposal) => {
    if (!p?.proposalNumber) return;
    const existing = merged.get(p.proposalNumber);
    if (!existing) {
      merged.set(p.proposalNumber, p);
      return;
    }
    const a = coerceTimestamp(existing.lastModified || existing.createdDate);
    const b = coerceTimestamp(p.lastModified || p.createdDate);
    merged.set(p.proposalNumber, b > a ? p : existing);
  };

  supabaseRows.forEach(upsert);
  localRows.forEach(upsert);

  // Return newest first
  return Array.from(merged.values()).sort(
    (a, b) => coerceTimestamp(b.lastModified || b.createdDate) - coerceTimestamp(a.lastModified || a.createdDate)
  );
}

export async function getProposal(proposalNumber: string): Promise<Proposal | null> {
  const session = readSession();

  const supabasePromise = (async () => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('franchise_proposals')
        .select('proposal_json')
        .eq('proposal_number', proposalNumber)
        .maybeSingle();
      if (error) throw error;
      if (!data?.proposal_json) return null;
      return ensureProposalMetadata(data.proposal_json as Proposal, session);
    } catch (error) {
      console.warn('Failed to load proposal from Supabase, will try local.', error);
      return null;
    }
  })();

  const localPromise = (async () => {
    try {
      if (!window.electron?.getProposal) return null;
      const proposal = await window.electron.getProposal(proposalNumber);
      return proposal ? ensureProposalMetadata(proposal as Proposal, session) : null;
    } catch (error) {
      console.warn('Failed to load proposal from local store.', error);
      return null;
    }
  })();

  const [cloud, local] = await Promise.all([supabasePromise, localPromise]);

  if (cloud && local) {
    const cloudTs = coerceTimestamp(cloud.lastModified || cloud.createdDate);
    const localTs = coerceTimestamp(local.lastModified || local.createdDate);
    return localTs > cloudTs ? local : cloud;
  }
  return cloud || local;
}

export async function saveProposal(proposal: Proposal): Promise<SaveResult> {
  const now = new Date().toISOString();
  const session = readSession();
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

  const result = await withFallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase
      .from('franchise_proposals')
      .upsert(
        {
          proposal_number: normalized.proposalNumber,
          franchise_id: franchiseId,
          designer_name: normalized.designerName,
          designer_role: normalized.designerRole,
          designer_code: normalized.designerCode,
          status: normalized.status,
          pricing_model_id: normalized.pricingModelId || null,
          pricing_model_name: normalized.pricingModelName || null,
          last_modified: normalized.lastModified || now,
          created_date: normalized.createdDate || now,
          updated_at: normalized.lastModified || now,
          proposal_json: normalized,
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
    return normalized;
  }, async () => {
    if (!window.electron?.saveProposal) {
      throw new Error('No save handler available (electron bridge missing).');
    }
    await window.electron.saveProposal(normalized);
    return normalized;
  });

  // Best-effort local persistence for offline reads
  if (window.electron?.saveProposal) {
    try {
      await window.electron.saveProposal(result);
    } catch (error) {
      console.warn('Failed to persist proposal to local database after Supabase save:', error);
    }
  }

  return { ...result, lastModified: normalized.lastModified || now };
}

export async function deleteProposal(proposalNumber: string, franchiseId?: string) {
  const targetFranchiseId = franchiseId || getSessionFranchiseId();
  await withFallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase
      .from('franchise_proposals')
      .delete()
      .eq('proposal_number', proposalNumber)
      .eq('franchise_id', targetFranchiseId || DEFAULT_FRANCHISE_ID);
    if (error) throw error;
  }, async () => {
    if (!window.electron?.deleteProposal) {
      throw new Error('No delete handler available (electron bridge missing).');
    }
    await window.electron.deleteProposal(proposalNumber);
  });

  if (window.electron?.deleteProposal) {
    try {
      await window.electron.deleteProposal(proposalNumber);
    } catch (error) {
      console.warn('Failed to delete proposal from local database after Supabase delete:', error);
    }
  }
}
