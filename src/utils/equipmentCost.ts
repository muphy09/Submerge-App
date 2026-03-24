import pricingData from '../services/pricingData';

export type EquipmentCostLike = {
  name?: string;
  basePrice?: number;
  addCost1?: number;
  addCost2?: number;
  addCost3?: number;
  price?: number;
  percentIncrease?: number;
  overheadMultiplier?: number;
  // Automation-only flags used for category detection
  zones?: number;
};

const findPumpCatalogMatch = (item?: EquipmentCostLike | null) => {
  if (!item?.name) return null;
  const list = pricingData?.equipment?.pumps || [];
  return list.find(
    (entry: any) => entry?.name?.toLowerCase?.() === item.name?.toLowerCase?.()
  );
};

const findAuxiliaryPumpCatalogMatch = (item?: EquipmentCostLike | null) => {
  if (!item?.name) return null;
  const list = (pricingData as any)?.equipment?.auxiliaryPumps || [];
  return list.find(
    (entry: any) => entry?.name?.toLowerCase?.() === item.name?.toLowerCase?.()
  );
};

const findAutomationCatalogMatch = (item?: EquipmentCostLike | null) => {
  if (!item?.name) return null;
  const list = pricingData?.equipment?.automation || [];
  return list.find(
    (entry: any) => entry?.name?.toLowerCase?.() === item.name?.toLowerCase?.()
  );
};

const findAutoFillCatalogMatch = (item?: EquipmentCostLike | null) => {
  if (!item?.name) return null;
  const list = pricingData?.equipment?.autoFillSystem || [];
  return list.find(
    (entry: any) => entry?.name?.toLowerCase?.() === item.name?.toLowerCase?.()
  );
};

const findSanitationAccessoryCatalogMatch = (item?: EquipmentCostLike | null) => {
  if (!item?.name) return null;
  const list = (pricingData as any)?.equipment?.sanitationAccessories || [];
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
  const pumpMatch = findPumpCatalogMatch(item) || findAuxiliaryPumpCatalogMatch(item);
  const explicitOverhead = Number.isFinite(item.overheadMultiplier) && Number(item.overheadMultiplier) > 0
    ? Number(item.overheadMultiplier)
    : undefined;
  const catalogOverhead = Number.isFinite((pumpMatch as any)?.overheadMultiplier) && Number((pumpMatch as any)?.overheadMultiplier) > 0
    ? Number((pumpMatch as any)?.overheadMultiplier)
    : undefined;
  const automationMatch = findAutomationCatalogMatch(item);
  const autoFillMatch = automationMatch ? null : findAutoFillCatalogMatch(item);
  const sanitationAccessoryMatch =
    automationMatch || autoFillMatch ? null : findSanitationAccessoryCatalogMatch(item);
  // Hydrate missing automation fields from the catalog so add-cost pricing still applies when only the name is stored.
  const target: EquipmentCostLike = automationMatch
    ? {
        ...automationMatch,
        ...item,
        zones: item.zones ?? (automationMatch as any).zones ?? 0,
      }
    : autoFillMatch
      ? {
          ...autoFillMatch,
          ...item,
          percentIncrease:
            item.percentIncrease ?? (autoFillMatch as any).percentIncrease,
        }
    : sanitationAccessoryMatch
      ? {
          ...sanitationAccessoryMatch,
          ...item,
        }
    : item;
  const hasParts =
    target.basePrice !== undefined ||
    target.addCost1 !== undefined ||
    target.addCost2 !== undefined ||
    target.addCost3 !== undefined;
  const percentIncrease = Number.isFinite(target.percentIncrease)
    ? Number(target.percentIncrease)
    : undefined;
  let totalParts =
    (target.basePrice ?? 0) +
    (target.addCost1 ?? 0) +
    (target.addCost2 ?? 0) +
    (target.addCost3 ?? 0);
  if (hasParts && percentIncrease !== undefined) {
    const divisor = percentIncrease / 100;
    totalParts = divisor !== 0 ? totalParts / divisor : totalParts;
  }
  const base = hasParts ? totalParts : target.price ?? 0;
  const pumpFallback = pumpMatch ? pricingData?.equipment?.pumpOverheadMultiplier ?? overheadMultiplier : overheadMultiplier;
  const resolvedOverhead = explicitOverhead ?? catalogOverhead ?? pumpFallback;
  const safeOverhead = Number.isFinite(resolvedOverhead) && resolvedOverhead > 0 ? resolvedOverhead : 1;
  return base * safeOverhead;
}
