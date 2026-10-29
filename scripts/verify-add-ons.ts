import assert from 'node:assert/strict';
import MasterPricingEngine from '../src/services/masterPricingEngine';
import { getPricingDataSnapshot, withTemporaryPricingSnapshot } from '../src/services/pricingDataStore';
import { calculateEquipmentPriceImpact, calculateInteriorFinishPriceImpact } from '../src/services/priceImpact';
import { buildAdditionalSpecificationLines } from '../src/services/contractGenerator';
import { getDefaultEquipment, getDefaultInteriorFinish, getDefaultProposal } from '../src/utils/proposalDefaults';
import { sanitizeProposalSelectionState } from '../src/utils/proposalSelectionSanitizer';
import { buildLineItemSubcategories } from '../src/utils/costBreakdownSubcategories';
import { proposalSelectionRows, reviewRows } from '../src/utils/contributionReview';
import { savedSelectionAmount, savedVersionPrices } from '../src/utils/versionComparison';
import { buildMaterialsOrderForm } from '../src/utils/materialsOrderForm';
import { validateAddOnCatalogs } from '../src/utils/addOnValidation';
import { contributionInputs, mergeContribution } from '../src/utils/contributionInputs';
import type { Proposal } from '../src/types/proposal-new';
import type { CollaborationRequest } from '../src/services/proposalCollaboration';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.011, `${a} != ${b}`);
const snapshot = clone(getPricingDataSnapshot());
snapshot.misc.taxRate = 0.08;
snapshot.papDiscountRates.equipment = 0.1;
snapshot.papDiscountRates.interiorFinish = 0.2;
snapshot.equipment.addOns = [
  { id: 'e1', name: 'Equipment Add-on', cost1: 100, cost2: 50, includeByDefault: true },
  { id: 'e2', name: 'Taxable Add-on', cost1: 40, cost2: 10, includeByDefault: false },
];
snapshot.interiorFinish.addOns = [
  { id: 'i1', name: 'Finish Add-on', cost1: 200, cost2: 25, includeByDefault: true },
  { id: 'i2', name: 'Free Finish Add-on', cost1: 0, cost2: 0, includeByDefault: false },
];
snapshot.equipment.packageOptions = [
  { id: 'custom', name: 'Custom', mode: 'custom', enabled: true, basePrice: 0, allowAddOns: false },
  { id: 'fixed', name: 'Fixed', mode: 'fixed', enabled: true, basePrice: 1000, allowAddOns: false },
  { id: 'legacy', name: 'Legacy Package', mode: 'fixed', enabled: true, basePrice: 1000 },
] as any;

withTemporaryPricingSnapshot(snapshot, () => {
  assert.equal(validateAddOnCatalogs(snapshot), null);
  const p = getDefaultProposal() as Proposal;
  Object.assign(p.poolSpecs, { maxLength: 30, maxWidth: 15, surfaceArea: 450, perimeter: 90, shallowDepth: 3.5, endDepth: 6 });
  p.createdDate = '2026-01-01T00:00:00Z';
  p.equipment.packageSelectionId = 'custom';
  p.equipment.packageSelectionTouched = true;
  assert.equal(p.equipment.addOns?.length, 1);
  assert.equal(p.interiorFinish.addOns?.length, 1);
  assert.equal(getDefaultEquipment().addOns, undefined, 'Hydration must not select defaults');
  assert.equal(getDefaultInteriorFinish().addOns, undefined, 'Hydration must not select defaults');

  const without = clone(p);
  without.equipment.addOns = [];
  without.interiorFinish.addOns = [];
  const calc = (input: Proposal) => MasterPricingEngine.calculateCompleteProposal(input);
  const before = calc(without);
  const after = calc(p);
  near(after.costBreakdown.totals.equipmentOrdered - before.costBreakdown.totals.equipmentOrdered, 150 * 0.9 * 1.08);
  near(after.costBreakdown.totals.interiorFinish - before.costBreakdown.totals.interiorFinish, 225 * 0.8);
  near(after.pricing.totalCostsBeforeOverhead - before.pricing.totalCostsBeforeOverhead, 325.8);
  assert.equal(buildLineItemSubcategories(after.costBreakdown.equipmentOrdered)?.[0].name, 'Add-ons');
  assert.equal(buildLineItemSubcategories(after.costBreakdown.interiorFinish)?.[0].name, 'Add-ons');
  assert.ok(buildAdditionalSpecificationLines(p).includes('Equipment Add-on: Equipment Add-on'));
  assert.ok(buildAdditionalSpecificationLines(p).includes('Interior Finish Add-on: Finish Add-on'));
  const order = buildMaterialsOrderForm(p, after.costBreakdown);
  assert.ok(order.groups.some(g => g.title === 'Equipment Add-ons' && g.items[0].name === 'Equipment Add-on'));
  assert.ok(order.groups.some(g => g.title === 'Interior Finish Add-ons' && g.items[0].name === 'Finish Add-on'));

  const inputBefore = JSON.stringify(p);
  for (const [calculate, id, expected] of [
    [calculateEquipmentPriceImpact, 'e1', 145.8],
    [calculateInteriorFinishPriceImpact, 'i1', 180],
  ] as const) {
    const impact = calculate({ proposal: p, target: { kind: 'addOn', id }, pricingSnapshot: snapshot });
    assert.equal(impact.status, 'available');
    near(impact.costChangeBeforeOverhead, expected);
    near(impact.reconciliationDifference, 0);
  }
  assert.equal(JSON.stringify(p), inputBefore, 'Price impact must not mutate the proposal');

  const priced = { ...p, ...after } as Proposal;
  const saved = savedVersionPrices(priced);
  assert.equal(saved.warning, null);
  assert.ok(saved.rows.some(row => row.selectionKey === 'equipment.addOns'));
  assert.ok(savedSelectionAmount(priced, saved.rows, 'interiorFinish.addOns', true)! > 0);
  assert.ok(proposalSelectionRows(p, snapshot).some(row => row.key === 'interiorFinish.addOns' && row.after.includes('Finish Add-on')));
  const review = reviewRows({ base_version_json: without, working_version_json: p } as CollaborationRequest, snapshot);
  assert.ok(review.some(row => row.key === 'equipment.addOns' && row.after.includes('Equipment Add-on')));
  const merged = mergeContribution(without, p, without);
  assert.equal(merged.conflicts.length, 0);
  assert.ok(JSON.stringify(contributionInputs(p)).includes('e1'));

  const restricted = clone(p);
  restricted.equipment.packageSelectionId = 'fixed';
  const restrictedCost = calc(restricted);
  assert.ok(!restrictedCost.costBreakdown.equipmentOrdered.some(item => item.details?.addOnId));
  assert.ok(restrictedCost.costBreakdown.interiorFinish.some(item => item.details?.addOnId));
  assert.deepEqual(sanitizeProposalSelectionState(restricted).equipment.addOns, []);
  assert.ok(!buildAdditionalSpecificationLines(restricted).some(line => line.startsWith('Equipment Add-on:')));
  restricted.equipment.packageSelectionId = 'legacy';
  assert.ok(calc(restricted).costBreakdown.equipmentOrdered.some(item => item.details?.addOnId));

  const fiberglass = clone(p);
  fiberglass.poolSpecs.poolType = 'fiberglass';
  fiberglass.poolSpecs.fiberglassModelName = 'Fixture Shell';
  assert.ok(calc(fiberglass).costBreakdown.interiorFinish.some(item => item.details?.addOnId));
  const duplicate = clone(p);
  duplicate.equipment.addOns = [p.equipment.addOns![0], p.equipment.addOns![0]];
  assert.equal(calc(duplicate).costBreakdown.equipmentOrdered.filter(item => item.details?.addOnId).length, 1);
  duplicate.equipment.addOns!.push({ id: 'e2', name: 'Taxable Add-on' });
  assert.equal(calc(duplicate).costBreakdown.equipmentOrdered.filter(item => item.details?.addOnId).length, 2);

  const newer = clone(snapshot);
  newer.equipment.addOns[0].cost1 = 1100;
  const newerCost = withTemporaryPricingSnapshot(newer, () => calc(p));
  assert.ok(newerCost.totalCost > after.totalCost);
  near(calc(p).totalCost, after.totalCost);
  const old = clone(p); delete old.equipment.addOns; delete old.interiorFinish.addOns;
  near(calc(old).totalCost, before.totalCost);
});
for (const invalid of [NaN, Infinity, -1]) {
  const bad = clone(snapshot); bad.equipment.addOns[0].cost1 = invalid;
  assert.ok(validateAddOnCatalogs(bad));
}
const duplicateIds = clone(snapshot); duplicateIds.equipment.addOns[1].id = 'e1';
assert.ok(validateAddOnCatalogs(duplicateIds));
console.log('Add-ons verification passed: pricing, tax/PAP, packages, defaults, pinned revisions, price impact, COGS, contracts, orders and comparisons.');
