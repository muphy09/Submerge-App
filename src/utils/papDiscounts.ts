import type { CostBreakdown, CostLineItem, PAPDiscounts, Proposal } from '../types/proposal-new';

const PAP_DISCOUNT_KEYS: Array<keyof PAPDiscounts> = [
  'excavation',
  'plumbing',
  'steel',
  'electrical',
  'shotcrete',
  'tileCopingLabor',
  'tileCopingMaterial',
  'equipment',
  'interiorFinish',
  'startup',
  'fiberglassShell',
];

const ZERO_PAP_DISCOUNTS: PAPDiscounts = {
  excavation: 0,
  plumbing: 0,
  steel: 0,
  electrical: 0,
  shotcrete: 0,
  tileCopingLabor: 0,
  tileCopingMaterial: 0,
  equipment: 0,
  interiorFinish: 0,
  startup: 0,
  fiberglassShell: 0,
};

const LEGACY_HARDCODED_PAP_DISCOUNTS: PAPDiscounts = {
  excavation: 0.1,
  plumbing: 0.1,
  steel: 0.1,
  electrical: 0,
  shotcrete: 0.1,
  tileCopingLabor: 0.1,
  tileCopingMaterial: 0.1,
  equipment: 0.1,
  interiorFinish: 0.1,
  startup: 0.1,
  fiberglassShell: 0.2,
};

const PAP_BREAKDOWN_KEYS: Partial<Record<keyof PAPDiscounts, Array<Exclude<keyof CostBreakdown, 'totals'>>>> = {
  excavation: ['excavation'],
  plumbing: ['plumbing'],
  steel: ['steel'],
  electrical: ['electrical'],
  shotcrete: ['shotcreteLabor', 'shotcreteMaterial'],
  tileCopingLabor: ['tileLabor', 'copingDeckingLabor'],
  tileCopingMaterial: ['tileMaterial', 'copingDeckingMaterial'],
  equipment: ['equipmentOrdered'],
  interiorFinish: ['interiorFinish'],
  startup: ['startupOrientation'],
  fiberglassShell: ['fiberglassShell'],
};

const COST_BREAKDOWN_KEYS: Array<Exclude<keyof CostBreakdown, 'totals'>> = [
  'plansAndEngineering',
  'layout',
  'permit',
  'excavation',
  'plumbing',
  'gas',
  'steel',
  'electrical',
  'shotcreteLabor',
  'shotcreteMaterial',
  'tileLabor',
  'tileMaterial',
  'copingDeckingLabor',
  'copingDeckingMaterial',
  'stoneRockworkLabor',
  'stoneRockworkMaterial',
  'drainage',
  'equipmentOrdered',
  'equipmentSet',
  'waterFeatures',
  'cleanup',
  'interiorFinish',
  'waterTruck',
  'fiberglassShell',
  'fiberglassInstall',
  'startupOrientation',
  'customFeatures',
];

const TAX_RECALCULATED_BREAKDOWN_KEYS = new Set<Exclude<keyof CostBreakdown, 'totals'>>([
  'equipmentOrdered',
  'fiberglassShell',
]);

const PAP_VALUE_EPSILON = 0.000001;

const valuesMatch = (left: number, right: number): boolean =>
  Math.abs(left - right) < PAP_VALUE_EPSILON;

export function normalizePapDiscounts(input?: Partial<PAPDiscounts> | null): PAPDiscounts {
  const normalized: PAPDiscounts = { ...ZERO_PAP_DISCOUNTS };

  if (!input || typeof input !== 'object') {
    return normalized;
  }

  PAP_DISCOUNT_KEYS.forEach((key) => {
    const value = Number(input[key]);
    normalized[key] = Number.isFinite(value) ? Math.max(0, value) : 0;
  });

  return normalized;
}

function isLegacyHardcodedPapProfile(discounts: PAPDiscounts): boolean {
  const positiveKeys = PAP_DISCOUNT_KEYS.filter((key) => (discounts[key] || 0) > 0);
  if (!positiveKeys.length) return false;

  const isLegacyFiberglassOnly =
    positiveKeys.length === 1 &&
    positiveKeys[0] === 'fiberglassShell' &&
    valuesMatch(discounts.fiberglassShell || 0, LEGACY_HARDCODED_PAP_DISCOUNTS.fiberglassShell);

  const isLegacyFullDefault = PAP_DISCOUNT_KEYS.every((key) => {
    const legacyValue = LEGACY_HARDCODED_PAP_DISCOUNTS[key] || 0;
    const currentValue = discounts[key] || 0;
    return valuesMatch(currentValue, legacyValue);
  });

  return isLegacyFiberglassOnly || isLegacyFullDefault;
}

export function removeHardcodedPapDiscountDefaults(input?: Partial<PAPDiscounts> | null): PAPDiscounts {
  const normalized = normalizePapDiscounts(input);
  if (!isLegacyHardcodedPapProfile(normalized)) {
    return normalized;
  }
  return { ...ZERO_PAP_DISCOUNTS };
}

export function resolveProposalPapDiscounts(
  _proposal: Partial<Proposal> | null | undefined,
  pricingModelDiscounts?: Partial<PAPDiscounts> | null
): PAPDiscounts {
  return normalizePapDiscounts(pricingModelDiscounts);
}

const roundCurrency = (value: number): number => Math.round(value * 100) / 100;

const isPapDiscountLine = (item?: CostLineItem | null): boolean =>
  String(item?.description || '').toLowerCase().includes('pap discount');

function restoreTaxableBaseAfterRemovedDiscount(
  key: Exclude<keyof CostBreakdown, 'totals'>,
  items: CostLineItem[],
  removedDiscountTotal: number
): CostLineItem[] {
  if (!TAX_RECALCULATED_BREAKDOWN_KEYS.has(key) || removedDiscountTotal >= 0) {
    return items;
  }

  const taxableIncrease = Math.abs(removedDiscountTotal);
  return items.map((item) => {
    const isTaxLine = String(item.description || '').toLowerCase().includes('tax');
    const taxRate = Number(item.unitPrice);
    if (!isTaxLine || !Number.isFinite(taxRate) || taxRate <= 0) {
      return item;
    }

    const nextQuantity = (Number(item.quantity) || 0) + taxableIncrease;
    return {
      ...item,
      quantity: nextQuantity,
      total: roundCurrency(nextQuantity * taxRate),
    };
  });
}

function removePapLineItemsForZeroRates(
  costBreakdown: CostBreakdown | undefined,
  discounts: PAPDiscounts
): CostBreakdown | undefined {
  if (!costBreakdown) return costBreakdown;

  const next: CostBreakdown = {
    ...costBreakdown,
    totals: {
      ...(costBreakdown.totals || {}),
    },
  };

  PAP_DISCOUNT_KEYS.forEach((papKey) => {
    if ((discounts[papKey] || 0) > 0) return;

    (PAP_BREAKDOWN_KEYS[papKey] || []).forEach((breakdownKey) => {
      const items = costBreakdown[breakdownKey];
      if (!Array.isArray(items) || !items.some(isPapDiscountLine)) return;

      let removedDiscountTotal = 0;
      const filteredItems = items.filter((item) => {
        if (!isPapDiscountLine(item)) return true;
        removedDiscountTotal += Number(item.total) || 0;
        return false;
      });

      next[breakdownKey] = restoreTaxableBaseAfterRemovedDiscount(
        breakdownKey,
        filteredItems,
        removedDiscountTotal
      ) as any;
    });
  });

  let grandTotal = 0;
  COST_BREAKDOWN_KEYS.forEach((key) => {
    const total = ((next[key] as CostLineItem[]) || []).reduce(
      (sum, item) => sum + (Number(item.total) || 0),
      0
    );
    (next.totals as any)[key] = total;
    grandTotal += total;
  });
  next.totals.grandTotal = grandTotal;

  return next;
}

function normalizeStoredProposalPapDiscounts<T extends Partial<Proposal>>(proposal: T): T {
  const papDiscounts = removeHardcodedPapDiscountDefaults(proposal.papDiscounts);
  return {
    ...proposal,
    papDiscounts,
    costBreakdown: removePapLineItemsForZeroRates(proposal.costBreakdown, papDiscounts),
  };
}

export function removeHardcodedPapDiscountsFromProposal<T extends Partial<Proposal>>(proposal: T): T {
  if (!proposal || typeof proposal !== 'object') return proposal;
  const normalized = normalizeStoredProposalPapDiscounts(proposal);
  return {
    ...normalized,
    versions: Array.isArray(proposal.versions)
      ? proposal.versions.map((version) => removeHardcodedPapDiscountsFromProposal(version))
      : proposal.versions,
  };
}

export function removeHardcodedPapDiscountsFromPricing<T extends { papDiscountRates?: Partial<PAPDiscounts> }>(
  pricing: T
): T {
  if (!pricing || typeof pricing !== 'object') return pricing;
  return {
    ...pricing,
    papDiscountRates: removeHardcodedPapDiscountDefaults(pricing.papDiscountRates),
  };
}
