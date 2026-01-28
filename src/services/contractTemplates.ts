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

type ContractTemplate = {
  id: ContractTemplateId;
  label: string;
  pdfUrl: string;
  pdfPath: string;
  fields: TemplateField[];
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

const PAYMENT_SCHEDULE_FIELD_IDS = [
  'p1_pay_deposit',
  'p1_pay_excavation',
  'p1_pay_shotcete',
  'p1_pay_decking',
  'p1_pay_interior_finish',
];

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

const buildTemplate = (
  id: ContractTemplateId,
  label: string,
  url: URL,
  overrides: FieldOverride[] = []
): ContractTemplate => ({
  id,
  label,
  pdfUrl: url.href,
  pdfPath: url.pathname,
  fields: applyFieldOverrides(DEFAULT_FIELDS, overrides),
});

const CONTRACT_TEMPLATES: Record<ContractTemplateId, ContractTemplate> = {
  'nc-gunite': buildTemplate('nc-gunite', '2024 Contract NC Gunite', NC_GUNITE_URL, PAYMENT_SCHEDULE_OVERRIDES['nc-gunite']),
  'nc-fiberglass': buildTemplate(
    'nc-fiberglass',
    '2024 Contract NC Fiberglass',
    NC_FIBERGLASS_URL,
    PAYMENT_SCHEDULE_OVERRIDES['nc-fiberglass']
  ),
  'sc-gunite': buildTemplate('sc-gunite', '2024 Contract SC Gunite', SC_GUNITE_URL, PAYMENT_SCHEDULE_OVERRIDES['sc-gunite']),
  'sc-fiberglass': buildTemplate(
    'sc-fiberglass',
    '2024 Contract SC Fiberglass',
    SC_FIBERGLASS_URL,
    PAYMENT_SCHEDULE_OVERRIDES['sc-fiberglass']
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

export function listContractTemplates(): ContractTemplate[] {
  return Object.values(CONTRACT_TEMPLATES);
}
