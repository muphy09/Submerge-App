import pricingData from '../services/pricingData';

type CleanerLike = {
  name?: string;
  defaultCleaner?: boolean;
  [key: string]: any;
};

export const isNoCleanerSelection = (name?: string | null) =>
  (name || '').trim().toLowerCase().includes('no cleaner');

export const getDefaultCleanerIndex = <T extends CleanerLike>(cleaners?: T[] | null): number => {
  if (!Array.isArray(cleaners) || cleaners.length === 0) {
    return -1;
  }

  const explicitIndex = cleaners.findIndex((cleaner) => Boolean(cleaner?.defaultCleaner));
  if (explicitIndex >= 0) {
    return explicitIndex;
  }

  const firstSelectableIndex = cleaners.findIndex((cleaner) => !isNoCleanerSelection(cleaner?.name));
  if (firstSelectableIndex >= 0) {
    return firstSelectableIndex;
  }

  return 0;
};

export const getDefaultCleanerOption = <T extends CleanerLike>(cleaners?: T[] | null): T | null => {
  const source =
    cleaners ??
    ((((pricingData as any).equipment?.cleaners as T[] | undefined) || []) as T[]);
  const defaultIndex = getDefaultCleanerIndex(source);
  return defaultIndex >= 0 ? source[defaultIndex] : null;
};

export const getDefaultCleanerQuantity = (cleaner?: CleanerLike | null): number =>
  cleaner && !isNoCleanerSelection(cleaner.name) ? 1 : 0;
