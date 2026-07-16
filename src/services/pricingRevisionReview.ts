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

type PricingCalculation = ReturnType<typeof MasterPricingEngine.calculateCompleteProposal>;

type RevisionCalculation = {
  calculation: PricingCalculation;
  proposal: Proposal;
  pricing: any;
};

const EQUIPMENT_RUNTIME_FIELDS = [
  'zones',
  'type',
  'autoAddedForSpa',
  'autoAddedReason',
  'includedSaltCellPlaceholder',
] as const;

const CATALOG_PRICE_FIELDS = [
  ['basePrice', 'Base price'],
  ['addCost1', 'Additional cost 1'],
  ['addCost2', 'Additional cost 2'],
  ['addCost3', 'Additional cost 3'],
  ['price', 'Price'],
] as const;

type PackageComponentDependency = {
  catalogKey: string;
  nameKey: string;
  quantityKey: string;
  usesPumpOverhead?: boolean;
  nestedCatalogKey?: string;
};

const PACKAGE_COMPONENT_DEPENDENCIES: PackageComponentDependency[] = [
  { catalogKey: 'pumps', nameKey: 'includedPumpName', quantityKey: 'includedPumpQuantity', usesPumpOverhead: true },
  { catalogKey: 'filters', nameKey: 'includedFilterName', quantityKey: 'includedFilterQuantity' },
  { catalogKey: 'cleaners', nameKey: 'includedCleanerName', quantityKey: 'includedCleanerQuantity' },
  { catalogKey: 'heaters', nameKey: 'includedHeaterName', quantityKey: 'includedHeaterQuantity' },
  { catalogKey: 'automation', nameKey: 'includedAutomationName', quantityKey: 'includedAutomationQuantity' },
  { catalogKey: 'saltSystem', nameKey: 'includedSaltSystemName', quantityKey: 'includedSaltSystemQuantity' },
  { catalogKey: 'autoFillSystem', nameKey: 'includedAutoFillSystemName', quantityKey: 'includedAutoFillSystemQuantity' },
  { catalogKey: 'poolLights', nameKey: 'includedPoolLightName', quantityKey: 'includedPoolLightQuantity', nestedCatalogKey: 'lights' },
  { catalogKey: 'spaLights', nameKey: 'includedSpaLightName', quantityKey: 'includedSpaLightQuantity', nestedCatalogKey: 'lights' },
  { catalogKey: 'sanitationAccessories', nameKey: 'includedSanitationAccessoryName', quantityKey: 'includedSanitationAccessoryQuantity' },
];

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function normalizeCatalogIdentity(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/horse\s*power/g, 'hp')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:hp|pump|system)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findCatalogSelection(catalog: unknown, selection: any) {
  if (!selection || !Array.isArray(catalog)) return null;
  const selectionId = String(selection.id || '').trim();
  if (selectionId) {
    const idMatch = catalog.find((entry: any) => String(entry?.id || '').trim() === selectionId);
    if (idMatch) return idMatch;
  }

  const selectionName = normalizeCatalogIdentity(selection.name);
  if (!selectionName) return null;
  return (
    catalog.find((entry: any) => normalizeCatalogIdentity(entry?.name) === selectionName) || null
  );
}

function hydrateCatalogSelection<T>(selection: T, catalog: unknown): T {
  if (!selection) return selection;
  const match = findCatalogSelection(catalog, selection);
  if (!match) return selection;

  const hydrated: any = {
    ...(selection as any),
    ...cloneValue(match),
  };
  EQUIPMENT_RUNTIME_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(selection as any, field)) {
      hydrated[field] = (selection as any)[field];
    }
  });

  // A legacy computed price must not override the immutable revision's
  // base/add-cost fields after the selection has been rehydrated.
  if (!Object.prototype.hasOwnProperty.call(match, 'price')) {
    delete hydrated.price;
  }
  return hydrated as T;
}

function hydrateProposalEquipmentFromRevision(proposal: Proposal, pricing: any): Proposal {
  if (!proposal.equipment || !pricing?.equipment) return cloneValue(proposal);
  const next = cloneValue(proposal);
  const equipment = next.equipment;
  const catalogs = pricing.equipment;

  equipment.pump = hydrateCatalogSelection(equipment.pump, catalogs.pumps);
  equipment.additionalPumps = equipment.additionalPumps?.map((pump) =>
    hydrateCatalogSelection(pump, catalogs.pumps)
  );
  equipment.auxiliaryPump = hydrateCatalogSelection(
    equipment.auxiliaryPump,
    catalogs.auxiliaryPumps
  );
  equipment.auxiliaryPumps = equipment.auxiliaryPumps?.map((pump) =>
    hydrateCatalogSelection(pump, catalogs.auxiliaryPumps)
  );
  equipment.filter = hydrateCatalogSelection(equipment.filter, catalogs.filters);
  equipment.cleaner = hydrateCatalogSelection(equipment.cleaner, catalogs.cleaners);
  equipment.heater = hydrateCatalogSelection(equipment.heater, catalogs.heaters);
  equipment.automation = hydrateCatalogSelection(equipment.automation, catalogs.automation);
  equipment.saltSystem = hydrateCatalogSelection(equipment.saltSystem, catalogs.saltSystem);
  equipment.additionalSaltSystem = hydrateCatalogSelection(
    equipment.additionalSaltSystem,
    catalogs.saltSystem
  );
  equipment.autoFillSystem = hydrateCatalogSelection(
    equipment.autoFillSystem,
    catalogs.autoFillSystem
  );
  equipment.sanitationAccessory = hydrateCatalogSelection(
    equipment.sanitationAccessory,
    catalogs.sanitationAccessories
  );
  equipment.poolLights = equipment.poolLights?.map((light) =>
    hydrateCatalogSelection(light, catalogs.lights?.poolLights)
  );
  equipment.spaLights = equipment.spaLights?.map((light) =>
    hydrateCatalogSelection(light, catalogs.lights?.spaLights)
  );

  return next;
}

function getSelectionQuantity(value: unknown, fallback = 0) {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? Math.max(quantity, 0) : fallback;
}

function calculateComparableCatalogCost(
  item: any,
  equipmentPricing: any,
  usesPumpOverhead = false
) {
  if (!item) return 0;
  const partFields = ['basePrice', 'addCost1', 'addCost2', 'addCost3'];
  const hasParts = partFields.some((field) => item[field] !== undefined);
  let cost = hasParts
    ? partFields.reduce((total, field) => total + (Number(item[field]) || 0), 0)
    : Number(item.price) || 0;
  if (hasParts && Number.isFinite(Number(item.percentIncrease))) {
    const divisor = Number(item.percentIncrease) / 100;
    if (divisor !== 0) cost /= divisor;
  }
  if (usesPumpOverhead) {
    const itemOverhead = Number(item.overheadMultiplier);
    const fallbackOverhead = Number(equipmentPricing?.pumpOverheadMultiplier);
    const overhead =
      Number.isFinite(itemOverhead) && itemOverhead > 0
        ? itemOverhead
        : Number.isFinite(fallbackOverhead) && fallbackOverhead > 0
          ? fallbackOverhead
          : 1;
    cost *= overhead;
  }
  return Number.isFinite(cost) ? cost : 0;
}

function getPackageComponentCatalog(equipmentPricing: any, dependency: PackageComponentDependency) {
  return dependency.nestedCatalogKey
    ? equipmentPricing?.[dependency.nestedCatalogKey]?.[dependency.catalogKey]
    : equipmentPricing?.[dependency.catalogKey];
}

function calculateAutomaticPackageCostDelta(
  beforePackage: any,
  afterPackage: any,
  beforeEquipment: any,
  afterEquipment: any
) {
  if (!beforePackage || !afterPackage) return null;
  let delta = 0;
  for (const dependency of PACKAGE_COMPONENT_DEPENDENCIES) {
    const beforeName = String(beforePackage[dependency.nameKey] || '').trim();
    const afterName = String(afterPackage[dependency.nameKey] || '').trim();
    const beforeQuantity = getSelectionQuantity(beforePackage[dependency.quantityKey]);
    const afterQuantity = getSelectionQuantity(afterPackage[dependency.quantityKey]);
    if (
      normalizeCatalogIdentity(beforeName) !== normalizeCatalogIdentity(afterName) ||
      beforeQuantity !== afterQuantity
    ) {
      return null;
    }
    if (!beforeName || beforeQuantity <= 0) continue;
    const beforeItem = findCatalogSelection(
      getPackageComponentCatalog(beforeEquipment, dependency),
      { name: beforeName }
    );
    const afterItem = findCatalogSelection(
      getPackageComponentCatalog(afterEquipment, dependency),
      { name: afterName }
    );
    if (!beforeItem || !afterItem) return null;
    delta +=
      (calculateComparableCatalogCost(
        afterItem,
        afterEquipment,
        Boolean(dependency.usesPumpOverhead)
      ) -
        calculateComparableCatalogCost(
          beforeItem,
          beforeEquipment,
          Boolean(dependency.usesPumpOverhead)
        )) *
      beforeQuantity;
  }
  return roundCurrency(delta);
}

function compareSelectedCatalogItems(
  proposal: Proposal,
  beforePricing: any,
  afterPricing: any
) {
  const rows: PricingRevisionComparisonRow[] = [];
  const changedSelectionNames = new Set<string>();
  const beforeEquipment = beforePricing?.equipment || {};
  const afterEquipment = afterPricing?.equipment || {};
  const equipment = proposal.equipment;
  if (!equipment) return { rows, changedSelectionNames };

  const compareSelection = (
    selection: any,
    beforeCatalog: unknown,
    afterCatalog: unknown,
    quantity: number,
    category = 'Equipment'
  ) => {
    if (!selection || quantity <= 0) return;
    const beforeItem = findCatalogSelection(beforeCatalog, selection);
    const afterItem = findCatalogSelection(afterCatalog, selection);
    if (!beforeItem || !afterItem) return;
    const label = String(afterItem.name || beforeItem.name || selection.name || 'Pricing item');
    const normalizedLabel = normalizeCatalogIdentity(label);

    CATALOG_PRICE_FIELDS.forEach(([field, fieldLabel]) => {
      if (
        !Object.prototype.hasOwnProperty.call(beforeItem, field) &&
        !Object.prototype.hasOwnProperty.call(afterItem, field)
      ) {
        return;
      }
      const beforeUnitAmount = roundCurrency(beforeItem[field]);
      const afterUnitAmount = roundCurrency(afterItem[field]);
      if (Math.abs(afterUnitAmount - beforeUnitAmount) < CURRENCY_EPSILON) return;
      if (normalizedLabel) changedSelectionNames.add(normalizedLabel);
      rows.push({
        key: [category, normalizedLabel, field]
          .map((value) => String(value).trim().toLowerCase())
          .join('::'),
        category: `${category} - ${fieldLabel}`,
        label,
        quantity,
        beforeAmount: roundCurrency(beforeUnitAmount * quantity),
        afterAmount: roundCurrency(afterUnitAmount * quantity),
        beforeUnitAmount,
        afterUnitAmount,
        direction: afterUnitAmount > beforeUnitAmount ? 'increase' : 'decrease',
      });
    });
  };

  const pumpQuantity = getSelectionQuantity(equipment.pumpQuantity);
  compareSelection(
    equipment.pump,
    beforeEquipment.pumps,
    afterEquipment.pumps,
    pumpQuantity
  );
  (equipment.additionalPumps || []).forEach((pump) =>
    compareSelection(pump, beforeEquipment.pumps, afterEquipment.pumps, 1)
  );

  const auxiliaryPumps =
    equipment.auxiliaryPumps && equipment.auxiliaryPumps.length > 0
      ? equipment.auxiliaryPumps
      : equipment.auxiliaryPump
        ? [equipment.auxiliaryPump]
        : [];
  auxiliaryPumps.forEach((pump) =>
    compareSelection(
      pump,
      beforeEquipment.auxiliaryPumps,
      afterEquipment.auxiliaryPumps,
      1
    )
  );

  compareSelection(
    equipment.filter,
    beforeEquipment.filters,
    afterEquipment.filters,
    getSelectionQuantity(equipment.filterQuantity)
  );
  compareSelection(
    equipment.cleaner,
    beforeEquipment.cleaners,
    afterEquipment.cleaners,
    getSelectionQuantity(equipment.cleanerQuantity)
  );
  compareSelection(
    equipment.heater,
    beforeEquipment.heaters,
    afterEquipment.heaters,
    getSelectionQuantity(equipment.heaterQuantity)
  );
  compareSelection(
    equipment.automation,
    beforeEquipment.automation,
    afterEquipment.automation,
    getSelectionQuantity(equipment.automationQuantity)
  );
  compareSelection(
    equipment.saltSystem,
    beforeEquipment.saltSystem,
    afterEquipment.saltSystem,
    getSelectionQuantity(
      equipment.saltSystemQuantity,
      equipment.saltSystem ? 1 : 0
    )
  );
  compareSelection(
    equipment.additionalSaltSystem,
    beforeEquipment.saltSystem,
    afterEquipment.saltSystem,
    equipment.additionalSaltSystem ? 1 : 0
  );
  compareSelection(
    equipment.autoFillSystem,
    beforeEquipment.autoFillSystem,
    afterEquipment.autoFillSystem,
    getSelectionQuantity(
      equipment.autoFillSystemQuantity,
      equipment.autoFillSystem ? 1 : 0
    )
  );
  compareSelection(
    equipment.sanitationAccessory,
    beforeEquipment.sanitationAccessories,
    afterEquipment.sanitationAccessories,
    getSelectionQuantity(
      equipment.sanitationAccessoryQuantity,
      equipment.sanitationAccessory ? 1 : 0
    )
  );
  (equipment.poolLights || []).forEach((light) =>
    compareSelection(
      light,
      beforeEquipment.lights?.poolLights,
      afterEquipment.lights?.poolLights,
      1
    )
  );
  (equipment.spaLights || []).forEach((light) =>
    compareSelection(
      light,
      beforeEquipment.lights?.spaLights,
      afterEquipment.lights?.spaLights,
      1
    )
  );

  if (equipment.packageSelectionId) {
    const packageSelection = { id: equipment.packageSelectionId, name: equipment.packageSelectionId };
    const beforePackage = findCatalogSelection(beforeEquipment.packageOptions, packageSelection);
    const afterPackage = findCatalogSelection(afterEquipment.packageOptions, packageSelection);
    const automaticPackageDelta = calculateAutomaticPackageCostDelta(
      beforePackage,
      afterPackage,
      beforeEquipment,
      afterEquipment
    );
    const packageBaseDelta = roundCurrency(
      Number(afterPackage?.basePrice || 0) - Number(beforePackage?.basePrice || 0)
    );
    const packageChangeIsAutomatic =
      automaticPackageDelta !== null &&
      Math.abs(packageBaseDelta) >= CURRENCY_EPSILON &&
      Math.abs(packageBaseDelta - automaticPackageDelta) < CURRENCY_EPSILON;

    if (packageChangeIsAutomatic) {
      const packageName = normalizeCatalogIdentity(afterPackage?.name || beforePackage?.name);
      if (packageName) changedSelectionNames.add(packageName);
    } else {
      compareSelection(
        packageSelection,
        beforeEquipment.packageOptions,
        afterEquipment.packageOptions,
        1,
        'Equipment package'
      );
    }
  }

  return { rows, changedSelectionNames };
}

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

function isDerivedTaxComparisonRow(row: PricingRevisionComparisonRow) {
  return /\btax\b/i.test(`${row.category} ${row.label}`);
}

async function calculateWithModel(
  proposal: Proposal,
  model: LoadedPricingModel
): Promise<RevisionCalculation> {
  const snapshot = await loadPricingSnapshotForFranchise(
    proposal.franchiseId,
    proposal.pricingModelId,
    proposal.pricingModelFranchiseId,
    normalizePricingTierId(proposal.pricingTierId || proposal.pricingTierName),
    model.revisionId || undefined
  );
  const hydratedProposal = hydrateProposalEquipmentFromRevision(proposal, snapshot.pricing);
  const calculation = withTemporaryPricingSnapshot(snapshot.pricing, () =>
    MasterPricingEngine.calculateCompleteProposal(hydratedProposal, hydratedProposal.papDiscounts)
  );
  return {
    calculation,
    proposal: hydratedProposal,
    pricing: snapshot.pricing,
  };
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

  // Pricing calculations temporarily swap a process-wide pricing snapshot, so
  // keep the two immutable revision calculations deliberately sequential.
  const before = await calculateWithModel(proposal, pinned);
  const after = await calculateWithModel(proposal, latest);
  const catalogComparison = compareSelectedCatalogItems(
    proposal,
    before.pricing,
    after.pricing
  );
  const calculatedRows = compareCostBreakdowns(
    before.calculation.costBreakdown,
    after.calculation.costBreakdown
  );
  const unmatchedCalculatedRows = calculatedRows.filter((row) => {
      const rowLabel = normalizeCatalogIdentity(row.label);
      return !catalogComparison.changedSelectionNames.has(rowLabel);
    });
  const visibleCalculatedRows =
    catalogComparison.rows.length > 0
      ? unmatchedCalculatedRows.filter((row) => !isDerivedTaxComparisonRow(row))
      : unmatchedCalculatedRows;
  const rows = [
    ...catalogComparison.rows,
    ...visibleCalculatedRows,
  ].sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
  const beforeRetail = roundCurrency(
    before.calculation.pricing?.retailPrice ?? before.calculation.totalCost
  );
  const afterRetail = roundCurrency(
    after.calculation.pricing?.retailPrice ?? after.calculation.totalCost
  );
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
    // Persist the catalog-backed selections from the accepted revision. This
    // prevents a later recalculation from reviving stale snapshotted item costs.
    equipment: recalculated.proposal.equipment,
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
    costBreakdown: recalculated.calculation.costBreakdown,
    pricing: recalculated.calculation.pricing,
    subtotal: recalculated.calculation.subtotal,
    taxRate: recalculated.calculation.taxRate,
    taxAmount: recalculated.calculation.taxAmount,
    totalCost: recalculated.calculation.totalCost,
    lastModified: new Date().toISOString(),
  };
}
