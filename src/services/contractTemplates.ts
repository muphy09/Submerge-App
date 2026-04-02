import { Proposal } from '../types/proposal-new';
import contractFieldLayout from '../../docs/Contracts/ppasContractFieldLayout.json';

export type ContractTemplateId = 'nc-gunite' | 'nc-fiberglass' | 'sc-gunite' | 'sc-fiberglass';

export type TemplateField = {
  id: string;
  page: number;
  rect: [number, number, number, number];
  label: string;
  color: 'blue' | 'yellow';
};

export type ContractTextOverlay = {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  width?: number;
  align?: 'left' | 'center';
  fontStyle?: 'regular' | 'bold';
};

export type ContractStaticPatch = {
  page: number;
  rect: [number, number, number, number];
  fill?: 'white' | 'headerGray';
  texts?: ContractTextOverlay[];
};

type ContractTemplate = {
  id: ContractTemplateId;
  label: string;
  pdfUrl: string;
  pdfPath: string;
  fields: TemplateField[];
  staticPatches: ContractStaticPatch[];
};

const DEFAULT_FIELDS = contractFieldLayout as TemplateField[];
const DEFAULT_STATE = 'NC';
export const DEFAULT_CONTRACT_TEMPLATE_ID: ContractTemplateId = 'nc-gunite';

const NC_GUNITE_URL = new URL('../../docs/Contracts/PPAS Contract Template.pdf', import.meta.url);
const NC_FIBERGLASS_URL = new URL('../../docs/Contracts/2024 Contract NC Fiberglass.pdf', import.meta.url);
const SC_GUNITE_URL = new URL('../../docs/Contracts/2024 Contract SC Gunite.pdf', import.meta.url);
const SC_FIBERGLASS_URL = new URL('../../docs/Contracts/2024 Contract SC Fiberglass.pdf', import.meta.url);

type FieldOverride = {
  id: string;
  page: number;
  rect: [number, number, number, number];
};

type AdditionalFeaturesPatchConfig = {
  fontSize: number;
  headingLeftRect: [number, number, number, number];
  headingRightRect?: [number, number, number, number];
  headingTextY: number;
  rowRectX: number;
  rowRectWidth: number;
  rowRectHeight: number;
  rowTextX: number;
  rowTextYs: [number, number, number, number];
  qtyTextX: number;
};

const ADDITIONAL_FEATURE_ROW_LABELS = [
  '54. Bubblers',
  '55. Umbrella Sleeves',
  '56. Handrails',
  '57. Jump Rock',
] as const;

function buildAdditionalFeaturesStaticPatches(config: AdditionalFeaturesPatchConfig): ContractStaticPatch[] {
  const rowUnitLabels = ['QTY:', 'QTY:', 'QTY:', 'LNFT:'] as const;
  const headingLeftPatch: ContractStaticPatch = {
    page: 2,
    rect: config.headingLeftRect,
    fill: 'headerGray',
    texts: [
      {
        x: config.headingLeftRect[0],
        y: config.headingTextY,
        text: 'ADDITIONAL FEATURES',
        fontSize: config.fontSize,
        width: config.headingLeftRect[2],
        align: 'center',
        fontStyle: 'bold',
      },
    ],
  };
  const headingRightPatch: ContractStaticPatch | null = config.headingRightRect
    ? {
        page: 2,
        rect: config.headingRightRect,
        fill: 'headerGray',
      }
    : null;

  const rowPatches = config.rowTextYs.map((rowTextY, index) => ({
    page: 2,
    rect: [config.rowRectX, rowTextY - 1.15, config.rowRectWidth, config.rowRectHeight] as [number, number, number, number],
    fill: 'white' as const,
    texts: [
      {
        x: config.rowTextX,
        y: rowTextY,
        text: ADDITIONAL_FEATURE_ROW_LABELS[index],
        fontSize: config.fontSize,
      },
      {
        x: config.qtyTextX,
        y: rowTextY,
        text: rowUnitLabels[index],
        fontSize: config.fontSize,
      },
    ],
  }));

  return [...(headingRightPatch ? [headingLeftPatch, headingRightPatch] : [headingLeftPatch]), ...rowPatches];
}

const STATIC_TEMPLATE_PATCHES: Record<ContractTemplateId, ContractStaticPatch[]> = {
  'nc-gunite': buildAdditionalFeaturesStaticPatches({
    fontSize: 6.96,
    headingLeftRect: [51.84000015258789, 465.42999267578125, 228.5299949645996, 9.480010986328125],
    headingRightRect: [290.2099914550781, 465.42999267578125, 269.2300109863281, 9.480010986328125],
    headingTextY: 467.47,
    rowRectX: 51,
    rowRectWidth: 220.5,
    rowRectHeight: 9.1,
    rowTextX: 53.28,
    rowTextYs: [458.11, 448.75, 439.39, 430.03],
    qtyTextX: 239.81,
  }),
  'sc-gunite': buildAdditionalFeaturesStaticPatches({
    fontSize: 6.96,
    headingLeftRect: [51.84000015258789, 465.42999267578125, 228.5299949645996, 9.480010986328125],
    headingRightRect: [290.2099914550781, 465.42999267578125, 269.2300109863281, 9.480010986328125],
    headingTextY: 467.47,
    rowRectX: 51,
    rowRectWidth: 220.5,
    rowRectHeight: 9.1,
    rowTextX: 53.28,
    rowTextYs: [458.11, 448.75, 439.39, 430.03],
    qtyTextX: 239.81,
  }),
  'nc-fiberglass': buildAdditionalFeaturesStaticPatches({
    fontSize: 7.44,
    headingLeftRect: [37.20000076293945, 448.0299987792969, 241.7299919128418, 10.079986572265625],
    headingRightRect: [289.25, 448.0299987792969, 284.71002197265625, 10.079986572265625],
    headingTextY: 450.19,
    rowRectX: 36.5,
    rowRectWidth: 233,
    rowRectHeight: 9.8,
    rowTextX: 38.76,
    rowTextYs: [440.23, 430.27, 420.31, 410.35],
    qtyTextX: 235.97,
  }),
  'sc-fiberglass': buildAdditionalFeaturesStaticPatches({
    fontSize: 7.56,
    headingLeftRect: [34.20000076293945, 462.54998779296875, 244.2500114440918, 10.20001220703125],
    headingRightRect: [289.010009765625, 462.54998779296875, 287.95001220703125, 10.20001220703125],
    headingTextY: 464.83,
    rowRectX: 34,
    rowRectWidth: 235,
    rowRectHeight: 10,
    rowTextX: 35.76,
    rowTextYs: [454.75, 444.67, 434.59, 424.51],
    qtyTextX: 234.77,
  }),
};

const INLINE_CONTRACT_FIELDS: TemplateField[] = [
  {
    id: 'p1_37_size',
    page: 1,
    rect: [338.5, 597.3400268554688, 373.5, 606.8200073242188],
    label: '37. Coping Size',
    color: 'blue',
  },
  {
    id: 'p1_38_qty',
    page: 1,
    rect: [338.5, 606.7000122070312, 373.5, 616.1799926757812],
    label: '38. Decking SF',
    color: 'blue',
  },
  {
    id: 'p1_40_qty',
    page: 1,
    rect: [389.5, 625.4199829101562, 424.5, 634.9000244140625],
    label: '40. Downspout Drainage Approx SF',
    color: 'blue',
  },
];

const PAYMENT_SCHEDULE_FIELD_IDS = [
  'p1_pay_deposit',
  'p1_pay_excavation',
  'p1_pay_shotcete',
  'p1_pay_decking',
  'p1_pay_interior_finish',
];
const PAYMENT_SCHEDULE_FIELD_ID_SET = new Set(PAYMENT_SCHEDULE_FIELD_IDS);
const PAYMENT_SCHEDULE_MIN_WIDTH = 32;

const PAYMENT_SCHEDULE_OVERRIDES: Record<ContractTemplateId, FieldOverride[]> = {
  'nc-gunite': [],
  'sc-gunite': [],
  'nc-fiberglass': [
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[0],
      page: 1,
      rect: [221.69, 350.391203613281, 240.09656, 358.631610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[1],
      page: 1,
      rect: [221.69, 360.351203613281, 240.09656, 368.591610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[2],
      page: 1,
      rect: [221.69, 370.311203613281, 240.09656, 378.551610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[3],
      page: 1,
      rect: [221.69, 380.271203613281, 240.09656, 388.511610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[4],
      page: 1,
      rect: [221.69, 390.231203613281, 240.09656, 398.471610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[0],
      page: 5,
      rect: [316.73, 169.281203613281, 335.13656, 177.521610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[1],
      page: 5,
      rect: [316.73, 178.401203613281, 335.13656, 186.641610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[2],
      page: 5,
      rect: [316.73, 187.521203613281, 335.13656, 195.761610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[3],
      page: 5,
      rect: [316.73, 196.641203613281, 335.13656, 204.881610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[4],
      page: 5,
      rect: [316.73, 205.761203613281, 335.13656, 214.001610107422],
    },
  ],
  'sc-fiberglass': [
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[0],
      page: 1,
      rect: [220.37, 336.351203613281, 239.33048, 344.711610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[1],
      page: 1,
      rect: [220.37, 346.431203613281, 239.33048, 354.791610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[2],
      page: 1,
      rect: [220.37, 356.511203613281, 239.33048, 364.871610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[3],
      page: 1,
      rect: [220.37, 366.591203613281, 239.33048, 374.951610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[4],
      page: 1,
      rect: [220.37, 376.671203613281, 239.33048, 385.031610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[0],
      page: 5,
      rect: [316.49, 152.961203613281, 335.45048, 161.321610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[1],
      page: 5,
      rect: [316.49, 162.201203613281, 335.45048, 170.561610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[2],
      page: 5,
      rect: [316.49, 171.441203613281, 335.45048, 179.801610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[3],
      page: 5,
      rect: [316.49, 180.681203613281, 335.45048, 189.041610107422],
    },
    {
      id: PAYMENT_SCHEDULE_FIELD_IDS[4],
      page: 5,
      rect: [316.49, 189.921203613281, 335.45048, 198.281610107422],
    },
  ],
};

const applyFieldOverrides = (fields: TemplateField[], overrides: FieldOverride[]): TemplateField[] => {
  if (!overrides.length) return fields;
  const overrideMap = new Map(overrides.map((override) => [`${override.id}-${override.page}`, override.rect]));
  return fields.map((field) => {
    const rect = overrideMap.get(`${field.id}-${field.page}`);
    if (!rect) return field;
    return { ...field, rect };
  });
};

const widenPaymentScheduleFields = (fields: TemplateField[]): TemplateField[] =>
  fields.map((field) => {
    if (!PAYMENT_SCHEDULE_FIELD_ID_SET.has(field.id)) return field;
    const [x0, y0, x1, y1] = field.rect;
    if (x1 - x0 >= PAYMENT_SCHEDULE_MIN_WIDTH) return field;
    return {
      ...field,
      rect: [x1 - PAYMENT_SCHEDULE_MIN_WIDTH, y0, x1, y1],
    };
  });

const applyInlineFieldAdjustments = (fields: TemplateField[]): TemplateField[] => {
  return [...fields, ...INLINE_CONTRACT_FIELDS];
};

const buildTemplate = (
  id: ContractTemplateId,
  label: string,
  url: URL,
  overrides: FieldOverride[] = [],
  staticPatches: ContractStaticPatch[] = []
): ContractTemplate => ({
  id,
  label,
  pdfUrl: url.href,
  pdfPath: url.pathname,
  fields: applyInlineFieldAdjustments(widenPaymentScheduleFields(applyFieldOverrides(DEFAULT_FIELDS, overrides))),
  staticPatches,
});

const CONTRACT_TEMPLATES: Record<ContractTemplateId, ContractTemplate> = {
  'nc-gunite': buildTemplate(
    'nc-gunite',
    '2024 Contract NC Shotcrete',
    NC_GUNITE_URL,
    PAYMENT_SCHEDULE_OVERRIDES['nc-gunite'],
    STATIC_TEMPLATE_PATCHES['nc-gunite']
  ),
  'nc-fiberglass': buildTemplate(
    'nc-fiberglass',
    '2024 Contract NC Fiberglass',
    NC_FIBERGLASS_URL,
    PAYMENT_SCHEDULE_OVERRIDES['nc-fiberglass'],
    STATIC_TEMPLATE_PATCHES['nc-fiberglass']
  ),
  'sc-gunite': buildTemplate(
    'sc-gunite',
    '2024 Contract SC Shotcrete',
    SC_GUNITE_URL,
    PAYMENT_SCHEDULE_OVERRIDES['sc-gunite'],
    STATIC_TEMPLATE_PATCHES['sc-gunite']
  ),
  'sc-fiberglass': buildTemplate(
    'sc-fiberglass',
    '2024 Contract SC Fiberglass',
    SC_FIBERGLASS_URL,
    PAYMENT_SCHEDULE_OVERRIDES['sc-fiberglass'],
    STATIC_TEMPLATE_PATCHES['sc-fiberglass']
  ),
};

export function getContractTemplate(id?: ContractTemplateId): ContractTemplate {
  return CONTRACT_TEMPLATES[id || DEFAULT_CONTRACT_TEMPLATE_ID];
}

export function getContractTemplateIdForProposal(proposal: Proposal): ContractTemplateId {
  const rawState = proposal.customerInfo?.state || DEFAULT_STATE;
  const state = rawState.toUpperCase();
  const poolType = proposal.poolSpecs?.poolType === 'fiberglass' ? 'fiberglass' : 'gunite';

  if (state === 'SC') {
    return poolType === 'fiberglass' ? 'sc-fiberglass' : 'sc-gunite';
  }

  return poolType === 'fiberglass' ? 'nc-fiberglass' : 'nc-gunite';
}
