import pricingData from '../services/pricingData';
import type { Proposal } from '../types/proposal-new';
import {
  WARRANTY_SECTION_ICON_KEYS,
  WarrantyAdvantageItem,
  WarrantyFeatureItem,
  WarrantySection,
  WarrantySectionIcon,
} from '../types/warranty';
import { getLightCounts } from './lighting';
import { getEffectivePrimarySanitationSystemName } from './equipmentPackages';
import { flattenWaterFeatures } from './waterFeatureCost';

type LegacyWarrantyItem = {
  id?: string;
  label?: string;
  detail?: string;
  advantage?: string;
};

type LegacyWarrantySection = {
  id?: string;
  title?: string;
  icon?: WarrantySectionIcon;
  items?: LegacyWarrantyItem[];
  featureItems?: WarrantyFeatureItem[];
  advantageItems?: WarrantyAdvantageItem[];
};

const DEFAULT_WARRANTY_ICON: WarrantySectionIcon = 'plans';
const GENERATED_WATER_FEATURE_WARRANTY_ID_PREFIX = 'generated-water-feature';

const createWarrantyId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

const slugifyWarrantyId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'item';

const createGeneratedWaterFeatureWarrantyId = (value: string) =>
  `${GENERATED_WATER_FEATURE_WARRANTY_ID_PREFIX}-${slugifyWarrantyId(value)}`;

const isWarrantySectionIcon = (value: unknown): value is WarrantySectionIcon =>
  typeof value === 'string' && (WARRANTY_SECTION_ICON_KEYS as readonly string[]).includes(value);

const replaceBrandTokens = (value: string | undefined, brandName: string) =>
  value ? value.replace(/\bSubmerge\b/g, brandName) : value;

const normalizeWarrantyFeatureItem = (item: unknown): WarrantyFeatureItem | null => {
  if (!item || typeof item !== 'object') return null;
  const input = item as Partial<WarrantyFeatureItem>;
  return {
    id: typeof input.id === 'string' && input.id.trim() ? input.id : createWarrantyId('warranty-feature'),
    label: typeof input.label === 'string' ? input.label : '',
    detail: typeof input.detail === 'string' ? input.detail : undefined,
  };
};

const normalizeWarrantyAdvantageItem = (item: unknown): WarrantyAdvantageItem | null => {
  if (!item || typeof item !== 'object') return null;
  const input = item as Partial<WarrantyAdvantageItem>;
  const legacyText = typeof (item as any).advantage === 'string' ? (item as any).advantage : undefined;
  return {
    id: typeof input.id === 'string' && input.id.trim() ? input.id : createWarrantyId('warranty-advantage'),
    text: typeof input.text === 'string' ? input.text : legacyText || '',
  };
};

const normalizeLegacyWarrantyItems = (items: unknown): LegacyWarrantyItem[] =>
  Array.isArray(items)
    ? items.filter((item): item is LegacyWarrantyItem => Boolean(item) && typeof item === 'object')
    : [];

const normalizeWarrantySection = (section: unknown): WarrantySection | null => {
  if (!section || typeof section !== 'object') return null;
  const input = section as LegacyWarrantySection;
  const legacyItems = normalizeLegacyWarrantyItems(input.items);
  const featureItems = Array.isArray(input.featureItems)
    ? input.featureItems
        .map(normalizeWarrantyFeatureItem)
        .filter((item): item is WarrantyFeatureItem => Boolean(item))
    : legacyItems
        .map((item) =>
          normalizeWarrantyFeatureItem({
            id: item.id,
            label: item.label,
            detail: item.detail,
          })
        )
        .filter((item): item is WarrantyFeatureItem => Boolean(item));
  const advantageItems = Array.isArray(input.advantageItems)
    ? input.advantageItems
        .map(normalizeWarrantyAdvantageItem)
        .filter((item): item is WarrantyAdvantageItem => Boolean(item))
    : legacyItems
        .filter((item) => typeof item.advantage === 'string')
        .map((item) =>
          normalizeWarrantyAdvantageItem({
            id: item.id,
            text: item.advantage,
          })
        )
        .filter((item): item is WarrantyAdvantageItem => Boolean(item));

  return {
    id: typeof input.id === 'string' && input.id.trim() ? input.id : createWarrantyId('warranty-section'),
    title: typeof input.title === 'string' ? input.title : '',
    icon: isWarrantySectionIcon(input.icon) ? input.icon : DEFAULT_WARRANTY_ICON,
    featureItems,
    advantageItems,
  };
};

export const normalizeWarrantySections = (sections: unknown): WarrantySection[] => {
  if (!Array.isArray(sections)) return [];
  return sections
    .map(normalizeWarrantySection)
    .filter((section): section is WarrantySection => Boolean(section));
};

export const normalizeWarrantySectionsSetting = (sections: unknown): WarrantySection[] | null => {
  if (Array.isArray(sections)) return normalizeWarrantySections(sections);
  return null;
};

export const createEmptyWarrantyFeatureItem = (): WarrantyFeatureItem => ({
  id: createWarrantyId('warranty-feature'),
  label: '',
});

export const createEmptyWarrantyAdvantageItem = (): WarrantyAdvantageItem => ({
  id: createWarrantyId('warranty-advantage'),
  text: '',
});

export const createEmptyWarrantySection = (): WarrantySection => ({
  id: createWarrantyId('warranty-section'),
  title: '',
  icon: DEFAULT_WARRANTY_ICON,
  featureItems: [createEmptyWarrantyFeatureItem()],
  advantageItems: [createEmptyWarrantyAdvantageItem()],
});

const createWarrantySectionFromEntries = (
  title: string,
  icon: WarrantySectionIcon,
  items: LegacyWarrantyItem[]
): WarrantySection => ({
  title,
  icon,
  featureItems: items.map((item) => ({
    id: item.id,
    label: item.label || '',
    detail: item.detail,
  })),
  advantageItems: items
    .filter((item) => typeof item.advantage === 'string')
    .map((item) => ({
      text: item.advantage || '',
    })),
});

const getInteriorFinishLabel = (finishType?: string) =>
  pricingData.interiorFinish.finishes?.find((finish) => finish.id === finishType)?.name ||
  finishType ||
  'Interior finish';

const formatNumber = (value?: number, digits = 1) =>
  value !== undefined && value !== null && !Number.isNaN(value)
    ? Number(value).toFixed(digits).replace(/\.0+$/, '')
    : '0';

const getWaterFeatureWarrantyCategoryLabel = (category?: string) => {
  switch (category) {
    case 'Sheer Descent':
      return 'Sheer Descents';
    case 'Bubbler':
      return 'Bubbler';
    case 'Jets':
      return 'Jets';
    default:
      return category || 'Water Feature';
  }
};

const simplifyWaterFeatureWarrantyName = (name: string, category?: string) => {
  const trimmedName = name.trim();
  if (!trimmedName) return trimmedName;

  if (category === 'Sheer Descent') {
    const simplified = trimmedName
      .replace(/\bSheer Descents?\b/gi, '')
      .replace(/\(\s*Requires[^)]*\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return simplified || trimmedName;
  }

  return trimmedName;
};

const buildSelectedWaterFeatureWarrantyItems = (proposal?: Partial<Proposal>): LegacyWarrantyItem[] => {
  const selections = proposal?.waterFeatures?.selections;
  if (!Array.isArray(selections) || selections.length === 0) {
    return [];
  }

  const catalog = flattenWaterFeatures(pricingData.waterFeatures);
  const lookup = new Map(catalog.map((entry) => [entry.id, entry]));
  const groupedSelections = new Map<
    string,
    { id: string; categoryLabel: string; featureName: string; quantity: number }
  >();

  selections.forEach((selection) => {
    const quantity = Number(selection?.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return;

    const feature =
      lookup.get(selection.featureId) || catalog.find((entry) => entry.name === selection.featureId);
    const featureKey = feature?.id || selection.featureId;
    const categoryLabel = getWaterFeatureWarrantyCategoryLabel(feature?.category);
    const featureName = simplifyWaterFeatureWarrantyName(feature?.name || selection.featureId, feature?.category);
    const existingEntry = groupedSelections.get(featureKey);

    if (existingEntry) {
      existingEntry.quantity += quantity;
      return;
    }

    groupedSelections.set(featureKey, {
      id: createGeneratedWaterFeatureWarrantyId(featureKey),
      categoryLabel,
      featureName,
      quantity,
    });
  });

  return Array.from(groupedSelections.values()).map((item) => ({
    id: item.id,
    label: `${item.categoryLabel}: ${item.featureName} - ${formatNumber(item.quantity, 0)}`,
  }));
};

const buildPoolDetail = (proposal?: Partial<Proposal>) => {
  const poolSpecs = proposal?.poolSpecs;
  if (!poolSpecs) return 'Pool details not set';

  if (poolSpecs.poolType === 'fiberglass') {
    if (poolSpecs.fiberglassModelName) return poolSpecs.fiberglassModelName;
    if (poolSpecs.fiberglassSize) return `Fiberglass (${poolSpecs.fiberglassSize})`;
    return 'Fiberglass pool';
  }

  const width = formatNumber(poolSpecs.maxWidth);
  const length = formatNumber(poolSpecs.maxLength);
  const shallow = formatNumber(poolSpecs.shallowDepth);
  const deep = formatNumber(poolSpecs.endDepth);
  return `Width ${width}ft x Length ${length}ft (Shallow ${shallow}ft / Deep ${deep}ft)`;
};

const buildSpaDetail = (proposal?: Partial<Proposal>) => {
  const poolSpecs = proposal?.poolSpecs;
  if (!poolSpecs || poolSpecs.spaType === 'none') {
    return { detail: 'No spa', advantage: 'No spa' };
  }

  const width = formatNumber(poolSpecs.spaWidth);
  const length = formatNumber(poolSpecs.spaLength);
  const shape = poolSpecs.spaShape ? ` ${poolSpecs.spaShape} spa` : ' spa';

  return {
    detail: `${width}ft x ${length}ft${shape}`,
    advantage: 'Split bench for customized therapy',
  };
};

const buildInteriorFinishDetail = (proposal?: Partial<Proposal>) => {
  const poolSpecs = proposal?.poolSpecs;
  const interior = proposal?.interiorFinish;
  if (!poolSpecs || poolSpecs.poolType === 'fiberglass' || !interior) return undefined;
  const label = getInteriorFinishLabel(interior.finishType);
  const color = interior.color ? ` - ${interior.color}` : '';
  return `${label}${color}`;
};

const buildEquipmentItems = (proposal?: Partial<Proposal>): LegacyWarrantyItem[] => {
  const equipment = proposal?.equipment;
  const items: LegacyWarrantyItem[] = [];

  if (!equipment) {
    return [
      {
        label: 'Equipment selections not set yet',
        advantage: '3-Year NO-FAULT Warranty on all Jandy equipment',
      },
    ];
  }

  const lightCounts = getLightCounts(equipment as any);
  const lightsText =
    lightCounts.poolLights + lightCounts.spaLights > 0
      ? [
          lightCounts.poolLights > 0
            ? `${lightCounts.poolLights} pool light${lightCounts.poolLights === 1 ? '' : 's'}`
            : null,
          lightCounts.spaLights > 0
            ? `${lightCounts.spaLights} spa light${lightCounts.spaLights === 1 ? '' : 's'}`
            : null,
        ]
          .filter(Boolean)
          .join(' + ')
      : 'No lights specified yet';

  items.push({
    label: equipment.pump?.name || 'Primary pump not selected',
    advantage: '3-Year NO-FAULT Warranty on all Jandy equipment',
  });

  const auxiliaryPumps =
    equipment.auxiliaryPumps && equipment.auxiliaryPumps.length > 0
      ? equipment.auxiliaryPumps
      : equipment.auxiliaryPump
        ? [equipment.auxiliaryPump]
        : [];

  auxiliaryPumps.forEach((pump) => {
    if (pump?.name) items.push({ label: pump.name });
  });

  items.push(
    { label: equipment.filter?.name || 'Filter not selected' },
    { label: equipment.heater?.name || 'Heater not selected' },
    { label: equipment.cleaner?.name || 'Cleaner not selected' },
    { label: equipment.automation?.name || 'Automation not selected' }
  );

  const sanitationSelections = [
    getEffectivePrimarySanitationSystemName(equipment as any),
    equipment.additionalSaltSystem?.name,
  ].filter((label): label is string => Boolean(label));

  if (sanitationSelections.length > 0) {
    sanitationSelections.forEach((label) => items.push({ label }));
  } else {
    items.push({ label: 'Sanitation system not selected' });
  }

  items.push({ label: lightsText });
  return items;
};

const buildPlumbingItems = (proposal?: Partial<Proposal>): LegacyWarrantyItem[] => [
  { label: '2 1/2 inch suction line', advantage: 'Submerge Stealth Series pump' },
  {
    label: '2 1/2 inch suction line for all pump motors larger than 1.0 HP',
    advantage: 'Submerge High-Performance circulation pump',
  },
  { label: '2 inch return line (to 1st tee)', advantage: 'Submerge booster pump' },
  { label: 'When possible 45-degree elbows are used rather than 90-degree to improve efficiency and performance' },
  { label: 'Separate skimmer and main drain suction - allows for maximum performance' },
  { label: 'Heavy duty surface skimmer' },
  { label: 'Jandy Ball Valves' },
  { label: 'Hose bib at pad for draining pool' },
  { label: 'All circulation lines are pressure tested throughout construction' },
  ...buildSelectedWaterFeatureWarrantyItems(proposal),
];

const applyBrandToSection = (section: WarrantySection, brandName: string): WarrantySection => ({
  ...section,
  title: replaceBrandTokens(section.title, brandName) || section.title,
  featureItems: section.featureItems.map((item) => ({
    ...item,
    label: replaceBrandTokens(item.label, brandName) || item.label,
    detail: replaceBrandTokens(item.detail, brandName),
  })),
  advantageItems: section.advantageItems.map((item) => ({
    ...item,
    text: replaceBrandTokens(item.text, brandName) || item.text,
  })),
});

const isGeneratedWaterFeatureWarrantyItem = (item: WarrantyFeatureItem) =>
  typeof item.id === 'string' && item.id.startsWith(`${GENERATED_WATER_FEATURE_WARRANTY_ID_PREFIX}-`);

const mergeSelectedWaterFeaturesIntoPlumbingSection = (
  sections: WarrantySection[],
  proposal?: Partial<Proposal>
): WarrantySection[] => {
  const selectedWaterFeatureItems = buildSelectedWaterFeatureWarrantyItems(proposal).map((item) => ({
    id: item.id,
    label: item.label || '',
    detail: item.detail,
  }));

  return sections.map((section) => {
    if (section.title.trim().toLowerCase() !== 'plumbing') {
      return section;
    }

    return {
      ...section,
      featureItems: [
        ...section.featureItems.filter((item) => !isGeneratedWaterFeatureWarrantyItem(item)),
        ...selectedWaterFeatureItems,
      ],
    };
  });
};

export const buildGeneratedWarrantySections = (
  proposal?: Partial<Proposal>,
  brandName: string = 'Submerge'
): WarrantySection[] => {
  const poolSpecs = proposal?.poolSpecs;
  const excavation = proposal?.excavation;
  const isFiberglass = poolSpecs?.poolType === 'fiberglass';
  const spa = buildSpaDetail(proposal);
  const interiorFinishDetail = buildInteriorFinishDetail(proposal);
  const dirtHaulText = excavation?.hasDirtHaul ? 'Dirt haul off included' : 'Dirt to remain at property';

  const sections: WarrantySection[] = [
    createWarrantySectionFromEntries('Dimensions', 'dimensions', [
      { label: 'Pool Dimensions (Feet)', detail: buildPoolDetail(proposal) },
      { label: 'Spa Dimensions (Feet)', detail: spa.detail, advantage: spa.advantage },
    ]),
    createWarrantySectionFromEntries('Steps & Benches', 'steps', [
      { label: 'One set of shallow-end access steps' },
      { label: 'Deep-end loveseat bench', advantage: 'For safety and relaxing' },
    ]),
    createWarrantySectionFromEntries('Plans, Permits & Insurance', 'plans', [
      {
        label: 'Detailed construction plans in advance for approval prior to excavation',
        advantage: 'Ensures clear understanding of project details',
      },
      { label: 'Engineered structural plans', advantage: 'Certificates available upon request' },
      { label: 'All required building permits' },
      { label: 'Underground services alert called prior to excavation' },
      { label: 'Commercial liability and auto insurance on all work' },
      { label: 'Employees covered by Workers Compensation Insurance' },
      { label: 'Taxes on all materials and equipment included in contract price' },
      { label: 'Lien releases available throughout construction' },
      { label: 'Submerge is licensed and bonded in accordance with State Contractors Board Regulations' },
    ]),
    createWarrantySectionFromEntries('Excavation', 'excavation', [
      {
        label: 'Pool layout prior to excavation',
        advantage: 'Pool is painted on ground for visual approval by homeowner',
      },
      {
        label: 'Pool hand contoured',
        advantage: 'Hand trimming assures uniform wall and floor thickness with proper cove radius',
      },
    ]),
    createWarrantySectionFromEntries(
      'Steel',
      'steel',
      isFiberglass
        ? [{ label: 'Fiberglass shell', detail: 'No steel required' }]
        : [
            {
              label: '4 bar bond beam with 1/2 inch steel; 3/8 inch rebar on 10 inch centers through pool',
              advantage:
                'Our bond beam and wall steel schedules are beyond code for protection against expansive soils',
            },
            {
              label: '10 inch on center in transition slope by 20 feet length',
              advantage: 'Strongest steel schedule in the industry!',
            },
            { label: '8" on center in the deep end and coves' },
          ]
    ),
    createWarrantySectionFromEntries('Plumbing', 'plumbing', buildPlumbingItems(proposal)),
    createWarrantySectionFromEntries('Electric', 'electric', [
      { label: 'Breakers at pad included', advantage: 'Protected outlet for homeowner convenience' },
      { label: '110 volt GFI protected light circuit with outlet' },
      { label: '220 volt pump circuit' },
      { label: 'Jandy IQ20 pump controller', advantage: 'Control your pump from your phone' },
      { label: 'Bonding as per N.E.C. Code' },
      { label: '(2) Low-voltage Submerge colored LED lights' },
    ]),
    createWarrantySectionFromEntries(
      'Shotcrete',
      'shotcrete',
      isFiberglass
        ? [{ label: 'No shotcrete required', detail: 'Fiberglass shell install' }]
        : [
            { label: '4,000 PSI pneumatically applied shotcrete', advantage: 'Lifetime structural warranty' },
            { label: 'All shotcrete is measured by a certified weighmaster' },
            { label: 'All nozzlemen are certified for State and Municipal work' },
            { label: 'Lifetime structural warranty' },
          ]
    ),
    createWarrantySectionFromEntries(
      'Tile & Masonry',
      'tile',
      isFiberglass
        ? [{ label: 'Fiberglass shell - no tile required' }]
        : [
            {
              label: 'All pool and spa waterline tile including the skimmer throat',
              advantage: 'Frost-proof tiles in a variety of patterns and colors',
            },
            {
              label: 'Trim tile available on steps and benches',
              advantage: 'By request at extra cost for safety and beauty',
            },
          ]
    ),
    createWarrantySectionFromEntries('Equipment', 'equipment', buildEquipmentItems(proposal)),
    createWarrantySectionFromEntries('Clean Up & Interior', 'cleanup', [
      { label: 'All trenches filled and yard rough graded' },
      { label: 'All construction debris hauled away' },
      ...(interiorFinishDetail ? [{ label: interiorFinishDetail, advantage: 'Combines durability and functionality' }] : []),
      { label: 'VGB compliant main drain covers' },
      { label: dirtHaulText },
      { label: 'Pool filled with water', advantage: 'Water trucks included' },
    ]),
    createWarrantySectionFromEntries('Start Up & Orientation', 'startup', [
      {
        label: 'Equipment turned on and started-up',
        advantage: 'Pool maintenance and equipment fully explained',
      },
      { label: 'Initial chemical balance', advantage: 'Program cycles set for ideal run times' },
      { label: '"Pool School" / Orientation', advantage: 'Report card allows you to provide feedback' },
    ]),
  ];

  return normalizeWarrantySections(sections).map((section) => applyBrandToSection(section, brandName));
};

export const resolveWarrantySections = (
  proposal?: Partial<Proposal>,
  brandName: string = 'Submerge'
): WarrantySection[] => {
  if (Array.isArray(proposal?.warrantySections)) {
    return mergeSelectedWaterFeaturesIntoPlumbingSection(
      normalizeWarrantySections(proposal.warrantySections),
      proposal
    ).map((section) => applyBrandToSection(section, brandName));
  }
  return buildGeneratedWarrantySections(proposal, brandName);
};
