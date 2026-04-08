import pricingData from '../services/pricingData';
import type { AdditionalDeckingSelection, Proposal, TileCopingDecking } from '../types/proposal-new';
import { getDeckingOptionLabel, normalizeDeckingOptionId } from './tileCopingCatalogs';

export interface AdditionalDeckingOption {
  id: string;
  label: string;
  laborRate: number;
  materialRate: number;
  wasteNotIncluded: boolean;
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeAdditionalDeckingSelection = (
  selection?: Partial<AdditionalDeckingSelection> | null
): AdditionalDeckingSelection => ({
  deckingType: String(selection?.deckingType || '').trim(),
  area: toNumber(selection?.area),
  isOffContract: Boolean(selection?.isOffContract),
});

export const getDeckingTypeFullLabel = (deckingType?: string | null): string => {
  const normalized = normalizeDeckingOptionId(deckingType);
  if (!normalized) return 'Decking';
  return (
    getDeckingOptionLabel(pricingData.tileCoping, normalized) ||
    getAdditionalDeckingOption(normalized)?.label ||
    normalized
  );
};

export const getAdditionalDeckingOptions = (): AdditionalDeckingOption[] => {
  const rawOptions =
    (pricingData.tileCoping?.decking?.additionalOptions || []) as Array<Record<string, unknown>>;
  if (!Array.isArray(rawOptions)) return [];

  const seenIds = new Set<string>();

  return rawOptions.reduce<AdditionalDeckingOption[]>((options, rawOption, index) => {
    const label = String(rawOption?.name || rawOption?.label || '').trim();
    const generatedId = slugify(label) || `additional-decking-${index + 1}`;
    const id = String(rawOption?.id || generatedId).trim() || generatedId;

    if (!label || seenIds.has(id)) {
      return options;
    }

    seenIds.add(id);
    options.push({
      id,
      label,
      laborRate: toNumber(rawOption?.laborRate),
      materialRate: toNumber(rawOption?.materialRate),
      wasteNotIncluded: Boolean(rawOption?.wasteNotIncluded),
    });
    return options;
  }, []);
};

export const getAdditionalDeckingOption = (
  optionId?: string | null
): AdditionalDeckingOption | null => {
  const normalizedId = String(optionId || '').trim();
  if (!normalizedId) return null;
  return getAdditionalDeckingOptions().find((option) => option.id === normalizedId) || null;
};

export const getAdditionalDeckingSelections = (
  decking?: Partial<TileCopingDecking> | null
): AdditionalDeckingSelection[] => {
  const selectionList = Array.isArray(decking?.additionalDeckingSelections)
    ? decking.additionalDeckingSelections.map(normalizeAdditionalDeckingSelection)
    : [];

  if (selectionList.length > 0) {
    return selectionList;
  }

  const legacySelection = normalizeAdditionalDeckingSelection({
    deckingType: decking?.additionalDeckingType,
    area: decking?.additionalDeckingArea,
    isOffContract: decking?.isAdditionalDeckingOffContract,
  });

  return legacySelection.deckingType || legacySelection.area > 0 || legacySelection.isOffContract
    ? [legacySelection]
    : [];
};

const isIncludedDeckingSelection = (
  selection?: Partial<AdditionalDeckingSelection> | null
): boolean => {
  const deckingType = String(selection?.deckingType || '').trim();
  const area = toNumber(selection?.area);

  return Boolean(deckingType) && deckingType !== 'none' && area > 0 && !Boolean(selection?.isOffContract);
};

export const hasIncludedDecking = (proposal?: Partial<Proposal> | null): boolean => {
  const tileCopingDecking = proposal?.tileCopingDecking;
  if (!tileCopingDecking) {
    return false;
  }

  const primaryDeckingType = String(tileCopingDecking.deckingType || '').trim();
  const primaryDeckingArea = toNumber(tileCopingDecking.deckingArea || proposal?.poolSpecs?.deckingArea || 0);
  const hasIncludedPrimaryDecking =
    Boolean(primaryDeckingType) &&
    primaryDeckingType !== 'none' &&
    primaryDeckingArea > 0 &&
    !Boolean(tileCopingDecking.isDeckingOffContract);

  if (hasIncludedPrimaryDecking) {
    return true;
  }

  return getAdditionalDeckingSelections(tileCopingDecking).some(isIncludedDeckingSelection);
};

export const withAdditionalDeckingSelections = (
  decking: TileCopingDecking,
  selections: Array<Partial<AdditionalDeckingSelection> | null>
): TileCopingDecking => {
  const normalizedSelections = selections.map(normalizeAdditionalDeckingSelection);
  const firstSelection = normalizedSelections[0];

  return {
    ...decking,
    additionalDeckingSelections: normalizedSelections,
    additionalDeckingType: firstSelection?.deckingType ?? '',
    additionalDeckingArea: firstSelection?.area ?? 0,
    isAdditionalDeckingOffContract: Boolean(firstSelection?.isOffContract),
    isAdditionalDeckingWasteRemoved: false,
  };
};
