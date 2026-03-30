import { CostLineItem, CustomOption, Proposal } from '../types/proposal-new';
import {
  getCustomFeatureTotal,
  hasCustomFeatureContent,
  isOffContractCustomFeature,
  normalizeCustomFeature,
  normalizeCustomFeatures,
} from './customFeatures';
import {
  getOffContractSelectionLabel,
  isOffContractEligibleLineItem,
  OFF_CONTRACT_GROUP_DECKING,
} from './offContractLineItems';

export interface OffContractItem {
  category: string;
  name: string;
  description: string;
  totalCost: number;
}

export interface OffContractItemGroup {
  category: string;
  items: OffContractItem[];
  totalCost: number;
}

const toNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const isOffContractCustomOption = (
  option?: Partial<CustomOption> | null
): boolean => Boolean(option?.isOffContract);

export const getCustomOptionTotal = (option?: Partial<CustomOption> | null): number => {
  if (!option) return 0;

  const explicitTotal = toNumber(option.totalCost);
  const labor = toNumber(option.laborCost);
  const material = toNumber(option.materialCost);

  if (isOffContractCustomOption(option)) {
    return explicitTotal !== 0 ? explicitTotal : labor + material;
  }

  if (labor !== 0 || material !== 0) {
    return labor + material;
  }

  return explicitTotal;
};

export const hasCustomOptionContent = (option?: Partial<CustomOption> | null): boolean => {
  if (!option) return false;

  const name = option.name?.trim() || '';
  const description = option.description?.trim() || '';
  const total = getCustomOptionTotal(option);

  return Boolean(name || description || total !== 0);
};

export const normalizeCustomOption = (option?: Partial<CustomOption> | null): CustomOption => ({
  name: option?.name ?? '',
  description: option?.description ?? '',
  laborCost: toNumber(option?.laborCost),
  materialCost: toNumber(option?.materialCost),
  totalCost: getCustomOptionTotal(option),
  isOffContract: Boolean(option?.isOffContract),
});

export const normalizeCustomOptions = (options?: Array<Partial<CustomOption> | null>): CustomOption[] =>
  (options || []).map(normalizeCustomOption);

export const isDeckingOffContract = (proposal?: Partial<Proposal>): boolean =>
  Boolean(proposal?.tileCopingDecking?.isDeckingOffContract);

const OFF_CONTRACT_SECTION_DEFINITIONS = [
  {
    category: 'Excavation',
    getOptions: (proposal: Partial<Proposal>) => proposal.excavation?.customOptions,
  },
  {
    category: 'Plumbing',
    getOptions: (proposal: Partial<Proposal>) => proposal.plumbing?.customOptions,
  },
  {
    category: 'Electrical',
    getOptions: (proposal: Partial<Proposal>) => proposal.electrical?.customOptions,
  },
  {
    category: 'Tile / Coping / Decking',
    getOptions: (proposal: Partial<Proposal>) => proposal.tileCopingDecking?.customOptions,
  },
  {
    category: 'Drainage',
    getOptions: (proposal: Partial<Proposal>) => proposal.drainage?.customOptions,
  },
  {
    category: 'Equipment',
    getOptions: (proposal: Partial<Proposal>) => proposal.equipment?.customOptions,
  },
  {
    category: 'Water Features',
    getOptions: (proposal: Partial<Proposal>) => proposal.waterFeatures?.customOptions,
  },
  {
    category: 'Interior Finish',
    getOptions: (proposal: Partial<Proposal>) => proposal.interiorFinish?.customOptions,
  },
];

const getDeckingOffContractItems = (
  proposal?: Partial<Proposal>,
  deckingLineItems?: CostLineItem[]
): OffContractItem[] => {
  if (!proposal || !isDeckingOffContract(proposal) || !Array.isArray(deckingLineItems)) {
    return [];
  }

  const eligibleDeckingItems = deckingLineItems
    .filter((item) => isOffContractEligibleLineItem(item, OFF_CONTRACT_GROUP_DECKING))
    .filter((item) => Number.isFinite(item.total) && item.total !== 0);

  if (!eligibleDeckingItems.length) return [];

  const selectionLabel =
    eligibleDeckingItems.map((item) => getOffContractSelectionLabel(item)).find(Boolean) || 'Selected Decking';

  const getDeckingLineTypeLabel = (item: CostLineItem): string => {
    const description = (item.description || '').toLowerCase();
    const category = (item.category || '').toLowerCase();

    if (description.includes('tax')) return 'Material Tax';
    if (category.includes('labor')) return 'Labor';
    if (category.includes('material')) return 'Material';
    return 'Cost';
  };

  return eligibleDeckingItems.map((item) => ({
    category: OFF_CONTRACT_GROUP_DECKING,
    name: item.description.toLowerCase().includes(getDeckingLineTypeLabel(item).toLowerCase())
      ? item.description
      : `${item.description} - ${getDeckingLineTypeLabel(item)}`,
    description: `${getDeckingLineTypeLabel(item)} | Decking Selection: ${selectionLabel}`,
    totalCost: toNumber(item.total),
  }));
};

export const getOffContractItems = (
  proposal?: Partial<Proposal>,
  deckingLineItems?: CostLineItem[]
): OffContractItem[] => {
  if (!proposal) return [];

  const customOptionItems = OFF_CONTRACT_SECTION_DEFINITIONS.flatMap(({ category, getOptions }) =>
    (getOptions(proposal) || [])
      .filter((option) => isOffContractCustomOption(option) && hasCustomOptionContent(option))
      .map((option, index) => {
        const normalized = normalizeCustomOption(option);
        return {
          category,
          name: normalized.name.trim() || `${category} Off Contract Item #${index + 1}`,
          description: normalized.description.trim(),
          totalCost: getCustomOptionTotal(normalized),
        };
      })
  );

  const deckingItems = getDeckingOffContractItems(proposal, deckingLineItems);

  const customFeatureItems = normalizeCustomFeatures(proposal.customFeatures).features
    .filter((feature) => isOffContractCustomFeature(feature) && hasCustomFeatureContent(feature))
    .map((feature, index) => {
      const normalized = normalizeCustomFeature(feature);
      return {
        category: 'Custom Features',
        name: normalized.name.trim() || `Custom Feature #${index + 1}`,
        description: normalized.description.trim(),
        totalCost: getCustomFeatureTotal(normalized),
      };
    });

  return [...customOptionItems, ...deckingItems, ...customFeatureItems];
};

export const getOffContractItemGroups = (
  proposal?: Partial<Proposal>,
  deckingLineItems?: CostLineItem[]
): OffContractItemGroup[] => {
  const groups = new Map<string, OffContractItem[]>();

  getOffContractItems(proposal, deckingLineItems).forEach((item) => {
    const bucket = groups.get(item.category);
    if (bucket) {
      bucket.push(item);
      return;
    }
    groups.set(item.category, [item]);
  });

  return Array.from(groups.entries()).map(([category, items]) => ({
    category,
    items,
    totalCost: items.reduce((sum, item) => sum + item.totalCost, 0),
  }));
};

export const getOffContractTotal = (
  proposal?: Partial<Proposal>,
  deckingLineItems?: CostLineItem[]
): number =>
  getOffContractItems(proposal, deckingLineItems).reduce((sum, item) => sum + item.totalCost, 0);
