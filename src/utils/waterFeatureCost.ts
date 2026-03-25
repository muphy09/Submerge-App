import type { PlumbingRuns, WaterFeatureSelection } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import { getEquipmentItemCost } from './equipmentCost';

export type WaterFeatureItem = {
  id?: string;
  name?: string;
  category?: string;
  requiresConduit?: boolean;
  basePrice?: number;
  addCost1?: number;
  addCost2?: number;
  note?: string;
  needsPoolLight?: boolean;
};

export type WaterFeatureCatalogItem = WaterFeatureItem & {
  id: string;
  name: string;
  category: string;
};

export type WaterFeatureRunEntry = {
  selection: WaterFeatureSelection;
  feature?: WaterFeatureCatalogItem;
  runField?: keyof PlumbingRuns;
  run: number;
};

export const DEFAULT_WATER_FEATURE_MARGIN = 0.7;
export const WATER_FEATURE_RUN_FIELDS: Array<keyof PlumbingRuns> = [
  'waterFeature1Run',
  'waterFeature2Run',
  'waterFeature3Run',
  'waterFeature4Run',
];

const getDefaultPoolLightCost = () => {
  const poolLights = pricingData?.equipment?.lights?.poolLights || [];
  const defaultPoolLight = poolLights.find((option: any) => option?.defaultLightChoice) || poolLights[0];
  return getEquipmentItemCost(defaultPoolLight);
};

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

const normalizeZoneCategory = (category?: string) => {
  const normalized = normalizeCategory(category);
  if (normalized.startsWith('Wok Pots')) return 'Wok Pots';
  return normalized;
};

export const waterFeatureNeedsGasRun = (item?: Pick<WaterFeatureItem, 'category' | 'name'> | null): boolean => {
  const normalized = normalizeCategory(item?.category || item?.name);
  return normalized === 'Wok Pots - Fire Only' || normalized === 'Wok Pots - Water & Fire';
};

export const waterFeatureNeedsConduitRun = (
  item?: Pick<WaterFeatureItem, 'requiresConduit' | 'needsPoolLight'> | null
): boolean => Boolean(item?.requiresConduit || item?.needsPoolLight);

export function getWaterFeatureCogs(item?: WaterFeatureItem | null): number {
  if (!item) return 0;
  return (
    (item.basePrice ?? 0) +
    (item.addCost1 ?? 0) +
    (item.addCost2 ?? 0) +
    (item.needsPoolLight ? getDefaultPoolLightCost() : 0)
  );
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
        requiresConduit: Boolean(item.requiresConduit),
        basePrice: item.basePrice ?? 0,
        addCost1: item.addCost1 ?? 0,
        addCost2: item.addCost2 ?? 0,
        note: item.note,
        needsPoolLight: Boolean(item.needsPoolLight),
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
        requiresConduit: Boolean(item.requiresConduit),
        basePrice: item.unitPrice ?? item.basePrice ?? 0,
        addCost1: item.addCost1 ?? 0,
        addCost2: item.addCost2 ?? 0,
        note: item.note,
        needsPoolLight: Boolean(item.needsPoolLight),
      };
      const existingIndex = flattened.findIndex((feature) => feature.id === id);
      // If we already have a structured entry for this id (new model), keep it and ignore legacy overrides.
      if (existingIndex >= 0) return;
      flattened.push(mapped);
    });
  }

  return flattened;
}

export function orderWaterFeatureSelectionsForRuns(
  selections: WaterFeatureSelection[] = [],
  config?: any
): Array<{ selection: WaterFeatureSelection; feature?: WaterFeatureCatalogItem }> {
  const catalog = flattenWaterFeatures(config ?? pricingData.waterFeatures);
  const lookup = new Map(catalog.map((entry) => [entry.id, entry]));
  const grouped = {
    sheer: [] as Array<{ selection: WaterFeatureSelection; feature?: WaterFeatureCatalogItem }>,
    woks: [] as Array<{ selection: WaterFeatureSelection; feature?: WaterFeatureCatalogItem }>,
    jets: [] as Array<{ selection: WaterFeatureSelection; feature?: WaterFeatureCatalogItem }>,
    bubblers: [] as Array<{ selection: WaterFeatureSelection; feature?: WaterFeatureCatalogItem }>,
  };

  selections.forEach((selection) => {
    const feature = lookup.get(selection.featureId) || catalog.find((entry) => entry.name === selection.featureId);
    const category = feature?.category;

    if (category === 'Sheer Descent') {
      grouped.sheer.push({ selection, feature });
      return;
    }
    if (category?.startsWith('Wok Pots')) {
      grouped.woks.push({ selection, feature });
      return;
    }
    if (category === 'Jets') {
      grouped.jets.push({ selection, feature });
      return;
    }
    if (category === 'Bubbler') {
      grouped.bubblers.push({ selection, feature });
    }
  });

  return [...grouped.sheer, ...grouped.woks, ...grouped.jets, ...grouped.bubblers];
}

export function getWaterFeatureRunEntries(
  selections: WaterFeatureSelection[] = [],
  plumbingRuns?: Partial<PlumbingRuns>,
  config?: any
): WaterFeatureRunEntry[] {
  return orderWaterFeatureSelectionsForRuns(selections, config).map(({ selection, feature }, index) => {
    const runField = WATER_FEATURE_RUN_FIELDS[index];
    return {
      selection,
      feature,
      runField,
      run: runField ? Math.max(0, plumbingRuns?.[runField] ?? 0) : 0,
    };
  });
}

export function getDerivedWaterFeatureGasRunTotal(
  selections: WaterFeatureSelection[] = [],
  plumbingRuns?: Partial<PlumbingRuns>,
  config?: any
): number {
  return getWaterFeatureRunEntries(selections, plumbingRuns, config).reduce((sum, entry) => {
    if (!entry.runField || entry.run <= 0 || !waterFeatureNeedsGasRun(entry.feature)) return sum;
    return sum + entry.run;
  }, 0);
}

export function getTotalGasRunForBilling(
  plumbingRuns?: Partial<PlumbingRuns>,
  selections: WaterFeatureSelection[] = [],
  config?: any
): number {
  return Math.max(0, plumbingRuns?.gasRun ?? 0) + getDerivedWaterFeatureGasRunTotal(selections, plumbingRuns, config);
}

export function countSelectedWaterFeatureZones(
  selections: WaterFeatureSelection[] = [],
  config?: any
): number {
  if (!Array.isArray(selections) || selections.length === 0) return 0;

  const catalog = flattenWaterFeatures(config);
  const lookup = new Map(catalog.map((entry) => [entry.id, entry]));
  const zones = new Set<string>();

  selections.forEach((selection) => {
    if (!selection || (selection.quantity ?? 0) <= 0 || selection.includeValveActuator === false) return;
    const feature = lookup.get(selection.featureId) || catalog.find((entry) => entry.name === selection.featureId);
    const zone = normalizeZoneCategory(feature?.category);
    if (zone) {
      zones.add(zone);
    }
  });

  return zones.size;
}
