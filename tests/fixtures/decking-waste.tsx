import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../../src/index.css';
import pricingData from '../../src/services/pricingData';
import { getDefaultProposal } from '../../src/utils/proposalDefaults';
import PricingDataModal from '../../src/components/PricingDataModal';
import PricingRevisionPromptModal from '../../src/components/PricingRevisionPromptModal';
import PricingRevisionComparisonModal from '../../src/components/PricingRevisionComparisonModal';
import { getPricingDataSnapshot, loadPricingSnapshotForExistingProposal, withTemporaryPricingSnapshot } from '../../src/services/pricingDataStore';
import { buildPricingRevisionComparison, markPricingRevisionDeclined, upgradeProposalPricingRevision } from '../../src/services/pricingRevisionReview';
import MasterPricingEngine from '../../src/services/masterPricingEngine';

Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
const franchiseId = new URLSearchParams(location.search).get('franchise') || '5555';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const oldPricing: any = clone(pricingData);
delete oldPricing.tileCoping.offContractDecking;
delete oldPricing.tileCoping.onContractDecking;
const model = {
  franchiseId, pricingModelId: 'waste-model', pricingModelName: 'Decking Pricing',
  isDefault: true, version: 'test', revisionId: 'new', revisionNumber: 2, pricing: clone(pricingData),
};
localStorage.setItem(`submerge.pricingModelSnapshot.${franchiseId}.waste-model.old`, JSON.stringify({ ...model, revisionId: 'old', revisionNumber: 1, pricing: oldPricing }));
localStorage.setItem(`submerge.pricingModelSnapshot.${franchiseId}.waste-model.new`, JSON.stringify(model));
localStorage.setItem(`submerge.pricingModelSnapshot.${franchiseId}.waste-model.current`, JSON.stringify(model));
(window as any).electron = { listPricingModels: async () => [], loadPricingModel: async () => model };
(window as any).getWastePricing = getPricingDataSnapshot;

async function mount() {
  let initial = {
    ...getDefaultProposal(), franchiseId, pricingModelId: model.pricingModelId,
    pricingModelFranchiseId: franchiseId, pricingModelName: model.pricingModelName,
    pricingModelRevisionId: 'old', pricingModelRevisionNumber: 1,
  };
  initial.poolSpecs = { ...initial.poolSpecs!, surfaceArea: 450, perimeter: 90, deckingArea: 400 };
  initial.tileCopingDecking = { ...initial.tileCopingDecking!, deckingType: 'travertine-level1', isDeckingOffContract: true };
  const saved = await loadPricingSnapshotForExistingProposal(franchiseId, model.pricingModelId, franchiseId, 'normal', 'old');
  initial = { ...initial, ...withTemporaryPricingSnapshot(saved.pricing, () => MasterPricingEngine.calculateCompleteProposal(initial)) };
  (window as any).initialWasteProposal = clone(initial);
  (window as any).testMissingRevision = () => loadPricingSnapshotForExistingProposal(franchiseId, model.pricingModelId, franchiseId, 'normal', 'missing');
  const comparison = await buildPricingRevisionComparison(initial);
  (window as any).testPricingDecisionIsolation = async () => {
    const proposals = new Map([
      ['A', { ...clone(initial), proposalNumber: 'PRICING-A' }],
      ['B', { ...clone(initial), proposalNumber: 'PRICING-B' }],
    ]);
    proposals.set('A', clone(await upgradeProposalPricingRevision(proposals.get('A')!, comparison!)));
    proposals.set('B', clone(markPricingRevisionDeclined(proposals.get('B')!, comparison!)));
    const a = clone(proposals.get('A'));
    const b = clone(proposals.get('B'));
    const aSnapshot = await loadPricingSnapshotForExistingProposal(franchiseId, model.pricingModelId, franchiseId, 'normal', a.pricingModelRevisionId);
    const bSnapshot = await loadPricingSnapshotForExistingProposal(franchiseId, model.pricingModelId, franchiseId, 'normal', b.pricingModelRevisionId);
    return {
      a: { revision: a.pricingModelRevisionId, decision: a.pricingRevisionReview?.decision, snapshotRevision: aSnapshot.pricingModelRevisionId },
      b: { revision: b.pricingModelRevisionId, decision: b.pricingRevisionReview?.decision, snapshotRevision: bSnapshot.pricingModelRevisionId },
    };
  };
  function Review() {
    const [proposal, setProposal] = useState(initial);
    const [step, setStep] = useState('prompt');
    (window as any).wasteProposal = proposal;
    return <>
      <div data-testid="revision">{proposal.pricingModelRevisionId}</div>
      <div data-testid="decision">{proposal.pricingRevisionReview?.decision || 'none'}</div>
      <PricingRevisionPromptModal isOpen={step === 'prompt'} pricingModelName={model.pricingModelName} onCompare={() => setStep('comparison')} />
      <PricingRevisionComparisonModal isOpen={step === 'comparison'} comparison={comparison}
        onClose={() => setStep('prompt')}
        onDecline={() => { setProposal(markPricingRevisionDeclined(proposal, comparison!)); setStep('done'); }}
        onConfirm={async () => { setProposal(await upgradeProposalPricingRevision(proposal, comparison!)); setStep('done'); }} />
    </>;
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    new URLSearchParams(location.search).has('review') ? <Review /> : <PricingDataModal franchiseId={franchiseId} onClose={() => undefined} />
  );
}
void mount();
