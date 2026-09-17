import assert from 'node:assert/strict';
import { TileCopingDeckingCalculations } from '../src/services/pricingEngineComplete';
import MasterPricingEngine from '../src/services/masterPricingEngine';
import { getPricingDataSnapshot, withTemporaryPricingSnapshot } from '../src/services/pricingDataStore';
import { resolvePricingForTier } from '../src/services/pricingTiers';
import { getDefaultProposal } from '../src/utils/proposalDefaults';
import { upgradeProposalPricingRevision } from '../src/services/pricingRevisionReview';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.00001, `${a} != ${b}`);
const snapshot = getPricingDataSnapshot();
(snapshot.tileCoping.decking.additionalOptions as any[]) = [
  { id: 'extra', name: 'Extra Pavers', materialRate: 10, laborRate: 8 },
  { id: 'no-waste', name: 'No Standard Waste', materialRate: 10, laborRate: 8, wasteNotIncluded: true },
];
let scenarios = 0;
for (const tier of ['normal', 'bronze']) {
  for (const shape of ['rectangle', 'freeform']) {
    for (const type of ['travertine-level1', 'concrete']) {
      for (const primaryOff of [false, true]) {
        for (const additionalOff of [false, true]) {
          const proposal = getDefaultProposal();
          proposal.poolSpecs = { ...proposal.poolSpecs!, poolShape: shape as any, surfaceArea: 450, perimeter: 90, deckingArea: 400 };
          proposal.tileCopingDecking = { ...proposal.tileCopingDecking!, deckingType: type as any, isDeckingOffContract: primaryOff,
            additionalDeckingSelections: [
              { deckingType: 'extra', area: 100, isOffContract: additionalOff },
              { deckingType: 'no-waste', area: 100, isOffContract: additionalOff },
            ] };
          const calculate = (rate: number) => {
            const pricing = resolvePricingForTier(clone(snapshot), tier);
            pricing.tileCoping.offContractDecking.materialWasteRate = rate;
            return withTemporaryPricingSnapshot(pricing, () => ({
              lines: TileCopingDeckingCalculations.calculateCosts(proposal.poolSpecs!, proposal.tileCopingDecking!),
              full: MasterPricingEngine.calculateCompleteProposal(proposal),
            }));
          };
          const before = calculate(0);
          const after = calculate(0.10);
          assert.deepEqual(after.lines.labor, before.lines.labor, 'Off-contract waste changed labor');
          assert.deepEqual(after.lines.material.filter(i => !i.description.includes('Off Contract Material Waste')), before.lines.material,
            'Off-contract waste changed existing material/freeform lines');
          const eligible = before.lines.material.filter(i => i.category === 'Decking Material' && i.details?.offContract && !/Tax|Freeform/.test(i.description));
          const waste = after.lines.material.filter(i => i.description.endsWith('Off Contract Material Waste'));
          close(waste.reduce((s, i) => s + i.total, 0), eligible.reduce((s, i) => s + i.total, 0) * 0.10);
          close(after.full.pricing.totalCOGS, before.full.pricing.totalCOGS);
          close(after.full.pricing.digCommission, before.full.pricing.digCommission);
          if (!primaryOff && !additionalOff) assert.deepEqual(after, before);
          const custom = calculate(0.20);
          close(custom.lines.material.filter(i => i.description.endsWith('Off Contract Material Waste')).reduce((s, i) => s + i.total, 0), waste.reduce((s, i) => s + i.total, 0) * 2);
          scenarios++;
        }
      }
    }
  }
}

// Existing on-contract quantity and freeform rules remain 5% by default.
const proposal = getDefaultProposal();
proposal.poolSpecs = { ...proposal.poolSpecs!, poolShape: 'freeform', deckingArea: 100, perimeter: 90 };
const onContract = clone(snapshot);
const baseline = withTemporaryPricingSnapshot(onContract, () => TileCopingDeckingCalculations.calculateCosts(proposal.poolSpecs!, proposal.tileCopingDecking!));
onContract.tileCoping.onContractDecking.quantityWasteRate = 0.20;
onContract.tileCoping.onContractDecking.freeformWasteRate = 0.10;
const adjusted = withTemporaryPricingSnapshot(onContract, () => TileCopingDeckingCalculations.calculateCosts(proposal.poolSpecs!, proposal.tileCopingDecking!));
assert.equal(baseline.material.find(i => i.description === 'Freeform Decking Waste')?.unitPrice, 0.05);
assert.equal(adjusted.material.find(i => i.description === 'Freeform Decking Waste')?.unitPrice, 0.10);
assert.equal(adjusted.material.find(i => i.description.endsWith('Decking Material'))?.quantity, 120);
assert.equal(adjusted.labor.find(i => i.category === 'Decking Labor')?.quantity, 120);

await assert.rejects(() => upgradeProposalPricingRevision({ ...proposal, status: 'signed', isLocked: true } as any, {} as any), /Signed proposals/);
console.log(`Decking waste verification passed: ${scenarios} combinations, custom/zero rates, on-contract controls, and signed protection.`);
