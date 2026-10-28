import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import DashboardProposalsPanel from '../../src/components/DashboardProposalsPanel';
import ProposalCollaborationPanel, { collaborationPanelApi } from '../../src/components/ProposalCollaborationPanel';
import '../../src/pages/ProposalView.css';
import type { Proposal } from '../../src/types/proposal-new';
import type { CollaborationRequest, CollaborationShare, SharedProposal } from '../../src/services/proposalCollaboration';
import { clearSession } from '../../src/services/session';
import '../../src/index.css';
import '../../src/styles/sharedButtons.css';
import { getDefaultProposal } from '../../src/utils/proposalDefaults';
import MasterPricingEngine from '../../src/services/masterPricingEngine';
import { withAdditionalDeckingSelections } from '../../src/utils/decking';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'dashboard';
const userId = mode === 'owner' ? 'owner-id' : 'recipient-id';
localStorage.setItem('submerge-user-session', JSON.stringify({ userId, franchiseId: 'fixture-franchise', role: 'designer', userName: mode === 'owner' ? 'Owner' : 'Recipient' }));

declare global { interface Window { collaborationAction: string; } }
window.collaborationAction = '';
(window as any).testClearSession = clearSession;
(window as any).electron = { listPricingModels: async () => [] };

const proposal = {
  proposalNumber: 'TEST-FIXTURE-1', franchiseId: 'fixture-franchise',
  ownerAuthUserId: 'owner-id', designerAuthUserId: 'owner-id', designerName: 'Original Designer',
  contentRevision: params.get('stale') ? 2 : 1, collaborationEnabled: true,
  customerInfo: { customerName: params.get('long') ? 'Rivera Family Extremely Long Customer Name for a Large Custom Backyard Pool' : 'Rivera Pool' }, status: 'draft',
  versionId: 'original', versionName: 'Original Version', activeVersionId: 'original',
  createdDate: '2026-09-20T12:00:00.000Z', lastModified: '2026-09-23T12:00:00.000Z',
  subtotal: 100000, taxAmount: 8000, totalCost: 108000,
  poolSpecs: { poolType: 'shotcrete' }, versions: [],
} as Proposal;
const share: CollaborationShare = {
  id: 'share-1', proposal_number: proposal.proposalNumber, recipient_id: 'recipient-id',
  permission: params.get('permission') === 'view' ? 'view' : 'contribute',
  note: params.has('note') ? (params.get('note') === '1' ? 'Please review' : params.get('note')) : mode === 'owner' ? 'Please review' : null,
  created_at: '2026-09-23T12:00:00.000Z', ended_at: null,
};
const request: CollaborationRequest = {
  id: 'request-1', proposal_number: proposal.proposalNumber, contributor_id: 'recipient-id',
  target_version_id: 'original', base_revision: 1,
  base_version_json: proposal,
  working_version_json: { ...proposal, poolSpecs: { ...proposal.poolSpecs, poolLength: 32 },
    subtotal: 120000, taxAmount: 9600, totalCost: 129600 } as Proposal,
  status: params.get('working') ? 'working' : 'submitted', contributor_note: 'Longer pool requested', owner_note: null,
  created_at: '2026-09-23T12:00:00.000Z', updated_at: '2026-09-23T12:00:00.000Z',
  applied_revision: null, restored_at: null,
  submitted_at: params.get('working') ? null : '2026-09-22T21:47:00.000Z',
};
if (params.get('diff') === 'equipment') {
  const base = { ...proposal, equipment: { automation: { name: 'No Automation', price: 0 } },
    pricing: { grossProfitMargin: 25 } } as Proposal;
  request.base_version_json = base;
  request.working_version_json = { ...base, equipment: { automation: { name: 'AQRS Omni - 25k with Salt and Heat', price: 4200, addCost1: 350 } },
    pricing: { grossProfitMargin: 28 }, totalCost: 113000 } as Proposal;
}
if (params.get('diff') === 'salt') {
  const base = { ...proposal, equipment: { saltSystem: { name: 'No Salt System', price: 0 } } } as Proposal;
  request.base_version_json = base;
  request.working_version_json = { ...base, equipment: { saltSystem: { name: 'AQRS Salt System', model: 'AQRS', price: 1000 } },
    totalCost: 109000 } as Proposal;
}
if (params.get('diff') === 'spa') {
  request.base_version_json = { ...proposal, poolSpecs: { ...proposal.poolSpecs, spaType: 'none' } } as Proposal;
  request.working_version_json = { ...request.base_version_json,
    poolSpecs: { ...proposal.poolSpecs, spaType: 'gunite' } } as Proposal;
}
if (params.get('diff') === 'longreview') {
  const additions = Object.fromEntries(Array.from({ length: 18 }, (_, index) => [`fixtureOption${index + 1}`, index + 1]));
  request.working_version_json = { ...proposal, poolSpecs: { ...proposal.poolSpecs, ...additions },
    totalCost: 128000 } as Proposal;
}
if (params.get('diff') === 'materials') {
  const base = { ...getDefaultProposal(), ...proposal } as Proposal;
  base.poolSpecs = { ...getDefaultProposal().poolSpecs, perimeter: 100, surfaceArea: 500, deckingArea: 400 };
  base.tileCopingDecking = { ...getDefaultProposal().tileCopingDecking, deckingArea: 400,
    tileLevel: 1, tileOptionId: 'level1', copingType: 'travertine-level1', copingSize: '12x12', deckingType: 'concrete' };
  Object.assign(base, MasterPricingEngine.calculateCompleteProposal(base));
  const work = structuredClone(base);
  work.tileCopingDecking = withAdditionalDeckingSelections({ ...work.tileCopingDecking,
    tileLevel: 3, tileOptionId: 'level3', copingType: 'travertine-level2', copingSize: '12x24',
    trimTileOptionId: 'default-trim-tile', hasTrimTileOnSteps: true,
    deckingType: 'paver', isDeckingOffContract: true }, [{ deckingType: 'concrete', area: 100, isOffContract: false }]);
  Object.assign(work, MasterPricingEngine.calculateCompleteProposal(work));
  const tileOnly = structuredClone(base);
  tileOnly.tileCopingDecking.tileLevel = 3;
  tileOnly.tileCopingDecking.tileOptionId = 'level3';
  (window as any).reviewExpected = {
    tilePrice: MasterPricingEngine.calculateCompleteProposal(tileOnly).pricing.retailPrice - base.pricing.retailPrice,
    totalPrice: work.pricing.retailPrice - base.pricing.retailPrice,
  };
  request.base_version_json = base;
  request.working_version_json = work;
}
const store = { proposal: { ...proposal }, shares: [share], requests: [request] };
if (params.has('history')) {
  store.shares.push({ ...share, id: 'ended-share', recipient_id: 'second-id', ended_at: '2026-09-24T12:00:00Z' });
  request.status = 'declined';
  request.decided_at = '2026-09-23T12:00:00Z';
  request.decided_by = 'owner-id';
}
(window as any).collaborationShares = () => structuredClone(store.shares);
const api: typeof collaborationPanelApi = {
  listCollaborationEvents: async () => localStorage.getItem('fixture-event-read') ? [] : [{
    id: 'fixture-unread', proposal_number: proposal.proposalNumber, event_type: 'shared',
    actor_id: 'owner-id', request_id: null, note: share.note, created_at: share.created_at, read_at: null }],
  markCollaborationEventRead: async (id) => { localStorage.setItem('fixture-event-read', id); },
  prepareChangeRequest: async (id, resolutions = {}) => {
    const target = store.requests.find(item => item.id === id)!;
    const conflicts = params.get('conflict') ? [{ path: 'poolSpecs.poolLength', before: 28, owner: 30, proposed: 32,
      message: 'The owner also changed this field.' }] : [];
    return { before: target.base_version_json, after: target.working_version_json, conflicts,
      expectedRevision: Number(store.proposal.contentRevision), requestUpdatedAt: target.updated_at, resolutions };
  },
  applyChangeRequest: async (id, _prepared, destination) => {
    (window as any).collaborationDestination = destination;
    await api.decideChangeRequest(id, 'apply');
    return { versionId: destination === 'new-draft' ? 'new-version' : 'original', destination };
  },
  listProposalShares: async () => store.shares,
  listChangeRequests: async () => store.requests,
  listProposalPeople: async () => [
    { user_id: 'owner-id', display_name: 'Alex Owner', email: 'alex@example.com' },
    { user_id: 'recipient-id', display_name: 'Jordan Designer', email: 'jordan@example.com' },
    { user_id: 'second-id', display_name: 'Taylor Admin', email: 'taylor@example.com' },
    { user_id: 'third-id', display_name: 'Casey Editor', email: 'casey@example.com' },
  ],
  listRecipientOptions: async () => [
    { user_id: 'recipient-id', display_name: 'Jordan Designer', email: 'jordan@example.com' },
    { user_id: 'second-id', display_name: 'Taylor Admin', email: 'taylor@example.com' },
    { user_id: 'third-id', display_name: 'Casey Editor', email: 'casey@example.com' },
  ],
  shareProposal: async (_number, recipient, permission, note) => {
    window.collaborationAction = `share:${recipient}:${permission}:${note}`;
    const existing = store.shares.find((item) => item.recipient_id === recipient);
    if (existing) { existing.permission = permission; existing.note = note?.trim() || null; }
    else store.shares.push({ ...share, id: `share-${recipient}`, recipient_id: recipient, permission, note });
  },
  endProposalShare: async (_number, recipient) => {
    if (params.has('leaveFailure')) throw new Error('Connection interrupted. Try leaving again.');
    window.collaborationAction = `end:${recipient}`;
    store.shares = store.shares.filter((item) => item.recipient_id !== recipient);
  },
  decideChangeRequest: async (id, action, note) => {
    window.collaborationAction = `${action}:${id}:${note || ''}`;
    const target = store.requests.find((item) => item.id === id)!;
    target.status = action === 'apply' ? 'applied' : action === 'revisions' ? 'revision_requested' : action === 'withdraw' ? 'withdrawn' : 'declined';
    target.decided_at = '2026-09-23T08:04:00.000Z';
    target.decided_by = mode === 'owner' ? 'owner-id' : 'recipient-id';
    if (action === 'apply') { store.proposal.contentRevision = 2; target.applied_revision = 2; }
  },
  restoreAppliedChange: async (id) => {
    window.collaborationAction = `restore:${id}`;
    store.requests.find((item) => item.id === id)!.restored_at = new Date().toISOString();
  },
  saveWorkingCopy: async (_number, _version, _work, submit, note) => {
    window.collaborationAction = `send:${submit}:${note}`;
    request.status = 'submitted';
    return request.id;
  },
};

function Fixture() {
  const [current, setCurrent] = useState(store.proposal);
  const [sendSignal, setSendSignal] = useState(0);
  const [manageSignal, setManageSignal] = useState(0);
  if (mode === 'dashboard') {
    const shared: SharedProposal = { proposal: { ...current, sharedPermission: 'contribute' }, share, ownerName: 'Alex Owner', requestStatus: 'submitted' };
    const many = params.get('many') === '1';
    const owned = many ? Array.from({ length: 22 }, (_, index) => ({ ...current,
      proposalNumber: `TEST-FIXTURE-${index + 1}`,
      customerInfo: index === 0 ? current.customerInfo : { customerName: `Customer ${index + 1}` } })) : [current];
    const sharedRows = many ? owned.map((entry, index) => ({ ...shared,
      proposal: { ...entry, sharedPermission: 'contribute' as const },
      share: { ...share, id: `share-${index}`, proposal_number: entry.proposalNumber },
    })) : [shared];
    return <DashboardProposalsPanel proposals={owned} sharedProposals={sharedRows} collaborationEnabled
      sharedOwnedProposalNumbers={[current.proposalNumber]}
      sharedOwnedRecipients={{ [current.proposalNumber]: ['Jordan Designer', 'Taylor Admin'] }}
      collaborationUpdates={[...(params.has('opened') ? [{ id: 'old-read-share', proposal_number: current.proposalNumber,
        event_type: 'shared', actor_id: 'owner-id', request_id: null, note: null,
        created_at: '2026-09-22T12:00:00Z', read_at: '2026-09-22T13:00:00Z' }] : []), { id: 'event-0', proposal_number: current.proposalNumber,
        event_type: 'shared', actor_id: 'owner-id', request_id: null, note: null,
        created_at: '2026-09-23T12:00:00.000Z', read_at: localStorage.getItem('fixture-event-read') ? '2026-10-27T12:00:00Z' : null },
      { id: 'event-1', proposal_number: current.proposalNumber,
        event_type: 'changes_submitted', actor_id: 'recipient-id', request_id: 'request-1', note: null,
        created_at: '2026-09-23T12:00:00.000Z', read_at: null }]}
      loading={false} onCreateProposal={() => undefined} onDeleteProposal={() => undefined}
      onOpenProposal={() => { window.collaborationAction = 'open-proposal'; }} />;
  }
  return <div className={params.get('rail') === '1' ? 'proposal-column proposal-column--side' : undefined}
    style={{ maxWidth: params.get('rail') === '1' ? 340 : mode === 'owner' ? 740 : 440, margin: '2rem auto', isolation: 'isolate' }}>
    {mode === 'owner' && <div className="view-actions"><button onClick={() => setManageSignal((value) => value + 1)}>Share / Manage Access</button></div>}
    {mode === 'recipient' && params.get('working') && <button onClick={() => setSendSignal((value) => value + 1)}>Send changes from summary</button>}
    <ProposalCollaborationPanel
    proposal={{ ...current, sharedPermission: mode === 'owner' ? undefined : share.permission }}
    available api={api} onLeft={() => { window.location.href = '?mode=dashboard'; }} onChanged={() => setCurrent({ ...store.proposal })}
    manageSignal={manageSignal} sendSignal={sendSignal} sendVersionId="original" />
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Fixture />);
