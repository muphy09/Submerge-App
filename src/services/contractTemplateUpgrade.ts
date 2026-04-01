import { Proposal } from '../types/proposal-new';

export const CURRENT_CONTRACT_TEMPLATE_REVISION = '2026-04-01-additional-features-v1';

const CONTRACT_TEMPLATE_RESET_FIELD_IDS = ['p2_82', 'p2_83', 'p2_84', 'p2_85', 'p2_86', 'p2_87', 'p2_88', 'p2_89'] as const;

function sanitizeContractOverridesForCurrentRevision(overrides?: Proposal['contractOverrides']) {
  if (!overrides) return overrides;

  let changed = false;
  const nextOverrides = { ...overrides };

  for (const fieldId of CONTRACT_TEMPLATE_RESET_FIELD_IDS) {
    if (!Object.prototype.hasOwnProperty.call(nextOverrides, fieldId)) continue;
    delete nextOverrides[fieldId];
    changed = true;
  }

  return changed ? nextOverrides : overrides;
}

export function upgradeProposalContractTemplateRevision(proposal: Proposal): Proposal {
  const revisionAlreadyCurrent = proposal.contractTemplateRevision === CURRENT_CONTRACT_TEMPLATE_REVISION;
  const nextOverrides = revisionAlreadyCurrent
    ? proposal.contractOverrides
    : sanitizeContractOverridesForCurrentRevision(proposal.contractOverrides);
  const nextVersions = (proposal.versions || []).map((version) => upgradeProposalContractTemplateRevision(version));
  const versionsChanged = nextVersions.some((version, index) => version !== (proposal.versions || [])[index]);
  const overridesChanged = nextOverrides !== proposal.contractOverrides;

  if (revisionAlreadyCurrent && !versionsChanged && !overridesChanged) {
    return proposal;
  }

  return {
    ...proposal,
    contractTemplateRevision: CURRENT_CONTRACT_TEMPLATE_REVISION,
    ...(proposal.contractOverrides !== undefined || overridesChanged ? { contractOverrides: nextOverrides } : {}),
    ...(proposal.versions ? { versions: nextVersions } : {}),
  };
}
