import { CostBreakdown, CostLineItem } from '../types/proposal-new';

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

const moveToWaterFeaturesCategory = (item: CostLineItem): CostLineItem => ({
  ...item,
  category: WATER_FEATURE_SOURCE_CATEGORY,
});

export function normalizeCostBreakdownForDisplay(costBreakdown: CostBreakdown): CostBreakdown {
  const equipmentItems = costBreakdown.equipmentOrdered || [];
  const movedWaterFeatureItems = equipmentItems
    .filter(isWaterFeatureEquipmentItem)
    .map(moveToWaterFeaturesCategory);

  if (movedWaterFeatureItems.length === 0) {
    return costBreakdown;
  }

  const remainingEquipmentItems = equipmentItems.filter((item) => !isWaterFeatureEquipmentItem(item));
  const waterFeatures = [
    ...movedWaterFeatureItems,
    ...(costBreakdown.waterFeatures || []).map(moveToWaterFeaturesCategory),
  ];

  return {
    ...costBreakdown,
    equipmentOrdered: remainingEquipmentItems,
    waterFeatures,
    totals: {
      ...costBreakdown.totals,
      equipmentOrdered: sumItems(remainingEquipmentItems),
      waterFeatures: sumItems(waterFeatures),
      grandTotal: costBreakdown.totals.grandTotal,
    },
  };
}
