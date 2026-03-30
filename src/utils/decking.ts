const DECKING_TYPE_FULL_LABELS: Record<string, string> = {
  none: 'No Decking',
  'travertine-level1': 'Travertine Level 1',
  'travertine-level2': 'Travertine Level 2',
  'travertine-level3': 'Travertine Level 3',
  paver: 'Paver',
  concrete: 'Concrete',
};

export const getDeckingTypeFullLabel = (deckingType?: string | null): string => {
  const normalized = String(deckingType || '').trim();
  if (!normalized) return 'Decking';
  return DECKING_TYPE_FULL_LABELS[normalized] || normalized;
};
