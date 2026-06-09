export const DEFAULT_TAX_RATE = 0.0725;

const LEGACY_TAX_RATE_PATHS = [
  ['equipment', 'taxRate'],
  ['tileCoping', 'materialTaxRate'],
  ['tileCoping', 'tileMaterialTaxRate'],
  ['fiberglass', 'shellTaxRate'],
  ['fiberglass', 'taxRate'],
  ['shotcrete', 'material', 'taxRate'],
  ['misc', 'startup', 'taxRate'],
] as const;

function getDeep(target: any, path: readonly string[]) {
  return path.reduce((acc, key) => (acc == null ? undefined : acc[key]), target);
}

export function normalizeTaxRate(value: any, fallback: number = DEFAULT_TAX_RATE): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return fallback;
}

export function getPricingTaxRate(pricing: any): number {
  const miscTaxRate = pricing?.misc?.taxRate;
  if (Number.isFinite(Number(miscTaxRate))) {
    return normalizeTaxRate(miscTaxRate);
  }

  const legacyRate = LEGACY_TAX_RATE_PATHS
    .map((path) => getDeep(pricing, path))
    .find((value) => Number.isFinite(Number(value)));

  return normalizeTaxRate(legacyRate);
}

export function syncLegacyTaxRateAliases(pricing: any, taxRate: number = getPricingTaxRate(pricing)) {
  if (!pricing || typeof pricing !== 'object') return;
  pricing.misc = pricing.misc && typeof pricing.misc === 'object' ? pricing.misc : {};
  pricing.misc.taxRate = normalizeTaxRate(taxRate);

  if (pricing.shotcrete?.material) {
    pricing.shotcrete.material.taxRate = pricing.misc.taxRate;
  }
  if (pricing.tileCoping) {
    pricing.tileCoping.materialTaxRate = pricing.misc.taxRate;
    pricing.tileCoping.tileMaterialTaxRate = pricing.misc.taxRate;
  }
  if (pricing.equipment) {
    pricing.equipment.taxRate = pricing.misc.taxRate;
  }
  if (pricing.fiberglass) {
    pricing.fiberglass.shellTaxRate = pricing.misc.taxRate;
    pricing.fiberglass.taxRate = pricing.misc.taxRate;
  }
  if (pricing.misc.startup) {
    pricing.misc.startup.taxRate = pricing.misc.taxRate;
  }
}
