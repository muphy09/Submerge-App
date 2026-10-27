import type { CostBreakdown, CostLineItem, Proposal } from '../types/proposal-new';
import type { AdjustmentCategory, CategoryAdjustment } from '../types/categoryAdjustments';
import { conditionError, getCategoryConditionTargets, matchesAdjustmentCondition, type ConditionTarget } from './categoryAdjustmentConditions';

export const CATEGORY_ADJUSTMENT_CATEGORIES: { id: AdjustmentCategory; label: string; bucket: Exclude<keyof CostBreakdown, 'totals'> }[] = [
  { id: 'plansAndEngineering', label: 'Plans & Engineering', bucket: 'plansAndEngineering' },
  { id: 'layout', label: 'Layout', bucket: 'layout' }, { id: 'permit', label: 'Permit', bucket: 'permit' },
  { id: 'excavation', label: 'Excavation', bucket: 'excavation' }, { id: 'plumbing', label: 'Plumbing', bucket: 'plumbing' },
  { id: 'gas', label: 'Gas', bucket: 'gas' }, { id: 'steel', label: 'Steel', bucket: 'steel' },
  { id: 'electrical', label: 'Electrical', bucket: 'electrical' }, { id: 'shotcrete', label: 'Shotcrete', bucket: 'shotcreteLabor' },
  { id: 'tile', label: 'Tile', bucket: 'tileLabor' }, { id: 'copingDecking', label: 'Coping/Decking', bucket: 'copingDeckingLabor' },
  { id: 'stoneRockwork', label: 'Stone/Rockwork', bucket: 'stoneRockworkLabor' },
  { id: 'drainage', label: 'Drainage', bucket: 'drainage' }, { id: 'equipmentOrdered', label: 'Equipment Ordered', bucket: 'equipmentOrdered' },
  { id: 'equipmentSet', label: 'Equipment Set', bucket: 'equipmentSet' }, { id: 'waterFeatures', label: 'Water Features', bucket: 'waterFeatures' },
  { id: 'cleanup', label: 'Cleanup', bucket: 'cleanup' }, { id: 'interiorFinish', label: 'Interior Finish', bucket: 'interiorFinish' },
  { id: 'waterTruck', label: 'Water Truck', bucket: 'waterTruck' }, { id: 'fiberglassShell', label: 'Fiberglass Shell', bucket: 'fiberglassShell' },
  { id: 'fiberglassInstall', label: 'Fiberglass Install', bucket: 'fiberglassInstall' },
  { id: 'startupOrientation', label: 'Startup/Orientation', bucket: 'startupOrientation' }, { id: 'customFeatures', label: 'Custom Features', bucket: 'customFeatures' },
];
export const isCategoryAdjustmentItem = (item: CostLineItem) => typeof item.details?.categoryAdjustmentId === 'string';
export const isRetailCategoryAdjustment = (item: CostLineItem) => isCategoryAdjustmentItem(item) && item.details?.adjustmentBasis === 'retail';

/** Default billing destination when the editor follows a designer input. */
export function getConditionBillingCategory(target?: ConditionTarget): AdjustmentCategory | '' {
  if (!target) return '';
  const [section, group] = target.path;
  switch (section) {
    case 'Pool Specifications':
      if (target.id === 'pool.hasSiltFence') return 'layout';
      if (target.id === 'pool.hasAutomaticCover' || target.id === 'pool.coverCost') return 'customFeatures';
      if (target.id === 'pool.deckingArea') return 'copingDecking';
      if (target.id === 'spa.facing') return 'stoneRockwork';
      if (target.id === 'spa.doubleBullnose') return 'stoneRockwork';
      if (target.id.startsWith('fiberglass') || target.id.startsWith('pool.fiberglass') || target.id === 'pool.crane' || target.id === 'spa.model' || target.id === 'spa.crane') return 'fiberglassShell';
      return 'plansAndEngineering';
    case 'Excavation':
      if (target.id === 'excavation.needsSoilSampleEngineer') return 'plansAndEngineering';
      if (/facing|backside/i.test(target.id)) return 'stoneRockwork';
      return 'excavation';
    case 'Plumbing': return 'plumbing';
    case 'Gas / Electrical': return group === 'Gas Run' ? 'gas' : 'electrical';
    case 'Tile / Coping / Decking':
      if (target.id === 'coping.bullnose') return 'stoneRockwork';
      if (group === 'Coping' || group === 'Decking') return 'copingDecking';
      if (group === 'Rough Grading') return 'cleanup';
      return 'tile';
    case 'Drainage': return 'drainage';
    case 'Equipment':
      if (['equipment.cleanerRun', 'equipment.autoFillRun', 'equipment.autoFillElectricRun'].includes(target.id)) return 'plumbing';
      return 'equipmentOrdered';
    case 'Water Features': return 'waterFeatures';
    case 'Interior Finish': return 'interiorFinish';
    case 'Custom Features': return 'customFeatures';
    default: return '';
  }
}

export function validateCategoryAdjustments(input: unknown, pricing: any, cachedTargets?: ConditionTarget[]): string | null {
  if (input === undefined) return null;
  if (!Array.isArray(input)) return 'Category Adjustments must be a list.';
  if (!input.length) return null;
  const targets = cachedTargets || getCategoryConditionTargets(pricing);
  const ids = new Set<string>();
  for (const adjustment of input as CategoryAdjustment[]) {
    if (!adjustment || typeof adjustment.title !== 'string') return 'Give every category adjustment a Title.';
    const label = adjustment.title.trim() || 'Untitled adjustment';
    if (!adjustment.id || ids.has(adjustment.id)) return `${label}: adjustment IDs must be unique.`;
    ids.add(adjustment.id);
    if (!adjustment.title?.trim()) return 'Give every category adjustment a Title.';
    if (typeof adjustment.amount !== 'number' || !Number.isFinite(adjustment.amount)) return `${label}: enter a valid amount.`;
    if (!['cogs', 'retail'].includes(adjustment.basis) || !['static', 'conditional'].includes(adjustment.mode)) return `${label}: choose a pricing basis and application mode.`;
    if (adjustment.mode === 'conditional') {
      const error = conditionError(adjustment.condition, targets);
      if (error) return `${label}: ${error}`;
    }
    if (!CATEGORY_ADJUSTMENT_CATEGORIES.some(c => c.id === adjustment.category)) return `${label}: choose a breakdown category.`;
  }
  return null;
}

/** Adds flat, once-per-proposal rows after ordinary tax/PAP calculations. */
export function applyCategoryAdjustments(breakdown: CostBreakdown, proposal: Partial<Proposal>, pricing: any): number {
  const input: CategoryAdjustment[] = Array.isArray(pricing.categoryAdjustments) ? pricing.categoryAdjustments : [];
  if (!input.length) return 0;
  const targets = getCategoryConditionTargets(pricing);
  let retailTotal = 0;
  const seen = new Set<string>();
  for (const adjustment of input) {
    if (validateCategoryAdjustments([adjustment], pricing, targets) || seen.has(adjustment.id)) continue;
    seen.add(adjustment.id);
    if (adjustment.mode === 'conditional' && !matchesAdjustmentCondition(adjustment.condition, proposal, targets)) continue;
    const category = CATEGORY_ADJUSTMENT_CATEGORIES.find(c => c.id === adjustment.category)!;
    const amount = Math.round(adjustment.amount * 100) / 100;
    const retail = adjustment.basis === 'retail';
    breakdown[category.bucket].push({
      category: category.label,
      description: adjustment.title.trim(),
      quantity: 1, unitPrice: retail ? 0 : amount, total: retail ? 0 : amount,
      details: {
        subcategory: 'Category Adjustments', categoryAdjustmentId: adjustment.id,
        adjustmentBasis: adjustment.basis, adjustmentAmount: amount,
        ...(retail ? { retailOverride: amount } : {}),
      },
    });
    if (retail) retailTotal += amount;
    else {
      breakdown.totals[category.bucket] += amount;
      breakdown.totals.grandTotal += amount;
    }
  }
  return Math.round(retailTotal * 100) / 100;
}
