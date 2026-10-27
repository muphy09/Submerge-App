import type { Proposal } from '../types/proposal-new';
import { getOffContractTotal } from './customOptions';
import { createVersionFromProposal, listAllVersions, upsertVersionInContainer } from './proposalVersions';
import {
  getLatestSignedBaselineVersionId,
  getSignedVersionId,
  getVersionRecordStatus,
  getWorkflowStatus,
  hasVersionSubmissionHistory,
  isVersionPermanentlyLocked,
  resetWorkflowAfterVersionEdit,
} from '../services/proposalWorkflow';

export function getSavedOffContractTotal(proposal: Partial<Proposal>): number {
  const saved = Number(proposal.pricing?.offContractTotal);
  if (Number.isFinite(saved) && saved > 0) return saved;
  const breakdown = proposal.costBreakdown;
  return getOffContractTotal(proposal, [
    ...(breakdown?.copingDeckingLabor || []),
    ...(breakdown?.copingDeckingMaterial || []),
  ]);
}

/** Existing saved prices were inclusive. Keep them until an editable version is explicitly corrected. */
export function needsOffContractSeparation(proposal: Partial<Proposal>): boolean {
  if (proposal.pricing?.offContractSeparated === true) return false;
  const retail = Number(proposal.pricing?.retailPrice ?? proposal.totalCost);
  return Number.isFinite(retail) && retail > 0 && getSavedOffContractTotal(proposal) > 0;
}

export function applyOffContractSeparation(
  container: Proposal,
  source: Proposal
): { container: Proposal; correctedVersion: Proposal; createdVersion: boolean } {
  if (!needsOffContractSeparation(source) || !source.pricing) {
    throw new Error('This version does not have saved Off-Contract pricing to correct.');
  }
  const offContractTotal = getSavedOffContractTotal(source);
  const savedRetail = Number(source.pricing.retailPrice ?? source.totalCost);
  const savedTotal = Number(source.totalCost ?? savedRetail);
  if (savedRetail < offContractTotal || savedTotal < offContractTotal) {
    throw new Error('The saved contract amount is smaller than its Off-Contract total. Review this version before correcting it.');
  }
  const sourceVersionId = source.versionId || container.activeVersionId || container.versionId || 'original';
  const signedBaseline = Boolean(
    getSignedVersionId(container) &&
    getWorkflowStatus(container) === 'signed' &&
    getLatestSignedBaselineVersionId(container) === sourceVersionId
  );
  if (isVersionPermanentlyLocked(source) && !signedBaseline) {
    throw new Error('This version is locked and cannot be corrected.');
  }
  const signedAddendumCount = container.workflow?.signedAddendumVersionIds?.length || 0;
  const created = signedBaseline
    ? createVersionFromProposal(
        container,
        { mode: 'copy', sourceVersionId },
        `Proposal Addendum ${signedAddendumCount + 1}`
      )
    : null;
  const now = new Date().toISOString();
  const contractOverrides = { ...(source.contractOverrides || {}) };
  // Recalculate the cash-price field and installments from the corrected total.
  delete contractOverrides.p1_7;
  delete contractOverrides.p1_pay_excavation;
  delete contractOverrides.p1_pay_shotcete;
  delete contractOverrides.p1_pay_decking;
  delete contractOverrides.p1_pay_interior_finish;
  const correctedVersion: Proposal = {
    ...(created?.newVersion || source),
    ...(created ? { versionSourceId: sourceVersionId, status: 'draft' as const } : {}),
    contractOverrides,
    costBreakdown: source.costBreakdown,
    pricing: {
      ...source.pricing,
      retailPrice: savedRetail - offContractTotal,
      offContractTotal,
      offContractSeparated: true,
      manualAdjustmentsTotal: source.pricing.manualAdjustmentsTotal === undefined
        ? undefined
        : source.pricing.manualAdjustmentsTotal - offContractTotal,
    },
    subtotal: source.subtotal,
    taxRate: source.taxRate,
    taxAmount: source.taxAmount,
    totalCost: savedTotal - offContractTotal,
    lastModified: now,
    versions: [],
  };
  const next = upsertVersionInContainer(
    created?.container || container,
    correctedVersion,
    created ? correctedVersion.versionId : container.activeVersionId
  );
  const recordStatus = getVersionRecordStatus(source);
  const needsResubmission = !created && (
    recordStatus === 'submitted' || recordStatus === 'needs_approval' ||
    recordStatus === 'approved' || hasVersionSubmissionHistory(container, sourceVersionId)
  );
  const updated = needsResubmission
    ? resetWorkflowAfterVersionEdit(next, sourceVersionId)
    : next;
  return {
    container: {
      ...updated,
      lastModified: now,
    },
    correctedVersion: listAllVersions(updated).find(
      (entry) => (entry.versionId || 'original') === (correctedVersion.versionId || 'original')
    ) || correctedVersion,
    createdVersion: signedBaseline,
  };
}
