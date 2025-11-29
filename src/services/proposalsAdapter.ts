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

const SUPABASE_REQUIRED =
  (import.meta.env.VITE_SUPABASE_ONLY || process.env.VITE_SUPABASE_ONLY || '')
    .toString()
    .toLowerCase() === 'true';

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

export async function listProposals(franchiseId?: string): Promise<Proposal[]> {
  const session = readSession();
  const targetFranchiseId = franchiseId || getSessionFranchiseId();

  return withFallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('franchise_proposals')
      .select('proposal_json')
      .eq('franchise_id', targetFranchiseId || DEFAULT_FRANCHISE_ID)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: any) =>
      ensureProposalMetadata((row?.proposal_json || {}) as Proposal, session)
    );
  }, async () => {
    if (!window.electron?.getAllProposals) return [];
    const rows = await window.electron.getAllProposals();
    return (rows || [])
      .filter(
        (proposal: Proposal) =>
          (proposal.franchiseId || DEFAULT_FRANCHISE_ID) === (targetFranchiseId || DEFAULT_FRANCHISE_ID)
      )
      .map((proposal: Proposal) => ensureProposalMetadata(proposal, session));
  });
}

export async function getProposal(proposalNumber: string): Promise<Proposal | null> {
  const session = readSession();
  return withFallback(async () => {
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
  }, async () => {
    if (!window.electron?.getProposal) return null;
    const proposal = await window.electron.getProposal(proposalNumber);
    return proposal ? ensureProposalMetadata(proposal as Proposal, session) : null;
  });
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
    const { error } = await supabase.from('franchise_proposals').upsert({
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
    });
    if (error) throw error;
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
