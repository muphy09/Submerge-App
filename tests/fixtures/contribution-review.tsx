import React from 'react';
import ReactDOM from 'react-dom/client';
import ProposalCollaborationPanel, { collaborationPanelApi } from '../../src/components/ProposalCollaborationPanel';
import { prepareContribution } from '../../src/services/collaborationPricing';
import '../../src/index.css';

// Test-supplied, credential-free documents. No app data or database writes.
const data = JSON.parse(localStorage.getItem('contribution-review-fixture')!);
localStorage.setItem('submerge-user-session', JSON.stringify({ userId: data.owner.designerAuthUserId,
  franchiseId: data.owner.franchiseId, role: 'designer' }));
const request = { id: 'preservation-request', proposal_number: data.owner.proposalNumber,
  target_version_id: data.owner.versionId || 'original', contributor_id: 'contributor',
  base_version_json: data.baseline, working_version_json: data.work, status: 'submitted',
  updated_at: '2026-10-27T21:00:00Z', created_at: '2026-10-27T20:00:00Z' } as any;
const api: typeof collaborationPanelApi = {
  ...collaborationPanelApi,
  listProposalShares: async () => [], listChangeRequests: async () => [request],
  listProposalPeople: async () => [{ user_id: 'contributor', display_name: 'Contributor', email: 'contributor@playwright.invalid' }],
  prepareChangeRequest: async (_id, resolutions) => {
    const result = await prepareContribution(request, data.owner, resolutions);
    (window as any).preparedContribution = result;
    return result;
  },
  applyChangeRequest: async (_id, prepared) => { (window as any).appliedContribution = prepared.after; request.status = 'applied'; },
};
ReactDOM.createRoot(document.getElementById('root')!).render(<ProposalCollaborationPanel
  proposal={data.owner} available api={api} onChanged={() => undefined} />);
