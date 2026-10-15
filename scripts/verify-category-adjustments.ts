import assert from 'node:assert/strict';
import { MasterPricingEngine } from '../src/services/masterPricingEngine';
import { getPricingDataSnapshot, loadPricingSnapshotForFranchise, withTemporaryPricingSnapshot } from '../src/services/pricingDataStore';
import { getDefaultProposal } from '../src/utils/proposalDefaults';
import { CATEGORY_ADJUSTMENT_CATEGORIES, isCategoryAdjustmentItem, validateCategoryAdjustments } from '../src/utils/categoryAdjustments';
import { CONDITION_SECTIONS, getCategoryConditionTargets, matchesAdjustmentCondition, describeCategoryAdjustment } from '../src/utils/categoryAdjustmentConditions';
import type { CategoryAdjustment, ConditionOperator } from '../src/types/categoryAdjustments';
import { buildPricingRevisionComparison, upgradeProposalPricingRevision } from '../src/services/pricingRevisionReview';
import { normalizeCostBreakdownForDisplay } from '../src/utils/costBreakdownDisplay';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const snapshot = clone(getPricingDataSnapshot());
const proposal = getDefaultProposal();
Object.assign(proposal.poolSpecs!, { maxLength: 30, maxWidth: 15, surfaceArea: 450, perimeter: 90, shallowDepth: 3.5, endDepth: 6 });
const calculate = (adjustments: CategoryAdjustment[], p = proposal) => withTemporaryPricingSnapshot({ ...snapshot, categoryAdjustments: adjustments }, () => MasterPricingEngine.calculateCompleteProposal(p));
const adjustment = (changes: Partial<CategoryAdjustment> = {}): CategoryAdjustment => ({ id: 'test', title: 'Tile setup charge', category: 'tile', amount: 800, basis: 'cogs', mode: 'static', ...changes });
const baseline = calculate([]);
for (const basis of ['cogs', 'retail'] as const) for (const amount of [800, -800, 0, 12.34]) for (const category of CATEGORY_ADJUSTMENT_CATEGORIES) {
  const result = calculate([adjustment({ basis, amount, category: category.id })]);
  const row = result.costBreakdown[category.bucket].find(isCategoryAdjustmentItem)!;
  assert.ok(row, `${basis} ${category.id} row missing`);
  assert.equal(row.description, 'Tile setup charge');
  assert.ok(Math.abs(result.pricing.totalCostsBeforeOverhead - baseline.pricing.totalCostsBeforeOverhead - (basis === 'cogs' ? amount : 0)) < 1e-7);
  if (basis === 'retail') {
    assert.equal(result.pricing.totalCOGS, baseline.pricing.totalCOGS);
    assert.ok(Math.abs(result.pricing.retailPrice - baseline.pricing.retailPrice - amount) < 1e-7);
    assert.equal(row.details?.retailOverride, amount);
  } else {
    assert.ok(Math.abs(result.pricing.totalCOGS - baseline.pricing.totalCOGS - amount * baseline.pricing.overheadMultiplier) < 1e-7);
  }
  assert.ok(Math.abs(result.pricing.grossProfit - (result.pricing.retailPrice - result.pricing.totalCOGS - result.pricing.digCommission - result.pricing.adminFee - result.pricing.closeoutCommission)) < 1e-7);
}
const targets = getCategoryConditionTargets(snapshot);
assert.equal(new Set(targets.map(t => t.id)).size, targets.length);
for (const section of CONDITION_SECTIONS) assert.ok(targets.some(t => t.path[0] === section), section);
const matches = (targetId: string, operator: ConditionOperator = 'active', value?: string | number, p = proposal) => matchesAdjustmentCondition({ targetId, operator, value }, p, targets);
for (const [operator, threshold, expected] of [['gt', 99, true], ['gt', 100, false], ['gte', 100, true], ['lt', 100, false], ['lte', 100, true], ['eq', 100, true], ['neq', 100, false]] as const) {
  proposal.plumbing!.runs.gasRun = 100;
  assert.equal(matches('electrical.gas', operator, threshold), expected, operator);
}
assert.equal(matches('electrical.gas', 'gt', NaN), false);
assert.equal(matches('tile.option'), true, 'Default tile counts');
assert.equal(matches('tile.option', 'equals', 'level1'), true);
assert.equal(matches('tile.option', 'equals', 'deleted'), false);
assert.equal(matches('group:Tile / Coping / Decking / Tile'), true);
proposal.tileCopingDecking!.tileOptionId = '';
proposal.tileCopingDecking!.tileLevel = 0;
assert.equal(matches('group:Tile / Coping / Decking / Tile'), false);
proposal.tileCopingDecking!.additionalTileLength = 10;
assert.equal(matches('group:Tile / Coping / Decking / Tile'), true);
proposal.poolSpecs!.poolType = 'fiberglass';
assert.equal(matches('tile.extra'), false, 'Hidden shotcrete field ignored');
proposal.poolSpecs!.poolType = 'gunite';
proposal.tileCopingDecking!.copingType = 'none';
assert.equal(matches('coping.size', 'equals', '12x12'), false);
assert.equal(matches('spa.spaLength', 'lte', 100), false, 'Inactive spa does not match a numeric comparison');
proposal.excavation!.hasAdditionalDigging = false;
proposal.excavation!.additionalDiggingDays = 5;
assert.equal(matches('excavation.additionalDiggingDays'), false);
proposal.excavation!.hasAdditionalDigging = true;
assert.equal(matches('excavation.additionalDiggingDays', 'gte', 5), true);
proposal.tileCopingDecking!.isDeckingOffContract = true;
proposal.tileCopingDecking!.deckingArea = 300;
proposal.tileCopingDecking!.additionalDeckingSelections = [{ deckingType: 'paver', area: 200, isOffContract: true }];
assert.equal(matches('decking.area'), false);
assert.equal(matches('decking.type', 'equals', 'paver'), false);
proposal.tileCopingDecking!.additionalDeckingSelections.push({ deckingType: 'paver', area: 25 });
assert.equal(matches('decking.area', 'eq', 25), true);
assert.equal(matches('decking.type', 'equals', 'paver'), false, 'Primary decking condition matched additional decking');
assert.equal(matches('decking.additionalType', 'equals', 'paver'), true);
proposal.customFeatures!.features = [{ name: 'Excluded', description: '', laborCost: 0, materialCost: 0, totalCost: 1000, isOffContract: true }];
assert.equal(matches('custom.manual'), false);
const autoPricing: any = clone(snapshot);
autoPricing.equipment.pumps.push({ name: 'Automatic pump', basePrice: 100 });
const automaticProposal = clone(proposal);
automaticProposal.equipment!.pump = { name: 'Automatic pump', autoAddedForSpa: true };
automaticProposal.equipment!.pumpQuantity = 1;
assert.equal(matchesAdjustmentCondition({ targetId: 'equipment.pump', operator: 'equals', value: 'Automatic pump' }, automaticProposal, getCategoryConditionTargets(autoPricing)), true);
automaticProposal.equipment!.pumpQuantity = 0;
assert.equal(matchesAdjustmentCondition({ targetId: 'equipment.pump', operator: 'equals', value: 'Automatic pump' }, automaticProposal, getCategoryConditionTargets(autoPricing)), false);
autoPricing.equipment.packageOptions.push({ id: 'restricted', name: 'Restricted', mode: 'fixed', supportsSpa: false, allowWaterFeatureUpgrade: false, includedWaterFeaturesBeforeExtraPump: 0 });
automaticProposal.equipment!.packageSelectionId = 'restricted';
automaticProposal.equipment!.packageSelectionTouched = true;
automaticProposal.poolSpecs!.spaType = 'gunite';
automaticProposal.waterFeatures!.selections = [{ featureId: 'deck-jet', quantity: 1 }];
const restrictedTargets = getCategoryConditionTargets(autoPricing);
assert.equal(matchesAdjustmentCondition({ targetId: 'spa.type', operator: 'active' }, automaticProposal, restrictedTargets), false);
assert.equal(matchesAdjustmentCondition({ targetId: 'waterFeatures.option', operator: 'active' }, automaticProposal, restrictedTargets), false);
proposal.waterFeatures!.selections = [{ featureId: 'deck-jet', quantity: 3 }, { featureId: 'laminar-jet', quantity: 2 }];
const conditional = adjustment({ basis: 'retail', mode: 'conditional', condition: { targetId: 'waterFeatures.quantity', operator: 'gte', value: 2 } });
const pBefore = JSON.stringify(proposal), sBefore = JSON.stringify(snapshot);
const result = calculate([conditional]);
assert.equal(result.costBreakdown.tileLabor.filter(isCategoryAdjustmentItem).length, 1);
assert.equal(JSON.stringify(proposal), pBefore, 'Calculation mutated proposal');
assert.equal(JSON.stringify(snapshot), sBefore, 'Calculation mutated pricing snapshot');
const noMatch = calculate([adjustment({ mode: 'conditional', condition: { targetId: 'waterFeatures.quantity', operator: 'gt', value: 99 } })]);
assert.equal(noMatch.costBreakdown.tileLabor.filter(isCategoryAdjustmentItem).length, 0);
const namedTax = calculate([adjustment({ category: 'interiorFinish', title: 'Microglass tax adjustment' })]);
assert.ok(normalizeCostBreakdownForDisplay(namedTax.costBreakdown, { designerCode: '9724' }).interiorFinish.some(isCategoryAdjustmentItem), 'Admin adjustment was removed by title-based legacy filtering');
assert.equal(validateCategoryAdjustments([adjustment({ mode: 'conditional' })], snapshot)?.includes('condition'), true);
assert.ok(validateCategoryAdjustments([adjustment({ title: '' })], snapshot));
assert.ok(validateCategoryAdjustments([adjustment(), adjustment()], snapshot));
assert.equal(describeCategoryAdjustment(conditional, targets), 'Apply $800.00 to Retail when Total Quantity is at least 2 features.');

// Loading another franchise/model or an old snapshot must never inherit rows.
const pricingByFranchise: Record<string, any> = { first: { ...snapshot, categoryAdjustments: [adjustment()] }, second: { ...snapshot, categoryAdjustments: [] }, historical: { ...snapshot } };
delete pricingByFranchise.historical.categoryAdjustments;
(globalThis as any).window = { electron: { loadPricingModel: async ({ franchiseId }: any) => ({ franchiseId, pricingModelId: 'model', pricing: pricingByFranchise[franchiseId] }) }, navigator: { onLine: false } };
for (const [id, count] of [['first', 1], ['second', 0], ['historical', 0]] as const) {
  const loaded = await loadPricingSnapshotForFranchise(id, 'model');
  assert.equal(loaded.pricing.categoryAdjustments.length, count, `Isolation failed: ${id}`);
}

// Retail-only rows must be reviewable even when two adjustments offset to zero.
const cache = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (key: string) => cache.get(key) ?? null, setItem: (key: string, value: string) => cache.set(key, value) };
const model = (revisionId: string, adjustments: CategoryAdjustment[]) => ({ franchiseId: 'revision-test', pricingModelId: 'model', pricingModelName: 'Model', revisionId, revisionNumber: revisionId === 'before' ? 1 : 2, version: 'v1', pricing: { ...snapshot, categoryAdjustments: adjustments } });
const beforeModel = model('before', []);
const afterModel = model('after', [adjustment({ id: 'credit', amount: -125, basis: 'retail' }), adjustment({ id: 'charge', title: 'Retail charge', amount: 125, basis: 'retail' })]);
cache.set('submerge.pricingModelSnapshot.revision-test.model.before', JSON.stringify(beforeModel));
cache.set('submerge.pricingModelSnapshot.revision-test.model.after', JSON.stringify(afterModel));
(globalThis as any).window.electron.loadPricingModel = async () => afterModel;
const revisionProposal = { ...getDefaultProposal(), franchiseId: 'revision-test', pricingModelId: 'model', pricingModelRevisionId: 'before' };
Object.assign(revisionProposal.poolSpecs!, { maxLength: 30, maxWidth: 15, surfaceArea: 450, perimeter: 90, shallowDepth: 3.5, endDepth: 6 });
const revisionBefore = JSON.stringify(revisionProposal);
const comparison = await buildPricingRevisionComparison(revisionProposal);
assert.ok(comparison?.affectsProposal);
assert.equal(comparison.rows.filter(row => row.label.endsWith('(Retail)')).length, 2);
assert.ok(comparison.rows.some(row => row.afterAmount === -125));
assert.equal(JSON.stringify(revisionProposal), revisionBefore, 'Review changed the original saved proposal');
const upgraded = await upgradeProposalPricingRevision(revisionProposal, comparison);
assert.equal(upgraded.pricingModelRevisionId, 'after');
assert.equal(upgraded.costBreakdown!.tileLabor.filter(isCategoryAdjustmentItem).length, 2);
assert.equal(revisionProposal.pricingModelRevisionId, 'before');
await assert.rejects(upgradeProposalPricingRevision({ ...revisionProposal, status: 'signed' }, comparison), /Signed proposals cannot change pricing revisions/);
console.log(`Category adjustments verified: ${CATEGORY_ADJUSTMENT_CATEGORIES.length * 8} pricing cases, numeric boundaries, applicability, defaults, Off-Contract, once-only rows, and historical/franchise isolation.`);
