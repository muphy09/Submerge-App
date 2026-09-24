import type { Proposal } from '../types/proposal-new';
import { getSupabaseClient, hasSupabaseConnection } from './supabaseClient';
import { getSessionFranchiseId, isTestSession, readSession } from './session';

export type CollaborationPermission = 'view' | 'contribute';
export type CollaborationShare = {
  id: string;
  proposal_number: string;
  recipient_id: string;
  permission: CollaborationPermission;
  note: string | null;
  created_at: string;
  ended_at: string | null;
};
export type CollaborationRequest = {
  id: string;
  proposal_number: string;
  contributor_id: string;
  target_version_id: string;
  base_revision: number;
  base_version_json: Proposal;
  working_version_json: Proposal;
  status: 'working' | 'submitted' | 'revision_requested' | 'applied' | 'declined' | 'withdrawn' | 'stale' | 'superseded' | 'access_ended';
  contributor_note: string | null;
  owner_note: string | null;
  created_at: string;
  updated_at: string;
  submitted_at?: string | null;
  decided_at?: string | null;
  decided_by?: string | null;
  applied_revision: number | null;
  restored_at: string | null;
};
export type CollaborationEvent = {
  id: string;
  proposal_number: string;
  event_type: string;
  actor_id: string | null;
  request_id: string | null;
  note: string | null;
  created_at: string;
  read_at: string | null;
};
export type RecipientOption = { user_id: string; display_name: string; email: string };
export type OwnershipRecoveryCandidate = {
  proposal_number: string;
  customer_name: string | null;
  designer_name: string | null;
  owner_id: string | null;
  reason: string;
};
export type SharedProposal = { proposal: Proposal; share: CollaborationShare; ownerName: string; requestStatus?: string };

const cachePrefix = 'submerge.sharedProposalCache.v1.';
const cacheDatabase = 'submerge-shared-proposals-v1';
const mode = () => isTestSession();
const table = () => mode() ? 'franchise_test_proposals' : 'franchise_proposals';

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Cloud connection is required for proposal collaboration.');
  return supabase;
}

async function online() {
  if (!(await hasSupabaseConnection(true))) {
    throw new Error('Reconnect to manage or propose changes to a shared proposal.');
  }
}

function cacheKey(number: string) {
  const session = readSession();
  return `${cachePrefix}${mode() ? 'test' : 'live'}.${session?.userId || 'signed-out'}.${number}`;
}

function openCache(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(cacheDatabase, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('copies', { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function cacheGet(key: string): Promise<{ proposal: Proposal; share: CollaborationShare } | null> {
  const database = await openCache();
  if (!database) return null;
  return new Promise((resolve) => {
    const request = database.transaction('copies', 'readonly').objectStore('copies').get(key);
    request.onsuccess = () => { resolve(request.result?.value || null); database.close(); };
    request.onerror = () => { resolve(null); database.close(); };
  });
}

async function cacheAll(): Promise<Array<{ key: string; value: { proposal: Proposal; share: CollaborationShare } }>> {
  const database = await openCache();
  if (!database) return [];
  return new Promise((resolve) => {
    const request = database.transaction('copies', 'readonly').objectStore('copies').getAll();
    request.onsuccess = () => { resolve(request.result || []); database.close(); };
    request.onerror = () => { resolve([]); database.close(); };
  });
}

async function cacheDelete(key: string) {
  const database = await openCache();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const request = database.transaction('copies', 'readwrite').objectStore('copies').delete(key);
    request.onsuccess = () => { database.close(); resolve(); };
    request.onerror = () => { database.close(); resolve(); };
  });
}

export function clearSharedProposalCache() {
  if (typeof localStorage === 'undefined') return;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(cachePrefix)) localStorage.removeItem(key);
  }
  if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(cacheDatabase);
}

async function cacheSharedProposal(proposal: Proposal, share: CollaborationShare) {
  const database = await openCache();
  if (database) {
    await new Promise<void>((resolve) => {
      const request = database.transaction('copies', 'readwrite').objectStore('copies')
        .put({ key: cacheKey(proposal.proposalNumber), value: { proposal, share } });
      request.onsuccess = () => { database.close(); resolve(); };
      request.onerror = () => { database.close(); resolve(); };
    });
    return;
  }
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(cacheKey(proposal.proposalNumber), JSON.stringify({ proposal, share }));
  } catch (error) {
    console.warn('Shared proposal could not be cached for offline viewing', error);
  }
}

async function readCachedSharedProposal(number: string): Promise<{ proposal: Proposal; share: CollaborationShare } | null> {
  const fromDatabase = await cacheGet(cacheKey(number));
  if (fromDatabase) return fromDatabase;
  if (typeof localStorage === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(cacheKey(number)) || 'null');
  } catch {
    return null;
  }
}

export async function forgetSharedProposal(number: string) {
  await cacheDelete(cacheKey(number));
  if (typeof localStorage !== 'undefined') localStorage.removeItem(cacheKey(number));
}

export async function isCollaborationAvailable(franchiseId = getSessionFranchiseId()) {
  if (!(await hasSupabaseConnection())) return false;
  const { data, error } = await client().from('proposal_collaboration_rollout')
    .select('live_enabled,test_enabled').eq('franchise_id', franchiseId).maybeSingle();
  if (error) return false;
  return mode() ? Boolean(data?.test_enabled) : Boolean(data?.live_enabled);
}

export async function listRecipientOptions(proposalNumber: string): Promise<RecipientOption[]> {
  await online();
  const { data, error } = await client().rpc('collab_recipient_directory', { p_number: proposalNumber, p_test: mode() });
  if (error) throw error;
  return (data || []) as RecipientOption[];
}

export async function listProposalPeople(proposalNumber: string): Promise<RecipientOption[]> {
  await online();
  const { data, error } = await client().rpc('collab_people', { p_number: proposalNumber, p_test: mode() });
  if (error) throw error;
  return (data || []) as RecipientOption[];
}

export async function listProposalShares(proposalNumber: string): Promise<CollaborationShare[]> {
  await online();
  const { data, error } = await client().from('proposal_collaboration_shares').select('*')
    .eq('proposal_number', proposalNumber).eq('is_test', mode())
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as CollaborationShare[];
}

export async function shareProposal(number: string, recipientId: string, permission: CollaborationPermission, note = '') {
  await online();
  const { error } = await client().rpc('collab_manage_share', {
    p_number: number, p_test: mode(), p_recipient: recipientId, p_permission: permission, p_note: note,
  });
  if (error) throw error;
}

export async function endProposalShare(number: string, recipientId: string) {
  await online();
  const { error } = await client().rpc('collab_end_share', { p_number: number, p_test: mode(), p_recipient: recipientId });
  if (error) throw error;
  if (recipientId === readSession()?.userId) await forgetSharedProposal(number);
}

export async function getSharedProposal(number: string): Promise<{ proposal: Proposal; share: CollaborationShare; offline: boolean } | null> {
  const userId = readSession()?.userId;
  if (!userId) return null;
  if (!(await hasSupabaseConnection())) {
    const cached = await readCachedSharedProposal(number);
    return cached?.proposal.franchiseId === getSessionFranchiseId()
      ? { ...cached, offline: true } : null;
  }
  const { data: shares, error: shareError } = await client().from('proposal_collaboration_shares')
    .select('*').eq('proposal_number', number).eq('is_test', mode())
    .eq('franchise_id', getSessionFranchiseId())
    .eq('recipient_id', userId).is('ended_at', null).limit(1);
  if (shareError) throw shareError;
  const share = (shares || [])[0] as CollaborationShare | undefined;
  if (!share) {
    await forgetSharedProposal(number);
    return null;
  }
  const { data, error } = await client().from(table())
    .select('proposal_json,owner_auth_user_id,content_revision,collaboration_enabled')
    .eq('proposal_number', number).maybeSingle();
  if (error) throw error;
  if (!data?.proposal_json) {
    await forgetSharedProposal(number);
    return null;
  }
  const proposal = {
    ...(data.proposal_json as Proposal),
    ownerAuthUserId: data.owner_auth_user_id,
    contentRevision: Number(data.content_revision || 0),
    collaborationEnabled: Boolean(data.collaboration_enabled),
    sharedPermission: share.permission,
  } as Proposal;
  try {
    const people = await listProposalPeople(number);
    proposal.currentOwnerName = people.find((person) => person.user_id === proposal.ownerAuthUserId)?.display_name || proposal.designerName;
  } catch { proposal.currentOwnerName = proposal.designerName; }
  await cacheSharedProposal(proposal, share);
  return { proposal, share, offline: false };
}

export async function hasEndedSharedAccess(number: string): Promise<boolean> {
  const userId = readSession()?.userId;
  if (!userId || !(await hasSupabaseConnection())) return false;
  const { data, error } = await client().from('proposal_collaboration_events')
    .select('id').eq('proposal_number', number).eq('is_test', mode())
    .eq('recipient_id', userId).eq('event_type', 'access_ended').limit(1);
  if (error) return false;
  return Boolean(data?.length);
}

export async function listSharedProposals(): Promise<SharedProposal[]> {
  const userId = readSession()?.userId;
  if (!userId) return [];
  if (!(await hasSupabaseConnection())) {
    const cached: SharedProposal[] = [];
    const accountPrefix = `${cachePrefix}${mode() ? 'test' : 'live'}.${userId}.`;
    for (const item of await cacheAll()) {
      if (item.key.startsWith(accountPrefix) && item.value.proposal.franchiseId === getSessionFranchiseId())
        cached.push({ proposal: item.value.proposal, share: item.value.share,
        ownerName: item.value.proposal.currentOwnerName || item.value.proposal.designerName || 'Proposal owner' });
    }
    if (typeof localStorage === 'undefined') return cached;
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(accountPrefix)) continue;
      try {
        const item = JSON.parse(localStorage.getItem(key) || 'null');
        if (item?.proposal && item?.share && item.proposal.franchiseId === getSessionFranchiseId()
          && !cached.some((entry) => entry.proposal.proposalNumber === item.proposal.proposalNumber))
          cached.push({ proposal: item.proposal, share: item.share, ownerName: item.proposal.currentOwnerName || item.proposal.designerName || 'Proposal owner' });
      } catch { /* bad cache entry is ignored */ }
    }
    return cached;
  }
  const { data: shares, error } = await client().from('proposal_collaboration_shares').select('*')
    .eq('recipient_id', userId).eq('is_test', mode())
    .eq('franchise_id', getSessionFranchiseId()).is('ended_at', null);
  if (error) throw error;
  const activeShares = (shares || []) as CollaborationShare[];
  const activeNumbers = new Set(activeShares.map((share) => share.proposal_number));
  const accountPrefix = `${cachePrefix}${mode() ? 'test' : 'live'}.${userId}.`;
  for (const item of await cacheAll()) {
    if (item.key.startsWith(accountPrefix) && item.value.proposal.franchiseId === getSessionFranchiseId()
      && !activeNumbers.has(item.key.slice(accountPrefix.length))) await cacheDelete(item.key);
  }
  for (const key of typeof localStorage === 'undefined' ? [] : Object.keys(localStorage)) {
    if (!key.startsWith(accountPrefix) || activeNumbers.has(key.slice(accountPrefix.length))) continue;
    try {
      if (JSON.parse(localStorage.getItem(key) || 'null')?.proposal?.franchiseId === getSessionFranchiseId())
        localStorage.removeItem(key);
    } catch { localStorage.removeItem(key); }
  }
  if (!activeShares.length) return [];
  const { data: rows, error: proposalError } = await client().from(table())
    .select('proposal_number,proposal_json,owner_auth_user_id,content_revision,collaboration_enabled')
    .in('proposal_number', [...activeNumbers]);
  if (proposalError) throw proposalError;
  const { data: requests } = await client().from('proposal_collaboration_requests')
    .select('proposal_number,status,updated_at').eq('is_test', mode()).eq('contributor_id', userId)
    .in('proposal_number', [...activeNumbers]).order('updated_at', { ascending: false });
  const latestRequest = new Map<string, string>();
  for (const request of requests || []) if (!latestRequest.has(request.proposal_number)) latestRequest.set(request.proposal_number, request.status);
  const byNumber = new Map((rows || []).map((row) => [row.proposal_number, row]));
  return Promise.all(activeShares.flatMap((share) => {
    const row = byNumber.get(share.proposal_number);
    if (!row?.proposal_json) return [];
    const proposal = { ...(row.proposal_json as Proposal), ownerAuthUserId: row.owner_auth_user_id,
      contentRevision: Number(row.content_revision || 0), collaborationEnabled: Boolean(row.collaboration_enabled),
      sharedPermission: share.permission } as Proposal;
    return [(async (): Promise<SharedProposal> => {
      let ownerName = proposal.designerName || 'Proposal owner';
      try {
        const people = await listProposalPeople(share.proposal_number);
        ownerName = people.find((person) => person.user_id === proposal.ownerAuthUserId)?.display_name || ownerName;
      } catch { /* historical attribution remains a safe fallback */ }
      proposal.currentOwnerName = ownerName;
      await cacheSharedProposal(proposal, share);
      return { proposal, share, ownerName, requestStatus: latestRequest.get(share.proposal_number) };
    })()];
  }));
}

export async function listOwnedSharedProposalNumbers(numbers: string[]): Promise<string[]> {
  if (!numbers.length || !(await hasSupabaseConnection())) return [];
  const shared = new Set<string>();
  for (let offset = 0; offset < numbers.length; offset += 100) {
    const { data, error } = await client().from('proposal_collaboration_shares')
      .select('proposal_number').eq('is_test', mode()).is('ended_at', null)
      .in('proposal_number', numbers.slice(offset, offset + 100));
    if (error) throw error;
    for (const row of data || []) shared.add(row.proposal_number);
  }
  return [...shared];
}

export async function listOwnedSharedProposalRecipients(numbers: string[]): Promise<Record<string, string[]>> {
  const sharedNumbers = await listOwnedSharedProposalNumbers(numbers);
  const entries = await Promise.all(sharedNumbers.map(async (number) => {
    try {
      const people = await listProposalPeople(number);
      const names = people.filter((person) => person.user_id !== readSession()?.userId)
        .map((person) => person.display_name || person.email);
      return [number, names] as const;
    } catch { return [number, []] as const; }
  }));
  return Object.fromEntries(entries);
}

export async function listChangeRequests(number: string): Promise<CollaborationRequest[]> {
  await online();
  const { data, error } = await client().from('proposal_collaboration_requests').select('*')
    .eq('proposal_number', number).eq('is_test', mode()).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as CollaborationRequest[];
}

export async function saveWorkingCopy(number: string, versionId: string, work: Proposal, submit = false, note = ''): Promise<string> {
  await online();
  const { data, error } = await client().rpc('collab_save_work', {
    p_number: number, p_test: mode(), p_version: versionId, p_work: work, p_submit: submit, p_note: note,
  });
  if (error) throw error;
  return String(data);
}

export async function decideChangeRequest(id: string, action: 'apply' | 'decline' | 'revisions' | 'withdraw', note = '') {
  await online();
  const { error } = await client().rpc('collab_decide_request', { p_request: id, p_test: mode(), p_action: action, p_note: note });
  if (error) throw error;
}

export async function restoreAppliedChange(id: string) {
  await online();
  const { error } = await client().rpc('collab_restore', { p_request: id, p_test: mode() });
  if (error) throw error;
}

export async function transferDepartedOwner(number: string, newOwnerId: string) {
  await online();
  const { error } = await client().rpc('collab_transfer_departed_owner', { p_number: number, p_test: mode(), p_new_owner: newOwnerId });
  if (error) throw error;
}

export async function listOwnershipRecovery(franchiseId: string): Promise<{
  candidates: OwnershipRecoveryCandidate[]; recipients: RecipientOption[];
}> {
  await online();
  const [candidateResult, recipientResult] = await Promise.all([
    client().rpc('collab_recovery_candidates', { p_franchise: franchiseId, p_test: mode() }),
    client().rpc('collab_recovery_directory', { p_franchise: franchiseId, p_test: mode() }),
  ]);
  if (candidateResult.error) throw candidateResult.error;
  if (recipientResult.error) throw recipientResult.error;
  return { candidates: candidateResult.data || [], recipients: recipientResult.data || [] };
}

export async function listCollaborationEvents(limit = 20): Promise<CollaborationEvent[]> {
  const userId = readSession()?.userId;
  if (!userId || !(await hasSupabaseConnection())) return [];
  const { data, error } = await client().from('proposal_collaboration_events').select('*')
    .eq('recipient_id', userId).eq('is_test', mode()).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []) as CollaborationEvent[];
}

export async function getCollaborationAttentionCount(): Promise<number> {
  if (!readSession()?.userId || !(await hasSupabaseConnection())) return 0;
  const { data, error } = await client().rpc('collab_attention_count', { p_test: mode() });
  if (error) throw error;
  return Number(data || 0);
}

export async function markCollaborationEventRead(id: string) {
  await online();
  const { error } = await client().rpc('collab_mark_event_read', { p_event: id, p_test: mode() });
  if (error) throw error;
}

export async function saveCollaborativeOwnerProposal(proposal: Proposal, submitConfirmed = false): Promise<Proposal> {
  await online();
  const { data, error } = await client().rpc('collab_owner_save', {
    p_number: proposal.proposalNumber,
    p_test: mode(),
    p_expected: proposal.contentRevision,
    p_proposal: proposal,
    p_status: proposal.status,
    p_submit_confirmed: submitConfirmed,
  });
  if (error) throw error;
  return { ...proposal, contentRevision: Number(data), collaborationEnabled: true, syncStatus: 'synced', syncMessage: 'Synced with cloud' };
}
