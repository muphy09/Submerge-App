import { Proposal } from '../types/proposal-new';
import { VERSION_RESETTABLE_CONTRACT_OVERRIDE_FIELD_IDS } from '../services/contractTemplates';

export const ORIGINAL_VERSION_ID = 'original';

const randomId = () => `version-${Math.random().toString(36).slice(2, 9)}`;

const cloneContractOverridesForNewVersion = (
  overrides?: Proposal['contractOverrides'] | null
): Proposal['contractOverrides'] => {
  if (!overrides) return {};

  return Object.fromEntries(
    Object.entries(overrides).filter(([fieldId]) => !VERSION_RESETTABLE_CONTRACT_OVERRIDE_FIELD_IDS.has(fieldId))
  );
};

const stripNestedVersions = (proposal: Proposal): Proposal => {
  const clone: Proposal = { ...proposal };
  clone.versions = [];
  return clone;
};

const ensureVersionDefaults = (proposal: Proposal, defaultName?: string): Proposal => {
  const versionId = proposal.versionId || ORIGINAL_VERSION_ID;
  const versionName =
    proposal.versionName ||
    defaultName ||
    (proposal.isOriginalVersion ? 'Original Version' : 'Version');
  const activeVersionId = proposal.activeVersionId || versionId;
  return {
    ...proposal,
    versionId,
    versionName,
    activeVersionId,
  };
};

const inheritSharedVersionMetadata = (container: Proposal, version: Proposal): Proposal => {
  const resolvedFranchiseId = version.franchiseId || container.franchiseId;
  const resolvedPricingModelId = version.pricingModelId || container.pricingModelId;
  const canReuseContainerPricingMeta =
    !version.pricingModelId || version.pricingModelId === container.pricingModelId;

  return {
    ...version,
    proposalNumber: version.proposalNumber || container.proposalNumber,
    franchiseId: resolvedFranchiseId,
    designerName: version.designerName || container.designerName,
    designerRole: version.designerRole || container.designerRole,
    designerCode: version.designerCode || container.designerCode,
    pricingModelId: resolvedPricingModelId,
    pricingModelName:
      version.pricingModelName ||
      (canReuseContainerPricingMeta ? container.pricingModelName : undefined),
    pricingModelFranchiseId:
      version.pricingModelFranchiseId ||
      (canReuseContainerPricingMeta ? container.pricingModelFranchiseId : undefined) ||
      (resolvedPricingModelId ? resolvedFranchiseId : undefined),
    pricingModelIsDefault:
      version.pricingModelIsDefault ??
      (canReuseContainerPricingMeta ? container.pricingModelIsDefault : undefined),
  };
};

export const listAllVersions = (proposal: Proposal): Proposal[] => {
  const normalized = ensureVersionDefaults(proposal);
  const baseVersion: Proposal = stripNestedVersions({
    ...normalized,
    isOriginalVersion: normalized.isOriginalVersion ?? true,
  });

  const extraVersions = (normalized.versions || []).map((entry) => {
    const normalizedEntry = inheritSharedVersionMetadata(
      normalized,
      ensureVersionDefaults(entry)
    );
    return stripNestedVersions({
      ...normalizedEntry,
      workflow: normalizedEntry.workflow || normalized.workflow,
      isOriginalVersion: normalizedEntry.isOriginalVersion ?? false,
    });
  });

  const seen = new Set<string>();
  const all = [baseVersion, ...extraVersions].filter((version) => {
    const id = version.versionId || ORIGINAL_VERSION_ID;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return all;
};

export const applyActiveVersion = (proposal: Proposal): Proposal => {
  const normalized = ensureVersionDefaults(proposal);
  const allVersions = listAllVersions(normalized);
  const targetId =
    normalized.activeVersionId || normalized.versionId || ORIGINAL_VERSION_ID;
  const active =
    allVersions.find((v) => (v.versionId || ORIGINAL_VERSION_ID) === targetId) ||
    allVersions[0] ||
    stripNestedVersions({
      ...normalized,
      versionId: targetId || ORIGINAL_VERSION_ID,
    });
  const otherVersions = allVersions.filter(
    (v) => (v.versionId || ORIGINAL_VERSION_ID) !== (active.versionId || ORIGINAL_VERSION_ID)
  );

  const mergedActive: Proposal = {
    ...active,
    status: proposal.status || active.status || 'draft',
    versionId: active.versionId || targetId || ORIGINAL_VERSION_ID,
    versionName:
      active.versionName ||
      (active.isOriginalVersion ? 'Original Version' : 'Version'),
    activeVersionId: targetId || active.versionId || ORIGINAL_VERSION_ID,
    versions: otherVersions,
    workflow: proposal.workflow || active.workflow,
  };

  // Preserve sync status/message from the container if the active version lacks it
  const syncStatus = (active as any).syncStatus || (proposal as any).syncStatus;
  const syncMessage = (active as any).syncMessage || (proposal as any).syncMessage;
  if (syncStatus) {
    (mergedActive as any).syncStatus = syncStatus;
  }
  if (syncMessage) {
    (mergedActive as any).syncMessage = syncMessage;
  }

  return mergedActive;
};

const nextVersionName = (proposal: Proposal): string => {
  const all = listAllVersions(proposal);
  const suffix = all.length;
  return `Version ${suffix}`;
};

export const createVersionFromProposal = (
  proposal: Proposal,
  sourceVersionId?: string,
  explicitName?: string
): { container: Proposal; newVersion: Proposal } => {
  const normalized = ensureVersionDefaults(proposal);
  const allVersions = listAllVersions(normalized);
  const now = new Date().toISOString();
  const source =
    allVersions.find((v) => v.versionId === sourceVersionId) ||
    allVersions.find((v) => v.versionId === normalized.activeVersionId) ||
    allVersions[0];

  const newVersion: Proposal = stripNestedVersions({
    ...(source || normalized),
    versionId: randomId(),
    versionName: explicitName || nextVersionName(normalized),
    isOriginalVersion: false,
    contractOverrides: cloneContractOverridesForNewVersion((source || normalized).contractOverrides),
    status: 'draft',
    versionLocked: false,
    versionLockedAt: null,
    versionSubmittedAt: null,
    versionSubmittedBy: null,
    createdDate: now,
    lastModified: now,
  });

  const currentActiveVersionId = normalized.activeVersionId || normalized.versionId || ORIGINAL_VERSION_ID;
  const active =
    allVersions.find((v) => (v.versionId || ORIGINAL_VERSION_ID) === currentActiveVersionId) ||
    stripNestedVersions({ ...normalized, versionId: currentActiveVersionId });
  const remaining = allVersions.filter(
    (v) => (v.versionId || ORIGINAL_VERSION_ID) !== (active.versionId || ORIGINAL_VERSION_ID)
  );
  const nextActiveVersionId = active.versionId || currentActiveVersionId || ORIGINAL_VERSION_ID;

  const container: Proposal = {
    ...normalized,
    ...active,
    status: normalized.status,
    workflow: normalized.workflow,
    lastModified: now,
    activeVersionId: nextActiveVersionId,
    versions: [...remaining, newVersion],
  };

  return { container, newVersion };
};

export const upsertVersionInContainer = (
  container: Proposal,
  version: Proposal,
  activeVersionId?: string
): Proposal => {
  const normalizedContainer = ensureVersionDefaults(container);
  const targetId = version.versionId || normalizedContainer.versionId || ORIGINAL_VERSION_ID;
  const sanitizedVersion = stripNestedVersions(
    ensureVersionDefaults(version, version.versionName)
  );

  const allVersions = listAllVersions(normalizedContainer);
  const nextVersions = allVersions.map((v) =>
    (v.versionId || ORIGINAL_VERSION_ID) === (sanitizedVersion.versionId || targetId)
      ? { ...sanitizedVersion }
      : v
  );
  if (!nextVersions.some((v) => v.versionId === sanitizedVersion.versionId)) {
    nextVersions.push(sanitizedVersion);
  }

  const desiredActiveId =
    activeVersionId || normalizedContainer.activeVersionId || targetId || ORIGINAL_VERSION_ID;
  const active =
    nextVersions.find((v) => v.versionId === desiredActiveId) || sanitizedVersion;
  const others = nextVersions.filter((v) => v.versionId !== active.versionId);

  return {
    ...normalizedContainer,
    ...active,
    status: normalizedContainer.status,
    workflow: normalizedContainer.workflow,
    activeVersionId: desiredActiveId,
    versions: others,
  };
};
