export type MasonryFacingCatalogType = 'rbb' | 'raisedSpa';

export interface MasonryFacingOption {
  id: string;
  name: string;
  materialCost: number;
  laborCost: number;
}

const DEFAULT_ORDER: Record<MasonryFacingCatalogType, string[]> = {
  rbb: ['tile', 'panel-ledge', 'stacked-stone'],
  raisedSpa: ['tile', 'ledgestone', 'stacked-stone'],
};

const LEGACY_LABELS: Record<MasonryFacingCatalogType, Record<string, string>> = {
  rbb: {
    tile: 'Tile',
    'panel-ledge': 'Panel Ledge',
    'stacked-stone': 'Stacked Stone',
  },
  raisedSpa: {
    tile: 'Tile',
    ledgestone: 'Ledgestone',
    'stacked-stone': 'Stacked Stone',
  },
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toWords = (value: string): string =>
  value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const toLegacyKeys = (value: string): string[] => {
  const normalized = normalizeMasonryFacingId(value);
  if (!normalized) return [];

  const compact = normalized.replace(/-/g, '');
  const camel = normalized.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
  return Array.from(new Set([normalized, compact, camel, value]));
};

export const slugifyMasonryFacingId = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const normalizeMasonryFacingId = (value?: string | null): string => {
  const normalized = slugifyMasonryFacingId(value || '');
  if (!normalized) return '';
  if (normalized === 'panelledge') return 'panel-ledge';
  if (normalized === 'stackedstone') return 'stacked-stone';
  return normalized;
};

const getDefaultLabel = (catalog: MasonryFacingCatalogType, id: string): string =>
  LEGACY_LABELS[catalog][normalizeMasonryFacingId(id)] || toWords(normalizeMasonryFacingId(id));

const getLegacyRate = (rates: Record<string, unknown> | undefined, id: string): number => {
  if (!rates) return 0;
  for (const key of toLegacyKeys(id)) {
    if (key in rates) {
      return toNumber(rates[key]);
    }
  }
  return 0;
};

const getCatalogKey = (catalog: MasonryFacingCatalogType) =>
  catalog === 'rbb' ? 'rbbFacingOptions' : 'raisedSpaFacingOptions';

const getLegacyRateMaps = (masonry: any, catalog: MasonryFacingCatalogType) =>
  catalog === 'rbb'
    ? {
        material: masonry?.material?.rbbFacing,
        labor: masonry?.labor?.rbbFacing,
      }
    : {
        material: masonry?.material?.raisedSpaFacing,
        labor: masonry?.labor?.raisedSpaFacing,
      };

const normalizeFacingOptions = (
  options: unknown[],
  catalog: MasonryFacingCatalogType,
  fallbackOptions: MasonryFacingOption[]
): MasonryFacingOption[] => {
  const fallbackById = new Map(
    fallbackOptions.map((option) => [normalizeMasonryFacingId(option.id), option] as const)
  );
  const seen = new Set<string>();

  return options.reduce<MasonryFacingOption[]>((acc, rawOption) => {
    if (!rawOption || typeof rawOption !== 'object') return acc;

    const option = rawOption as Partial<MasonryFacingOption>;
    const id = normalizeMasonryFacingId(option.id || option.name || '');
    if (!id || id === 'none' || seen.has(id)) return acc;

    const fallback = fallbackById.get(id);
    seen.add(id);
    acc.push({
      id,
      name: String(option.name || fallback?.name || getDefaultLabel(catalog, id)).trim(),
      materialCost: toNumber(option.materialCost ?? fallback?.materialCost),
      laborCost: toNumber(option.laborCost ?? fallback?.laborCost),
    });
    return acc;
  }, []);
};

export const buildLegacyMasonryFacingOptions = (
  masonry: any,
  catalog: MasonryFacingCatalogType
): MasonryFacingOption[] => {
  const { material, labor } = getLegacyRateMaps(masonry, catalog);
  const defaultIds = DEFAULT_ORDER[catalog].map((id) => normalizeMasonryFacingId(id));
  const extraIds = Array.from(
    new Set([
      ...Object.keys(material || {}).map((key) => normalizeMasonryFacingId(key)),
      ...Object.keys(labor || {}).map((key) => normalizeMasonryFacingId(key)),
    ])
  ).filter((id) => id && id !== 'none' && !defaultIds.includes(id));

  return [...defaultIds, ...extraIds].map((id) => ({
    id,
    name: getDefaultLabel(catalog, id),
    materialCost: getLegacyRate(material, id),
    laborCost: getLegacyRate(labor, id),
  }));
};

export const getMasonryFacingOptions = (
  masonry: any,
  catalog: MasonryFacingCatalogType
): MasonryFacingOption[] => {
  const key = getCatalogKey(catalog);
  const fallback = buildLegacyMasonryFacingOptions(masonry, catalog);
  const rawOptions = Array.isArray(masonry?.[key]) ? masonry[key] : [];
  const normalized = normalizeFacingOptions(rawOptions, catalog, fallback);
  return normalized.length > 0 ? normalized : fallback;
};

export const ensureMasonryFacingCatalogs = (target: any, source?: any, defaults?: any) => {
  const targetMasonry = target?.masonry ?? target;
  if (!targetMasonry || typeof targetMasonry !== 'object') return target;

  const sourceMasonry = source?.masonry ?? source ?? targetMasonry;
  const defaultMasonry = defaults?.masonry ?? defaults ?? targetMasonry;

  (['rbb', 'raisedSpa'] as MasonryFacingCatalogType[]).forEach((catalog) => {
    const key = getCatalogKey(catalog);
    const defaultOptions = getMasonryFacingOptions(defaultMasonry, catalog);
    const rawOptions = Array.isArray(sourceMasonry?.[key])
      ? sourceMasonry[key]
      : buildLegacyMasonryFacingOptions(targetMasonry, catalog);
    const normalized = normalizeFacingOptions(rawOptions, catalog, defaultOptions);
    targetMasonry[key] = normalized.length > 0 ? normalized : defaultOptions;
  });

  return target;
};

export const formatMasonryFacingLabel = (
  value?: string | null,
  options: MasonryFacingOption[] = []
): string => {
  const normalized = normalizeMasonryFacingId(value);
  if (!normalized || normalized === 'none') return 'None';

  const match = options.find((option) => normalizeMasonryFacingId(option.id) === normalized);
  return (match?.name || toWords(normalized)).trim();
};

export const getMasonryFacingRate = (
  masonry: any,
  catalog: MasonryFacingCatalogType,
  facingId: string,
  rateType: 'material' | 'labor'
): number => {
  const normalized = normalizeMasonryFacingId(facingId);
  if (!normalized || normalized === 'none') return 0;

  const match = getMasonryFacingOptions(masonry, catalog).find(
    (option) => normalizeMasonryFacingId(option.id) === normalized
  );
  if (match) {
    return rateType === 'material' ? toNumber(match.materialCost) : toNumber(match.laborCost);
  }

  const legacyRates = getLegacyRateMaps(masonry, catalog);
  return rateType === 'material'
    ? getLegacyRate(legacyRates.material, normalized)
    : getLegacyRate(legacyRates.labor, normalized);
};

