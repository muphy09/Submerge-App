import pricingData from '../services/pricingData';

export type EquipmentCostLike = {
  name?: string;
  basePrice?: number;
  addCost1?: number;
  addCost2?: number;
  price?: number;
  percentIncrease?: number;
  // Automation-only flags used for category detection
  zones?: number;
};

const findAutomationCatalogMatch = (item?: EquipmentCostLike | null) => {
  if (!item?.name) return null;
  const list = pricingData?.equipment?.automation || [];
  return list.find(
    (entry: any) => entry?.name?.toLowerCase?.() === item.name?.toLowerCase?.()
  );
};

/**
  * Sum base/add costs; fall back to legacy price; optionally apply an overhead multiplier (e.g., 1.1).
  */
export function getEquipmentItemCost(
  item?: EquipmentCostLike | null,
  overheadMultiplier: number = 1
): number {
  if (!item) return 0;
  const automationMatch = findAutomationCatalogMatch(item);
  // Hydrate missing automation fields from the catalog so percent adjustments still apply when only the name is stored.
  const target: EquipmentCostLike = automationMatch
    ? {
        ...automationMatch,
        ...item,
        zones: item.zones ?? (automationMatch as any).zones ?? 0,
        percentIncrease:
          item.percentIncrease ?? (automationMatch as any).percentIncrease,
      }
    : item;
  const hasParts =
    target.basePrice !== undefined || target.addCost1 !== undefined || target.addCost2 !== undefined;
  const percentIncrease = Number.isFinite(target.percentIncrease)
    ? Number(target.percentIncrease)
    : undefined;
  let totalParts = (target.basePrice ?? 0) + (target.addCost1 ?? 0) + (target.addCost2 ?? 0);
  if (hasParts && percentIncrease !== undefined) {
    totalParts = totalParts * (1 + percentIncrease / 100);
  }
  const base = hasParts ? totalParts : target.price ?? 0;
  return base * overheadMultiplier;
}
