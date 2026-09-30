import type { CostBreakdown, Equipment, EquipmentPackageOption, Proposal } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import { getAdditionalDeckingOption, getAdditionalDeckingSelections, getDeckingTypeFullLabel, getResolvedProposalPrimaryDeckingArea } from './decking';
import { getSelectedEquipmentPackage } from './equipmentPackages';
import { formatMasonryFacingLabel, getMasonryFacingOptions, normalizeMasonryFacingId } from './masonryFacing';
import { getAdditionalPumpSelections, getBasePumpQuantity } from './pumpSelections';
import { getCopingOptionById, getDeckingOptionById, getTileOptionById, getTileSelectionId, getTrimTileOptionById } from './tileCopingCatalogs';
import { flattenWaterFeatures, isWaterFeaturePlaceholderLabel } from './waterFeatureCost';

export interface OrderFormItem {
  name: string;
  detail?: string;
  measures: Array<{ label: string; value: number; unit: 'SF' | 'LNFT' | 'items' }>;
  note?: string;
  isFacing?: boolean;
}

export interface OrderFormGroup {
  title: string;
  items: OrderFormItem[];
  kind?: 'totals';
}

export interface MaterialsOrderFormData {
  groups: OrderFormGroup[];
  packageName: string;
  packageNote?: string;
}

const amount = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};
const rounded = (value: number) => Math.round(value * 100) / 100;
const selected = (name?: string | null) => Boolean(name?.trim()) && !/^(none|no\s|select\b)/i.test(name!.trim());
const quantity = (value: unknown, fallback = 0) => value == null ? fallback : amount(value);
const sfMeasures = (actual: number, withWaste: number): OrderFormItem['measures'] => [
  { label: 'Actual SF', value: rounded(actual), unit: 'SF' },
  { label: 'SF with Waste', value: rounded(withWaste), unit: 'SF' },
];
const countMeasure = (count: number): OrderFormItem['measures'] => [{ label: 'Quantity', value: count, unit: 'items' }];

interface EquipmentLine { category: string; name: string; quantity: number }
const addEquipment = (items: EquipmentLine[], category: string, name: string | undefined, count: number) => {
  if (!selected(name) || count <= 0) return;
  const existing = items.find((item) => item.category === category && item.name.toLowerCase() === name!.toLowerCase());
  if (existing) existing.quantity += count;
  else items.push({ category, name: name!.trim(), quantity: count });
};
const equipmentItem = (item: EquipmentLine, note?: string): OrderFormItem => ({
  name: item.name,
  detail: item.category,
  measures: countMeasure(item.quantity),
  note,
});

const getSelectedEquipment = (proposal: Proposal, equipment: Equipment, pkg: EquipmentPackageOption | null) => {
  const items: EquipmentLine[] = [];
  addEquipment(items, 'Pump', equipment.pump?.name, getBasePumpQuantity(equipment));
  getAdditionalPumpSelections(equipment).forEach((pump) => addEquipment(items, 'Pump', pump.name, 1));
  (equipment.auxiliaryPumps?.length ? equipment.auxiliaryPumps : equipment.auxiliaryPump ? [equipment.auxiliaryPump] : [])
    .forEach((pump) => addEquipment(items, 'Blower', pump.name, 1));
  addEquipment(items, 'Filter', equipment.filter?.name, quantity(equipment.filterQuantity, selected(equipment.filter?.name) ? 1 : 0));
  (equipment.additionalFilters || []).forEach((filter) => addEquipment(items, 'Filter', filter.name, 1));
  addEquipment(items, 'Cleaner', equipment.cleaner?.name, quantity(equipment.cleanerQuantity, selected(equipment.cleaner?.name) ? 1 : 0));
  addEquipment(items, 'Heater', equipment.heater?.name, quantity(equipment.heaterQuantity, selected(equipment.heater?.name) ? 1 : 0));
  (equipment.additionalHeaters || []).forEach((heater) => addEquipment(items, 'Heater', heater.name, 1));
  addEquipment(items, 'Heater / Chiller', equipment.heaterChiller?.name, quantity(equipment.heaterChillerQuantity));
  addEquipment(items, 'Automation', equipment.automation?.name, quantity(equipment.automationQuantity, selected(equipment.automation?.name) ? 1 : 0));
  addEquipment(items, 'Sanitation', equipment.saltSystem?.name, quantity(equipment.saltSystemQuantity, selected(equipment.saltSystem?.name) ? 1 : 0));
  addEquipment(items, 'Sanitation', equipment.additionalSaltSystem?.name, equipment.additionalSaltSystem ? 1 : 0);
  addEquipment(items, 'Auto-Fill', equipment.autoFillSystem?.name, quantity(equipment.autoFillSystemQuantity, selected(equipment.autoFillSystem?.name) ? 1 : 0));
  addEquipment(items, 'Sanitation Accessory', equipment.sanitationAccessory?.name,
    quantity(equipment.sanitationAccessoryQuantity, selected(equipment.sanitationAccessory?.name) ? 1 : 0));
  (equipment.poolLights || []).forEach((light) => addEquipment(items, 'Pool Light', light.name, 1));
  (equipment.spaLights || []).forEach((light) => addEquipment(items, 'Spa Light', light.name, 1));
  if (equipment.hasBlanketReel) addEquipment(items, 'Accessory', 'Blanket Reel', 1);
  if (equipment.hasSolarBlanket) addEquipment(items, 'Accessory', 'Solar Blanket', 1);
  if (equipment.hasAutoFill && !selected(equipment.autoFillSystem?.name)) addEquipment(items, 'Accessory', 'Auto Fill', 1);
  if (equipment.hasHandrail) addEquipment(items, 'Accessory', 'Handrail', 1);
  if (equipment.hasStartupChemicals) addEquipment(items, 'Accessory', 'Startup Chemicals', 1);
  if (equipment.automation?.zones > 0) addEquipment(items, 'Automation Accessory', 'Additional Automation Zones', equipment.automation.zones);
  if (pkg?.includeCheckValve !== false && pkg) addEquipment(items, 'Accessory', 'Check Valve', 1);
  if (proposal.poolSpecs?.hasAutomaticCover) addEquipment(items, 'Automatic Cover', 'Automatic Cover', 1);
  return items;
};

const packageIncludedEquipment = (pkg: EquipmentPackageOption): EquipmentLine[] => {
  const items: EquipmentLine[] = [];
  const add = (category: string, name: string | undefined, count: number | undefined) =>
    addEquipment(items, category, name, amount(count));
  add('Pump', pkg.includedPumpName, pkg.includedPumpQuantity);
  add('Filter', pkg.includedFilterName, pkg.includedFilterQuantity);
  add('Cleaner', pkg.includedCleanerName, pkg.includedCleanerQuantity);
  add('Heater', pkg.includedHeaterName, pkg.includedHeaterQuantity);
  add('Automation', pkg.includedAutomationName, pkg.includedAutomationQuantity);
  add('Sanitation', pkg.includedSaltSystemName, pkg.includedSaltSystemQuantity);
  add('Auto-Fill', pkg.includedAutoFillSystemName, pkg.includedAutoFillSystemQuantity);
  add('Sanitation Accessory', pkg.includedSanitationAccessoryName, pkg.includedSanitationAccessoryQuantity);
  add('Pool Light', pkg.includedPoolLightName, pkg.includedPoolLightQuantity);
  add('Spa Light', pkg.includedSpaLightName, pkg.includedSpaLightQuantity);
  if (pkg.includeCheckValve !== false) addEquipment(items, 'Accessory', 'Check Valve', 1);
  return items;
};

const equipmentGroups = (proposal: Proposal, pkg: EquipmentPackageOption | null, packageName: string): OrderFormGroup[] => {
  const actual = getSelectedEquipment(proposal, proposal.equipment, pkg);
  const packageTitle = `Equipment Package: ${packageName}`;
  if (!pkg || pkg.mode === 'custom') return [{ title: packageTitle, items: actual.map((item) => equipmentItem(item)) }];
  const remaining = actual.map((item) => ({ ...item }));
  const included = packageIncludedEquipment(pkg).map((base) => {
    const match = remaining.find((item) => item.category === base.category && item.name.toLowerCase() === base.name.toLowerCase());
    const used = match ? Math.min(match.quantity, base.quantity) : 0;
    if (match) match.quantity -= used;
    return equipmentItem(base, used < base.quantity ? 'Package standard — changed or removed in this proposal' : undefined);
  });
  return [
    { title: packageTitle, items: included },
    { title: 'Additional or Changed Equipment', items: remaining.filter((item) => item.quantity > 0).map((item) => equipmentItem(item)) },
  ];
};

const getMaterialQuantity = (costBreakdown: CostBreakdown, category: string, description: string) =>
  [...(costBreakdown.stoneRockworkMaterial || []), ...(costBreakdown.copingDeckingMaterial || [])]
    .filter((item) => item.category === category && item.description === description)
    .reduce((total, item) => total + amount(item.quantity), 0);

const getDeckingMaterialQuantity = (costBreakdown: CostBreakdown, key: string) =>
  Math.max(0, (costBreakdown.copingDeckingMaterial || [])
    .filter((item) => item.category === 'Decking Material' && item.details?.deckingSelectionKey === key)
    .filter((item) => !/tax|waste|steps/i.test(item.description))
    .reduce((total, item) => total + (Number(item.quantity) || 0), 0));

const excavationItems = (proposal: Proposal, costBreakdown: CostBreakdown): { details: OrderFormItem[]; totals: OrderFormItem[] } => {
  const excavation = proposal.excavation;
  const items: OrderFormItem[] = [];
  const facingRows: Array<{ description: string; actual: number; item: OrderFormItem; materialId: string; materialName: string }> = [];
  const retainingRows: Array<{ type: string; item: OrderFormItem }> = [];
  const rbbOptions = getMasonryFacingOptions(pricingData.masonry, 'rbb');
  const backsideOptions = getMasonryFacingOptions(pricingData.masonry, 'backside');
  const raisedSpaOptions = getMasonryFacingOptions(pricingData.masonry, 'raisedSpa');
  const addFacing = (description: string, actual: number, materialId: string, materialName: string) => {
    const item: OrderFormItem = { name: description, measures: sfMeasures(actual, actual), isFacing: true };
    items.push(item);
    facingRows.push({ description, actual, item, materialId, materialName });
  };

  (excavation.rbbLevels || []).forEach((level, index) => {
    const actual = amount(level.length) * amount(level.height) / 12;
    if (!actual) return;
    items.push({ name: `RBB ${index + 1}: ${level.height}" High`, measures: sfMeasures(actual, actual) });
    const front = normalizeMasonryFacingId(level.facing);
    if (front && front !== 'none') {
      const label = formatMasonryFacingLabel(level.facing, rbbOptions);
      addFacing(`${level.height}" RBB ${label} Facing`, actual, front, label);
      const explicitBack = normalizeMasonryFacingId(level.backsideFacing);
      if (explicitBack && explicitBack !== 'none') {
        const backLabel = formatMasonryFacingLabel(level.backsideFacing, backsideOptions);
        const explicitDescription = `Backside ${backLabel} Facing`;
        const legacyDescription = `Backside ${label} Facing`;
        const hasExplicitLine = (costBreakdown.stoneRockworkLabor || []).some((line) => line.description === explicitDescription);
        if (hasExplicitLine) addFacing(explicitDescription, actual, explicitBack, backLabel);
        else if (level.hasBacksideFacing) addFacing(legacyDescription, actual, front, label);
      } else if (level.hasBacksideFacing) {
        addFacing(`Backside ${label} Facing`, actual, front, label);
      }
    }
  });

  (excavation.exposedPoolWallLevels || []).forEach((level, index) => {
    const actual = amount(level.length) * amount(level.height) / 12;
    if (!actual) return;
    items.push({ name: `Exposed Pool Wall ${index + 1}: ${level.height}" High`, measures: sfMeasures(actual, actual) });
    const facing = normalizeMasonryFacingId(level.facing);
    if (facing && facing !== 'none') {
      const label = formatMasonryFacingLabel(level.facing, rbbOptions);
      addFacing(`Exposed Pool Wall ${label} Facing`, actual, facing, label);
    }
  });

  const columns = excavation.columns;
  const columnActual = amount(columns?.count) * 2 * (amount(columns?.width) + amount(columns?.depth)) * amount(columns?.height);
  if (columnActual > 0) {
    items.push({ name: `Columns: ${columns.count}`, detail: `${columns.width} × ${columns.depth} × ${columns.height} FT each`,
      measures: sfMeasures(columnActual, columnActual) });
    const facing = normalizeMasonryFacingId(columns.facing);
    if (facing && facing !== 'none') {
      const label = formatMasonryFacingLabel(columns.facing, rbbOptions);
      addFacing(`Column ${label} Facing`, columnActual, facing, label);
    }
  }

  const walls = excavation.retainingWalls?.length ? excavation.retainingWalls
    : selected(excavation.retainingWallType) && amount(excavation.retainingWallLength) > 0
      ? [{ type: excavation.retainingWallType!, length: excavation.retainingWallLength! }] : [];
  walls.forEach((wall, index) => {
    const option = pricingData.masonry.retainingWalls.find((entry) => entry.name === wall.type);
    const actual = amount(option?.heightFt) * amount(wall.length);
    if (actual > 0) {
      const item = { name: walls.length > 1 ? `Retaining Wall ${index + 1}: ${wall.type}` : `Retaining Wall: ${wall.type}`,
        measures: sfMeasures(actual, actual) };
      items.push(item);
      retainingRows.push({ type: wall.type, item });
    }
  });

  if (proposal.poolSpecs.isRaisedSpa) {
    const spa = proposal.poolSpecs;
    const calculatedPerimeter = spa.spaType === 'none' || spa.spaType === 'fiberglass' ? 0
      : Math.ceil(spa.spaShape === 'round' ? amount(spa.spaLength) * 3.14 : 2 * (amount(spa.spaLength) + amount(spa.spaWidth)));
    const actual = (amount(spa.spaPerimeter) || calculatedPerimeter) * 1.5;
    const facing = normalizeMasonryFacingId(proposal.poolSpecs.raisedSpaFacing);
    if (actual > 0 && facing && facing !== 'none') {
      items.push({ name: 'Raised Spa: 18" High', measures: sfMeasures(actual, actual) });
      const label = formatMasonryFacingLabel(proposal.poolSpecs.raisedSpaFacing, raisedSpaOptions);
      addFacing(`Raised Spa ${label} Facing`, actual, facing, label);
    }
  }

  // Distribute saved revision material quantities across repeated facing selections.
  // This keeps each facing directly below its parent without counting shared cost lines twice.
  const byDescription = new Map<string, typeof facingRows>();
  facingRows.forEach((row) => byDescription.set(row.description, [...(byDescription.get(row.description) || []), row]));
  byDescription.forEach((rows, description) => {
    const matchingMaterial = (costBreakdown.stoneRockworkMaterial || []).filter((line) => line.description === description);
    if (!matchingMaterial.length) return;
    const total = matchingMaterial.reduce((sum, line) => sum + amount(line.quantity), 0);
    if (total <= 0) return;
    if (matchingMaterial.length === rows.length) {
      rows.forEach((row, index) => { row.item.measures = sfMeasures(row.actual, amount(matchingMaterial[index].quantity)); });
      return;
    }
    const actualTotal = rows.reduce((sum, row) => sum + row.actual, 0);
    let assigned = 0;
    rows.forEach((row, index) => {
      const withWaste = index === rows.length - 1 ? rounded(total - assigned) : rounded(total * row.actual / actualTotal);
      assigned += withWaste;
      row.item.measures = sfMeasures(row.actual, withWaste);
    });
  });
  const totalsByMaterial = new Map<string, { name: string; actual: number; withWaste: number }>();
  const addTotal = (key: string, name: string, item: OrderFormItem) => {
    const total = totalsByMaterial.get(key) || { name, actual: 0, withWaste: 0 };
    total.actual += item.measures[0].value;
    total.withWaste += item.measures[1].value;
    totalsByMaterial.set(key, total);
  };
  facingRows.forEach(({ materialId, materialName, item }) =>
    addTotal(`facing:${materialId}`, `Total ${materialName} Facing`, item));
  retainingRows.forEach(({ type, item }) =>
    addTotal(`retaining:${type.trim().toLowerCase()}`, `Total Retaining Wall: ${type}`, item));
  const totals = Array.from(totalsByMaterial.values(), (total) => ({
    name: total.name, measures: sfMeasures(total.actual, total.withWaste),
  }));
  return { details: items, totals };
};

export const buildMaterialsOrderForm = (
  proposal: Proposal,
  costBreakdown: CostBreakdown,
  useVersionPackageDefinition = true
): MaterialsOrderFormData => {
  const tile = proposal.tileCopingDecking;
  const specs = proposal.poolSpecs;
  const prices = pricingData.tileCoping;
  const groups: OrderFormGroup[] = [];
  const pkg = useVersionPackageDefinition ? getSelectedEquipmentPackage(proposal.equipment) : null;
  const selectedPackageId = proposal.equipment?.packageSelectionTouched === false
    ? undefined : proposal.equipment?.packageSelectionId;
  const packageName = pkg?.name || ({
    custom: 'Custom',
    'pmf03-standard-automation': 'PMF03 Standard Automation Package',
    'pfm01-basic-chlorine': 'PFM01 Basic Chlorine Package',
  } as Record<string, string>)[selectedPackageId || ''] || selectedPackageId || 'No package selected';
  const packageNote = selectedPackageId && !pkg && selectedPackageId !== 'custom'
    ? 'Saved package definition unavailable; selected equipment is listed below.' : undefined;
  const surfaces: OrderFormItem[] = [];
  const coping = getCopingOptionById(prices, tile.copingType);
  if (coping && coping.id !== 'none') {
    const spaPerimeter = amount(specs.spaPerimeter);
    const length = amount(tile.copingLength) || Math.ceil(amount(specs.perimeter) * 1.1 + spaPerimeter * 2.15);
    const sizeFactor = tile.copingSize === '12x24' ? 2 : tile.copingSize === '16x16' ? 1.33 : 1;
    const actual = length * sizeFactor;
    const materialLength = getMaterialQuantity(costBreakdown, 'Coping Material', `${coping.name} Coping Material`);
    const withWaste = (materialLength || (coping.id === 'flagstone'
      ? length * amount(prices.flagstoneQuantityMultiplier ?? 1.1) : length)) * sizeFactor;
    if (length > 0) surfaces.push({ name: `Coping: ${coping.name}`, detail: `Size: ${tile.copingSize || '12x12'}`, measures: sfMeasures(actual, withWaste) });
  }
  const tileChoice = getTileOptionById(prices, getTileSelectionId(tile));
  if (specs.poolType !== 'fiberglass' && tileChoice) {
    const poolFeet = amount(specs.perimeter);
    if (poolFeet > 0) surfaces.push({ name: `Pool Tile: ${tileChoice.name}`, measures: sfMeasures(poolFeet, poolFeet),
      note: 'Tile SF based on Pool Perimeter' });
    const additionalFeet = amount(tile.additionalTileLength);
    if (additionalFeet > 0) surfaces.push({ name: `Additional Tile: ${tileChoice.name}`, measures: sfMeasures(additionalFeet, additionalFeet),
      note: 'Tile SF based on Additional Tile Length' });
    const spaFeet = amount(specs.spaPerimeter);
    if (spaFeet > 0) surfaces.push({ name: `Spa Tile: ${tileChoice.name}`, measures: sfMeasures(spaFeet, spaFeet),
      note: 'Tile SF based on Spa Perimeter' });
    const trim = getTrimTileOptionById(prices, tile.trimTileOptionId || (tile.hasTrimTileOnSteps ? 'step-trim' : ''));
    if (trim && amount(specs.totalStepsAndBench) > 0) {
      const trimFeet = spaFeet + amount(specs.totalStepsAndBench);
      surfaces.push({ name: `Trim Tile: ${trim.name}`, measures: sfMeasures(trimFeet, trimFeet),
        note: 'Tile SF based on Spa Perimeter and Step/Bench Length' });
    }
  }
  const deck = getDeckingOptionById(prices, tile.deckingType);
  if (deck && deck.id !== 'none') {
    const actual = getResolvedProposalPrimaryDeckingArea(proposal);
    const wasteRate = amount(prices.onContractDecking?.quantityWasteRate ?? 0.05);
    const materialQuantity = getDeckingMaterialQuantity(costBreakdown, 'primary');
    const waste = materialQuantity || (deck.id === 'concrete' ? actual : actual * (tile.isDeckingOffContract ? 1.05 : 1 + wasteRate));
    if (actual > 0) surfaces.push({ name: `Decking: ${deck.name}`, measures: sfMeasures(actual, waste) });
  }
  getAdditionalDeckingSelections(tile).forEach((entry, index) => {
    const option = getAdditionalDeckingOption(entry.deckingType);
    const area = amount(entry.area);
    if (!selected(entry.deckingType) || area <= 0) return;
    const wasteRate = amount(prices.onContractDecking?.quantityWasteRate ?? 0.05);
    const materialQuantity = getDeckingMaterialQuantity(costBreakdown, `additional-${index}`);
    const withWaste = materialQuantity || (entry.deckingType === 'concrete' || option?.wasteNotIncluded ? area : area * (entry.isOffContract ? 1.05 : 1 + wasteRate));
    surfaces.push({ name: `Additional Decking: ${option?.label || getDeckingTypeFullLabel(entry.deckingType)}`, measures: sfMeasures(area, withWaste) });
  });
  if (surfaces.length) groups.push({ title: 'Tile, Coping & Decking', items: surfaces });

  const excavation = excavationItems(proposal, costBreakdown);
  if (excavation.details.length) groups.push({ title: 'Excavation', items: excavation.details });
  if (excavation.totals.length) groups.push({ title: 'Excavation Material Totals', items: excavation.totals, kind: 'totals' });

  const featureCatalog = flattenWaterFeatures(pricingData.waterFeatures);
  const waterItems: OrderFormItem[] = (proposal.waterFeatures?.selections || []).filter((entry) => amount(entry.quantity) > 0).flatMap((entry): OrderFormItem[] => {
    const option = featureCatalog.find((candidate) => candidate.id === entry.featureId || candidate.name === entry.featureId);
    const name = option?.name || entry.featureId;
    if (isWaterFeaturePlaceholderLabel(name)) return [];
    return [{ name, detail: option?.category || 'Water / Fire Feature', measures: countMeasure(amount(entry.quantity)),
      note: `Valve actuator: ${entry.includeValveActuator === false ? 'No' : 'Yes'}` }];
  });
  if (waterItems.length) groups.push({ title: 'Water & Fire Features', items: waterItems });
  groups.push(...equipmentGroups(proposal, pkg, packageName).filter((group) => group.items.length > 0));
  return { groups, packageName, packageNote };
};
