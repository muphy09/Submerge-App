export type EquipmentCostLike = {
  basePrice?: number;
  addCost1?: number;
  addCost2?: number;
  price?: number;
  // Automation-only flags used for category detection
  zones?: number;
  hasChemistry?: boolean;
};

/**
  * Sum base/add costs; fall back to legacy price; optionally apply an overhead multiplier (e.g., 1.1).
  */
export function getEquipmentItemCost(
  item?: EquipmentCostLike | null,
  overheadMultiplier: number = 1
): number {
  if (!item) return 0;
  const hasParts =
    item.basePrice !== undefined || item.addCost1 !== undefined || item.addCost2 !== undefined;
  const totalParts = (item.basePrice ?? 0) + (item.addCost1 ?? 0) + (item.addCost2 ?? 0);
  const isAutomation = hasParts && (item.hasChemistry !== undefined || item.zones !== undefined);
  const base = hasParts
    ? isAutomation
      ? totalParts / 0.75 // Automation COGS = (base + adders) ÷ 75% (EQUIP tab parity)
      : totalParts
    : item.price ?? 0;
  return base * overheadMultiplier;
}
