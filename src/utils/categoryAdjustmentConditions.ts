import type { Proposal } from '../types/proposal-new';
import type { AdjustmentCondition, CategoryAdjustment, ConditionOperator } from '../types/categoryAdjustments';
import { getTileOptions, getTrimTileOptions, getCopingOptions, getDeckingOptions, getTileSelectionId, getTrimTileSelectionId, normalizeCopingOptionId, normalizeDeckingOptionId } from './tileCopingCatalogs';
import { isPpasEastProposal } from './franchiseScope';
import { isBronzeProposal } from '../services/pricingTiers';
import { flattenWaterFeatures, getWaterFeatureRunEntries } from './waterFeatureCost';
import { getMasonryFacingOptions } from './masonryFacing';
import { normalizeEquipmentPackageOptions, packageSupportsSpa, packageAllowsWaterFeatures } from './equipmentPackages';
import { getAdditionalDeckingOptions, getAdditionalDeckingSelections, getResolvedProposalPrimaryDeckingArea } from './decking';
import { getCustomFeatureTotal, hasCustomFeatureContent } from './customFeatures';
import { getCustomOptionTotal } from './customOptions';

type Context = Partial<Proposal>;
export interface ConditionTarget {
  id: string;
  path: string[];
  kind: 'group' | 'boolean' | 'number' | 'choice';
  unit?: string;
  choices?: { value: string; label: string }[];
  applicable: (p: Context) => boolean;
  read: (p: Context) => unknown;
}
export const CONDITION_SECTIONS = ['Pool Specifications', 'Excavation', 'Plumbing', 'Gas / Electrical', 'Tile / Coping / Decking', 'Drainage', 'Equipment', 'Water Features', 'Interior Finish', 'Custom Features'];
export const NUMERIC_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'gt', label: 'Greater than' }, { value: 'gte', label: 'At least' },
  { value: 'lt', label: 'Less than' }, { value: 'lte', label: 'At most' },
  { value: 'eq', label: 'Equal to' }, { value: 'neq', label: 'Not equal to' },
];
const present = (v: unknown) => v !== undefined && v !== null && v !== '' && v !== 'none' && v !== 'None';
const realEquipment = (v: any) => present(v?.name) && !/^(no |none\b|select\b)/i.test(v.name);
const positive = (v: unknown) => Number.isFinite(Number(v)) && Number(v) > 0;
const spa = (p: Context) => present(p.poolSpecs?.spaType);
const shotcrete = (p: Context) => p.poolSpecs?.poolType === 'gunite';
const fiberglass = (p: Context) => p.poolSpecs?.poolType === 'fiberglass';
const onContractCustom = (entries: any[] = []) => entries.filter(e => !e.isOffContract);

// Conditions deliberately use a reviewed catalogue, not arbitrary JSON fields.
// Parent applicability is checked before numeric comparisons (including zero).
export function getCategoryConditionTargets(pricing: any): ConditionTarget[] {
  const targets: ConditionTarget[] = [];
  const add = (id: string, path: string[], kind: ConditionTarget['kind'], read: ConditionTarget['read'], applicable: ConditionTarget['applicable'] = () => true, unit?: string, choices?: ConditionTarget['choices']) => {
    targets.push({ id, path, kind, read, applicable, unit, choices });
  };
  const num = (id: string, path: string[], read: ConditionTarget['read'], unit = '', gate?: ConditionTarget['applicable']) => add(id, path, 'number', read, gate, unit);
  const flag = (id: string, path: string[], read: ConditionTarget['read'], gate?: ConditionTarget['applicable']) => add(id, path, 'boolean', read, gate);
  const choice = (id: string, path: string[], read: ConditionTarget['read'], choices: ConditionTarget['choices'], gate?: ConditionTarget['applicable']) => add(id, path, 'choice', read, gate, undefined, choices);
  const options = (entries: any[] = []) => entries.map(e => ({ value: String(e.id ?? e.name), label: String(e.name ?? e.id) }));
  const fixed = (entries: string[]) => entries.map(value => ({ value, label: value }));
  const S = CONDITION_SECTIONS;
  choice('pool.type', [S[0], 'Pool Dimensions', 'Pool Type'], p => p.poolSpecs?.poolType, [{ value: 'gunite', label: 'Shotcrete' }, { value: 'fiberglass', label: 'Fiberglass' }]);
  choice('pool.shape', [S[0], 'Pool Dimensions', 'Pool Shape'], p => p.poolSpecs?.poolShape, [{ value: 'geometric', label: 'Geometric' }, { value: 'freeform', label: 'Freeform' }], shotcrete);
  for (const [key, label, unit] of [['perimeter', 'Perimeter', 'feet'], ['surfaceArea', 'Surface Area', 'sqft'], ['shallowDepth', 'Shallow Depth', 'feet'], ['endDepth', 'End Depth', 'feet'], ['maxWidth', 'Max Width', 'feet'], ['maxLength', 'Max Length', 'feet'], ['totalStepsAndBench', 'Total Steps & Bench', 'feet']] as const) {
    num(`pool.${key}`, [S[0], 'Pool Dimensions', label], p => p.poolSpecs?.[key], unit);
  }
  num('pool.deckingArea', [S[0], 'Pool Dimensions', 'Decking Area'], p => getResolvedProposalPrimaryDeckingArea(p), 'sqft', p => !p.tileCopingDecking?.isDeckingOffContract);
  choice('pool.fiberglassSize', [S[0], 'Pool Dimensions', 'Fiberglass Size'], p => p.poolSpecs?.fiberglassSize, fixed(['small', 'medium', 'large']), fiberglass);
  const models = Object.values(pricing.fiberglass?.poolModels || {}).flat() as any[];
  choice('pool.fiberglassModel', [S[0], 'Pool Dimensions', 'Fiberglass Model'], p => p.poolSpecs?.fiberglassModelName, models.map(e => ({ value: e.name, label: e.name })), fiberglass);
  for (const [field, label, list] of [['fiberglassFinishUpgradeName', 'Finish Upgrade', pricing.fiberglass?.finishUpgrades], ['fiberglassTanningLedgeName', 'Fiberglass Tanning Ledge', pricing.fiberglass?.tanningLedgeOptions]] as const) {
    choice(`pool.${field}`, [S[0], 'Pool Dimensions', label], p => p.poolSpecs?.[field], (list || []).map((e: any) => ({ value: e.name, label: e.name })), fiberglass);
  }
  flag('pool.crane', [S[0], 'Pool Dimensions', 'Crane Required'], p => p.poolSpecs?.needsFiberglassCrane, fiberglass);
  choice('spa.type', [S[0], 'Spa', 'Spa Type'], p => spa(p) ? p.poolSpecs?.spaType : '', [{ value: 'gunite', label: 'Shotcrete' }, { value: 'fiberglass', label: 'Fiberglass' }]);
  choice('spa.model', [S[0], 'Spa', 'Fiberglass Spa Option'], p => p.poolSpecs?.spaFiberglassModelName, (pricing.fiberglass?.spaOptions || []).map((e: any) => ({ value: e.name, label: e.name })), p => p.poolSpecs?.spaType === 'fiberglass');
  flag('spa.crane', [S[0], 'Spa', 'Crane Required'], p => p.poolSpecs?.needsFiberglassSpaCrane, p => p.poolSpecs?.spaType === 'fiberglass');
  for (const [key, label, parent] of [['fiberglassSpaSpecifications', 'Fiberglass Spa Specifications', 'Spa'], ['fiberglassLedgeSpecifications', 'Tanning Ledge Specifications', 'Pool Dimensions']] as const) {
    const gate = (p: Context) => key === 'fiberglassSpaSpecifications' ? p.poolSpecs?.spaType === 'fiberglass' : fiberglass(p) && present(p.poolSpecs?.fiberglassTanningLedgeName);
    for (const [dimension, name] of [['length', 'Length'], ['width', 'Width'], ['shallowDepth', 'Shallow Depth'], ['deepDepth', 'Deep Depth']] as const) num(`${key}.${dimension}`, [S[0], parent, label, name], p => {
      const specs: any = p.poolSpecs?.[key];
      return specs ? Number(specs[`${dimension}Feet`] || 0) + Number(specs[`${dimension}Inches`] || 0) / 12 : 0;
    }, 'feet', gate);
    for (const [field, name, unit] of [['perimeter', 'Perimeter', 'feet'], ['surfaceArea', 'Surface Area', 'sqft'], ['gallons', 'Gallons', 'gallons']] as const) num(`${key}.${field}`, [S[0], parent, label, name], p => p.poolSpecs?.[key]?.[field], unit, gate);
  }
  for (const [key, label] of [['spaLength', 'Spa Length'], ['spaWidth', 'Spa Width'], ['spaPerimeter', 'Spa Perimeter']] as const) num(`spa.${key}`, [S[0], 'Spa', label], p => p.poolSpecs?.[key], 'feet', p => p.poolSpecs?.spaType === 'gunite');
  choice('spa.shape', [S[0], 'Spa', 'Spa Shape'], p => p.poolSpecs?.spaShape, fixed(['round', 'square']), p => spa(p) && p.poolSpecs?.spaType === 'gunite');
  flag('spa.raised', [S[0], 'Spa', 'Raised Spa'], p => p.poolSpecs?.isRaisedSpa, p => spa(p) && p.poolSpecs?.spaType === 'gunite');
  choice('spa.facing', [S[0], 'Spa', 'Raised Spa Facing'], p => p.poolSpecs?.raisedSpaFacing, options(pricing.masonry?.raisedSpaFacingOptions), p => p.poolSpecs?.spaType === 'gunite' && !!p.poolSpecs?.isRaisedSpa);
  flag('spa.spillover', [S[0], 'Spa', 'Spillover'], p => p.poolSpecs?.hasSpillover, spa);
  num('spa.doubleBullnose', [S[0], 'Spa', 'Double Bullnose'], p => p.tileCopingDecking?.doubleBullnoseLnft, 'feet', p => p.poolSpecs?.spaType === 'gunite' && positive(p.poolSpecs.spaLength) && positive(p.poolSpecs.spaWidth));
  for (const [key, label] of [['hasTanningShelf', 'Tanning Shelf'], ['hasSiltFence', 'Silt Fence'], ['hasAutomaticCover', 'Automatic Cover']] as const) flag(`pool.${key}`, [S[0], 'Additional Options', label], p => p.poolSpecs?.[key], key === 'hasTanningShelf' ? shotcrete : undefined);
  num('pool.coverCost', [S[0], 'Additional Options', 'Automatic Cover Manufacturer Cost'], p => p.poolSpecs?.automaticCoverManufacturerCost, 'dollars', p => !!p.poolSpecs?.hasAutomaticCover);
  num('pool.travel', [S[0], 'Travel', 'Travel Distance'], p => p.poolSpecs?.travelDistance, 'miles');
  choice('pool.street', [S[0], 'Travel', 'Pool to Street Distance'], p => String(p.poolSpecs?.poolToStreetDistance ?? 0), [{ value: '0', label: 'Up to 250 feet' }, { value: '1', label: '251–300 feet' }, { value: '2', label: '300–350 feet' }]);

  for (const [key, label] of [['rbbLevels', 'Raised Bond Beam'], ['exposedPoolWallLevels', 'Exposed Pool Wall']] as const) {
    const rows = (p: Context) => (p.excavation?.[key] || []).filter(r => positive(r.length));
    num(`excavation.${key}.length`, [S[1], label, 'Total Length'], p => rows(p).reduce((n, r) => n + r.length, 0), 'feet');
    num(`excavation.${key}.height`, [S[1], label, 'Height of Any Entry'], p => rows(p).map(r => r.height), 'inches', p => rows(p).length > 0);
    choice(`excavation.${key}.facing`, [S[1], label, 'Facing'], p => rows(p).map(r => r.facing), options(getMasonryFacingOptions(pricing.masonry, 'rbb')));
    if (key === 'rbbLevels') {
      flag(`excavation.${key}.backside`, [S[1], label, 'Backside Facing'], p => rows(p).some(r => r.hasBacksideFacing));
      choice(`excavation.${key}.backsideType`, [S[1], label, 'Backside Facing Type'], p => rows(p).filter(r => r.hasBacksideFacing).map(r => r.backsideFacing), options(getMasonryFacingOptions(pricing.masonry, 'backside')));
    }
  }
  for (const [key, label, unit] of [['count', 'Number of Columns', 'columns'], ['width', 'Width', 'feet'], ['depth', 'Depth', 'feet'], ['height', 'Height', 'feet']] as const) num(`columns.${key}`, [S[1], 'Columns', label], p => p.excavation?.columns?.[key], unit, p => key === 'count' || positive(p.excavation?.columns?.count));
  choice('columns.facing', [S[1], 'Columns', 'Facing'], p => p.excavation?.columns?.facing, options(getMasonryFacingOptions(pricing.masonry, 'rbb')), p => positive(p.excavation?.columns?.count));
  const walls = (p: Context) => (p.excavation?.retainingWalls?.length ? p.excavation.retainingWalls : [{ type: p.excavation?.retainingWallType, length: p.excavation?.retainingWallLength }]).filter(r => positive(r.length));
  num('walls.length', [S[1], 'Retaining Wall', 'Total Length'], p => walls(p).reduce((n, r) => n + Number(r.length), 0), 'feet');
  choice('walls.type', [S[1], 'Retaining Wall', 'Retaining Wall Type'], p => walls(p).map(r => r.type), (pricing.masonry?.retainingWalls || []).map((e: any) => ({ value: e.type ?? e.name, label: e.type ?? e.name })));
  for (const [key, label] of [['hasGravelInstall', 'Gravel Install'], ['hasDirtHaul', 'Dirt Haul'], ['needsSoilSampleEngineer', 'Soil Sample / Engineer'], ['hasDoubleCurtain', 'Double Curtain'], ['hasAdditionalSitePrep', 'Additional Site Prep'], ['hasAdditionalDigging', 'Additional Digging'], ['hasTightAccessJob', 'Tight Access Job']] as const) flag(`excavation.${key}`, [S[1], 'Additional Options', label], p => p.excavation?.[key] ?? (key === 'hasDoubleCurtain' ? positive(p.excavation?.doubleCurtainLength) : key === 'hasAdditionalSitePrep' ? positive(p.excavation?.additionalSitePrepHours) : false), key === 'hasDoubleCurtain' ? shotcrete : undefined);
  for (const [key, parent, label, unit] of [['gravelInstallQuantity', 'hasGravelInstall', 'Gravel Install Quantity', 'installs'], ['dirtHaulQuantity', 'hasDirtHaul', 'Dirt Haul Quantity', 'hauls'], ['doubleCurtainLength', 'hasDoubleCurtain', 'Double Curtain Length', 'feet'], ['additionalSitePrepHours', 'hasAdditionalSitePrep', 'Additional Site Prep Hours', 'hours'], ['additionalDiggingDays', 'hasAdditionalDigging', 'Additional Digging Days', 'days']] as const) num(`excavation.${key}`, [S[1], 'Additional Options', label], p => p.excavation?.[key] ?? (key.endsWith('Quantity') || key === 'additionalDiggingDays' ? 1 : 0), unit, p => (p.excavation?.[parent] ?? positive(p.excavation?.[key])) && (key !== 'doubleCurtainLength' || shotcrete(p)));

  for (const [key, label] of [['skimmerRun', 'Total Skimmer Run'], ['mainDrainRun', 'Main Drain Run'], ['spaRun', 'Spa Run'], ['additionalSkimmers', 'Extra Skimmers']] as const) num(`plumbing.${key}`, [S[2], 'Core Plumbing', label], p => p.plumbing?.runs?.[key], key === 'additionalSkimmers' ? 'skimmers' : 'feet', key === 'spaRun' ? p => spa(p) || fiberglass(p) : undefined);
  num('electrical.gas', [S[3], 'Gas Run'], p => p.plumbing?.runs?.gasRun, 'feet');
  for (const [key, label] of [['electricalRun', 'Main Electrical Run'], ['lightRun', 'Light Run'], ['heatPumpElectricalRun', 'Heat Pump Electrical Run']] as const) num(`electrical.${key}`, [S[3], 'Electrical Runs', label], p => p.electrical?.runs?.[key], 'feet');

  choice('tile.option', [S[4], 'Tile', 'Tile Option'], p => getTileSelectionId(p.tileCopingDecking), options(getTileOptions(pricing.tileCoping)), shotcrete);
  num('tile.extra', [S[4], 'Tile', 'Additional Tile Length'], p => p.tileCopingDecking?.additionalTileLength, 'feet', shotcrete);
  choice('tile.trim', [S[4], 'Tile', 'Trim Tile on Steps & Bench'], p => getTrimTileSelectionId(p.tileCopingDecking), options(getTrimTileOptions(pricing.tileCoping)), shotcrete);
  const coping = (p: Context) => getCopingOptions(pricing.tileCoping).some(option => option.id === normalizeCopingOptionId(p.tileCopingDecking?.copingType));
  choice('coping.type', [S[4], 'Coping', 'Coping Type'], p => normalizeCopingOptionId(p.tileCopingDecking?.copingType), options(getCopingOptions(pricing.tileCoping)), coping);
  choice('coping.size', [S[4], 'Coping', 'Coping Size'], p => p.tileCopingDecking?.copingSize, fixed(['12x12', '12x24', '16x16']), coping);
  num('coping.bullnose', [S[4], 'Coping', 'Bullnose'], p => p.tileCopingDecking?.bullnoseLnft, 'feet');
  num('coping.spillway', [S[4], 'Coping', 'Spillway Length'], p => p.tileCopingDecking?.spillwayLnft, 'feet');
  const decks = (p: Context, kind: 'all' | 'primary' | 'additional' = 'all') => {
    const t = p.tileCopingDecking;
    if (!t) return [];
    const extra = getAdditionalDeckingSelections(t);
    const primary = [{ deckingType: t.deckingType, area: getResolvedProposalPrimaryDeckingArea(p), isOffContract: t.isDeckingOffContract }];
    return (kind === 'primary' ? primary : kind === 'additional' ? extra : [...primary, ...extra]).filter(d => !d.isOffContract && present(d.deckingType) && positive(d.area));
  };
  choice('decking.type', [S[4], 'Decking', 'Decking Type'], p => decks(p, 'primary').map(d => normalizeDeckingOptionId(d.deckingType)), options(getDeckingOptions(pricing.tileCoping)));
  num('decking.area', [S[4], 'Decking', 'Total Included Decking Area'], p => decks(p).reduce((n, d) => n + Number(d.area), 0), 'sqft');
  num('decking.primaryArea', [S[4], 'Decking', 'Primary Decking SQFT'], p => decks(p, 'primary').reduce((n, d) => n + Number(d.area), 0), 'sqft');
  const additionalDeckOptions = [...options(getDeckingOptions(pricing.tileCoping)), ...getAdditionalDeckingOptions(pricing.tileCoping).map(option => ({ value: option.id, label: option.label }))];
  choice('decking.additionalType', [S[4], 'Decking', 'Additional Decking'], p => decks(p, 'additional').map(d => additionalDeckOptions.some(option => option.value === d.deckingType) ? d.deckingType : normalizeDeckingOptionId(d.deckingType)), additionalDeckOptions.filter((option, index, entries) => entries.findIndex(e => e.value === option.value) === index));
  num('decking.additionalArea', [S[4], 'Decking', 'Additional Decking SQFT of Any Entry'], p => decks(p, 'additional').map(d => d.area), 'sqft', p => decks(p, 'additional').length > 0);
  num('decking.steps', [S[4], 'Decking', 'Concrete Steps Length'], p => p.tileCopingDecking?.concreteStepsLength, 'feet', p => !p.tileCopingDecking?.isDeckingOffContract);
  flag('decking.grading', [S[4], 'Rough Grading'], p => p.tileCopingDecking?.hasRoughGrading);
  for (const [key, label] of [['downspoutTotalLF', 'Downspout Drain'], ['deckDrainTotalLF', 'Deck Drain'], ['frenchDrainTotalLF', 'French Drain'], ['boxDrainTotalLF', 'Box Drain']] as const) num(`drainage.${key}`, [S[5], 'Core Drainage', label], p => p.drainage?.[key], 'feet');

  const equipmentKinds = [
    ['pump', 'Pump', 'pumps', 'pumpQuantity', 'additionalPumps'], ['filter', 'Filter', 'filters', 'filterQuantity', 'additionalFilters'],
    ['cleaner', 'Cleaner', 'cleaners', 'cleanerQuantity', ''], ['heater', 'Heater', 'heaters', 'heaterQuantity', 'additionalHeaters'],
    ['heaterChiller', 'Heater Chiller', 'heaterChillers', 'heaterChillerQuantity', ''], ['automation', 'Automation', 'automation', 'automationQuantity', ''],
    ['saltSystem', 'Sanitation System', 'saltSystem', 'saltSystemQuantity', ''], ['autoFillSystem', 'Auto-fill', 'autoFillSystem', 'autoFillSystemQuantity', ''],
    ['sanitationAccessory', 'Additional Sanitation Options', 'sanitationAccessories', 'sanitationAccessoryQuantity', ''],
  ];
  for (const [key, label, catalog, qty, additional] of equipmentKinds) {
    const selections = (p: Context): any[] => {
      const e: any = p.equipment || {};
      return [...(realEquipment(e[key]) && Number(e[qty] ?? 1) > 0 ? [{ ...e[key], quantity: Number(e[qty] ?? 1) }] : []), ...(additional ? e[additional] || [] : []), ...(key === 'saltSystem' && e.additionalSaltSystem ? [e.additionalSaltSystem] : [])].filter(realEquipment);
    };
    const gate = key === 'heaterChiller' ? isPpasEastProposal : () => true;
    choice(`equipment.${key}`, [S[6], label, 'Selected Option'], p => selections(p).map(e => e.name), (pricing.equipment?.[catalog] || []).filter(realEquipment).map((e: any) => ({ value: e.name, label: e.name })), gate);
    num(`equipment.${key}.quantity`, [S[6], label, 'Total Quantity'], p => selections(p).reduce((n, e) => n + Number(e.quantity ?? 1), 0), 'items', gate);
  }
  for (const [key, label, catalog] of [['poolLights', 'Pool Lights', 'poolLights'], ['spaLights', 'Spa Lights', 'spaLights'], ['auxiliaryPumps', 'Blowers', 'auxiliaryPumps']] as const) {
    const selections = (p: Context): any[] => {
      if (key === 'poolLights' && p.equipment?.includePoolLights === false) return [];
      if (key === 'spaLights' && p.equipment?.includeSpaLights === false) return [];
      return ((p.equipment?.[key] || []) as any[]).filter(realEquipment);
    };
    const gate = key === 'spaLights' ? spa : () => true;
    const entries = key === 'auxiliaryPumps' ? pricing.equipment?.[catalog] : pricing.equipment?.lights?.[catalog];
    choice(`equipment.${key}`, [S[6], label, 'Selected Option'], p => selections(p).map(e => e.name), (entries || []).filter(realEquipment).map((e: any) => ({ value: e.name, label: e.name })), gate);
    num(`equipment.${key}.quantity`, [S[6], label, 'Total Quantity'], p => selections(p).length, 'items', gate);
  }
  choice('equipment.package', [S[6], 'Package Options'], p => p.equipment?.packageSelectionTouched === false ? '' : p.equipment?.packageSelectionId, options(normalizeEquipmentPackageOptions(pricing.equipment?.packageOptions)));
  num('equipment.cleanerRun', [S[6], 'Cleaner', 'Cleaner Run'], p => p.plumbing?.runs?.cleanerRun, 'feet', p => realEquipment(p.equipment?.cleaner) && Number(p.equipment?.cleanerQuantity ?? 1) > 0);
  num('equipment.autoFillRun', [S[6], 'Auto-fill', 'Plumbing Run'], p => p.plumbing?.runs?.autoFillRun, 'feet', p => realEquipment(p.equipment?.autoFillSystem) && Number(p.equipment?.autoFillSystemQuantity ?? 1) > 0);
  num('equipment.autoFillElectricRun', [S[6], 'Auto-fill', 'Conduit Run'], p => p.plumbing?.runs?.autoFillElectricRun, 'feet', p => realEquipment(p.equipment?.autoFillSystem) && Number(p.equipment?.autoFillSystemQuantity ?? 1) > 0 && !!pricing.equipment?.autoFillSystem?.find((e: any) => e.name === p.equipment?.autoFillSystem?.name)?.requiresElectricRun);

  const waterOptions = flattenWaterFeatures(pricing.waterFeatures);
  const waterEntries = (p: Context) => getWaterFeatureRunEntries(p.waterFeatures?.selections, p.plumbing?.runs, pricing.waterFeatures).filter(e => e.feature && positive(e.selection.quantity));
  choice('waterFeatures.option', [S[7], 'Selected Water Feature'], p => waterEntries(p).map(e => e.feature!.id), options(waterOptions));
  num('waterFeatures.quantity', [S[7], 'Total Quantity'], p => waterEntries(p).reduce((n, e) => n + e.selection.quantity, 0), 'features');
  flag('waterFeatures.actuator', [S[7], 'Valve Actuator'], p => waterEntries(p).some(e => e.selection.includeValveActuator !== false));
  for (const category of [...new Set(waterOptions.map(e => e.category))]) {
    const entries = (p: Context) => waterEntries(p).filter(e => e.feature?.category === category);
    const id = `waterFeatures.category:${category}`;
    choice(`${id}.option`, [S[7], category, 'Selected Option'], p => entries(p).map(e => e.feature!.id), options(waterOptions.filter(e => e.category === category)));
    num(`${id}.quantity`, [S[7], category, 'Total Quantity'], p => entries(p).reduce((n, e) => n + e.selection.quantity, 0), 'features');
    num(`${id}.run`, [S[7], category, 'Run Length of Any Entry'], p => entries(p).map(e => e.run), 'feet', p => entries(p).length > 0);
    flag(`${id}.actuator`, [S[7], category, 'Valve Actuator'], p => entries(p).some(e => e.selection.includeValveActuator !== false));
  }
  choice('interior.finish', [S[8], 'Finish Type', 'Finish'], p => {
    const finishes = pricing.interiorFinish?.finishes || [];
    return (finishes.find((e: any) => e.id === p.interiorFinish?.finishType || e.name === p.interiorFinish?.finishType) || finishes[0])?.id;
  }, options(pricing.interiorFinish?.finishes), shotcrete);
  const colors = [...new Set<string>((pricing.interiorFinish?.finishes || []).flatMap((e: any) => e.colors || []))];
  choice('interior.color', [S[8], 'Finish Type', 'Color'], p => p.interiorFinish?.color, fixed(colors), shotcrete);
  flag('interior.waterproofing', [S[8], 'Additional Options', 'Microglass (Waterproofing)'], p => p.interiorFinish?.hasWaterproofing ?? true, p => shotcrete(p) && !isBronzeProposal(p) && !isPpasEastProposal(p));
  const features = (p: Context) => onContractCustom(p.customFeatures?.features);
  const groupedOptions = pricing.customFeatures?.groupedOptions || [];
  choice('custom.grouped', [S[9], 'Grouped Features', 'Selected Feature'], p => features(p).filter(e => e.source === 'grouped').map(e => e.groupedOptionId), options(groupedOptions));
  num('custom.groupedSqft', [S[9], 'Grouped Features', 'Square Footage of Any Entry'], p => features(p).filter(e => e.source === 'grouped' && e.groupedPricingMode === 'sqft').map(e => e.groupedSqft || 0), 'sqft', p => features(p).some(e => e.source === 'grouped' && e.groupedPricingMode === 'sqft'));
  num('custom.addonQuantity', [S[9], 'Grouped Features', 'Additional Option Quantity'], p => features(p).filter(e => e.groupedAddonOptionId).map(e => e.groupedAddonQuantity || 0), 'items', p => features(p).some(e => e.groupedAddonOptionId));
  const manualFeatures = (p: Context) => features(p).filter(e => e.source !== 'grouped' && hasCustomFeatureContent(e));
  flag('custom.manual', [S[9], 'Manual Custom Features'], p => manualFeatures(p).length > 0);
  for (const group of [...new Set<string>(groupedOptions.map((e: any) => e.subcategory || 'Other'))]) {
    const entries = groupedOptions.filter((e: any) => (e.subcategory || 'Other') === group);
    choice(`custom.group:${group}`, [S[9], 'Grouped Features', group], p => features(p).filter(e => e.source === 'grouped').map(e => e.groupedOptionId), options(entries));
  }
  for (const [key, label] of [['laborCost', 'Labor Cost of Any Entry'], ['materialCost', 'Material Cost of Any Entry'], ['totalCost', 'Total Cost of Any Entry']] as const) num(`custom.manual.${key}`, [S[9], 'Manual Custom Features', label], p => manualFeatures(p).map(e => key === 'totalCost' ? getCustomFeatureTotal(e) : e[key]), 'dollars', p => manualFeatures(p).length > 0);
  for (const [section, key] of [[S[1], 'excavation'], [S[2], 'plumbing'], [S[3], 'electrical'], [S[4], 'tileCopingDecking'], [S[5], 'drainage'], [S[6], 'equipment'], [S[7], 'waterFeatures'], [S[8], 'interiorFinish']] as const) {
    const entries = (p: Context) => onContractCustom((p[key] as any)?.customOptions).filter(e => e.name?.trim() || e.description?.trim() || getCustomOptionTotal(e) !== 0);
    flag(`${key}.customOptions`, [section, 'Custom Options'], p => entries(p).length > 0);
    for (const [field, label] of [['laborCost', 'Labor Cost of Any Entry'], ['materialCost', 'Material Cost of Any Entry'], ['totalCost', 'Total Cost of Any Entry']] as const) num(`${key}.customOptions.${field}`, [section, 'Custom Options', label], p => entries(p).map(e => field === 'totalCost' ? getCustomOptionTotal(e) : e[field]), 'dollars', p => entries(p).length > 0);
  }

  const packages = normalizeEquipmentPackageOptions(pricing.equipment?.packageOptions);
  const selectedPackage = (p: Context) => p.equipment?.packageSelectionTouched === false ? undefined : packages.find(e => e.id === p.equipment?.packageSelectionId);
  // Ignore stale values retained beneath controls disabled by the package.
  targets.forEach(target => {
    const applicable = target.applicable;
    if (target.path[0] === S[7]) target.applicable = p => applicable(p) && packageAllowsWaterFeatures(selectedPackage(p));
    if (target.path[1] === 'Spa' || target.id.startsWith('equipment.spaLights')) target.applicable = p => applicable(p) && packageSupportsSpa(selectedPackage(p));
  });

  // Every intermediate node is a supported broad condition. A broad condition
  // matches included work, not arbitrary numbers such as a coping size default.
  const leaves = [...targets];
  const groups = new Map<string, string[]>();
  leaves.forEach(t => t.path.slice(0, -1).forEach((_, i) => { const path = t.path.slice(0, i + 1); groups.set(path.join(' / '), path); }));
  groups.forEach((path, key) => {
    add(`group:${key}`, path, 'group', p => leaves.filter(t => t.path.length > path.length && path.every((v, i) => t.path[i] === v)).some(t => targetIsActive(t, p)));
  });
  return targets;
}

function values(target: ConditionTarget, p: Context): unknown[] {
  if (!target.applicable(p)) return [];
  const value = target.read(p);
  return Array.isArray(value) ? value : [value];
}
export function targetIsActive(target: ConditionTarget, p: Context): boolean {
  return values(target, p).some(value => target.kind === 'number' ? positive(value) : target.kind === 'boolean' || target.kind === 'group' ? value === true : present(value) && !!target.choices?.some(o => o.value === String(value)));
}
export function conditionError(condition: AdjustmentCondition | undefined, targets: ConditionTarget[]): string | null {
  const target = targets.find(t => t.id === condition?.targetId);
  if (!target || !condition) return 'Choose an available condition target.';
  if (condition.operator === 'active') return null;
  if (target.kind === 'number' && NUMERIC_OPERATORS.some(o => o.value === condition.operator) && typeof condition.value === 'number' && Number.isFinite(condition.value)) return null;
  if (target.kind === 'choice' && condition.operator === 'equals' && target.choices?.some(o => o.value === condition.value)) return null;
  return 'Choose a valid comparison or an available option. The saved option may have been removed.';
}
export function matchesAdjustmentCondition(condition: AdjustmentCondition | undefined, p: Context, targets: ConditionTarget[]): boolean {
  if (conditionError(condition, targets)) return false;
  const c = condition!;
  const target = targets.find(t => t.id === c.targetId)!;
  if (c.operator === 'active') return targetIsActive(target, p);
  return values(target, p).some(value => {
    if (c.operator === 'equals') return String(value) === c.value;
    if (value === undefined || value === null || value === '' || !Number.isFinite(Number(value))) return false;
    const n = Number(value), threshold = Number(c.value);
    switch (c.operator) {
      case 'gt': return n > threshold;
      case 'gte': return n >= threshold;
      case 'lt': return n < threshold;
      case 'lte': return n <= threshold;
      case 'eq': return n === threshold;
      case 'neq': return n !== threshold;
      default: return false;
    }
  });
}
export function describeAdjustmentCondition(condition: AdjustmentCondition | undefined, targets: ConditionTarget[]): string {
  if (conditionError(condition, targets)) return 'an available condition is chosen (this rule is incomplete)';
  const c = condition!;
  const t = targets.find(target => target.id === c.targetId)!;
  const name = t.path[t.path.length - 1];
  if (c.operator === 'active') return `${name} ${t.kind === 'number' ? 'is greater than zero' : 'is active'}`;
  if (c.operator === 'equals') return `${t.choices?.find(o => o.value === c.value)?.label} is active`;
  return `${name} is ${NUMERIC_OPERATORS.find(o => o.value === c.operator)?.label.toLowerCase()} ${c.value}${t.unit ? ` ${t.unit}` : ''}`;
}
export function describeCategoryAdjustment(adjustment: CategoryAdjustment, targets: ConditionTarget[]): string {
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(adjustment.amount || 0);
  return `Apply ${amount} to ${adjustment.basis === 'cogs' ? 'COGS' : 'Retail'} ${adjustment.mode === 'static' ? 'on every proposal' : `when ${describeAdjustmentCondition(adjustment.condition, targets)}`}.`;
}
