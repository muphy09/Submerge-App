export type WaterFeatureItem = {
  id?: string;
  name?: string;
  basePrice?: number;
  addCost1?: number;
  addCost2?: number;
  note?: string;
};

export type WaterFeatureCatalogItem = WaterFeatureItem & {
  id: string;
  name: string;
  category: string;
};

export const DEFAULT_WATER_FEATURE_MARGIN = 0.7;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'water-feature';

const normalizeCategory = (category?: string) => {
  const normalized = (category || '').toLowerCase();
  if (normalized.includes('sheer')) return 'Sheer Descent';
  if (normalized === 'jets' || normalized.includes('jet')) return 'Jets';
  if (normalized.includes('water & fire') || normalized.includes('fire & water')) return 'Wok Pots - Water & Fire';
  if (normalized.includes('fire only')) return 'Wok Pots - Fire Only';
  if (normalized.includes('water only')) return 'Wok Pots - Water Only';
  if (normalized.includes('bubbler')) return 'Bubbler';
  return category || 'Water Feature';
};

export function getWaterFeatureCogs(item?: WaterFeatureItem | null): number {
  if (!item) return 0;
  return (item.basePrice ?? 0) + (item.addCost1 ?? 0) + (item.addCost2 ?? 0);
}

export function getWaterFeatureRetail(item?: WaterFeatureItem | null, retailMargin: number = DEFAULT_WATER_FEATURE_MARGIN): number {
  const cogs = getWaterFeatureCogs(item);
  if (!retailMargin) return cogs;
  return cogs / retailMargin;
}

export function flattenWaterFeatures(config?: any): WaterFeatureCatalogItem[] {
  if (!config) return [];

  const woks = config.woks || {};
  const sections: { list: any[] | undefined; category: string }[] = [
    { list: config.sheerDescents, category: 'Sheer Descent' },
    { list: config.jets, category: 'Jets' },
    { list: woks.waterOnly, category: 'Wok Pots - Water Only' },
    { list: woks.fireOnly, category: 'Wok Pots - Fire Only' },
    { list: woks.waterAndFire || woks.fireAndWater, category: 'Wok Pots - Water & Fire' },
    { list: config.bubblers, category: 'Bubbler' },
  ];

  const flattened: WaterFeatureCatalogItem[] = [];

  sections.forEach(({ list, category }) => {
    (list || []).forEach((item: any, index: number) => {
      if (!item) return;
      const normalizedCategory = normalizeCategory(category);
      const name = item.name || item.id || `${category} ${index + 1}`;
      const id = item.id || slugify(`${normalizedCategory}-${name}-${index}`);
      flattened.push({
        id,
        name,
        category: normalizedCategory,
        basePrice: item.basePrice ?? 0,
        addCost1: item.addCost1 ?? 0,
        addCost2: item.addCost2 ?? 0,
        note: item.note,
      });
    });
  });

  if (Array.isArray(config?.catalog)) {
    (config.catalog as any[]).forEach((item: any, index: number) => {
      if (!item) return;
      const name = item.name || item.id || `Water Feature ${index + 1}`;
      const normalizedCategory = normalizeCategory(item.category);
      const id = item.id || slugify(`legacy-${name}-${index}`);
      const mapped: WaterFeatureCatalogItem = {
        id,
        name,
        category: normalizedCategory,
        basePrice: item.unitPrice ?? item.basePrice ?? 0,
        addCost1: item.addCost1 ?? 0,
        addCost2: item.addCost2 ?? 0,
        note: item.note,
      };
      const existingIndex = flattened.findIndex((feature) => feature.id === id);
      // If we already have a structured entry for this id (new model), keep it and ignore legacy overrides.
      if (existingIndex >= 0) return;
      flattened.push(mapped);
    });
  }

  return flattened;
}
