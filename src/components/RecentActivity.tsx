import { useMemo } from 'react';
import type { Proposal } from '../types/proposal-new';
import { getRecentActivityProposals } from '../services/recentProposalActivity';
import type { CollaborationEvent, SharedProposal } from '../services/proposalCollaboration';
import { getCollaborationNotifications } from '../utils/collaborationNotifications';
import ProposalSharingIndicator from './ProposalSharingIndicator';

type RecentActivityProps = {
  proposals: Proposal[];
  sharedProposals?: SharedProposal[];
  sharedOwnedProposalNumbers?: string[];
  sharedOwnedRecipients?: Record<string, string[]>;
  collaborationUpdates?: CollaborationEvent[];
  loading: boolean;
  userId?: string | null;
  franchiseId?: string | null;
  onOpenProposal: (proposalNumber: string) => void;
};

function getDisplayText(value: unknown, fallback: string) {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function getDashboardStatus(proposal: Proposal) {
  const status = String(proposal.status || 'draft').trim().toLowerCase();
  const needsPricingReview =
    proposal.pricingRevisionReview?.decision === 'pending' &&
    status !== 'draft' &&
    status !== 'signed' &&
    status !== 'completed';
  return needsPricingReview ? 'user_review' : status;
}

function formatStatusLabel(status: string) {
  if (status === 'changes_requested') return 'Returned';
  if (status === 'user_review') return 'User Review*';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatModifiedDate(proposal: Proposal) {
  const value = proposal.lastModified || proposal.createdDate;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
}

function RecentActivity({
  proposals,
  loading,
  userId,
  franchiseId,
  onOpenProposal,
  sharedProposals = [], sharedOwnedProposalNumbers = [], sharedOwnedRecipients = {}, collaborationUpdates = [],
}: RecentActivityProps) {
  const recentProposals = useMemo(
    () => getRecentActivityProposals(proposals, { userId, franchiseId }, 4),
    [franchiseId, proposals, userId]
  );

  const sharedByNumber = new Map(sharedProposals.map(entry => [entry.proposal.proposalNumber, entry]));
  const ownedShared = new Set(sharedOwnedProposalNumbers);
  const { newShares, reviews } = getCollaborationNotifications(collaborationUpdates);
  return (
    <section className="recent-activity-section" aria-labelledby="recent-activity-title">
      <h1 id="recent-activity-title">Recent Activity</h1>
      <div className="recent-activity-grid">
        {loading
          ? Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="recent-activity-card recent-activity-card-skeleton"
                aria-hidden="true"
              >
                <span />
                <span />
                <span />
              </div>
            ))
          : recentProposals.map((proposal) => {
              const status = getDashboardStatus(proposal);
              const customerName = getDisplayText(
                proposal.customerInfo?.customerName,
                'Untitled Proposal'
              );

              return (
                <button
                  key={proposal.proposalNumber}
                  type="button"
                  className="recent-activity-card"
                  onClick={() => onOpenProposal(proposal.proposalNumber)}
                  aria-label={`Open ${customerName}`}
                >
                  <span className="recent-activity-heading">
                    <span className="recent-activity-name">{customerName}</span>
                    <span className="recent-activity-indicators">
                      {sharedByNumber.has(proposal.proposalNumber) ? <ProposalSharingIndicator recipient
                        tooltip={`Shared by ${sharedByNumber.get(proposal.proposalNumber)!.ownerName}`} />
                        : ownedShared.has(proposal.proposalNumber) && <ProposalSharingIndicator
                          tooltip={`Shared with ${sharedOwnedRecipients[proposal.proposalNumber]?.join(', ') || 'collaborators'}`} />}
                      {((sharedByNumber.has(proposal.proposalNumber) && newShares.has(proposal.proposalNumber))
                        || (ownedShared.has(proposal.proposalNumber) && reviews.has(proposal.proposalNumber))) &&
                        <span className="dashboard-attention-dot" role="img" aria-label={sharedByNumber.has(proposal.proposalNumber)
                          ? 'New shared proposal' : 'Changes awaiting review'} />}
                    </span>
                  </span>
                  <span className={`recent-activity-status is-${status.replace(/_/g, '-')}`}>
                    {formatStatusLabel(status)}
                  </span>
                  <span className="recent-activity-date">
                    <span>Last Modified</span>
                    {formatModifiedDate(proposal)}
                  </span>
                </button>
              );
            })}

        {!loading && recentProposals.length === 0 && (
          <div className="recent-activity-empty">
            Recent proposals will appear here after they are created.
          </div>
        )}
      </div>
    </section>
  );
}

export default RecentActivity;
