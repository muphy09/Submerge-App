import {
  CustomFeature,
  CustomFeatures,
  CustomFeatureSource,
  GroupedCustomFeatureSubcategoryConfig,
  GroupedCustomFeaturePricingMode,
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

const normalizeGroupedPricingMode = (value?: string | null): GroupedCustomFeaturePricingMode =>
  value === 'sqft' ? 'sqft' : 'total';

const roundCurrency = (value: number): number => Math.round(value * 100) / 100;

type GroupedCustomFeaturePricingSource = Partial<
  GroupedCustomFeatureSubcategoryConfig & GroupedCustomFeatureOption & CustomFeature
>;

const normalizeGroupedSubcategory = (value?: unknown): string => String(value ?? '').trim();
const normalizeGroupedAdditionalOptionId = (value?: unknown): string => String(value ?? '').trim();

export const isGroupedCustomFeature = (feature?: Partial<CustomFeature> | null): boolean =>
  normalizeSource(feature?.source) === 'grouped';

export const isOffContractCustomFeature = (feature?: Partial<CustomFeature> | null): boolean =>
  Boolean(feature?.isOffContract);

export const getGroupedCustomFeaturePricingMode = (
  value?: GroupedCustomFeaturePricingSource | null
): GroupedCustomFeaturePricingMode =>
  normalizeGroupedPricingMode((value as any)?.groupedPricingMode ?? (value as any)?.pricingMode);

export const getGroupedCustomFeaturePricePerSqft = (value?: GroupedCustomFeaturePricingSource | null): number =>
  toNumber((value as any)?.groupedPricePerSqft ?? (value as any)?.pricePerSqft);

export const getGroupedCustomFeatureSqft = (value?: GroupedCustomFeaturePricingSource | null): number =>
  toNumber((value as any)?.groupedSqft);

export const getGroupedCustomFeatureSubcategory = (value?: GroupedCustomFeaturePricingSource | null): string =>
  normalizeGroupedSubcategory((value as any)?.groupedSubcategory ?? (value as any)?.subcategory);

export const getGroupedCustomFeatureAdditionalOptionCategory = (
  value?: GroupedCustomFeaturePricingSource | null
): string =>
  normalizeGroupedSubcategory(
    (value as any)?.groupedAdditionalOptionCategory ?? (value as any)?.additionalOptionCategory ?? (value as any)?.groupName
  );

export const getGroupedCustomFeatureAddonOptionId = (value?: GroupedCustomFeaturePricingSource | null): string =>
  normalizeGroupedAdditionalOptionId((value as any)?.groupedAddonOptionId ?? (value as any)?.addonOptionId ?? (value as any)?.id);

export const getGroupedCustomFeatureAdditionalOptionName = (
  value?: Partial<GroupedCustomFeatureSubcategoryConfig> | null
): string =>
  String((value as any)?.name ?? (value as any)?.addonLabel ?? '').trim() ||
  getGroupedCustomFeatureAdditionalOptionCategory(value as GroupedCustomFeaturePricingSource);

export const getGroupedCustomFeatureAddonLabel = (value?: GroupedCustomFeaturePricingSource | null): string =>
  String(
    (value as any)?.groupedAddonLabel ??
      (value as any)?.addonLabel ??
      (value as any)?.groupedAdditionalOptionCategory ??
      (value as any)?.additionalOptionCategory ??
      (value as any)?.groupName ??
      ''
  ).trim();

export const getGroupedCustomFeatureAddonUnitPrice = (value?: GroupedCustomFeaturePricingSource | null): number =>
  toNumber((value as any)?.groupedAddonUnitPrice ?? (value as any)?.addonUnitPrice);

export const getGroupedCustomFeatureAddonQuantity = (value?: GroupedCustomFeaturePricingSource | null): number =>
  Math.max(0, Math.round(toNumber((value as any)?.groupedAddonQuantity)));

export const getGroupedCustomFeatureAddonTotal = (value?: GroupedCustomFeaturePricingSource | null): number =>
  roundCurrency(getGroupedCustomFeatureAddonUnitPrice(value) * getGroupedCustomFeatureAddonQuantity(value));

export const getGroupedCustomFeatureBaseTotal = (feature?: Partial<CustomFeature> | null): number => {
  if (!feature) return 0;

  if (isGroupedCustomFeature(feature) && getGroupedCustomFeaturePricingMode(feature) === 'sqft') {
    return roundCurrency(getGroupedCustomFeaturePricePerSqft(feature) * getGroupedCustomFeatureSqft(feature));
  }

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

export const getCustomFeatureTotal = (feature?: Partial<CustomFeature> | null): number => {
  if (!feature) return 0;

  if (isGroupedCustomFeature(feature)) {
    return roundCurrency(getGroupedCustomFeatureBaseTotal(feature) + getGroupedCustomFeatureAddonTotal(feature));
  }

  return getGroupedCustomFeatureBaseTotal(feature);
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
  const groupedPricingMode =
    source === 'grouped' ? getGroupedCustomFeaturePricingMode(feature as GroupedCustomFeaturePricingSource) : undefined;
  const groupedPricePerSqft =
    source === 'grouped' ? getGroupedCustomFeaturePricePerSqft(feature as GroupedCustomFeaturePricingSource) : undefined;
  const groupedSqft =
    source === 'grouped' ? getGroupedCustomFeatureSqft(feature as GroupedCustomFeaturePricingSource) : undefined;
  const groupedSubcategory =
    source === 'grouped' ? getGroupedCustomFeatureSubcategory(feature as GroupedCustomFeaturePricingSource) : undefined;
  const groupedAdditionalOptionCategory =
    source === 'grouped'
      ? getGroupedCustomFeatureAdditionalOptionCategory(feature as GroupedCustomFeaturePricingSource)
      : undefined;
  const groupedAddonOptionId =
    source === 'grouped' ? getGroupedCustomFeatureAddonOptionId(feature as GroupedCustomFeaturePricingSource) : undefined;
  const groupedAddonLabel =
    source === 'grouped' ? getGroupedCustomFeatureAddonLabel(feature as GroupedCustomFeaturePricingSource) : undefined;
  const groupedAddonUnitPrice =
    source === 'grouped'
      ? getGroupedCustomFeatureAddonUnitPrice(feature as GroupedCustomFeaturePricingSource)
      : undefined;
  const groupedAddonQuantity =
    source === 'grouped' ? getGroupedCustomFeatureAddonQuantity(feature as GroupedCustomFeaturePricingSource) : undefined;

  return {
    name: feature?.name ?? '',
    description: feature?.description ?? '',
    laborCost: toNumber(feature?.laborCost),
    materialCost: toNumber(feature?.materialCost),
    totalCost: source === 'grouped' ? getGroupedCustomFeatureBaseTotal(feature) : getCustomFeatureTotal(feature),
    isOffContract: Boolean(feature?.isOffContract),
    source,
    groupedOptionId: source === 'grouped' ? fallbackGroupedOptionId || undefined : undefined,
    groupedSubcategory,
    groupedAdditionalOptionCategory,
    groupedAddonOptionId,
    groupedAddonLabel,
    groupedAddonUnitPrice,
    groupedAddonQuantity,
    groupedPricingMode,
    groupedPricePerSqft,
    groupedSqft,
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

export const normalizeGroupedCustomFeatureSubcategories = (
  subcategories?: Array<Partial<GroupedCustomFeatureSubcategoryConfig> | null>
): GroupedCustomFeatureSubcategoryConfig[] => {
  const usedIds = new Set<string>();

  return (subcategories || [])
    .map((subcategory, index) => {
      const groupName = String(subcategory?.groupName ?? '').trim() || String(subcategory?.name ?? '').trim();
      const optionName = String(subcategory?.name ?? '').trim() || String(subcategory?.addonLabel ?? '').trim() || groupName;
      const baseId =
        normalizeGroupedAdditionalOptionId((subcategory as any)?.id) ||
        slugify(`${groupName}-${optionName}`) ||
        `additional-option-${index + 1}`;
      let nextId = baseId;
      let suffix = 2;

      while (usedIds.has(nextId)) {
        nextId = `${baseId}-${suffix}`;
        suffix += 1;
      }

      usedIds.add(nextId);

      return {
        id: nextId,
        groupName,
        name: optionName,
        addonLabel: String(subcategory?.addonLabel ?? '').trim(),
        addonUnitPrice: toNumber(subcategory?.addonUnitPrice),
      };
    })
    .filter((subcategory) => Boolean(subcategory.groupName && subcategory.name));
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
        subcategory: getGroupedCustomFeatureSubcategory(option as GroupedCustomFeaturePricingSource),
        additionalOptionCategory: getGroupedCustomFeatureAdditionalOptionCategory(
          option as GroupedCustomFeaturePricingSource
        ),
        description: option?.description ?? '',
        pricingMode: getGroupedCustomFeaturePricingMode(option as GroupedCustomFeaturePricingSource),
        totalPrice: toNumber(option?.totalPrice),
        pricePerSqft: getGroupedCustomFeaturePricePerSqft(option as GroupedCustomFeaturePricingSource),
      };
    })
    .filter(
      (option) =>
        Boolean(option.name.trim() || option.description.trim() || option.totalPrice !== 0 || option.pricePerSqft !== 0)
    );
};
