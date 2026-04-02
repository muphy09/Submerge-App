import {
  type CostLineItem,
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

export type VersionDiffFieldChange = {
  label: string;
  before: string | null;
  after: string | null;
  kind: 'added' | 'removed' | 'changed';
};

export type VersionDiffCostChange = {
  label: string;
  category: string;
  beforeQuantity: number;
  afterQuantity: number;
  beforeUnitPrice: number;
  afterUnitPrice: number;
  beforeTotal: number;
  afterTotal: number;
  delta: number;
  kind: 'added' | 'removed' | 'changed';
};

export type VersionDiffCategory = {
  key: string;
  label: string;
  totalDelta: number;
  changeCount: number;
  fieldChanges: VersionDiffFieldChange[];
  costChanges: VersionDiffCostChange[];
};

export type VersionDiffSummary = {
  reviewVersionId: string;
  compareVersionId?: string | null;
  approvedVersionId?: string | null;
  reviewVersionName: string;
  compareVersionName?: string | null;
  comparisonKind: 'initial_submission' | 'proposal_addendum';
  changedSections: string[];
  retailDelta: number;
  costDelta: number;
  grossProfitDelta: number;
  grossMarginDelta: number;
  discountDelta: number;
  contractOverrideDelta: number;
  noteIndicator: boolean;
  categories: VersionDiffCategory[];
};

type WorkflowFieldSnapshot = {
  key: string;
  label: string;
  value: string;
};

type WorkflowDiffGroupDefinition = {
  key: string;
  label: string;
  costKeys: Array<keyof Proposal['costBreakdown']>;
  extractFields: (proposal: Proposal) => WorkflowFieldSnapshot[];
};

const REVIEW_PENDING_STATUSES: ProposalWorkflowStatus[] = ['needs_approval', 'changes_requested'];
const COST_DIFF_GROUPS: WorkflowDiffGroupDefinition[] = [];

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

function isPendingReviewStatus(status?: ProposalWorkflowStatus | null) {
  return REVIEW_PENDING_STATUSES.includes((status || 'draft') as ProposalWorkflowStatus);
}

function dedupeVersionIds(ids?: Array<string | null | undefined>, fallbackId?: string | null) {
  const seen = new Set<string>();
  return [...(ids || []), fallbackId]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function getVersionById(proposal: Proposal, versionId?: string | null) {
  const targetId = normalizeText(versionId);
  if (!targetId) return null;
  return (
    listAllVersions(proposal).find((entry) => (entry.versionId || ORIGINAL_VERSION_ID) === targetId) ||
    null
  );
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

function formatNumber(value: unknown, suffix = '') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return `${numeric.toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}`;
}

function formatCurrencyValue(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatBoolean(value: unknown) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return '';
}

function compactSnapshots(entries: WorkflowFieldSnapshot[]) {
  return entries.filter((entry) => normalizeText(entry.value).length > 0);
}

function compareSnapshots(currentEntries: WorkflowFieldSnapshot[], previousEntries: WorkflowFieldSnapshot[]) {
  const currentMap = new Map(currentEntries.map((entry) => [entry.key, entry]));
  const previousMap = new Map(previousEntries.map((entry) => [entry.key, entry]));
  const keys = Array.from(new Set([...currentMap.keys(), ...previousMap.keys()]));

  return keys
    .map((key) => {
      const current = currentMap.get(key);
      const previous = previousMap.get(key);
      const after = normalizeText(current?.value) || null;
      const before = normalizeText(previous?.value) || null;
      if (before === after) return null;
      return {
        label: current?.label || previous?.label || key,
        before,
        after,
        kind: before && after ? 'changed' : after ? 'added' : 'removed',
      } as VersionDiffFieldChange;
    })
    .filter((entry): entry is VersionDiffFieldChange => Boolean(entry));
}

function collectCostItems(proposal?: Partial<Proposal> | null, keys?: Array<keyof Proposal['costBreakdown']>) {
  if (!proposal?.costBreakdown || !keys?.length) return [] as CostLineItem[];
  return keys.flatMap((key) => {
    const items = proposal.costBreakdown?.[key];
    return Array.isArray(items) ? items : [];
  });
}

function compareCostItems(
  currentItems: CostLineItem[],
  previousItems: CostLineItem[]
) {
  const keyFor = (item: CostLineItem) => `${normalizeText(item.category)}::${normalizeText(item.description)}`;
  const currentMap = new Map(currentItems.map((item) => [keyFor(item), item]));
  const previousMap = new Map(previousItems.map((item) => [keyFor(item), item]));
  const keys = Array.from(new Set([...currentMap.keys(), ...previousMap.keys()]));

  return keys
    .map((key) => {
      const current = currentMap.get(key);
      const previous = previousMap.get(key);
      const beforeQuantity = toFiniteNumber(previous?.quantity);
      const afterQuantity = toFiniteNumber(current?.quantity);
      const beforeUnitPrice = toFiniteNumber(previous?.unitPrice);
      const afterUnitPrice = toFiniteNumber(current?.unitPrice);
      const beforeTotal = toFiniteNumber(previous?.total);
      const afterTotal = toFiniteNumber(current?.total);

      if (
        beforeQuantity === afterQuantity &&
        beforeUnitPrice === afterUnitPrice &&
        beforeTotal === afterTotal
      ) {
        return null;
      }

      return {
        label: normalizeText(current?.description || previous?.description) || 'Cost Item',
        category: normalizeText(current?.category || previous?.category) || 'Cost',
        beforeQuantity,
        afterQuantity,
        beforeUnitPrice,
        afterUnitPrice,
        beforeTotal,
        afterTotal,
        delta: afterTotal - beforeTotal,
        kind: previous && current ? 'changed' : current ? 'added' : 'removed',
      } as VersionDiffCostChange;
    })
    .filter((entry): entry is VersionDiffCostChange => Boolean(entry))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.label.localeCompare(b.label));
}

function normalizeVisibleVersionList(proposal: Proposal, versionIds: string[]) {
  const allVersions = listAllVersions(proposal);
  return versionIds
    .map((versionId) =>
      allVersions.find((entry) => (entry.versionId || ORIGINAL_VERSION_ID) === versionId) || null
    )
    .filter((entry): entry is Proposal => Boolean(entry));
}

function buildDetailedDiffCategories(current: Proposal, previous: Proposal) {
  return COST_DIFF_GROUPS
    .map((group) => {
      const fieldChanges = compareSnapshots(group.extractFields(current), group.extractFields(previous));
      const costChanges = compareCostItems(
        collectCostItems(current, group.costKeys),
        collectCostItems(previous, group.costKeys)
      );
      const totalDelta = costChanges.reduce((sum, entry) => sum + entry.delta, 0);
      const changeCount = fieldChanges.length + costChanges.length;
      if (!changeCount) return null;
      return {
        key: group.key,
        label: group.label,
        totalDelta,
        changeCount,
        fieldChanges,
        costChanges,
      } as VersionDiffCategory;
    })
    .filter((entry): entry is VersionDiffCategory => Boolean(entry));
}

function formatNamedSelection(selection?: { name?: string | null } | null, noneToken?: string) {
  const name = normalizeText(selection?.name);
  if (!name) return 'None';
  if (noneToken && name.toLowerCase().includes(noneToken)) return 'None';
  return name;
}

function summarizeNamedList(
  entries: Array<string | null | undefined>,
  options?: {
    noneValue?: string;
  }
) {
  const counts = new Map<string, number>();
  entries
    .map((entry) => normalizeText(entry))
    .filter(Boolean)
    .forEach((entry) => {
      counts.set(entry, (counts.get(entry) || 0) + 1);
    });

  const labels = Array.from(counts.entries()).map(([entry, count]) => (count > 1 ? `${entry} x${count}` : entry));
  return labels.length ? labels.join(', ') : options?.noneValue || 'None';
}

function summarizeCustomOptions(options?: Proposal['customFeatures']['features'] | Proposal['equipment']['customOptions']) {
  if (!Array.isArray(options) || options.length === 0) return 'None';
  return summarizeNamedList(options.map((entry) => entry?.name));
}

function summarizeRbbLevels(levels?: Proposal['excavation']['rbbLevels']) {
  if (!Array.isArray(levels) || levels.length === 0) return 'None';
  return levels
    .map((level) => {
      const height = Number.isFinite(level?.height) ? `${level.height}"` : '';
      const length = formatNumber(level?.length, ' LF');
      const facing = normalizeText(level?.facing);
      return [height, length, facing].filter(Boolean).join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

function summarizeColumns(columns?: Proposal['excavation']['columns']) {
  if (!columns || !Number.isFinite(columns.count) || columns.count <= 0) return 'None';
  return `${columns.count} columns at ${formatNumber(columns.width, ' ft')} x ${formatNumber(columns.depth, ' ft')} x ${formatNumber(columns.height, ' ft')}`;
}

function summarizeRetainingWalls(walls?: Proposal['excavation']['retainingWalls']) {
  if (!Array.isArray(walls) || walls.length === 0) return 'None';
  return walls
    .map((wall) => {
      const type = normalizeText(wall?.type);
      const length = formatNumber(wall?.length, ' LF');
      return [type, length].filter(Boolean).join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

function summarizeWaterFeatureSelections(waterFeatures?: Proposal['waterFeatures']) {
  const selections = Array.isArray(waterFeatures?.selections) ? waterFeatures?.selections : [];
  if (!selections.length) return 'None';
  return selections
    .map((selection) => {
      const featureId = normalizeText(selection?.featureId) || 'Feature';
      const quantity = Math.max(toFiniteNumber(selection?.quantity), 0);
      const actuator = selection?.includeValveActuator ? ' + actuator' : '';
      return `${featureId} x${quantity || 1}${actuator}`;
    })
    .join(', ');
}

function summarizeCustomFeatures(features?: Proposal['customFeatures']['features']) {
  if (!Array.isArray(features) || features.length === 0) return 'None';
  return features
    .map((feature) => {
      const name = normalizeText(feature?.name) || 'Custom Feature';
      const sqft = toFiniteNumber(feature?.groupedSqft);
      return sqft > 0 ? `${name} (${formatNumber(sqft, ' SQFT')})` : name;
    })
    .join(', ');
}

function summarizeRetailAdjustments(adjustments?: Proposal['retailAdjustments']) {
  if (!Array.isArray(adjustments) || adjustments.length === 0) return 'None';
  return adjustments
    .map((adjustment) => `${normalizeText(adjustment?.name) || 'Adjustment'} ${formatCurrencyValue(adjustment?.amount)}`)
    .join(', ');
}

function summarizeContractOverrides(overrides?: Proposal['contractOverrides']) {
  const entries = Object.entries(overrides || {}).filter(([, value]) => value !== null && value !== undefined && normalizeText(String(value)) !== '');
  if (!entries.length) return 'None';
  return `${entries.length} overridden field${entries.length === 1 ? '' : 's'}`;
}

function summarizeWarrantySections(sections?: Proposal['warrantySections']) {
  if (!Array.isArray(sections) || sections.length === 0) return 'None';
  return summarizeNamedList(sections.map((section) => section?.title), { noneValue: 'None' });
}

function summarizePumpArray(
  pumps?: Array<{ name?: string | null; autoAddedReason?: 'spa' | 'waterFeature' | null }>
) {
  if (!Array.isArray(pumps) || pumps.length === 0) return 'None';
  return pumps
    .map((pump) => {
      const name = normalizeText(pump?.name) || 'Pump';
      const reason =
        pump?.autoAddedReason === 'spa'
          ? 'auto for spa'
          : pump?.autoAddedReason === 'waterFeature'
          ? 'auto for water feature'
          : '';
      return reason ? `${name} (${reason})` : name;
    })
    .join(', ');
}

function extractPoolSpecsFields(proposal: Proposal): WorkflowFieldSnapshot[] {
  const specs = proposal.poolSpecs || ({} as Proposal['poolSpecs']);
  return compactSnapshots([
    { key: 'poolType', label: 'Pool Type', value: normalizeText(specs.poolType) },
    { key: 'poolShape', label: 'Pool Shape', value: normalizeText(specs.poolShape) },
    { key: 'fiberglassModel', label: 'Fiberglass Model', value: normalizeText(specs.fiberglassModelName) },
    { key: 'perimeter', label: 'Pool Perimeter', value: formatNumber(specs.perimeter, ' LF') },
    { key: 'surfaceArea', label: 'Pool Surface Area', value: formatNumber(specs.surfaceArea, ' SQFT') },
    { key: 'maxWidth', label: 'Max Width', value: formatNumber(specs.maxWidth, ' FT') },
    { key: 'maxLength', label: 'Max Length', value: formatNumber(specs.maxLength, ' FT') },
    { key: 'shallowDepth', label: 'Shallow Depth', value: formatNumber(specs.shallowDepth, ' FT') },
    { key: 'endDepth', label: 'End Depth', value: formatNumber(specs.endDepth, ' FT') },
    { key: 'stepsBench', label: 'Steps / Bench', value: formatNumber(specs.totalStepsAndBench, ' LF') },
    { key: 'tanningShelf', label: 'Tanning Shelf', value: formatBoolean(specs.hasTanningShelf) },
    { key: 'spaType', label: 'Spa Type', value: normalizeText(specs.spaType) || 'None' },
    { key: 'spaSize', label: 'Spa Size', value: [formatNumber(specs.spaLength, ' FT'), formatNumber(specs.spaWidth, ' FT')].filter(Boolean).join(' x ') },
    { key: 'spaPerimeter', label: 'Spa Perimeter', value: formatNumber(specs.spaPerimeter, ' LF') },
    { key: 'raisedSpa', label: 'Raised Spa', value: formatBoolean(specs.isRaisedSpa) },
    { key: 'raisedSpaFacing', label: 'Raised Spa Facing', value: normalizeText(specs.raisedSpaFacing) },
    { key: 'spillover', label: 'Spa Spillover', value: formatBoolean(specs.hasSpillover) },
    { key: 'deckingArea', label: 'Decking Area', value: formatNumber(specs.deckingArea, ' SQFT') },
    { key: 'travelDistance', label: 'Travel Distance', value: formatNumber(specs.travelDistance, ' MI') },
    { key: 'streetDistance', label: 'Pool To Street Distance', value: formatNumber(specs.poolToStreetDistance) },
    { key: 'automaticCover', label: 'Automatic Cover', value: formatBoolean(specs.hasAutomaticCover) },
    { key: 'waterfallCount', label: 'Waterfall Count', value: formatNumber(specs.waterfallCount) },
  ]);
}

function extractExcavationFields(proposal: Proposal): WorkflowFieldSnapshot[] {
  const excavation = proposal.excavation || ({} as Proposal['excavation']);
  return compactSnapshots([
    { key: 'rbbSqft', label: 'Raised Bond Beam Area', value: formatNumber(excavation.totalRBBSqft, ' SQFT') },
    { key: 'rbbLevels', label: 'Raised Bond Beam Levels', value: summarizeRbbLevels(excavation.rbbLevels) },
    { key: 'exposedPoolWalls', label: 'Exposed Pool Walls', value: summarizeRbbLevels(excavation.exposedPoolWallLevels) },
    { key: 'columns', label: 'Columns', value: summarizeColumns(excavation.columns) },
    { key: 'sitePrepHours', label: 'Site Prep Hours', value: formatNumber(excavation.additionalSitePrepHours, ' HRS') },
    { key: 'gravelInstall', label: 'Gravel Install', value: formatBoolean(excavation.hasGravelInstall) },
    { key: 'dirtHaul', label: 'Dirt Haul', value: formatBoolean(excavation.hasDirtHaul) },
    { key: 'additionalBench', label: 'Additional Bench', value: formatNumber(excavation.additionalBench, ' LF') },
    { key: 'doubleCurtain', label: 'Double Curtain', value: formatNumber(excavation.doubleCurtainLength, ' LF') },
    { key: 'soilEngineer', label: 'Soil Sample / Engineer', value: formatBoolean(excavation.needsSoilSampleEngineer) },
    { key: 'retainingWalls', label: 'Retaining Walls', value: summarizeRetainingWalls(excavation.retainingWalls) },
    { key: 'customOptions', label: 'Excavation Options', value: summarizeCustomOptions(excavation.customOptions) },
  ]);
}

function extractPlumbingFields(proposal: Proposal): WorkflowFieldSnapshot[] {
  const plumbing = proposal.plumbing || ({} as Proposal['plumbing']);
  const runs = plumbing.runs || ({} as Proposal['plumbing']['runs']);
  return compactSnapshots([
    { key: 'skimmerRun', label: 'Skimmer Run', value: formatNumber(runs.skimmerRun, ' LF') },
    { key: 'additionalSkimmers', label: 'Additional Skimmers', value: formatNumber(runs.additionalSkimmers) },
    { key: 'mainDrainRun', label: 'Main Drain Run', value: formatNumber(runs.mainDrainRun, ' LF') },
    { key: 'cleanerRun', label: 'Cleaner Run', value: formatNumber(runs.cleanerRun, ' LF') },
    { key: 'autoFillRun', label: 'Auto-Fill Run', value: formatNumber(runs.autoFillRun, ' LF') },
    { key: 'waterFeature1Run', label: 'Water Feature 1 Run', value: formatNumber(runs.waterFeature1Run, ' LF') },
    { key: 'waterFeature2Run', label: 'Water Feature 2 Run', value: formatNumber(runs.waterFeature2Run, ' LF') },
    { key: 'waterFeature3Run', label: 'Water Feature 3 Run', value: formatNumber(runs.waterFeature3Run, ' LF') },
    { key: 'waterFeature4Run', label: 'Water Feature 4 Run', value: formatNumber(runs.waterFeature4Run, ' LF') },
    { key: 'infloorValveToEq', label: 'Infloor Valve To Equipment', value: formatNumber(runs.infloorValveToEQ, ' LF') },
    { key: 'infloorValveToPool', label: 'Infloor Valve To Pool', value: formatNumber(runs.infloorValveToPool, ' LF') },
    { key: 'spaRun', label: 'Spa Run', value: formatNumber(runs.spaRun, ' LF') },
    { key: 'customOptions', label: 'Plumbing Options', value: summarizeCustomOptions(plumbing.customOptions) },
  ]);
}

function extractElectricalFields(proposal: Proposal): WorkflowFieldSnapshot[] {
  const electrical = proposal.electrical || ({} as Proposal['electrical']);
  const runs = electrical.runs || ({} as Proposal['electrical']['runs']);
  const plumbingRuns = proposal.plumbing?.runs || ({} as Proposal['plumbing']['runs']);
  return compactSnapshots([
    { key: 'gasRun', label: 'Gas Run', value: formatNumber(plumbingRuns.gasRun, ' LF') },
    { key: 'electricalRun', label: 'Equipment Electrical Run', value: formatNumber(runs.electricalRun, ' LF') },
    { key: 'lightRun', label: 'Light Run', value: formatNumber(runs.lightRun, ' LF') },
    { key: 'heatPumpElectricalRun', label: 'Heat Pump Electrical Run', value: formatNumber(runs.heatPumpElectricalRun, ' LF') },
    { key: 'customOptions', label: 'Electrical Options', value: summarizeCustomOptions(electrical.customOptions) },
  ]);
}

function extractTileCopingDeckingFields(proposal: Proposal): WorkflowFieldSnapshot[] {
  const tile = proposal.tileCopingDecking || ({} as Proposal['tileCopingDecking']);
  const additionalDeckingSelections = Array.isArray(tile.additionalDeckingSelections)
    ? tile.additionalDeckingSelections
    : [];
  return compactSnapshots([
    { key: 'tileLevel', label: 'Tile Level', value: formatNumber(tile.tileLevel) },
    { key: 'additionalTileLength', label: 'Additional Tile Length', value: formatNumber(tile.additionalTileLength, ' LF') },
    { key: 'trimTile', label: 'Trim Tile On Steps', value: formatBoolean(tile.hasTrimTileOnSteps) },
    { key: 'copingType', label: 'Coping Type', value: normalizeText(tile.copingType) || 'None' },
    { key: 'copingSize', label: 'Coping Size', value: normalizeText(tile.copingSize) },
    { key: 'copingLength', label: 'Coping Length', value: formatNumber(tile.copingLength, ' LF') },
    { key: 'deckingType', label: 'Decking Type', value: normalizeText(tile.deckingType) || 'None' },
    { key: 'deckingArea', label: 'Decking Area', value: formatNumber(tile.deckingArea, ' SQFT') },
    {
      key: 'additionalDecking',
      label: 'Additional Decking',
      value: additionalDeckingSelections.length
        ? additionalDeckingSelections
            .map((selection) => `${normalizeText(selection?.deckingType) || 'Decking'} ${formatNumber(selection?.area, ' SQFT')}`)
            .join(', ')
        : 'None',
    },
    { key: 'concreteSteps', label: 'Concrete Steps', value: formatNumber(tile.concreteStepsLength, ' LF') },
    { key: 'bullnose', label: 'Bullnose', value: formatNumber(tile.bullnoseLnft, ' LF') },
    { key: 'doubleBullnose', label: 'Double Bullnose', value: formatNumber(tile.doubleBullnoseLnft, ' LF') },
    { key: 'spillway', label: 'Spillway', value: formatNumber(tile.spillwayLnft, ' LF') },
    { key: 'panelLedgeRockwork', label: 'Panel Ledge Rockwork', value: formatNumber(tile.rockworkPanelLedgeSqft, ' SQFT') },
    { key: 'stackedStone', label: 'Stacked Stone', value: formatNumber(tile.rockworkStackedStoneSqft, ' SQFT') },
    { key: 'tileRockwork', label: 'Tile Rockwork', value: formatNumber(tile.rockworkTileSqft, ' SQFT') },
    { key: 'roughGrading', label: 'Rough Grading', value: formatBoolean(tile.hasRoughGrading) },
    { key: 'customOptions', label: 'Tile / Decking Options', value: summarizeCustomOptions(tile.customOptions) },
  ]);
}

function extractDrainageFields(proposal: Proposal): WorkflowFieldSnapshot[] {
  const drainage = proposal.drainage || ({} as Proposal['drainage']);
  return compactSnapshots([
    { key: 'downspouts', label: 'Downspouts', value: formatNumber(drainage.downspoutTotalLF, ' LF') },
    { key: 'deckDrain', label: 'Deck Drain', value: formatNumber(drainage.deckDrainTotalLF, ' LF') },
    { key: 'frenchDrain', label: 'French Drain', value: formatNumber(drainage.frenchDrainTotalLF, ' LF') },
    { key: 'boxDrain', label: 'Box Drain', value: formatNumber(drainage.boxDrainTotalLF, ' LF') },
    { key: 'customOptions', label: 'Drainage Options', value: summarizeCustomOptions(drainage.customOptions) },
  ]);
}

function extractEquipmentFields(proposal: Proposal): WorkflowFieldSnapshot[] {
  const equipment = proposal.equipment || ({} as Proposal['equipment']);
  const poolLights = Array.isArray(equipment.poolLights) ? equipment.poolLights : [];
  const spaLights = Array.isArray(equipment.spaLights) ? equipment.spaLights : [];
  return compactSnapshots([
    { key: 'pump', label: 'Pump', value: formatNamedSelection(equipment.pump, 'no pump') },
    { key: 'pumpQty', label: 'Pump Quantity', value: formatNumber(equipment.pumpQuantity) },
    { key: 'additionalPumps', label: 'Additional Pumps', value: summarizePumpArray(equipment.additionalPumps) },
    { key: 'auxiliaryPumps', label: 'Auxiliary Pumps', value: summarizePumpArray(equipment.auxiliaryPumps) },
    { key: 'filter', label: 'Filter', value: formatNamedSelection(equipment.filter, 'no filter') },
    { key: 'filterQty', label: 'Filter Quantity', value: formatNumber(equipment.filterQuantity) },
    { key: 'cleaner', label: 'Cleaner', value: formatNamedSelection(equipment.cleaner, 'no cleaner') },
    { key: 'cleanerQty', label: 'Cleaner Quantity', value: formatNumber(equipment.cleanerQuantity) },
    { key: 'heater', label: 'Heater', value: formatNamedSelection(equipment.heater, 'no heater') },
    { key: 'heaterQty', label: 'Heater Quantity', value: formatNumber(equipment.heaterQuantity) },
    { key: 'automation', label: 'Automation', value: formatNamedSelection(equipment.automation, 'no automation') },
    { key: 'automationQty', label: 'Automation Quantity', value: formatNumber(equipment.automationQuantity) },
    { key: 'automationZones', label: 'Automation Zones', value: formatNumber(equipment.automation?.zones) },
    { key: 'saltSystem', label: 'Salt System', value: formatNamedSelection(equipment.saltSystem, 'no salt') },
    { key: 'saltQty', label: 'Salt System Quantity', value: formatNumber(equipment.saltSystemQuantity) },
    { key: 'additionalSaltSystem', label: 'Additional Salt System', value: formatNamedSelection(equipment.additionalSaltSystem, 'no salt') },
    { key: 'autoFillSystem', label: 'Auto-Fill System', value: formatNamedSelection(equipment.autoFillSystem, 'no auto') },
    { key: 'autoFillQty', label: 'Auto-Fill Quantity', value: formatNumber(equipment.autoFillSystemQuantity) },
    { key: 'sanitationAccessory', label: 'Sanitation Accessory', value: formatNamedSelection(equipment.sanitationAccessory) },
    { key: 'sanitationAccessoryQty', label: 'Sanitation Accessory Quantity', value: formatNumber(equipment.sanitationAccessoryQuantity) },
    { key: 'poolLights', label: 'Pool Lights', value: summarizeNamedList(poolLights.map((entry) => entry?.name), { noneValue: 'None' }) },
    { key: 'spaLights', label: 'Spa Lights', value: summarizeNamedList(spaLights.map((entry) => entry?.name), { noneValue: 'None' }) },
    { key: 'blanketReel', label: 'Blanket Reel', value: formatBoolean(equipment.hasBlanketReel) },
    { key: 'solarBlanket', label: 'Solar Blanket', value: formatBoolean(equipment.hasSolarBlanket) },
    { key: 'handrail', label: 'Handrail', value: formatBoolean(equipment.hasHandrail) },
    { key: 'startupChemicals', label: 'Startup Chemicals', value: formatBoolean(equipment.hasStartupChemicals) },
    { key: 'customOptions', label: 'Equipment Options', value: summarizeCustomOptions(equipment.customOptions) },
  ]);
}

function extractWaterFeatureFields(proposal: Proposal): WorkflowFieldSnapshot[] {
  const waterFeatures = proposal.waterFeatures || ({} as Proposal['waterFeatures']);
  return compactSnapshots([
    { key: 'selections', label: 'Selections', value: summarizeWaterFeatureSelections(waterFeatures) },
    { key: 'customOptions', label: 'Water Feature Options', value: summarizeCustomOptions(waterFeatures.customOptions) },
  ]);
}

function extractCustomFeatureFields(proposal: Proposal): WorkflowFieldSnapshot[] {
  const customFeatures = proposal.customFeatures || ({} as Proposal['customFeatures']);
  return compactSnapshots([
    { key: 'features', label: 'Custom Features', value: summarizeCustomFeatures(customFeatures.features) },
    { key: 'totalCost', label: 'Custom Feature Total', value: formatCurrencyValue(customFeatures.totalCost) },
  ]);
}

function extractInteriorFinishFields(proposal: Proposal): WorkflowFieldSnapshot[] {
  const finish = proposal.interiorFinish || ({} as Proposal['interiorFinish']);
  return compactSnapshots([
    { key: 'finishType', label: 'Finish Type', value: normalizeText(finish.finishType) },
    { key: 'color', label: 'Finish Color', value: normalizeText(finish.color) },
    { key: 'surfaceArea', label: 'Finish Surface Area', value: formatNumber(finish.surfaceArea, ' SQFT') },
    { key: 'hasSpa', label: 'Interior Finish Includes Spa', value: formatBoolean(finish.hasSpa) },
    { key: 'waterproofing', label: 'Waterproofing', value: formatBoolean(finish.hasWaterproofing) },
    { key: 'customOptions', label: 'Interior Finish Options', value: summarizeCustomOptions(finish.customOptions) },
  ]);
}

function extractPricingAdjustmentFields(proposal: Proposal): WorkflowFieldSnapshot[] {
  const manual = proposal.manualAdjustments || ({} as Proposal['manualAdjustments']);
  return compactSnapshots([
    { key: 'manualPositive1', label: 'Manual Positive 1', value: formatCurrencyValue(manual.positive1) },
    { key: 'manualPositive2', label: 'Manual Positive 2', value: formatCurrencyValue(manual.positive2) },
    { key: 'manualNegative1', label: 'Manual Negative 1', value: formatCurrencyValue(manual.negative1) },
    { key: 'manualNegative2', label: 'Manual Negative 2', value: formatCurrencyValue(manual.negative2) },
    { key: 'retailAdjustments', label: 'Retail Adjustments', value: summarizeRetailAdjustments(proposal.retailAdjustments) },
    { key: 'contractOverrides', label: 'Contract Overrides', value: summarizeContractOverrides(proposal.contractOverrides) },
  ]);
}

function extractWarrantyFields(proposal: Proposal): WorkflowFieldSnapshot[] {
  return compactSnapshots([
    { key: 'warrantySections', label: 'Warranty Sections', value: summarizeWarrantySections(proposal.warrantySections) },
  ]);
}

COST_DIFF_GROUPS.push(
  {
    key: 'poolSpecs',
    label: 'Pool Specs',
    costKeys: ['plansAndEngineering', 'layout', 'permit', 'shotcreteLabor', 'shotcreteMaterial', 'fiberglassShell', 'fiberglassInstall', 'startupOrientation'],
    extractFields: extractPoolSpecsFields,
  },
  {
    key: 'excavation',
    label: 'Excavation',
    costKeys: ['excavation', 'steel', 'cleanup'],
    extractFields: extractExcavationFields,
  },
  {
    key: 'plumbing',
    label: 'Plumbing',
    costKeys: ['plumbing'],
    extractFields: extractPlumbingFields,
  },
  {
    key: 'electrical',
    label: 'Gas / Electrical',
    costKeys: ['gas', 'electrical'],
    extractFields: extractElectricalFields,
  },
  {
    key: 'tileCopingDecking',
    label: 'Tile / Coping / Decking',
    costKeys: ['tileLabor', 'tileMaterial', 'copingDeckingLabor', 'copingDeckingMaterial', 'stoneRockworkLabor', 'stoneRockworkMaterial'],
    extractFields: extractTileCopingDeckingFields,
  },
  {
    key: 'drainage',
    label: 'Drainage',
    costKeys: ['drainage'],
    extractFields: extractDrainageFields,
  },
  {
    key: 'equipment',
    label: 'Equipment',
    costKeys: ['equipmentOrdered', 'equipmentSet'],
    extractFields: extractEquipmentFields,
  },
  {
    key: 'waterFeatures',
    label: 'Water Features',
    costKeys: ['waterFeatures'],
    extractFields: extractWaterFeatureFields,
  },
  {
    key: 'customFeatures',
    label: 'Custom Features',
    costKeys: ['customFeatures'],
    extractFields: extractCustomFeatureFields,
  },
  {
    key: 'interiorFinish',
    label: 'Interior Finish',
    costKeys: ['interiorFinish', 'waterTruck'],
    extractFields: extractInteriorFinishFields,
  },
  {
    key: 'pricingAdjustments',
    label: 'Pricing Adjustments',
    costKeys: [],
    extractFields: extractPricingAdjustmentFields,
  },
  {
    key: 'warranty',
    label: 'Warranty',
    costKeys: [],
    extractFields: extractWarrantyFields,
  }
);

export function buildWorkflowActor(session?: UserSession | null): ProposalWorkflowActor {
  const current = getCurrentSession(session);
  return {
    userId: current?.userId,
    name: current?.userName || current?.userEmail || 'User',
    email: current?.userEmail || null,
    role: normalizeRole(current?.role),
  };
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
        proposal.workflow.approvedVersionId ||
        (proposal.workflow.history && proposal.workflow.history.length > 0)
      )
  );
  const shouldResetLegacySubmittedProposal =
    !hasWorkflowState &&
    (rawStatus === 'submitted' || rawStatus === 'approved' || rawStatus === 'rejected');
  const workflow = proposal.workflow || ({} as ProposalWorkflowState);
  const currentVersionId = proposal.activeVersionId || proposal.versionId || ORIGINAL_VERSION_ID;
  let normalizedStatus = shouldResetLegacySubmittedProposal ? 'draft' : getWorkflowStatus(proposal);
  let approvedVersionId = shouldResetLegacySubmittedProposal
    ? null
    : normalizeText(
        workflow.approvedVersionId ||
          (workflow.approved === true || normalizedStatus === 'completed'
            ? workflow.submittedVersionId || workflow.reviewVersionId || currentVersionId
            : null)
      ) || null;
  let approvedVersionIds = shouldResetLegacySubmittedProposal
    ? []
    : dedupeVersionIds(workflow.approvedVersionIds, approvedVersionId);
  let pendingReviewVersionId = shouldResetLegacySubmittedProposal
    ? null
    : normalizeText(workflow.reviewVersionId || workflow.submittedVersionId) || null;

  if (normalizedStatus === 'submitted' && !approvedVersionId && pendingReviewVersionId) {
    normalizedStatus = 'needs_approval';
  }

  if (!isPendingReviewStatus(normalizedStatus)) {
    pendingReviewVersionId = null;
  }

  if (!approvedVersionId && normalizedStatus === 'completed') {
    approvedVersionId = normalizeText(workflow.submittedVersionId || workflow.reviewVersionId || currentVersionId) || null;
    approvedVersionIds = dedupeVersionIds(approvedVersionIds, approvedVersionId);
  }

  const history = normalizeHistory(workflow.history);
  const approved = Boolean(approvedVersionId);
  const submittedVersionId = pendingReviewVersionId || approvedVersionId || normalizeText(workflow.submittedVersionId) || null;

  return {
    ...proposal,
    status: normalizedStatus,
    versionLocked: shouldResetLegacySubmittedProposal ? false : proposal.versionLocked === true,
    versionLockedAt: shouldResetLegacySubmittedProposal ? null : proposal.versionLockedAt || null,
    versionSubmittedAt: shouldResetLegacySubmittedProposal ? null : proposal.versionSubmittedAt || null,
    versionSubmittedBy: shouldResetLegacySubmittedProposal ? null : proposal.versionSubmittedBy || null,
    workflow: {
      status: normalizedStatus,
      reviewVersionId: pendingReviewVersionId,
      submittedVersionId,
      approvedVersionId,
      approvedVersionIds,
      submittedAt: shouldResetLegacySubmittedProposal ? null : workflow.submittedAt || null,
      submittedBy: shouldResetLegacySubmittedProposal ? null : workflow.submittedBy || null,
      manualReviewRequested: shouldResetLegacySubmittedProposal ? false : workflow.manualReviewRequested === true,
      manualReviewMessage: shouldResetLegacySubmittedProposal ? null : workflow.manualReviewMessage || null,
      needsApproval: shouldResetLegacySubmittedProposal ? false : isPendingReviewStatus(normalizedStatus),
      approvalReasons: shouldResetLegacySubmittedProposal ? [] : Array.isArray(workflow.approvalReasons) ? workflow.approvalReasons : [],
      approved,
      approvedAt: shouldResetLegacySubmittedProposal ? null : workflow.approvedAt || null,
      approvedBy: shouldResetLegacySubmittedProposal ? null : workflow.approvedBy || null,
      completedAt: shouldResetLegacySubmittedProposal ? null : workflow.completedAt || null,
      completedBy: shouldResetLegacySubmittedProposal ? null : workflow.completedBy || null,
      history: shouldResetLegacySubmittedProposal ? [] : history,
    },
  };
}

export function getPendingReviewVersionId(proposal?: Partial<Proposal> | null) {
  const status = getWorkflowStatus(proposal);
  if (!isPendingReviewStatus(status)) return null;
  return normalizeText(proposal?.workflow?.reviewVersionId || proposal?.workflow?.submittedVersionId) || null;
}

export function getApprovedVersionId(proposal?: Partial<Proposal> | null) {
  return normalizeText(proposal?.workflow?.approvedVersionId) || null;
}

export function getReviewVersionId(proposal?: Partial<Proposal> | null) {
  return (
    getPendingReviewVersionId(proposal) ||
    getApprovedVersionId(proposal) ||
    normalizeText(proposal?.workflow?.submittedVersionId) ||
    proposal?.activeVersionId ||
    proposal?.versionId ||
    ORIGINAL_VERSION_ID
  );
}

export function getReviewVersion(proposal: Proposal): Proposal | null {
  const normalized = ensureProposalWorkflow(proposal);
  return getVersionById(normalized, getReviewVersionId(normalized));
}

export function getPendingReviewVersion(proposal: Proposal): Proposal | null {
  const normalized = ensureProposalWorkflow(proposal);
  return getVersionById(normalized, getPendingReviewVersionId(normalized));
}

export function getApprovedVersion(proposal: Proposal): Proposal | null {
  const normalized = ensureProposalWorkflow(proposal);
  return getVersionById(normalized, getApprovedVersionId(normalized));
}

export function hasPendingWorkflowReview(proposal?: Partial<Proposal> | null) {
  return Boolean(getPendingReviewVersionId(proposal));
}

export function getReviewerVisibleVersions(proposal: Proposal) {
  const normalized = ensureProposalWorkflow(proposal);
  const approvedVersionId = getApprovedVersionId(normalized);
  const pendingReviewVersionId = getPendingReviewVersionId(normalized);
  const versionIds = dedupeVersionIds(
    approvedVersionId ? [approvedVersionId, pendingReviewVersionId] : [pendingReviewVersionId],
    !approvedVersionId && !pendingReviewVersionId ? getReviewVersionId(normalized) : null
  );
  return normalizeVisibleVersionList(normalized, versionIds);
}

export function getReviewerPrimaryVersionId(proposal?: Partial<Proposal> | null) {
  return (
    getPendingReviewVersionId(proposal) ||
    getApprovedVersionId(proposal) ||
    getReviewVersionId(proposal)
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

function setVersionWorkflowState(
  version: Proposal,
  nextStatus: ProposalWorkflowStatus,
  options: {
    locked: boolean;
    submittedAt?: string | null;
    submittedBy?: ProposalWorkflowActor | null;
  }
) {
  return {
    ...version,
    status: nextStatus,
    versionLocked: options.locked,
    versionLockedAt: options.locked ? nowIso() : null,
    versionSubmittedAt: options.submittedAt ?? null,
    versionSubmittedBy: options.submittedBy ?? null,
    versions: [],
  };
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

  const workflow = normalized.workflow as ProposalWorkflowState;
  const currentApprovedVersionId = getApprovedVersionId(normalized);
  const approvedVersionIds = dedupeVersionIds(workflow.approvedVersionIds, currentApprovedVersionId);
  const reviewKind = currentApprovedVersionId ? 'proposal_addendum' : 'initial_submission';
  const reasons = collectApprovalReasons(targetVersion, options, session);
  const nextStatus: ProposalWorkflowStatus = 'needs_approval';
  const submittedAt = nowIso();
  const nextHistory = [
    ...normalizeHistory(workflow.history),
    createWorkflowEvent('submitted', actor, {
      message: options?.message,
      versionId: targetVersion.versionId || ORIGINAL_VERSION_ID,
      fromStatus: getWorkflowStatus(normalized),
      toStatus: nextStatus,
      metadata: {
        reasons,
        reviewKind,
      },
    }),
  ];

  const updatedVersions = allVersions.map((entry) => {
    const entryId = entry.versionId || ORIGINAL_VERSION_ID;
    if (entryId === (targetVersion.versionId || ORIGINAL_VERSION_ID)) {
      return setVersionWorkflowState(entry, nextStatus, {
        locked: true,
        submittedAt,
        submittedBy: actor,
      });
    }

    if (approvedVersionIds.includes(entryId)) {
      const baselineStatus = getWorkflowStatus(normalized) === 'completed' ? 'completed' : 'submitted';
      return setVersionWorkflowState(entry, baselineStatus, {
        locked: true,
        submittedAt: entry.versionSubmittedAt || workflow.approvedAt || workflow.submittedAt || null,
        submittedBy: entry.versionSubmittedBy || workflow.approvedBy || workflow.submittedBy || null,
      });
    }

    return setVersionWorkflowState(entry, 'draft', {
      locked: Boolean(currentApprovedVersionId && entry.versionLocked),
      submittedAt: currentApprovedVersionId && entry.versionLocked ? entry.versionSubmittedAt || null : null,
      submittedBy: currentApprovedVersionId && entry.versionLocked ? entry.versionSubmittedBy || null : null,
    });
  });

  const nextWorkflow: ProposalWorkflowState = {
    ...workflow,
    status: nextStatus,
    reviewVersionId: targetVersion.versionId || ORIGINAL_VERSION_ID,
    submittedVersionId: targetVersion.versionId || ORIGINAL_VERSION_ID,
    approvedVersionId: currentApprovedVersionId,
    approvedVersionIds,
    submittedAt,
    submittedBy: actor,
    manualReviewRequested: options?.manualReviewRequested === true,
    manualReviewMessage: normalizeText(options?.message) || null,
    needsApproval: true,
    approvalReasons: reasons,
    approved: Boolean(currentApprovedVersionId),
    approvedAt: workflow.approvedAt || null,
    approvedBy: workflow.approvedBy || null,
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
  const reviewVersionId = getPendingReviewVersionId(proposal) || getReviewVersionId(proposal);
  return listAllVersions(proposal).map((entry) => {
    const entryId = entry.versionId || ORIGINAL_VERSION_ID;
    if (entryId !== reviewVersionId) {
      return { ...entry, versions: [] };
    }
    return {
      ...entry,
      status: nextStatus,
      versionLocked: true,
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
  const pendingReviewVersionId = getPendingReviewVersionId(normalized);
  const targetApprovedVersionId = pendingReviewVersionId || getReviewVersionId(normalized);
  const priorApprovedVersionId = getApprovedVersionId(normalized);
  const approvedVersionIds = dedupeVersionIds(
    (normalized.workflow as ProposalWorkflowState)?.approvedVersionIds,
    priorApprovedVersionId
  );
  const nextApprovedVersionIds = dedupeVersionIds(approvedVersionIds, targetApprovedVersionId);
  const updatedVersions = listAllVersions(normalized).map((entry) => {
    const entryId = entry.versionId || ORIGINAL_VERSION_ID;
    if (entryId === targetApprovedVersionId || nextApprovedVersionIds.includes(entryId)) {
      return setVersionWorkflowState(entry, 'submitted', {
        locked: true,
        submittedAt: entry.versionSubmittedAt || normalized.workflow?.submittedAt || null,
        submittedBy: entry.versionSubmittedBy || normalized.workflow?.submittedBy || null,
      });
    }
    return setVersionWorkflowState(entry, 'draft', {
      locked: true,
      submittedAt: entry.versionSubmittedAt || null,
      submittedBy: entry.versionSubmittedBy || null,
    });
  });
  const nextWorkflow: ProposalWorkflowState = {
    ...workflow,
    status: 'submitted',
    reviewVersionId: null,
    submittedVersionId: targetApprovedVersionId,
    approvedVersionId: targetApprovedVersionId,
    approvedVersionIds: nextApprovedVersionIds,
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
  const targetVersionId = getApprovedVersionId(normalized) || getReviewVersionId(normalized);
  const updatedVersions = listAllVersions(normalized).map((entry) => {
    const entryId = entry.versionId || ORIGINAL_VERSION_ID;
    if (entryId !== targetVersionId) {
      return { ...entry, versions: [] };
    }
    return setVersionWorkflowState(entry, 'completed', {
      locked: true,
      submittedAt: entry.versionSubmittedAt || normalized.workflow?.submittedAt || null,
      submittedBy: entry.versionSubmittedBy || normalized.workflow?.submittedBy || null,
    });
  });
  const nextWorkflow: ProposalWorkflowState = {
    ...workflow,
    status: 'completed',
    reviewVersionId: null,
    submittedVersionId: getApprovedVersionId(normalized) || workflow.submittedVersionId || null,
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
  const categories = buildDetailedDiffCategories(current as Proposal, previous as Proposal);
  return categories.map((category) => category.label);
}

function getWorkflowComparisonVersions(proposal: Proposal) {
  const normalized = ensureProposalWorkflow(proposal);
  const approvedVersion = getApprovedVersion(normalized);
  const reviewVersion = getPendingReviewVersion(normalized);
  if (!approvedVersion || !reviewVersion) return null;
  if ((approvedVersion.versionId || ORIGINAL_VERSION_ID) === (reviewVersion.versionId || ORIGINAL_VERSION_ID)) {
    return null;
  }
  return {
    approvedVersion,
    reviewVersion,
  };
}

export function buildVersionDiffSummary(proposal: Proposal): VersionDiffSummary | null {
  const normalized = ensureProposalWorkflow(proposal);
  const comparison = getWorkflowComparisonVersions(normalized);
  if (!comparison) return null;

  const { approvedVersion, reviewVersion } = comparison;
  const currentRetail = toFiniteNumber(reviewVersion.pricing?.retailPrice || reviewVersion.totalCost);
  const compareRetail = toFiniteNumber(approvedVersion.pricing?.retailPrice || approvedVersion.totalCost);
  const currentCost = toFiniteNumber(reviewVersion.pricing?.totalCOGS);
  const compareCost = toFiniteNumber(approvedVersion.pricing?.totalCOGS);
  const currentGrossProfit = toFiniteNumber(reviewVersion.pricing?.grossProfit);
  const compareGrossProfit = toFiniteNumber(approvedVersion.pricing?.grossProfit);
  const currentGrossMargin = toFiniteNumber(reviewVersion.pricing?.grossProfitMargin);
  const compareGrossMargin = toFiniteNumber(approvedVersion.pricing?.grossProfitMargin);
  const currentDiscount = getNonPapDiscountTotal(reviewVersion);
  const compareDiscount = getNonPapDiscountTotal(approvedVersion);
  const categories = buildDetailedDiffCategories(reviewVersion, approvedVersion);

  return {
    reviewVersionId: reviewVersion.versionId || ORIGINAL_VERSION_ID,
    compareVersionId: approvedVersion.versionId || null,
    approvedVersionId: approvedVersion.versionId || null,
    reviewVersionName: getVersionName(reviewVersion),
    compareVersionName: getVersionName(approvedVersion),
    comparisonKind: 'proposal_addendum',
    changedSections: categories.map((category) => category.label),
    retailDelta: currentRetail - compareRetail,
    costDelta: currentCost - compareCost,
    grossProfitDelta: currentGrossProfit - compareGrossProfit,
    grossMarginDelta: currentGrossMargin - compareGrossMargin,
    discountDelta: currentDiscount - compareDiscount,
    contractOverrideDelta:
      Object.keys(reviewVersion.contractOverrides || {}).length -
      Object.keys(approvedVersion.contractOverrides || {}).length,
    noteIndicator: Boolean(normalized.workflow?.manualReviewMessage),
    categories,
  };
}
