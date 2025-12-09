import * as XLSX from 'xlsx';
import { Proposal, WaterFeatureSelection } from '../types/proposal-new';
import pricingData from './pricingData';
import MasterPricingEngine from './masterPricingEngine';
import contractFieldMap from '../../docs/Contracts/contractFieldMap.json';

type ContractField = {
  cell: string;
  label: string;
  proposalPath?: string | null;
  formatter?: string;
  fallback?: any;
  notes?: string;
};

type ContractMapping = {
  sheet: string;
  columns: string;
  fields: ContractField[];
};

export type ContractOverrides = Record<string, string | number | null>;

export type ContractCellRender = {
  address: string;
  row: number;
  col: number;
  value: string | number | null;
  editable: boolean;
  style: {
    background?: string;
    bold?: boolean;
    italic?: boolean;
    fontSize?: number;
    align?: string;
    verticalAlign?: string;
    wrap?: boolean;
    border?: {
      top?: { style?: string; color?: string };
      right?: { style?: string; color?: string };
      bottom?: { style?: string; color?: string };
      left?: { style?: string; color?: string };
    };
  };
  colSpan?: number;
  rowSpan?: number;
};

export type ContractSheetRender = {
  name: string;
  rows: ContractCellRender[][];
  merges: XLSX.Range[];
  colWidths: number[];
  rowHeights: number[];
};

type ProposalWithPricing = Proposal & {
  pricing?: Proposal['pricing'] & { retailPrice?: number };
};

const TEMPLATE_URL = new URL('../../docs/Contracts/CONTRACT.xlsx', import.meta.url).href;
const BLUE_THEME = 4;
const BLUE_TINT = 0.7999816888943144;

const mapping = contractFieldMap as ContractMapping;

const columnLimit = (() => {
  const [start, end] = mapping.columns.split('-');
  return { start, end };
})();

function isWithinColumns(addr: string): boolean {
  const col = addr.replace(/[^A-Z]/g, '');
  return col >= columnLimit.start && col <= columnLimit.end;
}

function getCellAddress(row: number, col: number): string {
  const letters = XLSX.utils.encode_col(col);
  return `${letters}${row + 1}`;
}

function deepGet(obj: any, pathStr?: string | null): any {
  if (!pathStr) return undefined;
  const parts = pathStr
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  return parts.reduce((acc, key) => (acc && key in acc ? acc[key as keyof typeof acc] : undefined), obj);
}

function toHexColor(color: any): string | undefined {
  if (!color) return undefined;
  if (color.rgb) {
    const rgb = color.rgb.replace(/^FF/, '');
    return `#${rgb}`;
  }
  if (color.theme === BLUE_THEME) {
    // Map Excel theme blue tint to a hex approximation
    return color.tint === BLUE_TINT ? '#dae3f3' : '#b4c7e7';
  }
  return undefined;
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

function formatYesNo(value: any, defaultValue = 'NO '): string {
  if (value === undefined || value === null) return defaultValue;
  const truthy = typeof value === 'string' ? value.trim().length > 0 && value.toLowerCase() !== 'none' : Boolean(value);
  return truthy ? 'YES' : defaultValue;
}

function lookupWaterFeatureName(featureId: string): string {
  const pools = pricingData as any;
  const wf = pools.waterFeatures || {};
  const collections = [
    wf.sheerDescents,
    wf.jets,
    wf.woks?.waterOnly,
    wf.woks?.fireOnly,
    wf.woks?.waterAndFire,
    wf.bubblers,
  ].filter(Boolean) as any[];
  for (const group of collections) {
    const found = (group || []).find((item: any) => item.id === featureId);
    if (found?.name) return found.name;
  }
  return featureId;
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

function getWaterFeatureValue(
  features: ReturnType<typeof pickWaterFeatures>,
  formatter?: string
): string | number | null {
  if (!formatter) return null;
  if (formatter.startsWith('waterFeatureQty.')) {
    const [, type, indexRaw] = formatter.split('.');
    const index = Number(indexRaw) || 0;
    const list = (features as any)[type] as WaterFeatureSelection[] | undefined;
    const target = list?.[index];
    return target?.quantity ?? 0;
  }
  if (formatter.startsWith('waterFeature.')) {
    const [, type, indexRaw] = formatter.split('.');
    const index = Number(indexRaw) || 0;
    const list = (features as any)[type] as WaterFeatureSelection[] | undefined;
    const target = type === 'rock1' || type === 'rock2' ? features.other?.[index] : list?.[index];
    if (!target) return 'None';
    return lookupWaterFeatureName(target.featureId || '');
  }
  return null;
}

function formatValue(
  proposal: ProposalWithPricing,
  field: ContractField,
  overrides?: ContractOverrides
): string | number | Date | null {
  if (overrides && field.cell in overrides) {
    return overrides[field.cell] as any;
  }

  const mergedValue = deepGet(proposal, field.proposalPath);
  const formatter = field.formatter || 'text';
  const waterFeatures = pickWaterFeatures(proposal.waterFeatures?.selections);

  switch (formatter) {
    case 'poolType': {
      const type = (mergedValue as string) || proposal.poolSpecs.poolType;
      if (type?.toLowerCase() === 'fiberglass') return 'FIBERGLASS';
      if (type?.toLowerCase() === 'gunite') return 'SHOTCRETE';
      return (type || field.fallback || '').toString().toUpperCase();
    }
    case 'phone':
      return normalizePhone(mergedValue || field.fallback);
    case 'currencyRaw': {
      const fromPricing =
        proposal.pricing?.retailPrice ??
        proposal.pricing?.baseRetailPrice ??
        proposal.totalCost ??
        proposal.subtotal ??
        undefined;
      return Number.isFinite(fromPricing) ? Number(fromPricing) : Number(field.fallback || 0);
    }
    case 'date': {
      if (mergedValue) {
        const d = new Date(mergedValue);
        if (!Number.isNaN(d.getTime())) return d;
      }
      if (field.cell === 'I20') {
        const created = new Date(proposal.createdDate || proposal.lastModified || Date.now());
        return created;
      }
      if (field.cell === 'I21') {
        const base = new Date(proposal.createdDate || proposal.lastModified || Date.now());
        const estimate = new Date(base.getTime() + 120 * 24 * 60 * 60 * 1000);
        return estimate;
      }
      return field.fallback ? new Date(field.fallback) : null;
    }
    case 'number':
      if (mergedValue === 0 || Number.isFinite(mergedValue)) return Number(mergedValue);
      return field.fallback ?? null;
    case 'numberOrDash':
      if (mergedValue === 0 || Number.isFinite(mergedValue)) return Number(mergedValue);
      return '-';
    case 'tileLevel': {
      if (Number.isFinite(mergedValue)) return `Level ${mergedValue}`;
      return field.fallback ?? 'Included';
    }
    case 'yesNo':
      return formatYesNo(mergedValue ?? field.fallback ?? 'NO ');
    case 'spaYesNo':
      return proposal.poolSpecs.spaType !== 'none' ? 'YES' : 'NO ';
    case 'skimmerQty': {
      const additional = Number(mergedValue || 0);
      return 1 + (Number.isFinite(additional) ? additional : 0);
    }
    case 'coping': {
      const lookup: Record<string, string> = {
        'travertine-level1': '3CM Travertine',
        'travertine-level2': 'Travertine (Level 2)',
        flagstone: 'Flagstone',
        paver: 'Paver',
        concrete: 'Concrete',
        cantilever: 'Cantilever',
      };
      return lookup[mergedValue as string] || (mergedValue as string) || field.fallback || 'None';
    }
    case 'decking': {
      const lookup: Record<string, string> = {
        'travertine-level1': 'Travertine',
        'travertine-level2': 'Travertine (Level 2)',
        paver: 'Paver',
        concrete: 'Concrete',
      };
      return lookup[mergedValue as string] || (mergedValue as string) || field.fallback || 'None';
    }
    case 'facing': {
      const lookup: Record<string, string> = {
        none: 'None',
        tile: 'Tile',
        'panel-ledge': 'Panel Ledge',
        'stacked-stone': 'Stacked Stone',
      };
      return lookup[(mergedValue as string) || 'none'] || 'None';
    }
    case 'drainageResponsibility': {
      const numeric = Number(mergedValue || 0);
      return numeric > 0 ? 'BY BUILDER' : field.fallback || 'BY BUYER';
    }
    case 'finish': {
      if (proposal.poolSpecs.poolType === 'fiberglass') return 'Fiberglass';
      const finish = mergedValue?.finishType || mergedValue || proposal.interiorFinish?.finishType;
      const color = mergedValue?.color || proposal.interiorFinish?.color;
      return color ? `${finish || 'Interior Finish'} - ${color}` : finish || field.fallback || 'Interior Finish';
    }
    case 'finishOrNone': {
      if (proposal.poolSpecs.spaType === 'none') return 'None';
      return formatValue(proposal, { ...field, formatter: 'finish' }, overrides) as any;
    }
    case 'lightCount': {
      if (Array.isArray(mergedValue)) return mergedValue.length || field.fallback || 0;
      if (Number.isFinite(mergedValue)) return Number(mergedValue);
      return field.fallback || 0;
    }
    case 'lightCountExtra': {
      if (Array.isArray(mergedValue)) return Math.max(mergedValue.length - 1, 0);
      if (Number.isFinite(mergedValue)) return Math.max(Number(mergedValue) - 1, 0);
      return field.fallback || 0;
    }
    case 'hasWaterFeaturesYesNo':
      return formatYesNo((mergedValue as any[])?.length, field.fallback || 'NO ');
    default: {
      if (formatter.startsWith('waterFeature')) {
        const val = getWaterFeatureValue(waterFeatures, formatter);
        if (val !== null && val !== undefined) return val as any;
      }
      if (mergedValue !== undefined && mergedValue !== null) return mergedValue as any;
      return field.fallback ?? null;
    }
  }
}

function formatForDisplay(value: any): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'number') return Number.isFinite(value) ? value.toString() : '';
  return String(value);
}

function cloneWorkbook(wb: XLSX.WorkBook): XLSX.WorkBook {
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  return XLSX.read(buffer, { type: 'buffer', cellStyles: true });
}

let cachedTemplate: XLSX.WorkBook | null = null;

async function loadTemplate(): Promise<XLSX.WorkBook> {
  if (cachedTemplate) return cloneWorkbook(cachedTemplate);

  // Browser: fetch the template asset via Vite-served URL
  if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
    const res = await fetch(TEMPLATE_URL);
    const buffer = await res.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellStyles: true });
    cachedTemplate = wb;
    return cloneWorkbook(wb);
  }

  // Fallback for non-browser (electron main) environments
  const nodePath = new URL('../../docs/Contracts/CONTRACT.xlsx', import.meta.url).pathname;
  const wb = XLSX.readFile(nodePath, { cellStyles: true });
  cachedTemplate = wb;
  return cloneWorkbook(wb);
}

function applyValuesToSheet(
  sheet: XLSX.Sheet,
  proposal: ProposalWithPricing,
  overrides?: ContractOverrides
) {
  const editableCells = new Set(mapping.fields.map((f) => f.cell));
  const values = new Map<string, any>();

  mapping.fields.forEach((field) => {
    const value = formatValue(proposal, field, overrides);
    values.set(field.cell, value);
  });

  values.forEach((value, cellAddress) => {
    if (!isWithinColumns(cellAddress)) return;
    const cell = sheet[cellAddress] || { t: 's' };
    if (value instanceof Date) {
      cell.t = 'd';
      cell.v = value;
    } else if (typeof value === 'number') {
      cell.t = 'n';
      cell.v = value;
    } else {
      cell.t = 's';
      cell.v = value === null || value === undefined ? '' : value;
    }
    sheet[cellAddress] = cell as XLSX.CellObject;
  });

  return editableCells;
}

function buildRenderGrid(
  sheet: XLSX.Sheet,
  editableCells: Set<string>
): ContractSheetRender {
  const ref = sheet['!ref'] || 'A1:U1';
  const range = XLSX.utils.decode_range(ref);
  const maxCol = XLSX.utils.decode_col(columnLimit.end);
  const maxRow = range.e.r;
  const merges = (sheet['!merges'] || [])
    .filter((m) => m.s.c <= maxCol) // keep merges that start within our visible columns
    .map((m) => ({
      s: { r: m.s.r, c: m.s.c },
      e: { r: Math.min(m.e.r, maxRow), c: Math.min(m.e.c, maxCol) },
    }));
  const covered = new Set<string>();

  merges.forEach((merge) => {
    for (let r = merge.s.r; r <= merge.e.r; r += 1) {
      for (let c = merge.s.c; c <= merge.e.c; c += 1) {
        if (r === merge.s.r && c === merge.s.c) continue;
        covered.add(getCellAddress(r, c));
      }
    }
  });

  const rows: ContractCellRender[][] = [];
  for (let r = 0; r <= maxRow; r += 1) {
    const rowCells: ContractCellRender[] = [];
    for (let c = 0; c <= maxCol; c += 1) {
      const addr = getCellAddress(r, c);
      if (covered.has(addr)) continue;
      const cell = sheet[addr] as XLSX.CellObject | undefined;
      const value = cell?.v ?? '';
      const editable = editableCells.has(addr);
      const fill = (cell as any)?.s?.fgColor;
      const font = (cell as any)?.s?.font || {};
      const align = (cell as any)?.s?.alignment || {};

      const merge = merges.find((m) => m.s.r === r && m.s.c === c);
      const colSpan = merge ? merge.e.c - merge.s.c + 1 : undefined;
      const rowSpan = merge ? merge.e.r - merge.s.r + 1 : undefined;

      // Extract border information
      const borders = (cell as any)?.s?.border || {};
      const borderInfo = {
        top: borders.top ? { style: borders.top.style, color: borders.top.color } : undefined,
        right: borders.right ? { style: borders.right.style, color: borders.right.color } : undefined,
        bottom: borders.bottom ? { style: borders.bottom.style, color: borders.bottom.color } : undefined,
        left: borders.left ? { style: borders.left.style, color: borders.left.color } : undefined,
      };

      rowCells.push({
        address: addr,
        row: r + 1,
        col: c + 1,
        value: formatForDisplay(value),
        editable,
        style: {
          background: toHexColor(fill),
          bold: Boolean(font?.bold),
          italic: Boolean(font?.italic),
          fontSize: font?.sz,
          align: align?.horizontal,
          verticalAlign: align?.vertical,
          wrap: Boolean(align?.wrapText),
          border: borderInfo,
        },
        colSpan,
        rowSpan,
      });
    }
    rows.push(rowCells);
  }

  const colWidths = (sheet['!cols'] || [])
    .slice(0, maxCol + 1)
    .map((c: any) => {
      if (c?.wpx) return c.wpx;
      if (c?.wch) {
        // Excel column width (wch) -> px approximation
        // Excel uses 7 pixels per character unit at 96 DPI, plus padding
        return Math.round(c.wch * 7.5 + 5);
      }
      return 70;
    });

  const rowHeights = (sheet['!rows'] || [])
    .slice(0, maxRow + 1)
    .map((r: any) => {
      if (r?.hpx) return r.hpx;
      if (r?.h) {
        // Excel row height is stored in points (1 point = 1.333px at 96 DPI)
        return Math.round(r.h * 1.333);
      }
      return 20;
    });

  return {
    name: mapping.sheet,
    rows,
    merges,
    colWidths,
    rowHeights,
  };
}

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

export async function buildContractWorkbook(
  proposal: Proposal,
  overrides?: ContractOverrides
): Promise<{ workbook: XLSX.WorkBook; editableCells: Set<string> }> {
  const normalized = normalizeProposal(proposal);
  const workbook = await loadTemplate();
  const sheet = workbook.Sheets[mapping.sheet];
  if (!sheet) {
    throw new Error(`Missing contract sheet "${mapping.sheet}" in template.`);
  }
  const editableCells = applyValuesToSheet(sheet, normalized, overrides);
  return { workbook, editableCells };
}

export async function getEditableContractJson(
  proposal: Proposal,
  overrides?: ContractOverrides
): Promise<ContractSheetRender> {
  const { workbook, editableCells } = await buildContractWorkbook(proposal, overrides);
  const sheet = workbook.Sheets[mapping.sheet];
  return buildRenderGrid(sheet, editableCells);
}

export function listUnmappedFields(): ContractField[] {
  return mapping.fields.filter(
    (f) => !f.proposalPath && !(f.formatter || '').startsWith('waterFeature')
  );
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
