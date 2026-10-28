import type { Proposal } from '../types/proposal-new';
import { getSupabaseClient, hasSupabaseConnection } from './supabaseClient';
import { getSessionFranchiseId, isTestSession, readSession } from './session';
import { alignCollaborativeProposalRoot } from '../utils/collaborativeProposalSave';
import { assertProposalContext, captureProposalContext, proposalCacheEnvironment } from './proposalContext';
import { prepareContribution, type PreparedContribution } from './collaborationPricing';
import type { ContributionResolutions } from '../utils/contributionInputs';

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
  protocol_version?: number;
  contributor_note: string | null;
  owner_note: string | null;
  created_at: string;
  updated_at: string;
  submitted_at?: string | null;
  decided_at?: string | null;
  decided_by?: string | null;
  applied_revision: number | null;
  application_mode?: ContributionDestination | null;
  applied_version_id?: string | null;
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
  const context = captureProposalContext();
  if (!(await hasSupabaseConnection(true))) {
    throw new Error('Reconnect to manage or propose changes to a shared proposal.');
  }
  assertProposalContext(context);
  return context;
}

function cacheKey(number: string) {
  const session = readSession();
  return `${cachePrefix}${proposalCacheEnvironment()}.${mode() ? 'test' : 'live'}.${session?.userId || 'signed-out'}.${number}`;
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

async function cacheSharedProposal(proposal: Proposal, share: CollaborationShare, context: string) {
  assertProposalContext(context);
  const key = cacheKey(proposal.proposalNumber);
  const database = await openCache();
  if (context !== captureProposalContext()) { database?.close(); assertProposalContext(context); }
  if (database) {
    await new Promise<void>((resolve) => {
      const request = database.transaction('copies', 'readwrite').objectStore('copies')
        .put({ key, value: { proposal, share } });
      request.onsuccess = () => { database.close(); resolve(); };
      request.onerror = () => { database.close(); resolve(); };
    });
    return;
  }
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify({ proposal, share }));
  } catch (error) {
    console.warn('Shared proposal could not be cached for offline viewing', error);
  }
}

async function readCachedSharedProposal(number: string): Promise<{ proposal: Proposal; share: CollaborationShare } | null> {
  const context = captureProposalContext();
  const key = cacheKey(number);
  const valid = (value: any) => value?.proposal?.proposalNumber === number && value?.share?.proposal_number === number
    && value.share.recipient_id === readSession()?.userId && !value.share.ended_at
    && value.proposal.franchiseId === getSessionFranchiseId();
  const fromDatabase = await cacheGet(key);
  assertProposalContext(context);
  if (valid(fromDatabase)) return fromDatabase;
  if (typeof localStorage === 'undefined') return null;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null');
    return valid(cached) ? cached : null;
  } catch {
    return null;
  }
}

export async function forgetSharedProposal(number: string) {
  const key = cacheKey(number);
  await cacheDelete(key);
  if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
}

export async function isCollaborationAvailable(franchiseId = getSessionFranchiseId(), forceRefresh = false) {
  if (!(await hasSupabaseConnection(forceRefresh))) return false;
  const { data, error } = await client().from('proposal_collaboration_rollout')
    .select('live_enabled,test_enabled').eq('franchise_id', franchiseId).maybeSingle();
  if (error) return false;
  return mode() ? Boolean(data?.test_enabled) : Boolean(data?.live_enabled);
}

export async function listRecipientOptions(proposalNumber: string): Promise<RecipientOption[]> {
  const context = await online();
  const { data, error } = await client().rpc('collab_recipient_directory', { p_number: proposalNumber, p_test: mode() });
  assertProposalContext(context);
  if (error) throw error;
  return (data || []) as RecipientOption[];
}

export async function listProposalPeople(proposalNumber: string): Promise<RecipientOption[]> {
  const context = await online();
  const { data, error } = await client().rpc('collab_people', { p_number: proposalNumber, p_test: mode() });
  assertProposalContext(context);
  if (error) throw error;
  return (data || []) as RecipientOption[];
}

export async function listProposalShares(proposalNumber: string): Promise<CollaborationShare[]> {
  const context = await online();
  const { data, error } = await client().from('proposal_collaboration_shares').select('*')
    .eq('proposal_number', proposalNumber).eq('is_test', mode())
    .order('created_at', { ascending: true });
  assertProposalContext(context);
  if (error) throw error;
  return (data || []) as CollaborationShare[];
}

export async function shareProposal(number: string, recipientId: string, permission: CollaborationPermission, note = '') {
  const context = await online();
  const { error } = await client().rpc('collab_manage_share', {
    p_number: number, p_test: mode(), p_recipient: recipientId, p_permission: permission, p_note: note,
  });
  assertProposalContext(context);
  if (error) throw error;
}

export async function endProposalShare(number: string, recipientId: string) {
  const context = await online();
  const { error } = await client().rpc('collab_end_share', { p_number: number, p_test: mode(), p_recipient: recipientId });
  assertProposalContext(context);
  if (error) throw error;
  if (recipientId === readSession()?.userId) await forgetSharedProposal(number);
}

export async function getSharedProposal(number: string): Promise<{ proposal: Proposal; share: CollaborationShare; offline: boolean } | null> {
  const context = captureProposalContext();
  const userId = readSession()?.userId;
  if (!userId) return null;
  if (!(await hasSupabaseConnection())) {
    const cached = await readCachedSharedProposal(number);
    assertProposalContext(context);
    return cached?.proposal.franchiseId === getSessionFranchiseId()
      ? { ...cached, offline: true } : null;
  }
  const { data: shares, error: shareError } = await client().from('proposal_collaboration_shares')
    .select('*').eq('proposal_number', number).eq('is_test', mode())
    .eq('franchise_id', getSessionFranchiseId())
    .eq('recipient_id', userId).is('ended_at', null).limit(1);
  if (shareError) throw shareError;
  assertProposalContext(context);
  const share = (shares || [])[0] as CollaborationShare | undefined;
  if (!share) {
    await forgetSharedProposal(number);
    return null;
  }
  const { data, error } = await client().from(table())
    .select('proposal_json,owner_auth_user_id,content_revision,collaboration_enabled')
    .eq('proposal_number', number).maybeSingle();
  if (error) throw error;
  assertProposalContext(context);
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
  await cacheSharedProposal(proposal, share, context);
  assertProposalContext(context);
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
  const context = captureProposalContext();
  const userId = readSession()?.userId;
  if (!userId) return [];
  if (!(await hasSupabaseConnection())) {
    const cached: SharedProposal[] = [];
    const accountPrefix = `${cachePrefix}${proposalCacheEnvironment()}.${mode() ? 'test' : 'live'}.${userId}.`;
    for (const item of await cacheAll()) {
      if (item.key === cacheKey(item.value.proposal.proposalNumber)
        && item.value.share.recipient_id === userId && item.value.share.proposal_number === item.value.proposal.proposalNumber
        && !item.value.share.ended_at && item.value.proposal.franchiseId === getSessionFranchiseId())
        cached.push({ proposal: item.value.proposal, share: item.value.share,
        ownerName: item.value.proposal.currentOwnerName || item.value.proposal.designerName || 'Proposal owner' });
    }
    if (typeof localStorage === 'undefined') return cached;
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(accountPrefix)) continue;
      try {
        const item = JSON.parse(localStorage.getItem(key) || 'null');
        if (item?.proposal && item?.share && item.proposal.franchiseId === getSessionFranchiseId()
          && key === cacheKey(item.proposal.proposalNumber) && item.share.recipient_id === userId
          && item.share.proposal_number === item.proposal.proposalNumber && !item.share.ended_at
          && !cached.some((entry) => entry.proposal.proposalNumber === item.proposal.proposalNumber))
          cached.push({ proposal: item.proposal, share: item.share, ownerName: item.proposal.currentOwnerName || item.proposal.designerName || 'Proposal owner' });
      } catch { /* bad cache entry is ignored */ }
    }
    assertProposalContext(context);
    return cached;
  }
  const { data: shares, error } = await client().from('proposal_collaboration_shares').select('*')
    .eq('recipient_id', userId).eq('is_test', mode())
    .eq('franchise_id', getSessionFranchiseId()).is('ended_at', null);
  if (error) throw error;
  assertProposalContext(context);
  const activeShares = (shares || []) as CollaborationShare[];
  const activeNumbers = new Set(activeShares.map((share) => share.proposal_number));
  const accountPrefix = `${cachePrefix}${proposalCacheEnvironment()}.${mode() ? 'test' : 'live'}.${userId}.`;
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
      await cacheSharedProposal(proposal, share, context);
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
  const context = await online();
  const { data, error } = await client().from('proposal_collaboration_requests').select('*')
    .eq('proposal_number', number).eq('is_test', mode()).order('updated_at', { ascending: false });
  assertProposalContext(context);
  if (error) throw error;
  return (data || []) as CollaborationRequest[];
}

export async function beginWorkingCopy(number: string, versionId: string, expected: number): Promise<CollaborationRequest> {
  const context = await online();
  const { data, error } = await client().rpc('collab_begin_work', {
    p_number: number, p_test: mode(), p_version: versionId, p_expected: expected,
  });
  assertProposalContext(context);
  if (error) throw error;
  return data as CollaborationRequest;
}

export async function saveWorkingCopy(number: string, versionId: string, work: Proposal, submit = false, note = '',
  request?: CollaborationRequest): Promise<string> {
  const context = await online();
  if (!request || request.proposal_number !== number || request.target_version_id !== versionId) {
    throw new Error('Reopen the working copy to capture its original baseline. Your edits have not been saved.');
  }
  const { data, error } = await client().rpc('collab_save_work_v2', {
    p_request: request.id, p_test: mode(), p_work: work, p_updated: request.updated_at, p_submit: submit, p_note: note,
  });
  assertProposalContext(context);
  if (error) throw error;
  Object.assign(request, data);
  return String(data.id);
}

export async function prepareChangeRequest(id: string, resolutions: ContributionResolutions = {}): Promise<PreparedContribution> {
  const context = await online();
  const { data: request, error } = await client().from('proposal_collaboration_requests').select('*').eq('id', id).eq('is_test', mode()).single();
  assertProposalContext(context);
  if (error) throw error;
  const { data: row, error: readError } = await client().from(table()).select('proposal_json,content_revision,owner_auth_user_id')
    .eq('proposal_number', request.proposal_number).single();
  assertProposalContext(context);
  if (readError) throw readError;
  if (row.owner_auth_user_id !== readSession()?.userId) throw new Error('Owner review required.');
  const result = await prepareContribution(request, { ...row.proposal_json, contentRevision: Number(row.content_revision) }, resolutions);
  assertProposalContext(context);
  return result;
}

export type ContributionDestination = 'new-draft' | 'overwrite';

export async function applyChangeRequest(id: string, prepared: PreparedContribution, destination: ContributionDestination) {
  const context = await online();
  if (!['new-draft', 'overwrite'].includes(destination)) throw new Error('Choose how to apply these changes.');
  if (prepared.conflicts.some(conflict => !prepared.resolutions[conflict.path]
    || (conflict.allowed && !conflict.allowed.includes(prepared.resolutions[conflict.path])))) throw new Error('Resolve every conflict before applying changes.');
  const { data, error } = await client().rpc('collab_apply_review_v3', { p_request: id, p_test: mode(),
    p_expected: prepared.expectedRevision, p_updated: prepared.requestUpdatedAt,
    p_result: prepared.after, p_resolutions: prepared.resolutions, p_destination: destination });
  assertProposalContext(context);
  if (error) throw error;
  return data;
}

export async function decideChangeRequest(id: string, action: 'apply' | 'decline' | 'revisions' | 'withdraw', note = '') {
  if (action === 'apply') throw new Error('Open the current comparison before applying changes.');
  const context = await online();
  const { error } = await client().rpc('collab_decide_request', { p_request: id, p_test: mode(), p_action: action, p_note: note });
  if (error) throw error;
  assertProposalContext(context);
}

export async function restoreAppliedChange(id: string) {
  const context = await online();
  const { error } = await client().rpc('collab_restore', { p_request: id, p_test: mode() });
  assertProposalContext(context);
  if (error) throw error;
}

export async function transferDepartedOwner(number: string, newOwnerId: string) {
  const context = await online();
  const { error } = await client().rpc('collab_transfer_departed_owner', { p_number: number, p_test: mode(), p_new_owner: newOwnerId });
  assertProposalContext(context);
  if (error) throw error;
}

export async function listOwnershipRecovery(franchiseId: string): Promise<{
  candidates: OwnershipRecoveryCandidate[]; recipients: RecipientOption[];
}> {
  const context = await online();
  const [candidateResult, recipientResult] = await Promise.all([
    client().rpc('collab_recovery_candidates', { p_franchise: franchiseId, p_test: mode() }),
    client().rpc('collab_recovery_directory', { p_franchise: franchiseId, p_test: mode() }),
  ]);
  if (candidateResult.error) throw candidateResult.error;
  if (recipientResult.error) throw recipientResult.error;
  assertProposalContext(context);
  return { candidates: candidateResult.data || [], recipients: recipientResult.data || [] };
}

export async function listCollaborationEvents(limit = 20, options: { unreadOnly?: boolean; readSharesOnly?: boolean; proposalNumber?: string } = {}): Promise<CollaborationEvent[]> {
  const context = captureProposalContext();
  const userId = readSession()?.userId;
  if (!userId || !(await hasSupabaseConnection())) return [];
  let query = client().from('proposal_collaboration_events').select('*')
    .eq('recipient_id', userId).eq('is_test', mode());
  if (options.unreadOnly) query = query.is('read_at', null);
  if (options.readSharesOnly) query = query.eq('event_type', 'shared').not('read_at', 'is', null);
  if (options.proposalNumber) query = query.eq('proposal_number', options.proposalNumber);
  const pageSize = Math.max(1, Math.min(limit, 500));
  const events: CollaborationEvent[] = [];
  // Notification state must not disappear behind the old recent-updates limit.
  // A stable tie-breaker also keeps pages consistent for events in one transaction.
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query.order('created_at', { ascending: false }).order('id')
      .range(offset, offset + pageSize - 1);
    assertProposalContext(context);
    if (error) throw error;
    const rows = (data || []) as CollaborationEvent[];
    events.push(...rows);
    if ((!options.unreadOnly && !options.readSharesOnly) || rows.length < pageSize) break;
  }
  return events;
}

export async function getCollaborationAttentionCount(): Promise<number> {
  const context = captureProposalContext();
  if (!readSession()?.userId || !(await hasSupabaseConnection())) return 0;
  const { data, error } = await client().rpc('collab_attention_count', { p_test: mode() });
  assertProposalContext(context);
  if (error) throw error;
  return Number(data || 0);
}

export async function markCollaborationEventRead(id: string) {
  const context = await online();
  const { error } = await client().rpc('collab_mark_event_read', { p_event: id, p_test: mode() });
  assertProposalContext(context);
  if (error) throw error;
}

export async function saveCollaborativeOwnerProposal(proposal: Proposal, submitConfirmed = false): Promise<Proposal> {
  const context = await online();
  const { data: stored, error: readError } = await client().from(table())
    .select('proposal_json,content_revision').eq('proposal_number', proposal.proposalNumber).single();
  assertProposalContext(context);
  if (readError) throw readError;
  if (Number(stored.content_revision) !== proposal.contentRevision) {
    throw new Error('COLLAB_CONFLICT: This proposal changed on another device. Reopen the latest draft.');
  }
  const payload = alignCollaborativeProposalRoot(proposal, stored.proposal_json.versionId || 'original');
  const { data, error } = await client().rpc('collab_owner_save', {
    p_number: proposal.proposalNumber,
    p_test: mode(),
    p_expected: proposal.contentRevision,
    p_proposal: payload,
    p_status: proposal.status,
    p_submit_confirmed: submitConfirmed,
  });
  assertProposalContext(context);
  if (error) throw error;
  return { ...proposal, contentRevision: Number(data), collaborationEnabled: true, syncStatus: 'synced', syncMessage: 'Synced with cloud' };
}
