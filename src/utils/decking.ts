import pricingData from '../services/pricingData';

const DECKING_TYPE_FULL_LABELS: Record<string, string> = {
  none: 'No Decking',
  'travertine-level1': 'Travertine Level 1',
  'travertine-level2': 'Travertine Level 2',
  'travertine-level3': 'Travertine Level 3',
  paver: 'Paver',
  concrete: 'Concrete',
};

export interface AdditionalDeckingOption {
  id: string;
  label: string;
  laborRate: number;
  materialRate: number;
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

export const getDeckingTypeFullLabel = (deckingType?: string | null): string => {
  const normalized = String(deckingType || '').trim();
  if (!normalized) return 'Decking';
  return DECKING_TYPE_FULL_LABELS[normalized] || getAdditionalDeckingOption(normalized)?.label || normalized;
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
