import MasterPricingEngine from './masterPricingEngine';
import {
  loadPricingModel,
  type LoadedPricingModel,
} from './pricingModelsAdapter';
import {
  loadPricingSnapshotForFranchise,
  withTemporaryPricingSnapshot,
} from './pricingDataStore';
import { getWorkflowStatus, isVersionPermanentlyLocked } from './proposalWorkflow';
import { normalizePricingTierId } from './pricingTiers';
import type { CostBreakdown, CostLineItem, Proposal, ProposalWorkflowActor } from '../types/proposal-new';

export type PricingRevisionComparisonRow = {
  key: string;
  category: string;
  label: string;
  quantity: number;
  beforeAmount: number;
  afterAmount: number;
  beforeUnitAmount: number;
  afterUnitAmount: number;
  direction: 'increase' | 'decrease';
};

export type PricingRevisionComparison = {
  pricingModelId: string;
  pricingModelName: string;
  pinnedRevisionId: string;
  pinnedRevisionNumber: number | null;
  latestRevisionId: string;
  latestRevisionNumber: number | null;
  rows: PricingRevisionComparisonRow[];
  affectsProposal: boolean;
};

const CURRENCY_EPSILON = 0.005;

function roundCurrency(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
}

function flattenCostBreakdown(costBreakdown?: CostBreakdown | null) {
  const rows: Array<{ section: string; item: CostLineItem; occurrence: number }> = [];
  if (!costBreakdown) return rows;
  Object.entries(costBreakdown).forEach(([section, value]) => {
    if (!Array.isArray(value)) return;
    const occurrences = new Map<string, number>();
    value.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const identity = `${String(item.category || section).trim()}::${String(item.description || '').trim()}`;
      const occurrence = occurrences.get(identity) || 0;
      occurrences.set(identity, occurrence + 1);
      rows.push({ section, item, occurrence });
    });
  });
  return rows;
}

function lineItemKey(section: string, item: CostLineItem, occurrence: number) {
  return [section, item.category || '', item.description || '', occurrence]
    .map((value) => String(value).trim().toLowerCase())
    .join('::');
}

function compareCostBreakdowns(before?: CostBreakdown | null, after?: CostBreakdown | null) {
  const beforeMap = new Map(
    flattenCostBreakdown(before).map(({ section, item, occurrence }) => [
      lineItemKey(section, item, occurrence),
      { section, item, occurrence },
    ])
  );
  const afterMap = new Map(
    flattenCostBreakdown(after).map(({ section, item, occurrence }) => [
      lineItemKey(section, item, occurrence),
      { section, item, occurrence },
    ])
  );
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const rows: PricingRevisionComparisonRow[] = [];

  keys.forEach((key) => {
    const beforeEntry = beforeMap.get(key);
    const afterEntry = afterMap.get(key);
    const beforeItem = beforeEntry?.item;
    const afterItem = afterEntry?.item;
    const beforeAmount = roundCurrency(beforeItem?.total);
    const afterAmount = roundCurrency(afterItem?.total);
    if (Math.abs(afterAmount - beforeAmount) < CURRENCY_EPSILON) return;
    const item = afterItem || beforeItem;
    if (!item) return;
    rows.push({
      key,
      category: String(item.category || afterEntry?.section || beforeEntry?.section || 'Pricing'),
      label: String(item.description || item.category || 'Pricing item'),
      quantity: Number(afterItem?.quantity ?? beforeItem?.quantity) || 0,
      beforeAmount,
      afterAmount,
      beforeUnitAmount: roundCurrency(beforeItem?.unitPrice),
      afterUnitAmount: roundCurrency(afterItem?.unitPrice),
      direction: afterAmount > beforeAmount ? 'increase' : 'decrease',
    });
  });

  return rows.sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}

async function calculateWithModel(proposal: Proposal, model: LoadedPricingModel) {
  const snapshot = await loadPricingSnapshotForFranchise(
    proposal.franchiseId,
    proposal.pricingModelId,
    proposal.pricingModelFranchiseId,
    normalizePricingTierId(proposal.pricingTierId || proposal.pricingTierName),
    model.revisionId || undefined
  );
  return withTemporaryPricingSnapshot(snapshot.pricing, () =>
    MasterPricingEngine.calculateCompleteProposal(proposal, proposal.papDiscounts)
  );
}

export async function buildPricingRevisionComparison(
  proposal: Proposal
): Promise<PricingRevisionComparison | null> {
  if (!proposal.pricingModelId || !proposal.pricingModelRevisionId) return null;
  const franchiseId = proposal.pricingModelFranchiseId || proposal.franchiseId || 'default';
  const [pinned, latest] = await Promise.all([
    loadPricingModel(franchiseId, proposal.pricingModelId, proposal.pricingModelRevisionId),
    loadPricingModel(franchiseId, proposal.pricingModelId),
  ]);
  if (!pinned?.revisionId || !latest?.revisionId || pinned.revisionId === latest.revisionId) return null;

  const [before, after] = await Promise.all([
    calculateWithModel(proposal, pinned),
    calculateWithModel(proposal, latest),
  ]);
  const rows = compareCostBreakdowns(before.costBreakdown, after.costBreakdown);
  const beforeRetail = roundCurrency(before.pricing?.retailPrice ?? before.totalCost);
  const afterRetail = roundCurrency(after.pricing?.retailPrice ?? after.totalCost);
  const retailDifference = roundCurrency(afterRetail - beforeRetail);
  if (rows.length === 0 && Math.abs(retailDifference) >= CURRENCY_EPSILON) {
    rows.push({
      key: 'pricing-formula-adjustment',
      category: 'Pricing calculation',
      label: 'Pricing formula adjustment',
      quantity: 1,
      beforeAmount: retailDifference < 0 ? Math.abs(retailDifference) : 0,
      afterAmount: retailDifference > 0 ? retailDifference : 0,
      beforeUnitAmount: retailDifference < 0 ? Math.abs(retailDifference) : 0,
      afterUnitAmount: retailDifference > 0 ? retailDifference : 0,
      direction: retailDifference > 0 ? 'increase' : 'decrease',
    });
  }
  return {
    pricingModelId: proposal.pricingModelId,
    pricingModelName: proposal.pricingModelName || latest.pricingModelName || 'Pricing Model',
    pinnedRevisionId: pinned.revisionId,
    pinnedRevisionNumber: pinned.revisionNumber || proposal.pricingModelRevisionNumber || null,
    latestRevisionId: latest.revisionId,
    latestRevisionNumber: latest.revisionNumber || null,
    rows,
    affectsProposal: rows.length > 0,
  };
}

export function hasDeclinedPricingRevision(
  proposal: Proposal,
  comparison: PricingRevisionComparison
) {
  return (
    proposal.pricingRevisionReview?.decision === 'declined' &&
    proposal.pricingRevisionReview.latestRevisionId === comparison.latestRevisionId
  );
}

export function markPricingRevisionDeclined(
  proposal: Proposal,
  comparison: PricingRevisionComparison,
  actor?: ProposalWorkflowActor | null
): Proposal {
  return {
    ...proposal,
    pricingRevisionReview: {
      latestRevisionId: comparison.latestRevisionId,
      latestRevisionNumber: comparison.latestRevisionNumber,
      decision: 'declined',
      detectedAt: proposal.pricingRevisionReview?.detectedAt || new Date().toISOString(),
      decidedAt: new Date().toISOString(),
      decidedBy: actor || null,
      underlyingStatus:
        proposal.pricingRevisionReview?.underlyingStatus || getWorkflowStatus(proposal),
    },
  };
}

export function markPricingRevisionPending(
  proposal: Proposal,
  comparison: PricingRevisionComparison
): Proposal {
  if (isVersionPermanentlyLocked(proposal)) return proposal;
  if (
    proposal.pricingRevisionReview?.latestRevisionId === comparison.latestRevisionId &&
    proposal.pricingRevisionReview.decision !== 'pending'
  ) {
    return proposal;
  }
  return {
    ...proposal,
    pricingRevisionReview: {
      latestRevisionId: comparison.latestRevisionId,
      latestRevisionNumber: comparison.latestRevisionNumber,
      decision: comparison.affectsProposal ? 'pending' : 'not_affected',
      detectedAt: new Date().toISOString(),
      underlyingStatus: getWorkflowStatus(proposal),
    },
  };
}

export async function upgradeProposalPricingRevision(
  proposal: Proposal,
  comparison: PricingRevisionComparison,
  actor?: ProposalWorkflowActor | null
): Promise<Proposal> {
  if (isVersionPermanentlyLocked(proposal)) {
    throw new Error('Signed proposals cannot change pricing revisions. Create an addendum instead.');
  }
  const franchiseId = proposal.pricingModelFranchiseId || proposal.franchiseId || 'default';
  const latest = await loadPricingModel(
    franchiseId,
    comparison.pricingModelId,
    comparison.latestRevisionId
  );
  if (!latest?.revisionId) throw new Error('The latest pricing revision is unavailable.');
  const recalculated = await calculateWithModel(proposal, latest);
  const currentStatus = getWorkflowStatus(proposal);
  const needsReapproval = comparison.affectsProposal && currentStatus === 'approved';
  const nextStatus = needsReapproval ? 'needs_approval' : currentStatus;
  return {
    ...proposal,
    pricingModelRevisionId: latest.revisionId,
    pricingModelRevisionNumber: latest.revisionNumber || undefined,
    pricingRevisionReview: {
      latestRevisionId: latest.revisionId,
      latestRevisionNumber: latest.revisionNumber || null,
      decision: 'upgraded',
      detectedAt: proposal.pricingRevisionReview?.detectedAt || new Date().toISOString(),
      decidedAt: new Date().toISOString(),
      decidedBy: actor || null,
      underlyingStatus: currentStatus,
    },
    status: nextStatus,
    workflow: proposal.workflow
      ? {
          ...proposal.workflow,
          status: nextStatus,
          needsApproval: needsReapproval ? true : proposal.workflow.needsApproval,
          approved: needsReapproval ? false : proposal.workflow.approved,
          reviewVersionId: needsReapproval
            ? proposal.versionId || proposal.activeVersionId || 'original'
            : proposal.workflow.reviewVersionId,
        }
      : proposal.workflow,
    costBreakdown: recalculated.costBreakdown,
    pricing: recalculated.pricing,
    subtotal: recalculated.subtotal,
    taxRate: recalculated.taxRate,
    taxAmount: recalculated.taxAmount,
    totalCost: recalculated.totalCost,
    lastModified: new Date().toISOString(),
  };
}
