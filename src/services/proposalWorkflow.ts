import {
  type Proposal,
  type ProposalActorRole,
  type ProposalWorkflowActor,
  type ProposalWorkflowEvent,
  type ProposalWorkflowReason,
  type ProposalWorkflowState,
  type ProposalWorkflowStatus,
} from '../types/proposal-new';
import {
  getSessionApprovalMarginThreshold,
  getSessionAlwaysRequireApproval,
  getSessionDiscountAllowanceThreshold,
  readSession,
  type UserSession,
} from './session';
import { listAllVersions, ORIGINAL_VERSION_ID } from '../utils/proposalVersions';

export type SubmissionRequest = {
  manualReviewRequested?: boolean;
  message?: string;
};

export type VersionDiffSummary = {
  reviewVersionId: string;
  compareVersionId?: string | null;
  reviewVersionName: string;
  compareVersionName?: string | null;
  changedSections: string[];
  retailDelta: number;
  costDelta: number;
  grossProfitDelta: number;
  grossMarginDelta: number;
  discountDelta: number;
  contractOverrideDelta: number;
  noteIndicator: boolean;
};

const WORKFLOW_SECTION_KEYS: Array<keyof Proposal> = [
  'customerInfo',
  'poolSpecs',
  'excavation',
  'plumbing',
  'electrical',
  'tileCopingDecking',
  'drainage',
  'equipment',
  'waterFeatures',
  'customFeatures',
  'masonry',
  'interiorFinish',
  'manualAdjustments',
  'retailAdjustments',
  'contractOverrides',
  'warrantySections',
];

const SECTION_LABELS: Partial<Record<keyof Proposal, string>> = {
  customerInfo: 'Customer',
  poolSpecs: 'Pool Specs',
  excavation: 'Excavation',
  plumbing: 'Plumbing',
  electrical: 'Gas / Electrical',
  tileCopingDecking: 'Tile / Coping / Decking',
  drainage: 'Drainage',
  equipment: 'Equipment',
  waterFeatures: 'Water Features',
  customFeatures: 'Custom Features',
  masonry: 'Masonry',
  interiorFinish: 'Interior Finish',
  manualAdjustments: 'Manual Adjustments',
  retailAdjustments: 'Retail Adjustments',
  contractOverrides: 'Contract Overrides',
  warrantySections: 'Warranty',
};

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value?: string | null) {
  return String(value || '').trim();
}

function normalizeRole(value?: string | null): ProposalActorRole {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'master') return 'master';
  if (normalized === 'owner') return 'owner';
  if (normalized === 'admin') return 'admin';
  if (normalized === 'bookkeeper') return 'bookkeeper';
  return 'designer';
}

function toFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function deepEqualComparable(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function getCurrentSession(session?: UserSession | null) {
  return session ?? readSession();
}

export function buildWorkflowActor(session?: UserSession | null): ProposalWorkflowActor {
  const current = getCurrentSession(session);
  return {
    userId: current?.userId,
    name: current?.userName || current?.userEmail || 'User',
    email: current?.userEmail || null,
    role: normalizeRole(current?.role),
  };
}

function normalizeHistory(history?: ProposalWorkflowEvent[] | null) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      ...entry,
      id: entry.id || randomId('workflow'),
      createdAt: entry.createdAt || nowIso(),
      readByUserIds: Array.isArray(entry.readByUserIds) ? entry.readByUserIds.filter(Boolean) : [],
    }));
}

export function getWorkflowStatus(proposal?: Partial<Proposal> | null): ProposalWorkflowStatus {
  const status = normalizeText(proposal?.workflow?.status || proposal?.status).toLowerCase();
  if (status === 'submitted') return 'submitted';
  if (status === 'needs_approval') return 'needs_approval';
  if (status === 'changes_requested') return 'changes_requested';
  if (status === 'completed') return 'completed';
  return 'draft';
}

export function ensureProposalWorkflow(proposal: Proposal): Proposal {
  const rawStatus = normalizeText(proposal.status).toLowerCase();
  const hasWorkflowState = Boolean(
    proposal.workflow &&
      (
        proposal.workflow.status ||
        proposal.workflow.reviewVersionId ||
        proposal.workflow.submittedAt ||
        (proposal.workflow.history && proposal.workflow.history.length > 0)
      )
  );
  const shouldResetLegacySubmittedProposal =
    !hasWorkflowState &&
    (rawStatus === 'submitted' || rawStatus === 'approved' || rawStatus === 'rejected');
  const normalizedStatus = shouldResetLegacySubmittedProposal ? 'draft' : getWorkflowStatus(proposal);
  const workflow = proposal.workflow || ({} as ProposalWorkflowState);
  const history = normalizeHistory(workflow.history);
  return {
    ...proposal,
    status: normalizedStatus,
    versionLocked: shouldResetLegacySubmittedProposal ? false : proposal.versionLocked === true,
    versionLockedAt: shouldResetLegacySubmittedProposal ? null : proposal.versionLockedAt || null,
    versionSubmittedAt: shouldResetLegacySubmittedProposal ? null : proposal.versionSubmittedAt || null,
    versionSubmittedBy: shouldResetLegacySubmittedProposal ? null : proposal.versionSubmittedBy || null,
    workflow: {
      status: normalizedStatus,
      reviewVersionId: shouldResetLegacySubmittedProposal
        ? proposal.activeVersionId || proposal.versionId || ORIGINAL_VERSION_ID
        : workflow.reviewVersionId || workflow.submittedVersionId || proposal.activeVersionId || proposal.versionId || ORIGINAL_VERSION_ID,
      submittedVersionId: shouldResetLegacySubmittedProposal
        ? null
        : workflow.submittedVersionId || workflow.reviewVersionId || proposal.activeVersionId || proposal.versionId || ORIGINAL_VERSION_ID,
      submittedAt: shouldResetLegacySubmittedProposal ? null : workflow.submittedAt || null,
      submittedBy: shouldResetLegacySubmittedProposal ? null : workflow.submittedBy || null,
      manualReviewRequested: shouldResetLegacySubmittedProposal ? false : workflow.manualReviewRequested === true,
      manualReviewMessage: shouldResetLegacySubmittedProposal ? null : workflow.manualReviewMessage || null,
      needsApproval: shouldResetLegacySubmittedProposal ? false : workflow.needsApproval === true || normalizedStatus === 'needs_approval',
      approvalReasons: shouldResetLegacySubmittedProposal ? [] : Array.isArray(workflow.approvalReasons) ? workflow.approvalReasons : [],
      approved: shouldResetLegacySubmittedProposal ? false : workflow.approved === true,
      approvedAt: shouldResetLegacySubmittedProposal ? null : workflow.approvedAt || null,
      approvedBy: shouldResetLegacySubmittedProposal ? null : workflow.approvedBy || null,
      completedAt: shouldResetLegacySubmittedProposal ? null : workflow.completedAt || null,
      completedBy: shouldResetLegacySubmittedProposal ? null : workflow.completedBy || null,
      history: shouldResetLegacySubmittedProposal ? [] : history,
    },
  };
}

export function getReviewVersionId(proposal?: Partial<Proposal> | null) {
  return (
    proposal?.workflow?.reviewVersionId ||
    proposal?.workflow?.submittedVersionId ||
    proposal?.activeVersionId ||
    proposal?.versionId ||
    ORIGINAL_VERSION_ID
  );
}

export function getReviewVersion(proposal: Proposal): Proposal | null {
  const normalized = ensureProposalWorkflow(proposal);
  const reviewVersionId = getReviewVersionId(normalized);
  return (
    listAllVersions(normalized).find((entry) => (entry.versionId || ORIGINAL_VERSION_ID) === reviewVersionId) ||
    null
  );
}

export function isSubmittedVersionLocked(proposal?: Partial<Proposal> | null) {
  return proposal?.versionLocked === true || Boolean(proposal?.versionSubmittedAt);
}

export function canCreateReplacementVersion(proposal?: Partial<Proposal> | null) {
  return getWorkflowStatus(proposal) !== 'completed';
}

function createWorkflowEvent(
  type: ProposalWorkflowEvent['type'],
  actor: ProposalWorkflowActor,
  options?: {
    message?: string;
    versionId?: string;
    fromStatus?: ProposalWorkflowStatus | null;
    toStatus?: ProposalWorkflowStatus | null;
    metadata?: Record<string, unknown>;
  }
): ProposalWorkflowEvent {
  return {
    id: randomId('workflow'),
    type,
    createdAt: nowIso(),
    actor,
    message: normalizeText(options?.message) || undefined,
    versionId: options?.versionId,
    fromStatus: options?.fromStatus ?? null,
    toStatus: options?.toStatus ?? null,
    metadata: options?.metadata,
    readByUserIds: actor.userId ? [actor.userId] : [],
  };
}

function mergeVersionsIntoContainer(
  container: Proposal,
  versions: Proposal[],
  activeVersionId?: string | null,
  nextStatus?: ProposalWorkflowStatus,
  nextWorkflow?: ProposalWorkflowState
): Proposal {
  const desiredActiveVersionId =
    activeVersionId || container.activeVersionId || container.versionId || ORIGINAL_VERSION_ID;
  const active =
    versions.find((entry) => (entry.versionId || ORIGINAL_VERSION_ID) === desiredActiveVersionId) ||
    versions[0];
  const others = versions.filter(
    (entry) => (entry.versionId || ORIGINAL_VERSION_ID) !== (active?.versionId || ORIGINAL_VERSION_ID)
  );

  return ensureProposalWorkflow({
    ...(active || container),
    status: nextStatus || getWorkflowStatus(container),
    activeVersionId: desiredActiveVersionId,
    versions: others.map((entry) => ({ ...entry, versions: [] })),
    workflow: nextWorkflow || container.workflow,
  } as Proposal);
}

function getNonPapDiscountTotal(proposal: Partial<Proposal>) {
  const retailAdjustments = Array.isArray(proposal.retailAdjustments) ? proposal.retailAdjustments : [];
  const retailDiscountTotal = retailAdjustments.reduce((sum, adjustment) => {
    const amount = toFiniteNumber(adjustment?.amount);
    return amount < 0 ? sum + Math.abs(amount) : sum;
  }, 0);
  const manualAdjustments = proposal.manualAdjustments || ({} as Proposal['manualAdjustments']);
  const manualDiscountTotal =
    Math.abs(Math.min(0, toFiniteNumber((manualAdjustments as any).negative1))) +
    Math.abs(Math.min(0, toFiniteNumber((manualAdjustments as any).negative2)));
  return retailDiscountTotal + manualDiscountTotal;
}

export function collectApprovalReasons(
  proposal: Proposal,
  options?: SubmissionRequest,
  session?: UserSession | null
): ProposalWorkflowReason[] {
  const current = getCurrentSession(session);
  const reasons: ProposalWorkflowReason[] = [];
  const marginThreshold = Number.isFinite(Number(current?.approvalMarginThresholdPercent))
    ? Number(current?.approvalMarginThresholdPercent)
    : getSessionApprovalMarginThreshold();
  const discountThreshold = Number.isFinite(Number(current?.discountAllowanceThresholdPercent))
    ? Number(current?.discountAllowanceThresholdPercent)
    : getSessionDiscountAllowanceThreshold();
  const grossMargin = toFiniteNumber(proposal.pricing?.grossProfitMargin);
  const retailPrice = Math.max(toFiniteNumber(proposal.pricing?.retailPrice || proposal.totalCost), 0);
  const discountTotal = getNonPapDiscountTotal(proposal);
  const discountPercent = retailPrice > 0 ? (discountTotal / retailPrice) * 100 : 0;

  if (Number.isFinite(grossMargin) && grossMargin < marginThreshold) {
    reasons.push({
      code: 'margin_below_threshold',
      label: 'Gross margin is below the designer threshold',
      detail: `${grossMargin.toFixed(2)}% vs ${marginThreshold.toFixed(2)}% required`,
    });
  }

  if (Number.isFinite(discountPercent) && discountPercent > discountThreshold) {
    reasons.push({
      code: 'discount_above_allowance',
      label: 'Discount allowance is above the designer threshold',
      detail: `${discountPercent.toFixed(2)}% vs ${discountThreshold.toFixed(2)}% allowed`,
    });
  }

  if ((current?.alwaysRequireApproval ?? getSessionAlwaysRequireApproval()) === true) {
    reasons.push({
      code: 'always_require_approval',
      label: 'Designer is configured to always require approval',
    });
  }

  if (options?.manualReviewRequested) {
    reasons.push({
      code: 'manual_review',
      label: 'Designer requested manual review',
    });
  }

  return reasons;
}

export function submitProposalForWorkflow(
  proposal: Proposal,
  versionId: string,
  options?: SubmissionRequest,
  session?: UserSession | null
): Proposal {
  const normalized = ensureProposalWorkflow(proposal);
  const actor = buildWorkflowActor(session);
  const allVersions = listAllVersions(normalized).map((entry) => ({ ...entry, versions: [] }));
  const targetId = versionId || normalized.activeVersionId || normalized.versionId || ORIGINAL_VERSION_ID;
  const targetVersion =
    allVersions.find((entry) => (entry.versionId || ORIGINAL_VERSION_ID) === targetId) || allVersions[0];
  if (!targetVersion) {
    return normalized;
  }

  const reasons = collectApprovalReasons(targetVersion, options, session);
  const nextStatus: ProposalWorkflowStatus = reasons.length > 0 ? 'needs_approval' : 'submitted';
  const currentWorkflow = normalized.workflow as ProposalWorkflowState;
  const nextHistory = [
    ...normalizeHistory(currentWorkflow.history),
    createWorkflowEvent('submitted', actor, {
      message: options?.message,
      versionId: targetVersion.versionId || ORIGINAL_VERSION_ID,
      fromStatus: getWorkflowStatus(normalized),
      toStatus: nextStatus,
      metadata: {
        reasons,
        manualReviewRequested: options?.manualReviewRequested === true,
      },
    }),
  ];

  const updatedVersions = allVersions.map((entry) => {
    if ((entry.versionId || ORIGINAL_VERSION_ID) !== (targetVersion.versionId || ORIGINAL_VERSION_ID)) {
      return entry;
    }

    return {
      ...entry,
      status: nextStatus,
      versionLocked: true,
      versionLockedAt: nowIso(),
      versionSubmittedAt: nowIso(),
      versionSubmittedBy: actor,
    };
  });

  const nextWorkflow: ProposalWorkflowState = {
    ...currentWorkflow,
    status: nextStatus,
    reviewVersionId: targetVersion.versionId || ORIGINAL_VERSION_ID,
    submittedVersionId: targetVersion.versionId || ORIGINAL_VERSION_ID,
    submittedAt: nowIso(),
    submittedBy: actor,
    manualReviewRequested: options?.manualReviewRequested === true,
    manualReviewMessage: normalizeText(options?.message) || null,
    needsApproval: reasons.length > 0,
    approvalReasons: reasons,
    approved: false,
    approvedAt: null,
    approvedBy: null,
    history: nextHistory,
  };

  return mergeVersionsIntoContainer(
    normalized,
    updatedVersions,
    normalized.activeVersionId,
    nextStatus,
    nextWorkflow
  );
}

function updateReviewVersionStatus(proposal: Proposal, nextStatus: ProposalWorkflowStatus) {
  const reviewVersionId = getReviewVersionId(proposal);
  return listAllVersions(proposal).map((entry) => {
    if ((entry.versionId || ORIGINAL_VERSION_ID) !== reviewVersionId) {
      return { ...entry, versions: [] };
    }
    return {
      ...entry,
      status: nextStatus,
      versions: [],
    };
  });
}

function appendWorkflowEvent(
  proposal: Proposal,
  type: ProposalWorkflowEvent['type'],
  options: {
    message?: string;
    toStatus?: ProposalWorkflowStatus | null;
    metadata?: Record<string, unknown>;
  },
  session?: UserSession | null
) {
  const normalized = ensureProposalWorkflow(proposal);
  const actor = buildWorkflowActor(session);
  const workflow = normalized.workflow as ProposalWorkflowState;
  const event = createWorkflowEvent(type, actor, {
    message: options.message,
    versionId: getReviewVersionId(normalized),
    fromStatus: getWorkflowStatus(normalized),
    toStatus: options.toStatus ?? getWorkflowStatus(normalized),
    metadata: options.metadata,
  });
  return {
    normalized,
    workflow: {
      ...workflow,
      history: [...normalizeHistory(workflow.history), event],
    } as ProposalWorkflowState,
  };
}

export function addWorkflowNote(
  proposal: Proposal,
  message: string,
  session?: UserSession | null
): Proposal {
  const trimmedMessage = normalizeText(message);
  if (!trimmedMessage) return ensureProposalWorkflow(proposal);
  const { normalized, workflow } = appendWorkflowEvent(
    proposal,
    'note',
    { message: trimmedMessage },
    session
  );
  return mergeVersionsIntoContainer(normalized, listAllVersions(normalized), normalized.activeVersionId, undefined, workflow);
}

export function approveWorkflowProposal(
  proposal: Proposal,
  message?: string,
  session?: UserSession | null
): Proposal {
  const { normalized, workflow } = appendWorkflowEvent(
    proposal,
    'approved',
    { message, toStatus: 'submitted' },
    session
  );
  const actor = buildWorkflowActor(session);
  const updatedVersions = updateReviewVersionStatus(normalized, 'submitted');
  const nextWorkflow: ProposalWorkflowState = {
    ...workflow,
    status: 'submitted',
    needsApproval: false,
    approved: true,
    approvedAt: nowIso(),
    approvedBy: actor,
  };
  return mergeVersionsIntoContainer(normalized, updatedVersions, normalized.activeVersionId, 'submitted', nextWorkflow);
}

export function requestWorkflowChanges(
  proposal: Proposal,
  message: string,
  session?: UserSession | null
): Proposal {
  const { normalized, workflow } = appendWorkflowEvent(
    proposal,
    'changes_requested',
    { message, toStatus: 'changes_requested' },
    session
  );
  const updatedVersions = updateReviewVersionStatus(normalized, 'changes_requested');
  const nextWorkflow: ProposalWorkflowState = {
    ...workflow,
    status: 'changes_requested',
    needsApproval: false,
  };
  return mergeVersionsIntoContainer(
    normalized,
    updatedVersions,
    normalized.activeVersionId,
    'changes_requested',
    nextWorkflow
  );
}

export function completeWorkflowProposal(
  proposal: Proposal,
  message?: string,
  session?: UserSession | null
): Proposal {
  const { normalized, workflow } = appendWorkflowEvent(
    proposal,
    'completed',
    { message, toStatus: 'completed' },
    session
  );
  const actor = buildWorkflowActor(session);
  const updatedVersions = updateReviewVersionStatus(normalized, 'completed');
  const nextWorkflow: ProposalWorkflowState = {
    ...workflow,
    status: 'completed',
    completedAt: nowIso(),
    completedBy: actor,
  };
  return mergeVersionsIntoContainer(normalized, updatedVersions, normalized.activeVersionId, 'completed', nextWorkflow);
}

export function markWorkflowRead(proposal: Proposal, userId?: string | null): Proposal {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) return ensureProposalWorkflow(proposal);
  const normalized = ensureProposalWorkflow(proposal);
  const workflow = normalized.workflow as ProposalWorkflowState;
  let changed = false;
  const nextHistory = normalizeHistory(workflow.history).map((entry) => {
    if ((entry.actor?.userId || '') === normalizedUserId) return entry;
    const readByUserIds = Array.isArray(entry.readByUserIds) ? [...entry.readByUserIds] : [];
    if (readByUserIds.includes(normalizedUserId)) return entry;
    changed = true;
    return {
      ...entry,
      readByUserIds: [...readByUserIds, normalizedUserId],
    };
  });

  if (!changed) return normalized;
  return {
    ...normalized,
    workflow: {
      ...workflow,
      history: nextHistory,
    },
  };
}

export function countUnreadWorkflowEvents(proposal: Proposal, userId?: string | null) {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) return 0;
  const normalized = ensureProposalWorkflow(proposal);
  const history = normalizeHistory(normalized.workflow?.history);
  return history.filter((entry) => {
    if ((entry.actor?.userId || '') === normalizedUserId) return false;
    return !(entry.readByUserIds || []).includes(normalizedUserId);
  }).length;
}

export function hasUnreadWorkflowEvents(proposal: Proposal, userId?: string | null) {
  return countUnreadWorkflowEvents(proposal, userId) > 0;
}

function getVersionName(version?: Partial<Proposal> | null) {
  const id = version?.versionId || ORIGINAL_VERSION_ID;
  if (normalizeText(version?.versionName)) return normalizeText(version?.versionName);
  return id === ORIGINAL_VERSION_ID ? 'Original Version' : 'Version';
}

export function getChangedSections(current?: Partial<Proposal> | null, previous?: Partial<Proposal> | null) {
  if (!current || !previous) return [];
  return WORKFLOW_SECTION_KEYS
    .filter((key) => !deepEqualComparable(current[key], previous[key]))
    .map((key) => SECTION_LABELS[key] || String(key));
}

export function buildVersionDiffSummary(proposal: Proposal): VersionDiffSummary | null {
  const normalized = ensureProposalWorkflow(proposal);
  const allVersions = listAllVersions(normalized);
  const reviewVersionId = getReviewVersionId(normalized);
  const reviewVersion =
    allVersions.find((entry) => (entry.versionId || ORIGINAL_VERSION_ID) === reviewVersionId) || allVersions[0];
  if (!reviewVersion) return null;

  const compareVersion =
    allVersions
      .filter((entry) => (entry.versionId || ORIGINAL_VERSION_ID) !== (reviewVersion.versionId || ORIGINAL_VERSION_ID))
      .sort(
        (a, b) =>
          new Date(b.versionSubmittedAt || b.lastModified || b.createdDate || 0).getTime() -
          new Date(a.versionSubmittedAt || a.lastModified || a.createdDate || 0).getTime()
      )[0] || null;

  const currentRetail = toFiniteNumber(reviewVersion.pricing?.retailPrice || reviewVersion.totalCost);
  const compareRetail = toFiniteNumber(compareVersion?.pricing?.retailPrice || compareVersion?.totalCost);
  const currentCost = toFiniteNumber(reviewVersion.pricing?.totalCOGS);
  const compareCost = toFiniteNumber(compareVersion?.pricing?.totalCOGS);
  const currentGrossProfit = toFiniteNumber(reviewVersion.pricing?.grossProfit);
  const compareGrossProfit = toFiniteNumber(compareVersion?.pricing?.grossProfit);
  const currentGrossMargin = toFiniteNumber(reviewVersion.pricing?.grossProfitMargin);
  const compareGrossMargin = toFiniteNumber(compareVersion?.pricing?.grossProfitMargin);
  const currentDiscount = getNonPapDiscountTotal(reviewVersion);
  const compareDiscount = getNonPapDiscountTotal(compareVersion || {});

  return {
    reviewVersionId: reviewVersion.versionId || ORIGINAL_VERSION_ID,
    compareVersionId: compareVersion?.versionId || null,
    reviewVersionName: getVersionName(reviewVersion),
    compareVersionName: compareVersion ? getVersionName(compareVersion) : null,
    changedSections: getChangedSections(reviewVersion, compareVersion),
    retailDelta: currentRetail - compareRetail,
    costDelta: currentCost - compareCost,
    grossProfitDelta: currentGrossProfit - compareGrossProfit,
    grossMarginDelta: currentGrossMargin - compareGrossMargin,
    discountDelta: currentDiscount - compareDiscount,
    contractOverrideDelta:
      Object.keys(reviewVersion.contractOverrides || {}).length -
      Object.keys(compareVersion?.contractOverrides || {}).length,
    noteIndicator: Boolean(normalized.workflow?.manualReviewMessage),
  };
}
