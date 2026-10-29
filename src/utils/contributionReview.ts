import type { Proposal } from '../types/proposal-new';
import type { CollaborationRequest } from '../services/proposalCollaboration';
import type { PricingData } from '../services/pricingTiers';
import { contributionValue } from './contributionInputs';
import { getTileSelectionId, getTileOptionLabel, getTrimTileContractLabel, getCopingOptionLabel, getDeckingOptionLabel } from './tileCopingCatalogs';
import { getAdditionalDeckingSelections, getResolvedProposalPrimaryDeckingArea } from './decking';
import { flattenWaterFeatures } from './waterFeatureCost';
import { getExcavationOptionQuantity } from './excavationOptionQuantities';

const bodyFields = [
  'customerInfo','poolSpecs','excavation','plumbing','electrical','tileCopingDecking',
  'drainage','equipment','waterFeatures','customFeatures','masonry','interiorFinish',
  'papDiscounts','manualAdjustments','retailAdjustments',
  'notes','contractOverrides','warrantySections',
];

type Difference = { path: string; before: unknown; after: unknown };
function compareValue(before: unknown, after: unknown, path: string, result: Difference[]) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  if (before && after && typeof before === 'object' && typeof after === 'object'
    && !Array.isArray(before) && !Array.isArray(after)) {
    const oldRecord = before as Record<string, unknown>;
    const newRecord = after as Record<string, unknown>;
    for (const key of new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)])) {
      compareValue(oldRecord[key], newRecord[key], `${path}.${key}`, result);
    }
    return;
  }
  result.push({ path, before, after });
}
function requestDifferences(request: CollaborationRequest) {
  const differences: Difference[] = [];
  for (const field of bodyFields) {
    const explicit = ['customFeatures', 'manualAdjustments', 'retailAdjustments', 'contractOverrides'].includes(field);
    compareValue(contributionValue((request.base_version_json as any)?.[field], explicit),
      contributionValue((request.working_version_json as any)?.[field], explicit), field, differences);
  }
  return differences;
}
function displayValue(value: unknown, path: string): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map((entry) => displayValue(entry, path)).join(', ') : 'None';
  if (typeof value === 'object') {
    const entry = value as Record<string, unknown>;
    if (typeof entry.name === 'string') {
      const details: string[] = [];
      if (typeof entry.quantity === 'number') details.push(`Qty: ${entry.quantity}`);
      for (const field of ['model', 'zones', 'sqft', 'btu', 'includesSaltCell']) {
        if (entry[field] != null) details.push(`${titleCase(field)}: ${displayValue(entry[field], path)}`);
      }
      if (/customOptions|customFeatures/.test(path)) {
        if (entry.description) details.push(String(entry.description));
        if (entry.groupedSqft != null) details.push(`${entry.groupedSqft} sq ft`);
        if (entry.groupedAddonLabel) details.push(`${entry.groupedAddonLabel} (Qty: ${entry.groupedAddonQuantity || 0})`);
        if (entry.laborCost != null) details.push(`Labor: ${formatMoney(entry.laborCost)}`);
        if (entry.materialCost != null) details.push(`Material: ${formatMoney(entry.materialCost)}`);
        details.push(contract(Boolean(entry.isOffContract)));
      }
      if (entry.amount != null) details.push(formatMoney(entry.amount));
      return [displayValue(entry.name, path), ...details].join('; ');
    }
    if (typeof entry.label === 'string') return displayValue(entry.label, path) || 'None';
    return Object.entries(entry).filter(([key]) => !/^(price|basePrice|addCost\d*|total|cost|id)$/i.test(key))
      .map(([key, item]) => `${titleCase(key)}: ${displayValue(item, `${path}.${key}`)}`).join(', ') || 'Configured';
  }
  return String(value).replace(/\bgunite\b/gi, 'Shotcrete');
}
export function titleCase(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ')
    .replace(/\b(level)(\d)/gi, '$1 $2').replace(/\b\w/g, (character) => character.toUpperCase());
}
export function displayPath(path: string) {
  return path.split('.').slice(1).map(titleCase).join(' › ') || titleCase(path);
}
export function displayGroup(path: string) {
  return titleCase(path.split('.')[0]);
}
export function formatMoney(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : '—';
}

export type ReviewRow = { key: string; category: string; label: string; before: string; after: string; paths: string[] };
function changedDetail(value: unknown, path: string): string {
  if (Array.isArray(value)) return value.length ? value.map(item => changedDetail(item, path)).join(' | ') : 'None';
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => `${titleCase(key)}: ${changedDetail(item, `${path}.${key}`)}`).join('; ');
  }
  return displayValue(value, path);
}
function getAtPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => (current as Record<string, unknown> | null)?.[key], value);
}
export function proposalWithReviewRow(base: Proposal, after: Proposal, row: ReviewRow): Proposal {
  const copy = JSON.parse(JSON.stringify(base)) as Record<string, any>;
  for (const path of row.paths) {
    const segments = path.split('.');
    let target: Record<string, any> = copy;
    for (const segment of segments.slice(0, -1)) target = target[segment] ||= {};
    const value = getAtPath(after, path);
    if (value === undefined) delete target[segments[segments.length - 1]];
    else target[segments[segments.length - 1]] = JSON.parse(JSON.stringify(value));
  }
  return copy as Proposal;
}

type SelectionGroup = {
  key: string;
  label: string;
  paths: string[];
  describe: (proposal: Proposal, pricing?: PricingData) => string;
};
const fieldGroup = (key: string, label: string, paths: string[], describe: SelectionGroup['describe']): SelectionGroup =>
  ({ key, label, paths, describe });
const tilePaths = (...fields: string[]) => fields.map(field => `tileCopingDecking.${field}`);
const words = (value: unknown) => !value || value === 'none' ? 'None' : titleCase(String(value));
const contract = (enabled?: boolean) => enabled ? 'Off-Contract' : 'On Contract';
const quantity = (value: unknown, fallback = 1) => Number(value ?? fallback);
const equipmentValue = (proposal: Proposal, field: string, quantityField?: string) => {
  const equipment = proposal.equipment as any;
  const selection = equipment?.[field];
  const name = selection?.name || 'None';
  const details = [`${name} (Qty: ${quantity(equipment?.[quantityField || `${field}Quantity`], selection ? 1 : 0)})`];
  if (selection?.model && !name.includes(selection.model)) details.push(String(selection.model));
  if (selection?.zones != null) details.push(`Additional Zones: ${selection.zones}`);
  if (selection?.sqft != null) details.push(`${selection.sqft} sq ft`);
  if (selection?.btu != null) details.push(`${selection.btu} BTU`);
  if (selection?.includesSaltCell != null) details.push(`Includes Salt Cell: ${selection.includesSaltCell ? 'Yes' : 'No'}`);
  return details.join('; ');
};

// Each descriptor represents a user choice, including its legacy mirrors and
// dependent inputs. The same paths drive both its display and price replay.
const selectionGroups: SelectionGroup[] = [
  fieldGroup('poolSpecs.fiberglassModel', 'Fiberglass Pool Model', ['poolSpecs.fiberglassModelName', 'poolSpecs.fiberglassSize'],
    p => p.poolSpecs?.fiberglassModelName || words(p.poolSpecs?.fiberglassSize)),
  fieldGroup('poolSpecs.automaticCover', 'Automatic Cover', ['poolSpecs.hasAutomaticCover', 'poolSpecs.automaticCoverManufacturerCost'], p =>
    p.poolSpecs?.hasAutomaticCover ? `Yes; Manufacturer Cost: ${formatMoney(p.poolSpecs.automaticCoverManufacturerCost || 0)}` : 'None'),
  fieldGroup('poolSpecs.tanningShelf', 'Tanning Shelf / Ledge', ['poolSpecs.hasTanningShelf', 'poolSpecs.fiberglassTanningLedgeName'], p =>
    p.poolSpecs?.hasTanningShelf ? p.poolSpecs.fiberglassTanningLedgeName || 'Yes' : 'None'),
  fieldGroup('poolSpecs.spa', 'Spa', ['poolSpecs.spaType', 'poolSpecs.spaFiberglassModelName'], p =>
    p.poolSpecs?.spaType === 'none' ? 'None' : p.poolSpecs?.spaFiberglassModelName || displayValue(p.poolSpecs?.spaType, 'poolSpecs.spaType')),
  fieldGroup('tileCopingDecking.tile', 'Tile Level', tilePaths('tileLevel', 'tileOptionId'), (p, pricing) => {
    const id = getTileSelectionId(p.tileCopingDecking);
    return /^level[123]$/.test(id) ? id.slice(-1) : id ? getTileOptionLabel(pricing?.tileCoping, id) : 'None';
  }),
  fieldGroup('tileCopingDecking.trimTile', 'Trim Tile', tilePaths('trimTileOptionId', 'hasTrimTileOnSteps'),
    (p, pricing) => getTrimTileContractLabel(pricing?.tileCoping, p.tileCopingDecking)),
  fieldGroup('tileCopingDecking.coping', 'Coping', tilePaths('copingType', 'copingSize'), (p, pricing) => {
    const data = p.tileCopingDecking;
    const name = getCopingOptionLabel(pricing?.tileCoping, data?.copingType);
    return `${name || 'None'}${data?.copingType && data.copingType !== 'none' && data.copingSize ? ` (${data.copingSize})` : ''}`;
  }),
  fieldGroup('tileCopingDecking.decking', 'Decking', [...tilePaths('deckingType', 'deckingArea', 'isDeckingOffContract',
    'isDeckingWasteRemoved', 'deckingOffContractCost'), 'poolSpecs.deckingArea'], (p, pricing) => {
    const d = p.tileCopingDecking;
    return `${getDeckingOptionLabel(pricing?.tileCoping, d?.deckingType) || 'None'}; ${getResolvedProposalPrimaryDeckingArea(p)} sq ft; ${contract(d?.isDeckingOffContract)}${d?.isDeckingWasteRemoved ? '; Waste Removed' : ''}${d?.deckingOffContractCost ? `; Off-Contract Cost: ${formatMoney(d.deckingOffContractCost)}` : ''}`;
  }),
  fieldGroup('tileCopingDecking.additionalDecking', 'Additional Decking', tilePaths('additionalDeckingSelections',
    'additionalDeckingType', 'additionalDeckingArea', 'isAdditionalDeckingOffContract', 'isAdditionalDeckingWasteRemoved'),
  (p, pricing) => getAdditionalDeckingSelections(p.tileCopingDecking).map(d => {
    const option = pricing?.tileCoping?.decking?.additionalOptions?.find((option: any) => option.id === d.deckingType) as any;
    return `${option?.name || option?.label || getDeckingOptionLabel(pricing?.tileCoping, d.deckingType)}; ${d.area} sq ft; ${contract(d.isOffContract)}`;
  }).join(' | ') + (p.tileCopingDecking?.isAdditionalDeckingWasteRemoved ? '; Waste Removed' : '') || 'None'),
  ...['pump', 'filter', 'cleaner', 'heater', 'heaterChiller', 'automation', 'saltSystem', 'sanitationAccessory'].map(field =>
    fieldGroup(`equipment.${field}`, titleCase(field), [`equipment.${field}`, `equipment.${field}Quantity`],
      p => equipmentValue(p, field))),
  fieldGroup('equipment.autoFillSystem', 'Auto-Fill System', ['equipment.autoFillSystem', 'equipment.autoFillSystemQuantity', 'equipment.hasAutoFill'],
    p => equipmentValue(p, 'autoFillSystem')),
  fieldGroup('equipment.poolLights', 'Pool Lights', ['equipment.poolLights', 'equipment.includePoolLights',
    'equipment.applyCustomPackageDefaultPoolLights', 'equipment.numberOfLights'], p =>
    p.equipment?.includePoolLights === false ? 'None' : p.equipment?.poolLights?.length
      ? displayValue(p.equipment.poolLights, 'equipment.poolLights') : p.equipment?.numberOfLights
        ? `Additional lights (Qty: ${p.equipment.numberOfLights})` : 'None'),
  fieldGroup('equipment.spaLights', 'Spa Lights', ['equipment.spaLights', 'equipment.includeSpaLights', 'equipment.hasSpaLight'], p =>
    p.equipment?.includeSpaLights === false ? 'None' : p.equipment?.spaLights?.length
      ? displayValue(p.equipment.spaLights, 'equipment.spaLights') : p.equipment?.hasSpaLight ? 'Spa light (Qty: 1)' : 'None'),
  fieldGroup('equipment.auxiliaryPumps', 'Blowers', ['equipment.auxiliaryPump', 'equipment.auxiliaryPumps'], p =>
    displayValue(p.equipment?.auxiliaryPumps?.length ? p.equipment.auxiliaryPumps : p.equipment?.auxiliaryPump, 'equipment.auxiliaryPumps')),
  fieldGroup('equipment.package', 'Equipment Package', ['equipment.packageSelectionId', 'equipment.packageSelectionTouched'], (p, pricing) => {
    const id = p.equipment?.packageSelectionId;
    const options = (pricing as any)?.equipment?.packageOptions || [];
    return options.find((option: any) => option.id === id)?.name || words(id);
  }),
  ...[
    ['additionalSitePrep', 'Additional Site Preparation', 'hasAdditionalSitePrep', 'additionalSitePrepHours', 'hours'],
    ['additionalDigging', 'Additional Digging', 'hasAdditionalDigging', 'additionalDiggingDays', 'days'],
    ['gravelInstall', 'Gravel Installation', 'hasGravelInstall', 'gravelInstallQuantity', ''],
    ['dirtHaul', 'Dirt Haul', 'hasDirtHaul', 'dirtHaulQuantity', ''],
    ['doubleCurtain', 'Double Curtain', 'hasDoubleCurtain', 'doubleCurtainLength', 'ln ft'],
  ].map(([key, label, enabled, amount, unit]) => fieldGroup(`excavation.${key}`, label,
    [`excavation.${enabled}`, `excavation.${amount}`], p => {
      const d = p.excavation as any;
      if (!unit) return d?.[enabled] ? `Qty: ${getExcavationOptionQuantity(d[enabled], d[amount])}` : 'None';
      return d?.[enabled] === false ? 'None' : `${quantity(d?.[amount], 0)} ${unit}`;
    })),
  fieldGroup('excavation.retainingWalls', 'Retaining Walls', ['excavation.retainingWalls', 'excavation.retainingWallType', 'excavation.retainingWallLength'], p => {
    const walls = p.excavation?.retainingWalls?.length ? p.excavation.retainingWalls
      : p.excavation?.retainingWallType ? [{ type: p.excavation.retainingWallType, length: p.excavation.retainingWallLength }] : [];
    return walls.map(wall => `${words(wall.type)}; ${wall.length || 0} ln ft`).join(' | ') || 'None';
  }),
  fieldGroup('excavation.columns', 'Columns', ['excavation.columns'], p => {
    const columns = p.excavation?.columns;
    return !columns?.count ? 'None' : `Qty: ${columns.count}; ${columns.width} × ${columns.depth} × ${columns.height} ft; ${words(columns.facing)}`;
  }),
  ...(['equipment', 'interiorFinish'] as const).map(category =>
    fieldGroup(`${category}.addOns`, 'Add-ons', [`${category}.addOns`], (p, pricing) =>
      p[category]?.addOns?.map(item => pricing?.[category]?.addOns?.find(option => option.id === item.id)?.name || item.name).join(' | ') || 'None')),
  fieldGroup('interiorFinish.finish', 'Interior Finish', ['interiorFinish.finishType', 'interiorFinish.color'], (p, pricing) =>
    [pricing?.interiorFinish?.finishes?.find(finish => finish.id === p.interiorFinish?.finishType)?.name
      || words(p.interiorFinish?.finishType), p.interiorFinish?.color].filter(Boolean).join(' — ')),
  fieldGroup('waterFeatures.selections', 'Water Features', ['waterFeatures.selections'], (p, pricing) => {
    const catalog = pricing ? flattenWaterFeatures(pricing.waterFeatures) : [];
    return p.waterFeatures?.selections?.map(selection => `${catalog.find(item => item.id === selection.featureId)?.name || words(selection.featureId)} (Qty: ${selection.quantity})${selection.includeValveActuator ? '; Valve Actuator' : ''}`).join(' | ') || 'None';
  }),
];

// These are internal caches, mirrored runs, or calculated quantities rather than
// independently editable choices. Keep their values in the saved documents.
const hiddenPaths = new Set([
  'poolSpecs.approximateGallons', 'poolSpecs.spaPerimeter', 'poolSpecs.fiberglassPerimeter',
  'poolSpecs.fiberglassSpecAutofillEnabled', 'poolSpecs.fiberglassPoolSpecsAutoFilled',
  'poolSpecs.fiberglassSpaSpecsAutoFilled', 'poolSpecs.fiberglassLedgeSpecsAutoFilled',
  'excavation.additionalBench', 'tileCopingDecking.copingLength', 'interiorFinish.surfaceArea', 'interiorFinish.hasSpa',
  'equipment.hasBeenEdited', 'equipment.waterFeatureAutoPumpDismissed', 'equipment.packageSelectionTouched',
  'equipment.applyCustomPackageDefaultPoolLights', 'plumbing.runs.electricalRun', 'plumbing.runs.lightRun',
  'masonry.columnCost', 'masonry.rbbFacingCost', 'masonry.raisedSpaFacingCost',
]);

export function reviewRows(request: CollaborationRequest, pricing?: PricingData): ReviewRow[] {
  const groups = new Map<string, { definition?: SelectionGroup; differences: Difference[] }>();
  for (const difference of requestDifferences(request)) {
    if (hiddenPaths.has(difference.path)) continue;
    const definition = selectionGroups.find(group => group.paths.some(path => difference.path === path || difference.path.startsWith(`${path}.`)));
    // Equipment objects stay together; independent runs and scalar inputs remain separate.
    const key = definition?.key || (difference.path.startsWith('equipment.') ? difference.path.split('.').slice(0, 2).join('.') : difference.path);
    const group = groups.get(key) || { definition, differences: [] };
    group.differences.push(difference);
    groups.set(key, group);
  }
  return [...groups].map(([key, { definition, differences }]) => {
    const describe = (p: Proposal) => definition ? definition.describe(p, pricing) : displayValue(getAtPath(p, key), key);
    let before = describe(request.base_version_json);
    let after = describe(request.working_version_json);
    if (before === after) {
      const details = (side: 'before' | 'after') => differences.filter(item => !/\.(id|featureId)$/.test(item.path))
        .map(item => `${titleCase(item.path.split('.').slice(-1)[0])}: ${changedDetail(item[side], item.path)}`).join(', ');
      before = details('before') || before;
      after = details('after') || after;
    }
    return { key, category: displayGroup(key), label: definition?.label || displayPath(key), before, after,
      paths: definition?.paths || differences.map(item => item.path) };
  }).sort((a, b) => bodyFields.indexOf(a.key.split('.')[0]) - bodyFields.indexOf(b.key.split('.')[0]));
}

/** Enumerate readable choices without treating an entire missing section as one change. */
export function proposalSelectionRows(proposal: Proposal, pricing?: PricingData): ReviewRow[] {
  const shape = (value: unknown): unknown => {
    if (Array.isArray(value)) return [];
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]));
    return undefined;
  };
  const empty = Object.fromEntries(bodyFields.map(field => [field, shape((proposal as any)[field])]));
  const rows = reviewRows({ base_version_json: empty, working_version_json: proposal } as unknown as CollaborationRequest, pricing);
  const optionalChoices = new Set(['poolSpecs.tanningShelf', 'poolSpecs.automaticCover', 'tileCopingDecking.additionalDecking',
    'equipment.heaterChiller', 'equipment.sanitationAccessory', 'equipment.autoFillSystem', 'equipment.saltSystem',
    'equipment.poolLights', 'equipment.spaLights', 'equipment.auxiliaryPumps']);
  for (const group of selectionGroups) {
    if (optionalChoices.has(group.key) && !rows.some(row => row.key === group.key)) {
      rows.push({ key: group.key, label: group.label, category: displayGroup(group.key), paths: group.paths, before: '', after: '' });
    }
  }
  rows.sort((a, b) => bodyFields.indexOf(a.key.split('.')[0]) - bodyFields.indexOf(b.key.split('.')[0]));
  // A version is a saved state, not a change request. Describe its choices directly:
  // the request formatter's equal-value fallback exposes internal fields for empty choices.
  const cranePaths = ['poolSpecs.needsFiberglassCrane', 'poolSpecs.needsFiberglassSpaCrane', 'poolSpecs.fiberglassCraneOption'];
  let craneShown = false;
  return rows.flatMap(row => {
    if (cranePaths.includes(row.key)) {
      if (craneShown) return [];
      craneShown = true;
      const specs = proposal.poolSpecs;
      const needed = specs.needsFiberglassCrane || specs.needsFiberglassSpaCrane
        || (specs.fiberglassCraneOption && specs.fiberglassCraneOption !== 'no-crane');
      return [{ ...row, key: 'poolSpecs.fiberglassCrane', label: 'Fiberglass Crane', paths: cranePaths, after: needed ? 'Yes' : 'None' }];
    }
    const definition = selectionGroups.find(group => group.key === row.key);
    let after = definition ? definition.describe(proposal, pricing) : displayValue(getAtPath(proposal, row.key), row.key);
    if (['poolSpecs.poolShape', 'poolSpecs.spaShape', 'poolSpecs.raisedSpaFacing', 'masonry.columns.facing'].includes(row.key)
      || /(?:Facing|\.facing)$/.test(row.key)) after = words(getAtPath(proposal, row.key));
    if (row.key === 'poolSpecs.automaticCover') after = proposal.poolSpecs.hasAutomaticCover ? 'Yes' : 'None';
    if (row.key.startsWith('equipment.') && row.key !== 'equipment.package' && row.key !== 'equipment.addOns') {
      const field = row.key.slice('equipment.'.length);
      const equipment = proposal.equipment;
      if (['poolLights', 'spaLights'].includes(field)) {
        const enabled = field === 'poolLights' ? equipment.includePoolLights : equipment.includeSpaLights;
        const lights = field === 'poolLights' ? equipment.poolLights : equipment.spaLights;
        after = enabled === false ? 'None' : lights?.length ? comparisonEquipmentList(lights)
          : field === 'spaLights' && equipment.hasSpaLight ? 'Spa light (Qty: 1)'
          : field === 'poolLights' && equipment.numberOfLights > 0 ? `Additional lights (Qty: ${equipment.numberOfLights})` : 'None';
      } else if (field === 'auxiliaryPumps') {
        after = comparisonEquipmentList(equipment.auxiliaryPumps ?? (equipment.auxiliaryPump ? [equipment.auxiliaryPump] : []));
      } else {
        const selection = getAtPath(equipment, field);
        if (Array.isArray(selection)) after = comparisonEquipmentList(selection);
        else if (selection && typeof selection === 'object' && 'name' in selection) {
          after = comparisonEquipment(selection, getAtPath(equipment, `${field}Quantity`));
        } else if (['heaterChiller', 'sanitationAccessory', 'autoFillSystem', 'saltSystem'].includes(field)) after = 'None';
      }
    }
    // Off-contract is an exception worth calling out; the usual contract state is implicit.
    after = after.replace(/; On Contract\b/g, '').replace(/;\s*$/g, '');
    const selection = getAtPath(proposal, row.key) as { isOffContract?: boolean } | undefined;
    if (selection?.isOffContract && !after.includes('Off-Contract')) after += '; Off-Contract';
    return [{ ...row, after }];
  });
}

function comparisonEquipment(selection: unknown, count?: unknown): string {
  const item = selection as { name?: string; model?: string; quantity?: number; isOffContract?: boolean } | undefined;
  const name = item?.name?.trim();
  const qty = Number(count ?? item?.quantity ?? 1);
  if (!name || /^(none|no\b)/i.test(name) || qty <= 0) return 'None';
  const model = item?.model?.trim();
  return `${name} (Qty: ${qty})${model && !/^(none|no\b)/i.test(model) && !name.includes(model) ? `; ${model}` : ''}${item?.isOffContract ? '; Off-Contract' : ''}`;
}

function comparisonEquipmentList(selections: unknown[]): string {
  const groups = new Map<string, { selection: unknown; quantity: number }>();
  for (const selection of selections) {
    const item = selection as { name?: string; model?: string; quantity?: number; isOffContract?: boolean };
    if (comparisonEquipment(item) === 'None') continue;
    const key = JSON.stringify([item.name, item.model, item.isOffContract]);
    const group = groups.get(key);
    groups.set(key, { selection, quantity: (group?.quantity || 0) + (item.quantity ?? 1) });
  }
  return [...groups.values()].map(group => comparisonEquipment(group.selection, group.quantity)).join(' | ') || 'None';
}

