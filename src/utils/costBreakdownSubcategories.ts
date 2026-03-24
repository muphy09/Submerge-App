import { CostLineItem } from '../types/proposal-new';

export interface CostBreakdownSubcategory {
  name: string;
  items: CostLineItem[];
}

export const CUSTOM_OPTIONS_SUBCATEGORY = 'Custom Options';

export const getLineItemSubcategory = (item?: CostLineItem | null): string | null => {
  const subcategory = item?.details?.subcategory;
  return typeof subcategory === 'string' && subcategory.trim().length > 0
    ? subcategory.trim()
    : null;
};

export const hasLineItemSubcategory = (item?: CostLineItem | null): boolean =>
  getLineItemSubcategory(item) !== null;

export const isCustomOptionItem = (item?: CostLineItem | null): boolean =>
  getLineItemSubcategory(item) === CUSTOM_OPTIONS_SUBCATEGORY;

export const buildLineItemSubcategories = (
  items?: CostLineItem[]
): CostBreakdownSubcategory[] | undefined => {
  const subcategories = new Map<string, CostLineItem[]>();

  (items || []).forEach((item) => {
    const subcategory = getLineItemSubcategory(item);
    if (!subcategory) return;
    const bucket = subcategories.get(subcategory);
    if (bucket) {
      bucket.push(item);
      return;
    }
    subcategories.set(subcategory, [item]);
  });

  if (subcategories.size === 0) return undefined;

  return Array.from(subcategories.entries()).map(([name, groupedItems]) => ({
    name,
    items: groupedItems,
  }));
};
