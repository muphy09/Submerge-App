export const WARRANTY_SECTION_ICON_KEYS = [
  'dimensions',
  'steps',
  'plans',
  'excavation',
  'steel',
  'plumbing',
  'electric',
  'shotcrete',
  'tile',
  'equipment',
  'cleanup',
  'startup',
] as const;

export type WarrantySectionIcon = typeof WARRANTY_SECTION_ICON_KEYS[number];

export interface WarrantyFeatureItem {
  id?: string;
  label: string;
  detail?: string;
}

export interface WarrantyAdvantageItem {
  id?: string;
  text: string;
}

export interface WarrantySection {
  id?: string;
  title: string;
  icon: WarrantySectionIcon;
  featureItems: WarrantyFeatureItem[];
  advantageItems: WarrantyAdvantageItem[];
}
