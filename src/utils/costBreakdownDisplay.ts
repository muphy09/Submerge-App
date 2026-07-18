import { CostBreakdown, CostLineItem, Proposal } from '../types/proposal-new';
import { isPpasEastProposal } from './franchiseScope';

const WATER_FEATURE_SOURCE_CATEGORY = 'Water Features';

const isWaterFeatureEquipmentItem = (item?: CostLineItem | null): boolean => {
  if (!item) return false;
  if ((item.category || '').toLowerCase() !== 'equipment') return false;

  return (
    item.details?.sourceCategory === WATER_FEATURE_SOURCE_CATEGORY ||
    typeof item.details?.waterFeatureId === 'string'
  );
};

const sumItems = (items: CostLineItem[] = []): number =>
  items.reduce((sum, item) => sum + (item.total ?? 0), 0);

const PPAS_EAST_UNSUPPORTED_COST_PATTERN = /\bmicro\s*glass\b|\bwaterproofing\b/i;

const removeUnsupportedPpasEastCostItems = (
  costBreakdown: CostBreakdown,
  proposal?: Partial<Proposal>
): CostBreakdown => {
  if (!isPpasEastProposal(proposal)) return costBreakdown;

  const currentInteriorFinish = costBreakdown.interiorFinish || [];
  const interiorFinish = currentInteriorFinish.filter(
    (item) =>
      !PPAS_EAST_UNSUPPORTED_COST_PATTERN.test(item.description || '') &&
      !PPAS_EAST_UNSUPPORTED_COST_PATTERN.test(item.category || '')
  );
  if (interiorFinish.length === currentInteriorFinish.length) return costBreakdown;

  const currentInteriorTotal =
    costBreakdown.totals?.interiorFinish ?? sumItems(currentInteriorFinish);
  const interiorFinishTotal = sumItems(interiorFinish);
  const removedTotal = currentInteriorTotal - interiorFinishTotal;

  return {
    ...costBreakdown,
    interiorFinish,
    totals: {
      ...costBreakdown.totals,
      interiorFinish: interiorFinishTotal,
      grandTotal: (costBreakdown.totals?.grandTotal ?? 0) - removedTotal,
    },
  };
};

const moveToWaterFeaturesCategory = (item: CostLineItem): CostLineItem => ({
  ...item,
  category: WATER_FEATURE_SOURCE_CATEGORY,
});

export function normalizeCostBreakdownForDisplay(
  costBreakdown: CostBreakdown,
  proposal?: Partial<Proposal>
): CostBreakdown {
  const supportedCostBreakdown = removeUnsupportedPpasEastCostItems(costBreakdown, proposal);
  const equipmentItems = supportedCostBreakdown.equipmentOrdered || [];
  const movedWaterFeatureItems = equipmentItems
    .filter(isWaterFeatureEquipmentItem)
    .map(moveToWaterFeaturesCategory);

  if (movedWaterFeatureItems.length === 0) {
    return supportedCostBreakdown;
  }

  const remainingEquipmentItems = equipmentItems.filter((item) => !isWaterFeatureEquipmentItem(item));
  const waterFeatures = [
    ...movedWaterFeatureItems,
    ...(supportedCostBreakdown.waterFeatures || []).map(moveToWaterFeaturesCategory),
  ];

  return {
    ...supportedCostBreakdown,
    equipmentOrdered: remainingEquipmentItems,
    waterFeatures,
    totals: {
      ...supportedCostBreakdown.totals,
      equipmentOrdered: sumItems(remainingEquipmentItems),
      waterFeatures: sumItems(waterFeatures),
      grandTotal: supportedCostBreakdown.totals.grandTotal,
    },
  };
}
