import pricingData from './pricingData';

export type PricingTierOverrideMap = Record<string, any>;

export const NORMAL_PRICING_TIER_ID = 'normal' as const;
export const BRONZE_PRICING_TIER_ID = 'bronze' as const;

export type PricingTierId = typeof NORMAL_PRICING_TIER_ID | typeof BRONZE_PRICING_TIER_ID;

export const PRICING_TIER_OPTIONS: Array<{ id: PricingTierId; name: string }> = [
  { id: NORMAL_PRICING_TIER_ID, name: 'Normal' },
  { id: BRONZE_PRICING_TIER_ID, name: 'Bronze' },
];

export type PricingTierDefinition = {
  id: PricingTierId;
  name: string;
  overrides: PricingTierOverrideMap;
};

export type PricingTierContainer = {
  pricingTiers?: Partial<Record<PricingTierId, PricingTierDefinition>>;
};

export type PricingData = typeof pricingData & PricingTierContainer & {
  pricingTierId?: PricingTierId;
  pricingTierName?: string;
};

export const getPathKey = (path: Array<string | number>) => path.join('.');

export function normalizePricingTierId(value?: string | null): PricingTierId {
  return String(value || '').trim().toLowerCase() === BRONZE_PRICING_TIER_ID
    ? BRONZE_PRICING_TIER_ID
    : NORMAL_PRICING_TIER_ID;
}

export function getPricingTierName(value?: string | null): string {
  return normalizePricingTierId(value) === BRONZE_PRICING_TIER_ID ? 'Bronze' : 'Normal';
}

export function isBronzePricingTier(value?: string | null): boolean {
  return normalizePricingTierId(value) === BRONZE_PRICING_TIER_ID;
}

export function getProposalPricingTierId(proposal?: {
  pricingTierId?: string | null;
  pricingTierName?: string | null;
} | null): PricingTierId {
  return normalizePricingTierId(proposal?.pricingTierId || proposal?.pricingTierName);
}

export function isBronzeProposal(proposal?: {
  pricingTierId?: string | null;
  pricingTierName?: string | null;
} | null): boolean {
  return getProposalPricingTierId(proposal) === BRONZE_PRICING_TIER_ID;
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function getDeep(target: any, path: Array<string | number>) {
  return path.reduce((acc, key) => (acc == null ? undefined : acc[key]), target);
}

export function setDeep(target: any, path: Array<string | number>, value: any) {
  if (!path.length) return;
  let cursor = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (cursor[key] == null) {
      cursor[key] = typeof path[i + 1] === 'number' ? [] : {};
    }
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
}

export function parsePathKey(pathKey: string): Array<string | number> {
  return pathKey.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

export function arePricingValuesEqual(left: any, right: any): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function setOverride(overrides: PricingTierOverrideMap, path: Array<string | number>, value: any) {
  overrides[getPathKey(path)] = value;
}

function setOptionOverride(
  source: any,
  overrides: PricingTierOverrideMap,
  listPath: Array<string | number>,
  optionId: string,
  key: string,
  value: any
) {
  const list = getDeep(source, listPath);
  if (!Array.isArray(list)) return;
  const index = list.findIndex((entry) => String(entry?.id || '').trim() === optionId);
  if (index < 0) return;
  setOverride(overrides, [...listPath, index, key], value);
}

function setAllFiberglassGravelOverrides(source: any, overrides: PricingTierOverrideMap) {
  ['small', 'medium', 'large'].forEach((size) => {
    const list = getDeep(source, ['fiberglass', 'poolModels', size]);
    if (!Array.isArray(list)) return;
    list.forEach((entry, index) => {
      if ('gravel' in (entry || {})) {
        setOverride(overrides, ['fiberglass', 'poolModels', size, index, 'gravel'], 0);
      }
    });
  });
  setOverride(overrides, ['fiberglass', 'fiberglassInstall', 'gravel'], 0);
}

export function buildBronzeDefaultOverrides(basePricing: any): PricingTierOverrideMap {
  const overrides: PricingTierOverrideMap = {
    'excavation.over1000Sqft': 4,
    'excavation.gravelPerSqft': 0,
    'plumbing.cleanerPerFt': 2.5,
    'plumbing.threeQuarterInchPipe': 4.5,
    'plumbing.autoFillPerFt': 5,
    'plumbing.onePointFiveInchPipe': 5.5,
    'plumbing.twoPointFiveInchPipe': 5.5,
    'plumbing.threeInchPipe': 10,
    'plumbing.additionalWaterFeatureRunPerFt': 6,
    'tileCoping.decking.material.rockwork.panelLedge': 8.5,
    'interiorFinish.extras.waterproofingPerSqft': 0,
    'interiorFinish.extras.waterproofingRaisedSpa': 0,
    'misc.startup.fiveYearWarranty': 0,
    'misc.startup.premium': 0,
  };

  setOptionOverride(basePricing, overrides, ['tileCoping', 'tile', 'options'], 'level1', 'materialRate', 5);
  setOptionOverride(
    basePricing,
    overrides,
    ['tileCoping', 'coping', 'options'],
    'travertine-level1',
    'materialRate',
    10.5
  );
  setAllFiberglassGravelOverrides(basePricing, overrides);

  return overrides;
}

export function normalizePricingTiers<T extends Record<string, any>>(pricing: T): T & {
  pricingTiers: Record<PricingTierId, PricingTierDefinition>;
} {
  const next = pricing as T & { pricingTiers: Record<PricingTierId, PricingTierDefinition> };
  const existing = next.pricingTiers || {};
  const hasExistingBronzeTier = Boolean(existing[BRONZE_PRICING_TIER_ID]);
  const bronzeOverrides = hasExistingBronzeTier
    ? existing[BRONZE_PRICING_TIER_ID]?.overrides || {}
    : buildBronzeDefaultOverrides(next);
  const normalizedTiers: Record<PricingTierId, PricingTierDefinition> = {
    [NORMAL_PRICING_TIER_ID]: {
      id: NORMAL_PRICING_TIER_ID,
      name: 'Normal',
      overrides: {},
    },
    [BRONZE_PRICING_TIER_ID]: {
      id: BRONZE_PRICING_TIER_ID,
      name: 'Bronze',
      overrides: bronzeOverrides,
    },
  };
  next.pricingTiers = normalizedTiers;
  return next;
}

export function resolvePricingForTier<T extends Record<string, any>>(
  basePricing: T,
  tierId?: string | null
): PricingData {
  const normalizedTierId = normalizePricingTierId(tierId);
  const normalizedBase = normalizePricingTiers(deepClone(basePricing));
  const effective = deepClone(normalizedBase) as unknown as PricingData;
  const overrides =
    normalizedTierId === BRONZE_PRICING_TIER_ID
      ? normalizedBase.pricingTiers[BRONZE_PRICING_TIER_ID]?.overrides || {}
      : {};

  Object.entries(overrides).forEach(([pathKey, value]) => {
    setDeep(effective, parsePathKey(pathKey), deepClone(value));
  });
  effective.pricingTierId = normalizedTierId;
  effective.pricingTierName = getPricingTierName(normalizedTierId);
  return effective;
}

export function withoutPricingRuntimeFields<T extends Record<string, any>>(pricing: T): T {
  const next = deepClone(pricing);
  delete next.pricingTierId;
  delete next.pricingTierName;
  return next;
}

export function isBronzeLockedPricingPath(path: Array<string | number>): boolean {
  const pathKey = getPathKey(path);
  if (
    pathKey === 'excavation.gravelPerSqft' ||
    pathKey === 'interiorFinish.extras.waterproofingPerSqft' ||
    pathKey === 'interiorFinish.extras.waterproofingRaisedSpa' ||
    pathKey === 'misc.startup.fiveYearWarranty' ||
    pathKey === 'misc.startup.premium' ||
    pathKey === 'fiberglass.fiberglassInstall.gravel'
  ) {
    return true;
  }
  return (
    path[0] === 'fiberglass' &&
    path[1] === 'poolModels' &&
    (path[2] === 'small' || path[2] === 'medium' || path[2] === 'large') &&
    typeof path[3] === 'number' &&
    path[4] === 'gravel'
  );
}

export function upsertPricingTierOverride(
  basePricing: PricingData,
  tierId: PricingTierId,
  path: Array<string | number>,
  value: any
): PricingData {
  const next = normalizePricingTiers(deepClone(withoutPricingRuntimeFields(basePricing)));
  if (tierId === NORMAL_PRICING_TIER_ID) {
    setDeep(next, path, deepClone(value));
    return next;
  }

  const pathKey = getPathKey(path);
  const normalValue = getDeep(next, path);
  const overrides = next.pricingTiers[tierId].overrides || {};
  if (arePricingValuesEqual(normalValue, value)) {
    delete overrides[pathKey];
  } else {
    overrides[pathKey] = deepClone(value);
  }
  next.pricingTiers[tierId].overrides = overrides;
  return next;
}

export function removePricingTierOverride(
  basePricing: PricingData,
  tierId: PricingTierId,
  path: Array<string | number>
): PricingData {
  const next = normalizePricingTiers(deepClone(withoutPricingRuntimeFields(basePricing)));
  if (tierId !== NORMAL_PRICING_TIER_ID) {
    delete next.pricingTiers[tierId].overrides[getPathKey(path)];
  }
  return next;
}
