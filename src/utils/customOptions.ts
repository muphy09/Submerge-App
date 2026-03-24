import { CustomOption, Proposal } from '../types/proposal-new';

export interface OffContractItem {
  category: string;
  name: string;
  description: string;
  totalCost: number;
  option: CustomOption;
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

export const getDeckingOffContractCost = (proposal?: Partial<Proposal>): number =>
  isDeckingOffContract(proposal) ? toNumber(proposal?.tileCopingDecking?.deckingOffContractCost) : 0;

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

export const getOffContractItems = (proposal?: Partial<Proposal>): OffContractItem[] => {
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
          option: normalized,
        };
      })
  );

  const deckingOffContractCost = getDeckingOffContractCost(proposal);
  const deckingItems: OffContractItem[] =
    isDeckingOffContract(proposal) && deckingOffContractCost >= 0
      ? [
          {
            category: 'Tile / Coping / Decking',
            name: 'Decking',
            description: 'Decking marked as off contract',
            totalCost: deckingOffContractCost,
            option: normalizeCustomOption({
              name: 'Decking',
              description: 'Decking marked as off contract',
              totalCost: deckingOffContractCost,
              isOffContract: true,
            }),
          },
        ]
      : [];

  return [...customOptionItems, ...deckingItems];
};

export const getOffContractItemGroups = (proposal?: Partial<Proposal>): OffContractItemGroup[] => {
  const groups = new Map<string, OffContractItem[]>();

  getOffContractItems(proposal).forEach((item) => {
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

export const getOffContractTotal = (proposal?: Partial<Proposal>): number =>
  getOffContractItems(proposal).reduce((sum, item) => sum + item.totalCost, 0);
