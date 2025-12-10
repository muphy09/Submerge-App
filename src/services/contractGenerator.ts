import { Proposal, WaterFeatureSelection } from '../types/proposal-new';
import MasterPricingEngine from './masterPricingEngine';
import contractTemplate from '../../docs/Contracts/ppasContractFieldLayout.json';

export type ContractOverrides = Record<string, string | number | null>;

type TemplateField = {
  id: string;
  page: number;
  rect: [number, number, number, number];
  label: string;
  color: 'blue' | 'yellow';
};

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
};

type ProposalWithPricing = Proposal & {
  pricing?: Proposal['pricing'] & { retailPrice?: number };
};

const templateFields: TemplateField[] = contractTemplate as TemplateField[];

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

function formatDate(val: Date | string | number | null | undefined): string {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
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

function computeAutoValue(field: ContractFieldRender, proposal: ProposalWithPricing): string {
  const label = field.label.toLowerCase();
  const info = proposal.customerInfo || {};
  const specs = proposal.poolSpecs || ({} as Proposal['poolSpecs']);
  const pricing = getRetailPrice(proposal);
  const waterFeatures = pickWaterFeatures(proposal.waterFeatures?.selections);

  const overrideDefault = defaultFromLabel(field.label);

  if (/job site/.test(label) || /address/.test(label)) return info.address || '';
  if (/buyer/.test(label) && /name/.test(label)) return info.customerName || '';
  if (/city/.test(label) && !/surface/.test(label)) return info.city || '';
  if (/zip/.test(label)) return parseZipFromAddress(info.address) || '';
  if (/phone/.test(label)) return normalizePhone(info.phone);
  if (/email/.test(label)) return info.email || '';

  if (/cash price/.test(label) || /retail price/.test(label) || /\$0\.00.*cash/.test(label)) {
    return formatCurrency(pricing);
  }

  if (/non-refundable deposit/.test(label)) return formatCurrency(pricing ? pricing * 0.1 : 0);
  if (/prior to shotcete/.test(label) || /prior to excavation/.test(label)) return formatCurrency(pricing * 0.3);
  if (/prior to decking/.test(label)) return formatCurrency(pricing * 0.3);
  if (/prior to interior finish/.test(label)) return formatCurrency(pricing * 0.1);

  if (/construction to substanstially commence/.test(label)) {
    const created = new Date(proposal.createdDate || proposal.lastModified || Date.now());
    return formatDate(created);
  }
  if (/construction to be substanstially complete/.test(label)) {
    const base = new Date(proposal.createdDate || proposal.lastModified || Date.now());
    const estimate = new Date(base.getTime() + 120 * 24 * 60 * 60 * 1000);
    return formatDate(estimate);
  }

  if (/perimeter/.test(label) && /surface area/.test(label)) return String(specs.surfaceArea || '');
  if (/perimeter/.test(label)) return String(specs.perimeter || specs.fiberglassPerimeter || '');
  if (/surface area/.test(label)) return String(specs.surfaceArea || '');
  if (/pool size/.test(label) && field.id === 'p1_12') return String(specs.maxLength || '');
  if (/pool size/.test(label) && field.id === 'p1_13') return String(specs.maxWidth || '');
  if (/pool depth/.test(label) && field.id === 'p1_14') return String(specs.shallowDepth || '');
  if (/pool depth/.test(label) && field.id === 'p1_15') return String(specs.endDepth || '');
  if (/pool depth/.test(label) && field.id === 'p1_16') return specs.endDepth ? 'POOL DEPTH DOES NOT PERMIT DIVING' : '';

  if (/hoa approval/.test(label)) return 'YES';
  if (/financing required/.test(label)) return 'NO';

  if (/auxiliary pump i/.test(label)) return proposal.equipment?.auxiliaryPumps?.[0]?.name || overrideDefault || '';
  if (/auxiliary pump ii/.test(label)) return proposal.equipment?.auxiliaryPumps?.[1]?.name || overrideDefault || '';
  if (/sanitation i/.test(label)) return proposal.equipment?.saltSystem?.name || overrideDefault || '';
  if (/sanitation ii/.test(label)) return overrideDefault;
  if (/sanitation iii/.test(label)) return overrideDefault;
  if (/cleaner/.test(label)) return proposal.equipment?.cleaner?.name || overrideDefault || '';
  if (/heater/.test(label)) return proposal.equipment?.heater?.name || overrideDefault || '';
  if (/gas line/.test(label)) {
    const gasRun = proposal.plumbing?.runs?.gasRun;
    return gasRun ? `${gasRun} LF` : overrideDefault;
  }
  if (/line type/.test(label)) return overrideDefault;
  if (/waterline tile/.test(label)) return 'Included';
  if (/accent tile/.test(label)) return proposal.tileCopingDecking?.hasTrimTileOnSteps ? 'Yes' : 'None';
  if (/coping/.test(label)) {
    const lookup: Record<string, string> = {
      'travertine-level1': '3CM Travertine',
      'travertine-level2': 'Travertine (Level 2)',
      flagstone: 'Flagstone',
      paver: 'Paver',
      concrete: 'Concrete',
      cantilever: 'Cantilever',
    };
    return lookup[proposal.tileCopingDecking?.copingType as string] || overrideDefault;
  }
  if (/decking drainage/.test(label)) return proposal.drainage?.deckDrainTotalLF ? 'BY BUILDER' : overrideDefault;
  if (/decking\b/i.test(label)) return String(proposal.tileCopingDecking?.deckingArea || '');

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
    const finish = proposal.interiorFinish?.finishType || (specs.poolType === 'fiberglass' ? 'Fiberglass' : 'Interior Finish');
    const color = proposal.interiorFinish?.color;
    return color ? `${finish} - ${color}` : finish;
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
  overrides?: ContractOverrides
): Promise<ContractFieldRender[]> {
  const normalized = normalizeProposal(proposal);
  const fields: ContractFieldRender[] = templateFields
    .filter((field) => (field.label || '').trim().length > 0)
    .map((field) => {
      const [x0, y0, x1, y1] = field.rect;
      const width = x1 - x0;
      const height = y1 - y0;
      const autoValue = computeAutoValue(
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
        },
        normalized
      );
      const overrideVal = overrides && field.id in (overrides || {}) ? overrides[field.id] : undefined;
      const value = overrideVal !== undefined && overrideVal !== null ? String(overrideVal) : autoValue;
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
      };
    });

  return fields;
}

export function listUnmappedFields(fields: ContractFieldRender[]): string[] {
  return fields
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
