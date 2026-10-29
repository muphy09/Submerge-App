import type { Proposal, CostLineItem } from '../types/proposal-new';
import { collaborationVersionBlockedReason } from './collaborationSafety';
import { isOffContractLineItem } from './offContractLineItems';
import { titleCase } from './contributionReview';

export const versionKey = (p: Proposal) => p.versionId || 'original';
export const eligibleComparisonVersion = (p: Proposal) => !collaborationVersionBlockedReason(p);
export function selectComparisonVersions(saved: Proposal[], visibleActiveIds: ReadonlySet<string>) {
  return saved.filter(p => visibleActiveIds.has(versionKey(p)) && eligibleComparisonVersion(p));
}
export type SavedPriceRow = { key: string; category: string; label: string; detail: string; price: number | null; cogs: number | null; selectionKey?: string };
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const cents = (n: number) => Math.round(n * 100) / 100;

/** Read saved breakdowns only. Never hydrate, normalize, or run the pricing engine. */
export function savedVersionPrices(p: Proposal): { rows: SavedPriceRow[]; warning: string | null } {
  const rows = new Map<string, SavedPriceRow>();
  const pricing = p.pricing;
  const validRates = finite(pricing?.overheadMultiplier) && pricing.overheadMultiplier > 0
    && finite(pricing?.targetMargin) && pricing.targetMargin > 0;
  let costs = 0;
  let directAdjustments = 0;
  const add = (row: SavedPriceRow) => {
    const old = rows.get(row.key);
    if (old) {
      old.price = old.price !== null && row.price !== null ? old.price + row.price : null;
      old.cogs = old.cogs !== null && row.cogs !== null ? old.cogs + row.cogs : null;
      old.detail += ' · ' + row.detail;
    } else rows.set(row.key, row);
  };
  for (const [section, items] of Object.entries(p.costBreakdown || {})) {
    if (!Array.isArray(items)) continue;
    for (const item of items as CostLineItem[]) {
      const offContract = isOffContractLineItem(item);
      const negativeCustom = section === 'customFeatures' && item.total < 0;
      const retailAdjustment = item.details?.adjustmentBasis === 'retail';
      const direct = retailAdjustment ? Number(item.details?.adjustmentAmount) : negativeCustom ? item.total : 0;
      const cost = offContract || negativeCustom || retailAdjustment ? 0 : item.total;
      if (finite(cost)) costs += cost; else costs = NaN;
      directAdjustments += direct;
      const identity = item.details?.categoryAdjustmentId || item.details?.selectionId || item.description;
      add({ key: `${section}::${item.category}::${identity}`, category: titleCase(section), label: item.description,
        selectionKey: savedSelectionKey(p, section, item),
        detail: `Qty: ${item.quantity}${offContract ? ' · Off-Contract' : ''}${item.notes ? ' · ' + item.notes : ''}`,
        cogs: validRates && finite(cost) ? cost * pricing.overheadMultiplier : null,
        price: validRates && finite(cost) && finite(direct) ? cost * pricing.overheadMultiplier / pricing.targetMargin + direct : null });
    }
  }
  const reconcilesCosts = validRates && finite(costs) && finite(pricing?.totalCostsBeforeOverhead)
    && Math.abs(costs - pricing.totalCostsBeforeOverhead) < 0.02;
  if (reconcilesCosts) {
    const adjustments = pricing.manualAdjustmentsTotal;
    add({ key: 'pricing::adjustments', category: 'Proposal adjustments', label: 'Other retail adjustments',
      detail: 'Saved manual, custom, and cover adjustments not already listed above', cogs: 0,
      price: finite(adjustments) ? adjustments - directAdjustments : null });
    for (const [key, label] of [['discountAmount', 'Discount'], ['g3UpgradeCost', 'Retail add-on']] as const) {
      add({ key: 'pricing::' + key, category: 'Proposal adjustments', label, detail: '', cogs: 0,
        price: finite(pricing[key]) ? pricing[key] : null });
    }
    const rounding = pricing.baseRetailPrice - costs * pricing.overheadMultiplier / pricing.targetMargin;
    add({ key: 'pricing::rounding', category: 'Proposal adjustments', label: 'Proposal rounding', detail: '', cogs: 0,
      price: finite(rounding) && rounding >= -0.01 && rounding < 10.01 ? rounding : null });
  }
  const result = [...rows.values()];
  const sum = result.reduce((total, row) => total + (row.price ?? NaN), 0);
  const valid = reconcilesCosts && finite(p.totalCost) && finite(sum) && Math.abs(sum - p.totalCost) < 0.02;
  // Do not manufacture a balancing adjustment when saved information is incomplete.
  if (!valid) result.forEach(row => { row.price = null; });
  if (!reconcilesCosts) result.forEach(row => { row.cogs = null; });
  if (valid) {
    const rounding = result.find(row => row.key === 'pricing::rounding')!;
    const displayedItems = result.filter(row => row !== rounding).reduce((sum, row) => sum + cents(row.price!), 0);
    rounding.price = cents(p.totalCost - displayedItems);
  }
  return { rows: result, warning: valid ? null : 'Item prices are unavailable because the saved breakdown does not reconcile with the saved proposal total.' };
}

export function savedContractPrice(p: Proposal): number | null {
  const override = p.contractOverrides?.p1_7;
  if (override !== null && override !== undefined) {
    const text = String(override).trim().replace(/[$,\s]/g, '');
    const value = text ? Number(text) : NaN;
    return finite(value) ? value : null;
  }
  return finite(p.pricing?.retailPrice) ? p.pricing.retailPrice : finite(p.totalCost) ? p.totalCost : null;
}

export const priceDifference = (a: number | null | undefined, b: number | null | undefined) =>
  a === null || b === null ? null : cents(cents(b ?? 0) - cents(a ?? 0));

const equipmentFields = ['pump', 'filter', 'heater', 'cleaner', 'heaterChiller', 'automation', 'saltSystem',
  'additionalSaltSystem', 'autoFillSystem', 'sanitationAccessory', 'additionalPumps', 'additionalFilters', 'additionalHeaters', 'auxiliaryPumps'];

/** Associate only separately identifiable saved charges. Shared tax, discounts and
 * installation charges remain in Item Prices rather than being assigned twice. */
function savedSelectionKey(p: Proposal, section: string, item: CostLineItem): string | undefined {
  if (section === 'equipmentOrdered') {
    const description = item.description.replace(/ \(upgrade\)$/i, '');
    if (description.startsWith('Pool Light - ')) return 'equipment.poolLights';
    if (description.startsWith('Spa Light - ')) return 'equipment.spaLights';
    const owners = equipmentFields.filter(field => {
      const value = (p.equipment as any)?.[field];
      const selections = Array.isArray(value) ? value : value ? [value] : field === 'auxiliaryPumps' && p.equipment.auxiliaryPump ? [p.equipment.auxiliaryPump] : [];
      return selections.some(selection => selection.name && description === (field === 'additionalPumps' ? `Additional Pump - ${selection.name}` : selection.name));
    });
    return owners.length === 1 ? `equipment.${owners[0]}` : undefined;
  }
  if (/^Tile (Labor|Material)$/.test(item.category) && !/^Step Trim/i.test(item.description)
    && / Tile(?: Labor)?(?: - Spa)?$/.test(item.description)) return 'tileCopingDecking.tile';
  if (/^Coping (Labor|Material)$/.test(item.category)) return 'tileCopingDecking.coping';
  return undefined;
}

export function savedSelectionAmount(p: Proposal, rows: SavedPriceRow[], key: string, cogs: boolean): number | null {
  const matches = rows.filter(row => row.selectionKey === key);
  if (matches.length) {
    const values = matches.map(row => cogs ? row.cogs : row.price);
    return values.some(value => value === null) ? null : cents(values.reduce<number>((sum, value) => sum + cents(value!), 0));
  }
  if (key.startsWith('equipment.')) {
    const field = key.slice(10);
    if (![...equipmentFields, 'poolLights', 'spaLights'].includes(field)) return null;
    const value = (p.equipment as any)?.[field];
    const count = (p.equipment as any)?.[`${field}Quantity`];
    if (!value || count === 0 || (Array.isArray(value) ? !value.length : /^(none|no\b)/i.test(value.name || ''))) return 0;
  }
  if (key === 'tileCopingDecking.tile' && (!p.tileCopingDecking.tileLevel || p.tileCopingDecking.tileOptionId === 'none')) return 0;
  if (key === 'tileCopingDecking.coping' && (!p.tileCopingDecking.copingType || p.tileCopingDecking.copingType === 'none')) return 0;
  return null;
}
