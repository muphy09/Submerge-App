import { useEffect, useState } from 'react';
import type { Proposal } from '../types/proposal-new';
import { getSharedProposal } from '../services/proposalCollaboration';
import { buildPricingRevisionComparison } from '../services/pricingRevisionReview';
import { isVersionPermanentlyLocked } from '../services/proposalWorkflow';
import { captureProposalContext, assertProposalContext } from '../services/proposalContext';
import './SharedPricingRevisionNotice.css';

// Advisory only: never adopts pricing, updates the pricing store, or saves.
export default function SharedPricingRevisionNotice({ proposal }: { proposal: Partial<Proposal> }) {
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!proposal.sharedPermission || !proposal.proposalNumber) return;
    let cancelled = false;
    const context = captureProposalContext();
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const shared = await getSharedProposal(proposal.proposalNumber!);
        assertProposalContext(context);
        if (!shared) { if (!cancelled) setMessage('Shared access could not be confirmed. Reopen this proposal before continuing.'); return; }
        const current = [shared.proposal, ...(shared.proposal.versions || [])]
          .find(version => (version.versionId || 'original') === (proposal.versionId || 'original'));
        if (!current || isVersionPermanentlyLocked(current)) { if (!cancelled) setMessage(''); return; }
        if (current.pricingModelRevisionId !== proposal.pricingModelRevisionId) {
          if (!cancelled) setMessage('The owner changed the pricing revision. Your proposed edits are preserved and will be reviewed using the owner’s chosen pricing.');
          return;
        }
        const comparison = await buildPricingRevisionComparison(current);
        assertProposalContext(context);
        const pending = comparison && !comparison.specificationOnly
          && current.pricingRevisionReview?.latestRevisionId !== comparison.latestRevisionId;
        if (!cancelled) setMessage(pending || current.pricingRevisionReview?.decision === 'pending'
          ? 'A pricing model revision is awaiting owner review. Only the owner can accept or decline it. You can continue proposing changes using the saved pricing.' : '');
      } catch {
        if (!cancelled && context === captureProposalContext()) setMessage('Pricing revision status could not be checked. Your copy keeps its saved pricing; reconnect to refresh the status.');
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [proposal.proposalNumber, proposal.versionId, proposal.pricingModelRevisionId, proposal.sharedPermission]);
  return message ? <div className="shared-pricing-revision-notice no-print" role="status">{message}</div> : null;
}
