const STORAGE_PREFIX = 'submerge.pricing-field-labels';

export type PricingFieldLabelOverrides = Record<string, string>;

const memoryCache = new Map<string, PricingFieldLabelOverrides>();

function storageKey(franchiseId: string) {
  return `${STORAGE_PREFIX}.${franchiseId || 'default'}`;
}

export function buildPricingFieldLabelOverrideKey(
  listPath: Array<string | number>,
  fieldKey: string
) {
  return `${listPath.join('.')}.${fieldKey}`;
}

export function loadPricingFieldLabelOverrides(franchiseId: string): PricingFieldLabelOverrides {
  const targetFranchiseId = franchiseId || 'default';
  if (memoryCache.has(targetFranchiseId)) {
    return { ...(memoryCache.get(targetFranchiseId) || {}) };
  }

  if (typeof localStorage === 'undefined') {
    return {};
  }

  try {
    const raw = localStorage.getItem(storageKey(targetFranchiseId));
    const parsed = raw ? (JSON.parse(raw) as PricingFieldLabelOverrides) : {};
    const safe = parsed && typeof parsed === 'object' ? parsed : {};
    memoryCache.set(targetFranchiseId, safe);
    return { ...safe };
  } catch (error) {
    console.warn('Unable to read pricing field label overrides:', error);
    return {};
  }
}

export function savePricingFieldLabelOverrides(
  franchiseId: string,
  overrides: PricingFieldLabelOverrides
) {
  const targetFranchiseId = franchiseId || 'default';
  const safeOverrides = Object.entries(overrides || {}).reduce<PricingFieldLabelOverrides>((acc, [key, value]) => {
    const normalized = String(value || '').trim();
    if (normalized) {
      acc[key] = normalized;
    }
    return acc;
  }, {});

  memoryCache.set(targetFranchiseId, safeOverrides);

  if (typeof localStorage === 'undefined') {
    return safeOverrides;
  }

  try {
    localStorage.setItem(storageKey(targetFranchiseId), JSON.stringify(safeOverrides));
  } catch (error) {
    console.warn('Unable to persist pricing field label overrides:', error);
  }

  return safeOverrides;
}
