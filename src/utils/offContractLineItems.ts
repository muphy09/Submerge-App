import { CostLineItem } from '../types/proposal-new';

export const OFF_CONTRACT_GROUP_DECKING = 'Decking';

const isTruthyValue = (value: unknown): boolean =>
  value === true || value === 'true' || value === 1 || value === '1';

export const annotateOffContractLineItem = (
  item: CostLineItem,
  options: {
    group: string;
    selectionLabel?: string;
    applied?: boolean;
  }
): CostLineItem => ({
  ...item,
  details: {
    ...(item.details || {}),
    offContractEligible: true,
    offContractGroup: options.group,
    ...(options.selectionLabel ? { offContractSelectionLabel: options.selectionLabel } : {}),
    ...(options.applied ? { offContract: true } : {}),
  },
});

export const isOffContractLineItem = (item?: CostLineItem | null): boolean =>
  isTruthyValue(item?.details?.offContract);

export const isOffContractEligibleLineItem = (
  item?: CostLineItem | null,
  group?: string
): boolean => {
  if (!isTruthyValue(item?.details?.offContractEligible)) return false;
  if (!group) return true;
  return String(item?.details?.offContractGroup || '').trim() === group;
};

export const getOffContractLineItemGroup = (item?: CostLineItem | null): string =>
  String(item?.details?.offContractGroup || '').trim();

export const getOffContractSelectionLabel = (item?: CostLineItem | null): string =>
  String(item?.details?.offContractSelectionLabel || '').trim();
