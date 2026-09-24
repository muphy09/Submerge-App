import { Fragment, useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { Proposal } from '../types/proposal-new';
import { calculatePriceImpact } from '../services/priceImpact';
import { loadPricingSnapshotForExistingProposal } from '../services/pricingDataStore';
import { readSession } from '../services/session';
import ProposalSummaryIcon from './ProposalSummaryIcon';
import {
  decideChangeRequest,
  endProposalShare,
  listChangeRequests,
  listProposalPeople,
  listProposalShares,
  listRecipientOptions,
  restoreAppliedChange,
  saveWorkingCopy,
  shareProposal,
  type CollaborationPermission,
  type CollaborationRequest,
  type CollaborationShare,
  type RecipientOption,
} from '../services/proposalCollaboration';
import './ProposalCollaborationPanel.css';

export const collaborationPanelApi = {
  decideChangeRequest, endProposalShare, listChangeRequests, listProposalPeople,
  listProposalShares, listRecipientOptions, restoreAppliedChange, shareProposal,
  saveWorkingCopy,
};

const bodyFields = [
  'customerInfo','poolSpecs','excavation','plumbing','electrical','tileCopingDecking',
  'drainage','equipment','waterFeatures','customFeatures','masonry','interiorFinish',
  'papDiscounts','manualAdjustments','retailAdjustments',
  'notes','contractOverrides','warrantySections',
];

type Difference = { path: string; before: unknown; after: unknown };
function compareValue(before: unknown, after: unknown, path: string, result: Difference[]) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  if (before && after && typeof before === 'object' && typeof after === 'object'
    && !Array.isArray(before) && !Array.isArray(after)) {
    const oldRecord = before as Record<string, unknown>;
    const newRecord = after as Record<string, unknown>;
    for (const key of new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)])) {
      compareValue(oldRecord[key], newRecord[key], `${path}.${key}`, result);
    }
    return;
  }
  result.push({ path, before, after });
}
function requestDifferences(request: CollaborationRequest) {
  const differences: Difference[] = [];
  for (const field of bodyFields) {
    compareValue((request.base_version_json as any)?.[field], (request.working_version_json as any)?.[field], field, differences);
  }
  return differences;
}
function displayValue(value: unknown, path: string): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map((entry) => displayValue(entry, path)).join(', ') : 'None';
  if (typeof value === 'object') {
    const entry = value as Record<string, unknown>;
    if (typeof entry.name === 'string') return entry.name || 'None';
    if (typeof entry.label === 'string') return entry.label || 'None';
    return Object.entries(entry).filter(([key]) => !/^(price|basePrice|addCost\d*|total|cost|id)$/i.test(key))
      .map(([key, item]) => `${titleCase(key)}: ${displayValue(item, `${path}.${key}`)}`).join(', ') || 'Configured';
  }
  return String(value);
}
function titleCase(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (character) => character.toUpperCase());
}
function displayPath(path: string) {
  return path.split('.').slice(1).map(titleCase).join(' › ') || titleCase(path);
}
function displayGroup(path: string) {
  return titleCase(path.split('.')[0]);
}
function formatMoney(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : '—';
}

type ReviewRow = { key: string; category: string; label: string; before: string; after: string; paths: string[] };
function reviewGroupKey(path: string) {
  const segments = path.split('.');
  const item = segments[1]?.replace(/Quantity$/, '') || segments[0];
  return segments.length > 1 ? `${segments[0]}.${item}` : segments[0];
}
function getAtPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => (current as Record<string, unknown> | null)?.[key], value);
}
function reviewRows(request: CollaborationRequest): ReviewRow[] {
  const groups = new Map<string, Difference[]>();
  for (const difference of requestDifferences(request)) {
    const key = reviewGroupKey(difference.path);
    groups.set(key, [...(groups.get(key) || []), difference]);
  }
  return [...groups].map(([key, differences]) => {
    const beforeGroup = getAtPath(request.base_version_json, key);
    const afterGroup = getAtPath(request.working_version_json, key);
    const before = displayValue(beforeGroup, key);
    const after = displayValue(afterGroup, key);
    return {
      key, category: displayGroup(key), label: displayPath(key),
      before: before === after ? differences.map((item) => `${titleCase(item.path.split('.').slice(-1)[0] || '')}: ${displayValue(item.before, item.path)}`).join(', ') : before,
      after: before === after ? differences.map((item) => `${titleCase(item.path.split('.').slice(-1)[0] || '')}: ${displayValue(item.after, item.path)}`).join(', ') : after,
      paths: differences.map((item) => item.path),
    };
  });
}
function proposalWithReviewRow(base: Proposal, after: Proposal, row: ReviewRow): Proposal {
  const copy = JSON.parse(JSON.stringify(base)) as Record<string, any>;
  for (const path of row.paths) {
    const segments = path.split('.');
    let target: Record<string, any> = copy;
    for (const segment of segments.slice(0, -1)) target = target[segment] ||= {};
    const value = getAtPath(after, path);
    if (value === undefined) delete target[segments[segments.length - 1]];
    else target[segments[segments.length - 1]] = value;
  }
  return copy as Proposal;
}

type Props = {
  proposal: Proposal;
  available: boolean;
  offline?: boolean;
  manageSignal?: number;
  sendSignal?: number;
  sendVersionId?: string;
  onRequestsLoaded?: (requests: CollaborationRequest[]) => void;
  onChanged: () => void;
  api?: typeof collaborationPanelApi;
};

export default function ProposalCollaborationPanel({ proposal, available, offline = false, manageSignal, sendSignal, sendVersionId, onRequestsLoaded, onChanged, api = collaborationPanelApi }: Props) {
  const { decideChangeRequest, endProposalShare, listChangeRequests, listProposalPeople,
    listProposalShares, listRecipientOptions, restoreAppliedChange, shareProposal, saveWorkingCopy } = api;
  const userId = readSession()?.userId;
  const isOwner = Boolean(userId && (proposal.ownerAuthUserId || proposal.designerAuthUserId) === userId);
  const [shares, setShares] = useState<CollaborationShare[]>([]);
  const [endedShares, setEndedShares] = useState<CollaborationShare[]>([]);
  const [requests, setRequests] = useState<CollaborationRequest[]>([]);
  const [people, setPeople] = useState<RecipientOption[]>([]);
  const [options, setOptions] = useState<RecipientOption[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [contributorNote, setContributorNote] = useState('');
  const [search, setSearch] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<RecipientOption[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<Record<string, CollaborationPermission>>({});
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [highlightedRecipient, setHighlightedRecipient] = useState(0);
  const recipientListId = useId();
  const recipientInputId = useId();
  const [note, setNote] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewPrices, setReviewPrices] = useState<Record<string, number | null>>({});

  const refresh = useCallback(async () => {
    if (offline || (!available && !proposal.collaborationEnabled)) return;
    setLoading(true);
    try {
      const [nextShares, nextRequests, nextPeople] = await Promise.all([
        listProposalShares(proposal.proposalNumber),
        listChangeRequests(proposal.proposalNumber),
        proposal.collaborationEnabled ? listProposalPeople(proposal.proposalNumber) : Promise.resolve([]),
      ]);
      setShares(nextShares.filter((share) => !share.ended_at));
      setEndedShares(nextShares.filter((share) => Boolean(share.ended_at)));
      setRequests(nextRequests);
      onRequestsLoaded?.(nextRequests);
      setPeople(nextPeople);
      if (isOwner && available && manageOpen) setOptions(await listRecipientOptions(proposal.proposalNumber));
      setError(null);
    } catch (caught) {
      setError((caught as Error).message || 'Could not load collaboration.');
    } finally { setLoading(false); }
  }, [api, available, isOwner, manageOpen, offline, onRequestsLoaded, proposal.collaborationEnabled, proposal.proposalNumber]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (manageSignal) setManageOpen(true); }, [manageSignal]);
  useEffect(() => { if (sendSignal) setSendOpen(true); }, [sendSignal]);

  const myShare = shares.find((share) => share.recipient_id === userId);
  const mySubmittedRequest = requests.find((request) => request.contributor_id === userId && request.status === 'submitted');
  const submitted = requests.filter((request) => request.status === 'submitted');
  const review = requests.find((request) => request.id === reviewId) || null;
  const rows = useMemo(() => review ? reviewRows(review) : [], [review]);
  useEffect(() => {
    if (!review) return;
    let cancelled = false;
    setReviewPrices({});
    const calculate = async () => {
      if (rows.length === 1) {
        const difference = Number(review.working_version_json.totalCost) - Number(review.base_version_json.totalCost);
        if (Number.isFinite(difference)) {
          if (!cancelled) setReviewPrices({ [rows[0].key]: difference });
          return;
        }
      }
      try {
        const base = review.base_version_json;
        const snapshot = await loadPricingSnapshotForExistingProposal(base.franchiseId,
          base.pricingModelId, base.pricingModelFranchiseId, base.pricingTierId, base.pricingModelRevisionId);
        const changes: Record<string, number | null> = {};
        for (const row of rows) {
          const result = calculatePriceImpact({
            currentProposal: proposalWithReviewRow(base, review.working_version_json, row),
            comparisonProposal: base, controlLabel: row.label, comparisonLabel: row.before,
            directSections: new Set<string>(), pricingSnapshot: snapshot.pricing,
          });
          changes[row.key] = result.status === 'available' ? result.customerPriceChange : null;
        }
        if (!cancelled) setReviewPrices(changes);
      } catch (caught) {
        console.warn('Could not calculate item price changes for collaboration review.', caught);
        if (!cancelled) setReviewPrices(Object.fromEntries(rows.map((row) => [row.key, null])));
      }
    };
    void calculate();
    return () => { cancelled = true; };
  }, [reviewId, review?.updated_at]);
  const sendRequest = requests.find((request) => request.contributor_id === userId
    && request.target_version_id === sendVersionId && ['working', 'revision_requested'].includes(request.status));
  const names = new Map(people.map((person) => [person.user_id, person.display_name || person.email]));
  const ownerName = names.get(proposal.ownerAuthUserId || '') || proposal.currentOwnerName || proposal.designerName || 'Proposal owner';
  const targetVersionLabel = (versionId: string) => {
    const version = [proposal, ...(proposal.versions || [])].find((item) => (item.versionId || 'original') === versionId);
    const name = version?.versionName?.trim();
    return versionId === 'original' && (!name || name.toLowerCase() === 'original version')
      ? 'Original' : name || versionId;
  };
  const history = requests.flatMap((request) => {
    const entries = [] as Array<{ key: string; actor: string; action: string; at: string; note?: string | null }>;
    if (request.submitted_at || request.status !== 'working') entries.push({
      key: `${request.id}-submitted`, actor: names.get(request.contributor_id) || 'Contributor',
      action: 'Submitted Changes', at: request.submitted_at || request.created_at, note: request.contributor_note,
    });
    const decisions: Record<string, string> = {
      applied: 'Approved Changes', declined: 'Declined Changes', revision_requested: 'Sent Back Changes',
      withdrawn: 'Withdrew Changes', stale: 'Changes Became Outdated', superseded: 'Changes Superseded',
      access_ended: 'Access Ended',
    };
    if (decisions[request.status]) entries.push({
      key: `${request.id}-decision`,
      actor: names.get(request.decided_by || '') || (request.status === 'withdrawn' ? names.get(request.contributor_id) : ownerName) || 'Contributor',
      action: decisions[request.status], at: request.decided_at || request.updated_at, note: request.owner_note,
    });
    if (request.restored_at) entries.push({ key: `${request.id}-restored`, actor: ownerName,
      action: 'Restored Previous Draft', at: request.restored_at });
    return entries;
  }).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const historyDate = (value: string) => new Date(value).toLocaleString(undefined, {
    year: '2-digit', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).replace(',', '').replace(/\s?AM$/i, 'am').replace(/\s?PM$/i, 'pm');
  const filteredOptions = useMemo(() => options.filter((person) => {
    if (shares.some((share) => share.recipient_id === person.user_id)) return false;
    if (selectedRecipients.some((selected) => selected.user_id === person.user_id)) return false;
    const searchText = search.trim().toLowerCase();
    return !searchText || `${person.display_name} ${person.email}`.toLowerCase().includes(searchText);
  }), [options, search, shares, selectedRecipients]);

  const chooseRecipient = (person: RecipientOption) => {
    setSelectedRecipients((current) => [...current, person]);
    setSelectedPermissions((current) => ({ ...current, [person.user_id]: 'view' }));
    setSearch('');
    setHighlightedRecipient(0);
    setRecipientPickerOpen(false);
  };

  const act = async (action: () => Promise<unknown>, closeReview = false) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (closeReview) { setReviewId(null); setDecisionNote(''); }
      await refresh();
      onChanged();
    } catch (caught) {
      setError((caught as Error).message || 'Action could not be completed.');
    } finally { setBusy(false); }
  };

  if (!available && !proposal.collaborationEnabled) return null;

  return <>
    <section className="proposal-side-card collaboration-card no-print" aria-label="Collaboration">
      <div className="proposal-side-card-header"><div className="summary-card-title">
        <span className="summary-card-icon"><ProposalSummaryIcon name="people" size={28} /></span>
        <h2>Collaboration</h2>
      </div></div>
      <div className="proposal-side-card-body collaboration-card-body">
        {loading && <p>Loading collaborators…</p>}
        {offline && <p role="status">Showing a saved shared copy. Reconnect to check access or make changes.</p>}
        {error && <p role="alert" className="collaboration-error">{error}</p>}
        <div className="collaboration-people">
          <div className="collaboration-person"><span className="collaboration-person-icon owner"><ProposalSummaryIcon name="owner" size={25} /></span>
            <span><small>Owner</small><strong>{ownerName}</strong></span></div>
          <div className="collaboration-person"><span className="collaboration-person-icon contributors"><ProposalSummaryIcon name="people" size={25} /></span>
            <span><small>Collaborators</small><strong>{people.filter((person) => person.user_id !== proposal.ownerAuthUserId).length
              ? people.filter((person) => person.user_id !== proposal.ownerAuthUserId)
                .map((person) => person.display_name || 'Franchise user').join(', ')
              : offline ? 'Reconnect to see current access' : 'None yet'}</strong></span></div>
        </div>
        {!isOwner && <p className="collaboration-access-note">Your Access: {(myShare?.permission || proposal.sharedPermission) === 'contribute' ? 'Can propose changes' : 'Can view'}</p>}
        {isOwner && submitted.length > 0 && <div className="collaboration-review-list">
          {submitted.map((request) => <div key={request.id} className="collaboration-review-entry">
            <div className="collaboration-review-alert"><span className="collaboration-person-icon alert"><ProposalSummaryIcon name="request" size={27} /></span>
              <span><strong>{submitted.length === 1 ? '1 change request awaiting review' : 'Change request awaiting review'}</strong>
                <small>Review changes from {names.get(request.contributor_id) || 'contributor'} ({targetVersionLabel(request.target_version_id)}).</small></span></div>
            <button className="action-button primary" onClick={() => setReviewId(request.id)}>
              <ProposalSummaryIcon name="review" size={21} />Review Changes<ProposalSummaryIcon name="arrow" size={21} className="action-trailing-icon" />
            </button>
          </div>)}
        </div>}
        {!isOwner && <div className="collaboration-recipient-actions">
          {mySubmittedRequest && <button className="action-button collaboration-withdraw" 
          onClick={() => void act(() => decideChangeRequest(mySubmittedRequest.id, 'withdraw'))} disabled={busy || offline}>Withdraw Changes</button>}
          <button className="action-button collaboration-leave" onClick={() => {
          if (window.confirm('Leave this proposal? Your unfinished or pending changes will be canceled.')) {
            void act(() => endProposalShare(proposal.proposalNumber, userId || ''));
          }
        }} disabled={busy || offline}>Leave Proposal</button></div>}
        <details className="collaboration-history"><summary><ProposalSummaryIcon name="history" size={22} /><span>Collaboration History</span><ProposalSummaryIcon name="chevron" size={20} className="collaboration-history-chevron" /></summary>
          <ul>
            {endedShares.length === 0 && history.length === 0 && <li>No collaboration history yet.</li>}
            {history.map((entry) => <li key={entry.key}><strong>{entry.actor === (names.get(userId || '') || '') ? 'You' : entry.actor}:</strong> {entry.action} <span>| {historyDate(entry.at)}</span>
              {entry.note && <small>{entry.note}</small>}</li>)}
            {endedShares.map((share) => <li key={share.id}>
              {names.get(share.recipient_id) || 'Franchise user'}: Left Proposal | {historyDate(share.ended_at || share.created_at)}
            </li>)}
          </ul>
        </details>
      </div>
    </section>

    {manageOpen && isOwner && <div className="collaboration-modal-overlay no-print" data-scroll-lock="true" onClick={() => setManageOpen(false)}>
      <div className="collaboration-modal" role="dialog" aria-modal="true" aria-label="Share and manage access" onClick={(event) => event.stopPropagation()}>
        <header><h2>Share / Manage Access</h2><button aria-label="Close" onClick={() => setManageOpen(false)}>×</button></header>
        <p>Only active users in this franchise can be added. They receive access immediately. Removing access cannot erase a copy on a disconnected device until it reconnects.</p>
        {error && <p role="alert" className="collaboration-error">{error}</p>}
        <div className="collaboration-recipient-picker"><label htmlFor={recipientInputId}>Share with</label>
          {selectedRecipients.length > 0 && <span className="collaboration-recipient-chips">
            {selectedRecipients.map((person) => <span className="collaboration-recipient-chip" key={person.user_id}>
              <span><strong>{person.display_name || person.email}</strong><small>{person.email}</small></span>
              <select aria-label={`Permission for ${person.display_name || person.email}`} value={selectedPermissions[person.user_id] || 'view'}
                onChange={(event) => setSelectedPermissions((current) => ({ ...current, [person.user_id]: event.target.value as CollaborationPermission }))}>
                <option value="view">Can view</option><option value="contribute">Can propose changes</option>
              </select>
              <button type="button" aria-label={`Remove ${person.display_name || person.email} from selection`}
                onClick={() => setSelectedRecipients((current) => current.filter((item) => item.user_id !== person.user_id))}>×</button>
            </span>)}
          </span>}
          <input id={recipientInputId} role="combobox" aria-autocomplete="list" aria-expanded={recipientPickerOpen}
            aria-controls={recipientListId}
            aria-activedescendant={recipientPickerOpen && filteredOptions[highlightedRecipient]
              ? `${recipientListId}-${filteredOptions[highlightedRecipient].user_id}` : undefined}
            value={search} placeholder={selectedRecipients.length ? 'Add another person' : 'Search a name or email'}
            onFocus={() => setRecipientPickerOpen(Boolean(search.trim()))}
            onBlur={() => setRecipientPickerOpen(false)}
            onChange={(event) => {
              setSearch(event.target.value);
              setHighlightedRecipient(0);
              setRecipientPickerOpen(Boolean(event.target.value.trim()));
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { setRecipientPickerOpen(false); return; }
              if (event.key === 'Backspace' && !search && selectedRecipients.length) {
                setSelectedRecipients((current) => current.slice(0, -1));
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (!search.trim()) return;
                setRecipientPickerOpen(true);
                setHighlightedRecipient((current) => event.key === 'ArrowDown'
                  ? Math.max(0, Math.min(current + 1, filteredOptions.length - 1))
                  : Math.max(current - 1, 0));
              }
              if (event.key === 'Enter' && recipientPickerOpen && filteredOptions[highlightedRecipient]) {
                event.preventDefault();
                chooseRecipient(filteredOptions[highlightedRecipient]);
              }
            }} />
          {recipientPickerOpen && <div className="collaboration-recipient-options" id={recipientListId} role="listbox" aria-label="Franchise users">
            {filteredOptions.map((person, index) => <button type="button" role="option"
              id={`${recipientListId}-${person.user_id}`} key={person.user_id}
              aria-selected={index === highlightedRecipient} className={index === highlightedRecipient ? 'is-highlighted' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseRecipient(person)}>
              <strong>{person.display_name || person.email}</strong><span>{person.email}</span>
            </button>)}
            {filteredOptions.length === 0 && !error && <p>{loading ? 'Loading users…' : 'No available users match your search.'}</p>}
          </div>}
        </div>
        <label>Note (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <button className="action-button primary" disabled={!selectedRecipients.length || busy} onClick={() => void act(async () => {
          const recipients = [...selectedRecipients];
          const outcomes = await Promise.allSettled(recipients.map((person) =>
            shareProposal(proposal.proposalNumber, person.user_id, selectedPermissions[person.user_id] || 'view', note)));
          setSelectedRecipients(recipients.filter((_, index) => outcomes[index].status === 'rejected'));
          setSearch(''); setRecipientPickerOpen(false);
          if (outcomes.every((outcome) => outcome.status === 'fulfilled')) setNote('');
          else {
            await refresh();
            throw new Error('Some people could not be added. The remaining names are still selected for retry.');
          }
        })}>Share {selectedRecipients.length > 1 ? `${selectedRecipients.length} people` : 'proposal'}</button>
        <h3>People with Access</h3>
        {shares.length === 0 && <p>No recipients yet.</p>}
        {shares.map((share) => <div key={share.id} className="collaboration-share-row">
          <span>{names.get(share.recipient_id) || share.recipient_id}</span>
          <select value={share.permission} aria-label={`Permission for ${names.get(share.recipient_id) || 'recipient'}`} disabled={busy}
            onChange={(event) => void act(() => shareProposal(proposal.proposalNumber, share.recipient_id, event.target.value as CollaborationPermission))}>
            <option value="view">Can view</option><option value="contribute">Can propose changes</option>
          </select>
          <button className="collaboration-remove-access" disabled={busy} onClick={() => {
            if (window.confirm('Remove access? Their unfinished or pending changes will be canceled.'))
              void act(() => endProposalShare(proposal.proposalNumber, share.recipient_id));
          }}>Remove</button>
        </div>)}
      </div>
    </div>}

    {sendOpen && !isOwner && <div className="collaboration-modal-overlay no-print" data-scroll-lock="true" onClick={() => setSendOpen(false)}>
      <div className="collaboration-modal collaboration-send-modal" role="dialog" aria-modal="true" aria-label="Send changes to owner" onClick={(event) => event.stopPropagation()}>
        <header><div><p className="collaboration-modal-kicker">Shared proposal</p><h2>Send changes to {ownerName}</h2></div>
          <button type="button" aria-label="Close" onClick={() => setSendOpen(false)}>×</button></header>
        <p>The modifications you have made to this version will be sent to {ownerName} for review. Their copy will remain unchanged unless they apply your changes.</p>
        {error && <p role="alert" className="collaboration-error">{error}</p>}
        {mySubmittedRequest && <p role="alert" className="collaboration-error">You already have changes awaiting review. Withdraw them before sending another proposal.</p>}
        {!sendRequest && <p role="alert" className="collaboration-error">There is no saved working copy for this version. Open the proposal and propose changes first.</p>}
        {sendRequest && sendRequest.base_revision !== proposal.contentRevision &&
          <p role="alert" className="collaboration-error">The owner draft has changed. Reopen the latest draft before sending changes.</p>}
        <label htmlFor="collaboration-contributor-note">Note for {ownerName} (optional)
          <textarea id="collaboration-contributor-note" value={contributorNote} onChange={(event) => setContributorNote(event.target.value)}
            placeholder="Summarize your changes or add context for the owner" />
        </label>
        <footer><button type="button" className="action-button" onClick={() => setSendOpen(false)}>Cancel</button>
          <button type="button" className="action-button primary" disabled={busy || offline || Boolean(mySubmittedRequest) || !sendRequest || sendRequest.base_revision !== proposal.contentRevision}
            onClick={() => void act(async () => {
              if (!sendRequest) return;
              await saveWorkingCopy(proposal.proposalNumber, sendRequest.target_version_id, sendRequest.working_version_json, true, contributorNote);
              setSendOpen(false); setContributorNote('');
            })}>Send changes</button></footer>
      </div>
    </div>}

    {review && isOwner && <div className="collaboration-modal-overlay no-print" data-scroll-lock="true" onClick={() => setReviewId(null)}>
      <div className="collaboration-modal collaboration-review" role="dialog" aria-modal="true" aria-label="Review proposed changes" onClick={(event) => event.stopPropagation()}>
        <header><div><p className="collaboration-modal-kicker">Owner review</p><h2>Review proposed changes</h2>
          <p>From {names.get(review.contributor_id) || 'Contributor'} · {targetVersionLabel(review.target_version_id)}</p></div>
          <button aria-label="Close" onClick={() => setReviewId(null)}>×</button></header>
        <div className="collaboration-review-body">
          {review.contributor_note && <p className="collaboration-review-note"><strong>Contributor note</strong><span>{review.contributor_note}</span></p>}
          {review.base_revision !== proposal.contentRevision && <p role="alert" className="collaboration-error">The owner draft changed. This request needs a contributor refresh.</p>}
          <div className="collaboration-totals" aria-label="Financial totals">
            <div className="collaboration-total"><strong>Subtotal</strong><span>{formatMoney(review.base_version_json.subtotal)} <b aria-label="changes to">→</b> {formatMoney(review.working_version_json.subtotal)}</span></div>
            <div className="collaboration-total"><strong>Gross Profit %</strong><span>{typeof review.base_version_json.pricing?.grossProfitMargin === 'number' ? `${review.base_version_json.pricing.grossProfitMargin.toFixed(1)}%` : '—'} <b aria-label="changes to">→</b> {typeof review.working_version_json.pricing?.grossProfitMargin === 'number' ? `${review.working_version_json.pricing.grossProfitMargin.toFixed(1)}%` : '—'}</span></div>
            <div className="collaboration-total"><strong>Total</strong><span>{formatMoney(review.base_version_json.totalCost)} <b aria-label="changes to">→</b> {formatMoney(review.working_version_json.totalCost)}</span></div>
          </div>
          <div className="collaboration-diff"><h3>Changed Fields <span>{rows.length}</span></h3>
            {rows.length ? <div className="collaboration-diff-table-wrap"><table className="collaboration-diff-table">
              <thead><tr><th scope="col">Changed Item</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Price Change</th></tr></thead>
              <tbody>{rows.map((row, index) => <Fragment key={row.key}>
                {(index === 0 || rows[index - 1].category !== row.category) &&
                  <tr className="collaboration-diff-group"><th colSpan={4} scope="rowgroup">{row.category}</th></tr>}
                <tr><th scope="row">{row.label}</th><td>{row.before}</td><td>{row.after}</td>
                  <td className={typeof reviewPrices[row.key] === 'number' ? reviewPrices[row.key]! > 0 ? 'price-increase' : reviewPrices[row.key]! < 0 ? 'price-decrease' : '' : ''}>
                    {typeof reviewPrices[row.key] === 'number' ? `${reviewPrices[row.key]! > 0 ? '+' : ''}${formatMoney(reviewPrices[row.key])}` : '—'}
                  </td></tr>
              </Fragment>)}</tbody>
            </table></div> : <p>No changed fields found.</p>}
          </div>
          {error && <p role="alert" className="collaboration-error">{error}</p>}
          <label>Note for contributor<textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /></label>
        </div>
        <footer className="collaboration-review-actions">
          <button disabled={busy || review.base_revision !== proposal.contentRevision} className="action-button primary"
            onClick={() => void act(() => decideChangeRequest(review.id, 'apply'), true)}>Apply changes to draft</button>
          <button disabled={busy || !decisionNote.trim()} onClick={() => void act(() => decideChangeRequest(review.id, 'revisions', decisionNote), true)}>Request revisions</button>
          <button disabled={busy} onClick={() => void act(() => decideChangeRequest(review.id, 'decline', decisionNote), true)}>Decline</button>
        </footer>
      </div>
    </div>}

    {isOwner && requests.filter((request) => request.status === 'applied' && !request.restored_at
      && request.applied_revision === proposal.contentRevision).map((request) =>
      <div className="collaboration-restore no-print" key={request.id}>
        <span>Changes from {names.get(request.contributor_id) || 'contributor'} were applied.</span>
        <button disabled={busy} onClick={() => {
          if (window.confirm('Restore the draft as it was before these changes?')) void act(() => restoreAppliedChange(request.id));
        }}>Restore previous draft</button>
      </div>)}
  </>;
}
