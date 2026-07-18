export const MAX_EXCAVATION_OPTION_QUANTITY = 9;

export function getExcavationOptionQuantity(
  selected: boolean | null | undefined,
  quantity: number | null | undefined
): number {
  if (!selected) return 0;
  const numericQuantity = Number(quantity);
  if (!Number.isFinite(numericQuantity) || numericQuantity < 1) return 1;
  return Math.min(MAX_EXCAVATION_OPTION_QUANTITY, Math.floor(numericQuantity));
}

export function clampExcavationOptionQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 0;
  return Math.min(MAX_EXCAVATION_OPTION_QUANTITY, Math.max(0, Math.floor(quantity)));
}
