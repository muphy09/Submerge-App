import {
  CustomFeature,
  CustomFeatures,
  CustomFeatureSource,
  GroupedCustomFeatureOption,
} from '../types/proposal-new';

const toNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeSource = (value?: string | null): CustomFeatureSource =>
  value === 'grouped' ? 'grouped' : 'manual';

export const isGroupedCustomFeature = (feature?: Partial<CustomFeature> | null): boolean =>
  normalizeSource(feature?.source) === 'grouped';

export const isOffContractCustomFeature = (feature?: Partial<CustomFeature> | null): boolean =>
  Boolean(feature?.isOffContract);

export const getCustomFeatureTotal = (feature?: Partial<CustomFeature> | null): number => {
  if (!feature) return 0;

  const explicitTotal = toNumber(feature.totalCost);
  const labor = toNumber(feature.laborCost);
  const material = toNumber(feature.materialCost);

  if (isGroupedCustomFeature(feature) || isOffContractCustomFeature(feature)) {
    return explicitTotal !== 0 ? explicitTotal : labor + material;
  }

  if (labor !== 0 || material !== 0) {
    return labor + material;
  }

  return explicitTotal;
};

export const hasCustomFeatureContent = (feature?: Partial<CustomFeature> | null): boolean => {
  if (!feature) return false;

  const name = feature.name?.trim() || '';
  const description = feature.description?.trim() || '';
  const total = getCustomFeatureTotal(feature);
  const groupedOptionId = String(feature.groupedOptionId || '').trim();

  return Boolean(name || description || total !== 0 || groupedOptionId || isGroupedCustomFeature(feature));
};

export const normalizeCustomFeature = (feature?: Partial<CustomFeature> | null): CustomFeature => {
  const source = normalizeSource(feature?.source);
  const fallbackGroupedOptionId =
    source === 'grouped' ? String(feature?.groupedOptionId || '').trim() || slugify(feature?.name || '') : '';

  return {
    name: feature?.name ?? '',
    description: feature?.description ?? '',
    laborCost: toNumber(feature?.laborCost),
    materialCost: toNumber(feature?.materialCost),
    totalCost: getCustomFeatureTotal(feature),
    isOffContract: Boolean(feature?.isOffContract),
    source,
    groupedOptionId: source === 'grouped' ? fallbackGroupedOptionId || undefined : undefined,
  };
};

export const normalizeCustomFeatureList = (features?: Array<Partial<CustomFeature> | null>): CustomFeature[] =>
  (features || []).map(normalizeCustomFeature);

export const normalizeCustomFeatures = (input?: Partial<CustomFeatures> | null): CustomFeatures => {
  const features = normalizeCustomFeatureList(input?.features);
  return {
    features,
    totalCost: features.reduce((sum, feature) => sum + getCustomFeatureTotal(feature), 0),
  };
};

const normalizeGroupedOptionId = (option: Partial<GroupedCustomFeatureOption> | null | undefined, index: number): string =>
  String(option?.id || '').trim() || slugify(option?.name || '') || `custom-feature-${index + 1}`;

export const normalizeGroupedCustomFeatureOptions = (
  options?: Array<Partial<GroupedCustomFeatureOption> | null>
): GroupedCustomFeatureOption[] => {
  const usedIds = new Set<string>();

  return (options || [])
    .map((option, index) => {
      const baseId = normalizeGroupedOptionId(option, index);
      let nextId = baseId;
      let suffix = 2;

      while (usedIds.has(nextId)) {
        nextId = `${baseId}-${suffix}`;
        suffix += 1;
      }

      usedIds.add(nextId);

      return {
        id: nextId,
        name: option?.name ?? '',
        description: option?.description ?? '',
        totalPrice: toNumber(option?.totalPrice),
      };
    })
    .filter(
      (option) =>
        Boolean(option.name.trim() || option.description.trim() || option.totalPrice !== 0)
    );
};
