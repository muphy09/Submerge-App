import { Proposal, WaterFeatureSelection } from '../types/proposal-new';
import MasterPricingEngine from './masterPricingEngine';
import pricingData from './pricingData';
import { flattenWaterFeatures } from '../utils/waterFeatureCost';
import { ContractTemplateId, getContractTemplate, getContractTemplateIdForProposal } from './contractTemplates';

export type ContractOverrides = Record<string, string | number | null>;

export type ContractFieldRender = {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: 'blue' | 'yellow';
  value: string;
  autoValue: string;
  isAutoFilled: boolean;
  isOverridden: boolean;
};

type ProposalWithPricing = Proposal & {
  pricing?: Proposal['pricing'] & { retailPrice?: number };
};

const ADDITIONAL_SPEC_FIELD_IDS = new Set([
  'p2_additional_spec_73',
  'p2_additional_spec_74',
  'p2_additional_spec_75',
  'p2_additional_spec_76',
  'p2_additional_spec_77',
  'p2_additional_spec_78',
  'p2_additional_spec_79',
  'p2_additional_spec_80',
  'p2_additional_spec_81',
  'p2_additional_spec_82',
]);
const OPTIONAL_UNMAPPED_FIELD_IDS = new Set([
  'p1_16',
  'p1_rbb_6',
  'p1_rbb_12',
  'p1_rbb_18',
  'p1_rbb_24',
  'p1_rbb_30',
  'p1_rbb_36',
  'p1_rbb_42',
  'p1_rbb_48',
  ...ADDITIONAL_SPEC_FIELD_IDS,
]);
const PLUMBING_RESPONSIBILITY_FIELD_IDS = new Set([
  'p1_39',
  'p1_40',
  'p1_15_resp',
  'p1_16_resp',
  'p1_17_resp',
  'p1_18_resp',
  'p1_19_resp',
  'p2_51',
  'p2_55',
  'p2_57',
]);
const SANITATION_NONE_FIELD_IDS = new Set(['p1_24', 'p1_25']);
const WATER_FEATURE_CATALOG = flattenWaterFeatures(pricingData.waterFeatures);
const WATER_FEATURE_NAME_BY_ID = new Map(WATER_FEATURE_CATALOG.map((item) => [item.id, item.name]));

function normalizeProposal(pr: Proposal): ProposalWithPricing {
  try {
    const calc = MasterPricingEngine.calculateCompleteProposal(pr, pr.papDiscounts);
    return {
      ...pr,
      pricing: calc?.pricing || pr.pricing,
      costBreakdown: calc?.costBreakdown || pr.costBreakdown,
    };
  } catch (error) {
    console.warn('Failed to recalc proposal for contract view; using stored pricing.', error);
    return pr;
  }
}

function normalizePhone(value: any): string {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function formatYesNo(value: any, defaultValue = 'NO'): string {
  if (value === undefined || value === null) return defaultValue;
  const truthy = typeof value === 'string' ? value.trim().length > 0 && value.toLowerCase() !== 'none' : Boolean(value);
  return truthy ? 'YES' : defaultValue;
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '$0.00';
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatNumberValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '';
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
}

function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0';
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '0';
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
}

function formatFacingValue(value?: string | null): string {
  if (!value || value === 'none') return 'None';
  if (value === 'panel-ledge') return 'Panel Ledge';
  if (value === 'stacked-stone') return 'Stacked Stone';
  if (value === 'tile') return 'Tile';
  if (value === 'ledgestone') return 'Ledgestone';
  return String(value);
}

function formatRaisedSpaFacing(value?: string | null): string {
  if (!value || value === 'none') return 'NONE';
  if (value === 'tile') return 'Tile';
  if (value === 'ledgestone') return 'Ledgestone';
  if (value === 'stacked-stone') return 'Stacked Stone';
  return String(value);
}

function stripParenSuffix(value: string): string {
  const idx = value.indexOf('(');
  return (idx >= 0 ? value.slice(0, idx) : value).trim();
}

function getWaterFeatureName(featureId?: string): string {
  if (!featureId) return '';
  return WATER_FEATURE_NAME_BY_ID.get(featureId) || featureId;
}

function getInteriorFinishLabel(finishType?: string): string {
  if (!finishType) return '';
  const finish = pricingData.interiorFinish?.finishes?.find((item) => item.id === finishType);
  if (finish?.name) return finish.name;
  const byName = pricingData.interiorFinish?.finishes?.find((item) => item.name === finishType);
  return byName?.name || finishType;
}

function groupLightSelections(lights?: Array<{ name?: string }>) {
  const groups: { name: string; count: number }[] = [];
  (lights || []).forEach((light) => {
    const name = (light?.name || '').trim();
    if (!name) return;
    const existing = groups.find((group) => group.name === name);
    if (existing) {
      existing.count += 1;
    } else {
      groups.push({ name, count: 1 });
    }
  });
  return groups;
}

function parseZipFromAddress(address?: string | null): string {
  if (!address) return '';
  const zip = address.match(/\b\d{5}(?:-\d{4})?\b/);
  return zip ? zip[0] : '';
}

function pickWaterFeatures(selections: WaterFeatureSelection[] | undefined) {
  const base = selections || [];
  const byType = {
    sheer: [] as WaterFeatureSelection[],
    deckJet: [] as WaterFeatureSelection[],
    laminar: [] as WaterFeatureSelection[],
    bowl: [] as WaterFeatureSelection[],
    sconce: [] as WaterFeatureSelection[],
    other: [] as WaterFeatureSelection[],
  };

  base.forEach((sel) => {
    const id = sel.featureId || '';
    if (id.includes('sheer')) {
      byType.sheer.push(sel);
    } else if (id.includes('deck-jet')) {
      byType.deckJet.push(sel);
    } else if (id.includes('laminar')) {
      byType.laminar.push(sel);
    } else if (id.includes('wok') || id.includes('bowl')) {
      byType.bowl.push(sel);
    } else if (id.includes('sconce') || id.includes('scupper')) {
      byType.sconce.push(sel);
    } else {
      byType.other.push(sel);
    }
  });

  return byType;
}

function defaultFromLabel(label: string): string {
  if (/by builder/i.test(label)) return 'BY BUILDER';
  if (/by buyer/i.test(label)) return 'BY BUYER';
  if (/none/i.test(label)) return 'None';
  const qty = label.match(/qty:\s*([\d.-]+)/i);
  if (qty) return qty[1];
  if (/\$0\.00/.test(label)) return '$0.00';
  const num = label.match(/\b\d+\b/);
  if (num) return num[0];
  return '';
}

function getRetailPrice(proposal: ProposalWithPricing): number {
  return (
    proposal.pricing?.retailPrice ??
    proposal.pricing?.baseRetailPrice ??
    proposal.totalCost ??
    proposal.subtotal ??
    0
  );
}

function isMeaningfulAutoValue(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return false;
  return normalized !== 'none';
}

function computeAutoValue(field: ContractFieldRender, proposal: ProposalWithPricing): string {
  if (SANITATION_NONE_FIELD_IDS.has(field.id)) return 'None';

  const label = field.label.toLowerCase();
  const info = proposal.customerInfo || {};
  const specs = proposal.poolSpecs || ({} as Proposal['poolSpecs']);
  const pricing = getRetailPrice(proposal);
  const waterFeatures = pickWaterFeatures(proposal.waterFeatures?.selections);

  if (ADDITIONAL_SPEC_FIELD_IDS.has(field.id)) return '';

  const overrideDefault = defaultFromLabel(field.label);
  const isPlumbingResponsibilityField = PLUMBING_RESPONSIBILITY_FIELD_IDS.has(field.id);

  if (isPlumbingResponsibilityField) {
    if (field.id === 'p1_40') return 'BY BUYER';
    if (field.id === 'p2_51') return 'BY BUILDER';
    if (field.id === 'p2_55') return 'BY BUILDER';
    if (field.id === 'p2_57') return 'BY BUYER';
    if (label.includes('auto-fill')) {
      const hasAutoFillRun = Boolean(proposal.plumbing?.runs?.autoFillRun);
      return hasAutoFillRun ? 'BY BUILDER' : overrideDefault || 'BY BUYER';
    }
    return overrideDefault || 'BY BUILDER';
  }

  if (field.id === 'p2_68') return 'NO';

  if (field.id === 'p1_33') {
    const facing = proposal.excavation?.rbbLevels?.[0]?.facing;
    return formatFacingValue(facing);
  }

  if (field.id === 'p1_35') {
    const facing = proposal.excavation?.rbbLevels?.[1]?.facing;
    return formatFacingValue(facing);
  }

  const raisedBeamMatch = field.id.match(/^p1_rbb_(\d+)/);
  if (raisedBeamMatch) {
    const height = Number(raisedBeamMatch[1]);
    const levels = proposal.excavation?.rbbLevels || [];
    const total = levels
      .filter((level) => level.height === height)
      .reduce((sum, level) => sum + (Number(level.length) || 0), 0);
    return formatNumberValue(total);
  }

  if (
    field.id === 'p2_70' ||
    field.id === 'p2_71' ||
    field.id === 'p2_72' ||
    field.id === 'p2_73' ||
    field.id === 'p2_74' ||
    field.id === 'p2_75' ||
    field.id === 'p2_76' ||
    field.id === 'p2_77' ||
    field.id === 'p2_78' ||
    field.id === 'p2_79' ||
    field.id === 'p2_80' ||
    field.id === 'p2_81'
  ) {
    const sheerSelections = waterFeatures.sheer;
    const deckJetSelections = waterFeatures.deckJet;
    const laminarSelections = waterFeatures.laminar;
    const bowlSelections = waterFeatures.bowl;
    const sconceSelections = waterFeatures.sconce;
    const sheerOne = sheerSelections[0];
    const sheerTwo = sheerSelections[1];
    const deckJetQty = deckJetSelections.reduce((sum, sel) => sum + (Number(sel.quantity) || 0), 0);
    const laminarQty = laminarSelections.reduce((sum, sel) => sum + (Number(sel.quantity) || 0), 0);
    const bowlQty = bowlSelections.reduce((sum, sel) => sum + (Number(sel.quantity) || 0), 0);
    const sconceQty = sconceSelections.reduce((sum, sel) => sum + (Number(sel.quantity) || 0), 0);

    switch (field.id) {
      case 'p2_70':
        return sheerOne ? getWaterFeatureName(sheerOne.featureId) : 'NONE';
      case 'p2_71':
        return formatCount(sheerOne?.quantity);
      case 'p2_72':
        return sheerTwo ? getWaterFeatureName(sheerTwo.featureId) : 'NONE';
      case 'p2_73':
        return formatCount(sheerTwo?.quantity);
      case 'p2_74':
        return bowlQty > 0 ? 'CONCRETE' : 'NONE';
      case 'p2_75':
        return formatCount(bowlQty);
      case 'p2_76':
        return deckJetQty > 0 ? 'STANDARD' : 'NONE';
      case 'p2_77':
        return formatCount(deckJetQty);
      case 'p2_78':
        return laminarQty > 0 ? getWaterFeatureName(laminarSelections[0]?.featureId) : 'NONE';
      case 'p2_79':
        return formatCount(laminarQty);
      case 'p2_80':
        return sconceQty > 0 ? 'STANDARD' : 'NONE';
      case 'p2_81':
        return formatCount(sconceQty);
      default:
        return '';
    }
  }

  if (['p2_82', 'p2_84', 'p2_86', 'p2_88'].includes(field.id)) {
    return 'None';
  }

  if (['p2_83', 'p2_85', 'p2_87', 'p2_89'].includes(field.id)) {
    return '0';
  }

  if (field.id === 'p2_91') return 'BY BUILDER';
  if (field.id === 'p2_92') return 'BY BUYER';
  if (field.id === 'p2_93') return 'BY BUILDER';
  if (field.id === 'p2_94') return 'YES';
  if (field.id === 'p2_95') return 'INCLUDED';

  if (field.id === 'p2_53' || field.id === 'p2_54') {
    const spaLights = proposal.equipment?.spaLights || [];
    const spaLightCount = spaLights.length;
    if (field.id === 'p2_53') return spaLightCount > 0 ? 'Standard' : 'NONE';
    return formatCount(spaLightCount);
  }

  if (field.id === 'p2_56') return 'NONE';
  if (field.id === 'p2_58') return 'NO';
  if (field.id === 'p2_62') return 'NO';
  if (field.id === 'p2_65') return 'NO';
  if (field.id === 'p2_67') return proposal.poolSpecs?.isRaisedSpa ? 'YES' : 'NO';
  if (field.id === 'p2_69') return formatRaisedSpaFacing(proposal.poolSpecs?.raisedSpaFacing);

  if (field.id === 'p2_60' || field.id === 'p2_61' || field.id === 'p2_63' || field.id === 'p2_64') {
    const groups = groupLightSelections(proposal.equipment?.poolLights || []);
    const primary = groups[0];
    const secondary = groups[1];
    if (field.id === 'p2_60') return primary?.name || 'None';
    if (field.id === 'p2_61') return primary ? String(primary.count) : '0';
    if (field.id === 'p2_63') return secondary?.name || 'None';
    if (field.id === 'p2_64') return secondary ? String(secondary.count) : '0';
  }

  if (field.id === 'p2_66') {
    const automationName = proposal.equipment?.automation?.name || '';
    const automationQty = Number(proposal.equipment?.automationQuantity || 0);
    if (!automationName || automationName.toLowerCase().includes('no automation') || automationQty <= 0) {
      return 'None';
    }
    return stripParenSuffix(automationName) || 'None';
  }

  if (/job site/.test(label) || /address/.test(label)) return info.address || '';
  if (/customer/.test(label) && /name/.test(label)) return info.customerName || '';
  if (/buyer/.test(label) && /name/.test(label)) return info.customerName || '';
  if (/city/.test(label) && !/surface/.test(label)) return info.city || '';
  if (/zip/.test(label)) return parseZipFromAddress(info.address) || '';
  if (/phone/.test(label)) return normalizePhone(info.phone);
  if (/email/.test(label)) return info.email || '';

  if (/cash price/.test(label) || /retail price/.test(label) || /\$0\.00.*cash/.test(label)) {
    return formatCurrency(pricing);
  }

  // Payment schedule amounts are designer-entered; leave empty.
  if (field.id.startsWith('p1_pay_')) return '';
  if (/non-refundable deposit/.test(label)) return '';
  if (/prior to shotcete/.test(label) || /prior to excavation/.test(label)) return '';
  if (/prior to decking/.test(label)) return '';
  if (/prior to interior finish/.test(label)) return '';

  if (/construction to substanstially commence/.test(label)) return '';
  if (/construction to be substanstially complete/.test(label)) return '';

  if (['p1_17', 'p1_18', 'p1_19', 'p1_20'].includes(field.id)) return '';

  if (/perimeter/.test(label) && /surface area/.test(label)) return String(specs.surfaceArea || '');
  if (/perimeter/.test(label)) return String(specs.perimeter || specs.fiberglassPerimeter || '');
  if (/surface area/.test(label)) return String(specs.surfaceArea || '');
  if (/pool size/.test(label) && field.id === 'p1_12') return String(specs.maxLength || '');
  if (/pool size/.test(label) && field.id === 'p1_13') return String(specs.maxWidth || '');
  if (/pool depth/.test(label) && field.id === 'p1_14') return String(specs.shallowDepth || '');
  if (/pool depth/.test(label) && field.id === 'p1_15') return String(specs.endDepth || '');
  if (/pool depth/.test(label) && field.id === 'p1_16') return '';

  if (/hoa approval/.test(label)) return 'YES';
  if (/financing required/.test(label)) return 'NO';

  if (/auxiliary pump i/.test(label)) {
    const auxPumps = proposal.equipment?.auxiliaryPumps?.filter(Boolean) || [];
    const legacyAux = !auxPumps.length && proposal.equipment?.auxiliaryPump ? [proposal.equipment.auxiliaryPump] : [];
    const pumps = [...auxPumps, ...legacyAux];
    return pumps[0]?.name || 'None';
  }
  if (/auxiliary pump ii/.test(label)) {
    const auxPumps = proposal.equipment?.auxiliaryPumps?.filter(Boolean) || [];
    const legacyAux = !auxPumps.length && proposal.equipment?.auxiliaryPump ? [proposal.equipment.auxiliaryPump] : [];
    const pumps = [...auxPumps, ...legacyAux];
    return pumps[1]?.name || 'None';
  }
  if (/sanitation i/.test(label)) return proposal.equipment?.saltSystem?.name || 'None';
  if (/sanitation ii/.test(label)) return 'None';
  if (/sanitation iii/.test(label)) return 'None';
  if (/cleaner/.test(label)) {
    const cleanerQty = proposal.equipment?.cleanerQuantity ?? 0;
    return cleanerQty > 0 ? proposal.equipment?.cleaner?.name || '' : 'None';
  }
  if (/heater/.test(label)) {
    const heaterQty = proposal.equipment?.heaterQuantity ?? 0;
    return heaterQty > 0 ? proposal.equipment?.heater?.name || '' : 'None';
  }
  if (/gas line/.test(label)) {
    return 'None';
  }
  if (/line type/.test(label)) return 'None';
  if (/waterline tile/.test(label)) return (proposal.tileCopingDecking?.tileLevel ?? 1) > 0 ? 'Included' : 'None';
  if (/accent tile/.test(label)) {
    const hasTile = (proposal.tileCopingDecking?.tileLevel ?? 1) > 0;
    return hasTile && proposal.tileCopingDecking?.hasTrimTileOnSteps ? 'Trim Tile' : 'None';
  }
  if (/coping/.test(label)) {
    const lookup: Record<string, string> = {
      none: 'None',
      'travertine-level1': 'Travertine Lvl 1',
      'travertine-level2': 'Travertine Lvl 2',
      cantilever: 'Cantilever',
      flagstone: 'Flagstone',
      paver: 'Paver',
      concrete: 'Concrete',
    };
    return lookup[proposal.tileCopingDecking?.copingType as string] || '';
  }
  if (/decking drainage/.test(label)) return proposal.drainage?.deckDrainTotalLF ? 'BY BUILDER' : overrideDefault;
  if (/decking\b/i.test(label)) {
    const lookup: Record<string, string> = {
      none: 'None',
      'travertine-level1': 'Travertine Lvl 1',
      'travertine-level2': 'Travertine Lvl 2',
      paver: 'Paver',
      concrete: 'Concrete',
    };
    return lookup[proposal.tileCopingDecking?.deckingType as string] || '';
  }

  if (/skimmer/.test(label)) {
    const additional = proposal.plumbing?.runs?.additionalSkimmers || 0;
    return String(1 + (Number.isFinite(additional) ? additional : 0));
  }
  if (/surface returns/.test(label)) {
    const returns = proposal.plumbing?.runs?.mainDrainRun;
    return returns ? String(returns) : overrideDefault;
  }
  if (/auto-fill/.test(label)) return formatYesNo(proposal.plumbing?.runs?.autoFillRun, overrideDefault || 'NO');
  if (/circulation pump/.test(label)) return proposal.equipment?.pump?.name || proposal.equipment?.primaryPump?.name || overrideDefault;
  if (/filter/.test(label) && !/interior/.test(label)) return proposal.equipment?.filter?.name || overrideDefault;
  if (/spa perimeter/.test(label)) return proposal.poolSpecs?.spaPerimeter ? String(proposal.poolSpecs.spaPerimeter) : '';
  if (/spa light/.test(label)) return proposal.poolSpecs?.spaType !== 'none' ? '1' : '0';
  if (/blower/.test(label)) return proposal.poolSpecs?.spaType !== 'none' ? 'YES' : 'NO';
  if (/interior finish/.test(label)) {
    const finishType = proposal.interiorFinish?.finishType;
    const finishLabel = finishType
      ? getInteriorFinishLabel(finishType)
      : specs.poolType === 'fiberglass'
      ? 'Fiberglass'
      : 'Interior Finish';
    const color = proposal.interiorFinish?.color;
    return color ? `${finishLabel}: ${color}` : finishLabel;
  }
  if (/laminar|sheer|jets|water features/.test(label)) {
    const typeMap: Record<string, WaterFeatureSelection[]> = {
      sheer: waterFeatures.sheer,
      jets: waterFeatures.deckJet,
      laminar: waterFeatures.laminar,
      bowl: waterFeatures.bowl,
      sconce: waterFeatures.sconce,
      other: waterFeatures.other,
    };
    const entry = Object.entries(typeMap).find(([key]) => label.includes(key));
    if (entry) {
      const list = entry[1];
      return list?.[0]?.quantity ? String(list[0].quantity) : overrideDefault;
    }
  }

  if (overrideDefault) return overrideDefault;
  return '';
}

export async function getEditableContractFields(
  proposal: Proposal,
  overrides?: ContractOverrides,
  templateId?: ContractTemplateId
): Promise<ContractFieldRender[]> {
  const normalized = normalizeProposal(proposal);
  const resolvedTemplateId = templateId || getContractTemplateIdForProposal(proposal);
  const templateFields = getContractTemplate(resolvedTemplateId).fields;
  const fields: ContractFieldRender[] = templateFields
    .filter((field) => (field.label || '').trim().length > 0)
    .map((field) => {
      const [x0, y0, x1, y1] = field.rect;
      const width = x1 - x0;
      const height = y1 - y0;
      let autoValue = computeAutoValue(
        {
          id: field.id,
          page: field.page,
          x: x0,
          y: y0,
          width,
          height,
          label: field.label,
          color: field.color,
          value: '',
          autoValue: '',
          isAutoFilled: false,
          isOverridden: false,
        },
        normalized
      );
      if (field.id === 'p1_30') autoValue = '1';
      const hasOverride = overrides ? Object.prototype.hasOwnProperty.call(overrides, field.id) : false;
      const overrideVal = hasOverride ? overrides?.[field.id] : undefined;
      const value = hasOverride && overrideVal !== null && overrideVal !== undefined ? String(overrideVal) : autoValue;
      const shouldAutoFill = field.id === 'p1_30' ? false : !hasOverride && isMeaningfulAutoValue(autoValue);
      return {
        id: field.id,
        page: field.page,
        x: x0,
        y: y0,
        width,
        height,
        label: field.label,
        color: field.color,
        value: value || '',
        autoValue,
        isAutoFilled: shouldAutoFill,
        isOverridden: hasOverride,
      };
    });

  return fields;
}

export function listUnmappedFields(fields: ContractFieldRender[]): string[] {
  return fields
    .filter((f) => !OPTIONAL_UNMAPPED_FIELD_IDS.has(f.id))
    .filter((f) => !f.value && f.color === 'blue' && (f.label || '').trim())
    .map((f) => f.label || f.id);
}

export function validateContractInputs(proposal: Proposal): string[] {
  const warnings: string[] = [];
  const info = proposal.customerInfo || {};
  const specs = proposal.poolSpecs || ({} as Proposal['poolSpecs']);
  const pricing = proposal.pricing || {};

  if (!info.customerName?.trim()) warnings.push('Customer name');
  if (!info.address?.trim()) warnings.push('Job site address');
  if (!info.city?.trim()) warnings.push('City');
  if (!specs.perimeter) warnings.push('Pool perimeter');
  if (!specs.surfaceArea) warnings.push('Surface area');
  if (!specs.maxLength) warnings.push('Pool length');
  if (!specs.maxWidth) warnings.push('Pool width');
  if (!specs.shallowDepth) warnings.push('Shallow depth');
  if (!specs.endDepth) warnings.push('Deep depth');
  if (!(pricing.retailPrice || pricing.baseRetailPrice)) warnings.push('Retail price');

  return warnings;
}
