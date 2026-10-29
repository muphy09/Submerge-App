import type { Proposal } from '../types/proposal-new';
import { isCurrentPricingEngineProposal } from './pricingEngineCompatibility';

export function collaborationVersionBlockedReason(proposal: Proposal): string | null {
  if (!isCurrentPricingEngineProposal(proposal) || proposal.calculationProfile
    || Number(proposal.historicalPricingAdjustment || 0) !== 0) {
    return 'Legacy proposal versions cannot be shared or edited through collaboration.';
  }
  if (!proposal.pricingModelId || !proposal.pricingModelRevisionId) {
    return 'Sharing requires a saved pricing model and pricing revision for every version.';
  }
  return null;
}

export function collaborationSharingBlockedReason(proposal: Proposal): string | null {
  // Inspect raw snapshots: inheriting the active version's pins can conceal legacy versions.
  for (const version of [proposal, ...(proposal.versions || [])]) {
    const reason = collaborationVersionBlockedReason(version);
    if (reason) return `${version.versionName || version.versionId || 'Original'}: ${reason}`;
  }
  return null;
}

export function assertCollaborativeVersion(proposal: Proposal) {
  const reason = collaborationVersionBlockedReason(proposal);
  if (reason) throw new Error(reason);
}
