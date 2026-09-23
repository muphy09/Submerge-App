import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../../src/index.css';
import pricingData from '../../src/services/pricingData';
import PricingDataModal from '../../src/components/PricingDataModal';
import PricingRevisionPromptModal from '../../src/components/PricingRevisionPromptModal';
import PoolSpecsSectionNew from '../../src/components/PoolSpecsSectionNew';
import { getDefaultProposal } from '../../src/utils/proposalDefaults';
import { getPricingDataSnapshot, initPricingDataStore } from '../../src/services/pricingDataStore';
import { PoolCalculations } from '../../src/services/pricingEngineComplete';
import { buildPricingRevisionComparison } from '../../src/services/pricingRevisionReview';
import type { Proposal } from '../../src/types/proposal-new';
import { getEditableContractFields } from '../../src/services/contractGenerator';
import MasterPricingEngine from '../../src/services/masterPricingEngine';

Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const complete = {
  widthFeet: 13, widthInches: 10, lengthFeet: 32, lengthInches: 0,
  shallowDepthFeet: 3, shallowDepthInches: 6, deepDepthFeet: 6, deepDepthInches: 1,
  surfaceArea: 391, perimeter: 87, gallons: 7700, stepsAndBench: 53,
};
const spa = {
  widthFeet: 9, widthInches: 8, lengthFeet: 9, lengthInches: 8,
  shallowDepthFeet: 3, shallowDepthInches: 4, deepDepthFeet: 3, deepDepthInches: 4,
  surfaceArea: 64, perimeter: 28, gallons: 950,
};
const ledge = {
  widthFeet: 5, widthInches: 9, lengthFeet: 9, lengthInches: 8,
  shallowDepthFeet: 0, shallowDepthInches: 10, deepDepthFeet: 0, deepDepthInches: 10,
  surfaceArea: 50, perimeter: 27, gallons: 250,
};
const base = clone(pricingData) as any;
base.fiberglass.poolModels.small = [
  { name: 'Apollo 14', shellPrice: 10000, freight: 100, crane: 0, install: 100, gravel: 0, specifications: complete },
  { name: 'Hydura Lido 20XT', shellPrice: 11000, freight: 100, crane: 0, install: 100, gravel: 0 },
];
base.fiberglass.spaOptions = [{ name: 'Mystic', price: 3000, specifications: spa }];
base.fiberglass.tanningLedgeOptions = [{ name: 'Hermosa Tanning Ledge', price: 2000, specifications: ledge }];
const params = new URLSearchParams(location.search);
const franchiseId = params.get('franchise') || 'fiberglass-test';
const copy = params.has('copy');
const model: any = {
  franchiseId, pricingModelId: 'fiberglass-test-model', pricingModelName: 'Fixture Model',
  isDefault: true, version: 'fixture', revisionId: 'latest', revisionNumber: 1,
  pricing: franchiseId === 'new-franchise' && !copy ? clone(base) : clone(base),
};
let currentReviewModel: any = null;
if (franchiseId === 'new-franchise' && !copy) {
  for (const entry of model.pricing.fiberglass.poolModels.small) delete entry.specifications;
  for (const entry of model.pricing.fiberglass.spaOptions) delete entry.specifications;
  for (const entry of model.pricing.fiberglass.tanningLedgeOptions) delete entry.specifications;
}
(window as any).electron = {
  listPricingModels: async () => [{ id: model.pricingModelId, name: model.pricingModelName, isDefault: true, currentRevisionId: model.revisionId, currentRevisionNumber: model.revisionNumber }],
  listPricingModelRevisions: async () => [],
  loadPricingModel: async (request: any) => clone(request?.pricingModelId === 'review-model' ? currentReviewModel : model),
  savePricingModel: async (payload: any) => {
    model.pricing = clone(payload.pricing);
    model.revisionNumber += 1;
    model.revisionId = `saved-${model.revisionNumber}`;
    return { franchiseId, pricingModelId: model.pricingModelId, revisionId: model.revisionId, revisionNumber: model.revisionNumber };
  },
};
(window as any).getFiberglassFixturePricing = () => getPricingDataSnapshot();
(window as any).getFiberglassFixtureSavedPricing = () => model.pricing;
(window as any).testFiberglassRevisionProtection = async () => {
  const withoutSpecs = clone(base);
  for (const entry of withoutSpecs.fiberglass.poolModels.small) delete entry.specifications;
  for (const entry of withoutSpecs.fiberglass.spaOptions) delete entry.specifications;
  for (const entry of withoutSpecs.fiberglass.tanningLedgeOptions) delete entry.specifications;
  const priced = clone(withoutSpecs);
  priced.fiberglass.poolModels.small[0].shellPrice += 100;
  const pricedWithSpecs = clone(priced);
  pricedWithSpecs.fiberglass.poolModels.small[0].specifications = complete;
  pricedWithSpecs.fiberglass.spaOptions[0].specifications = spa;
  pricedWithSpecs.fiberglass.tanningLedgeOptions[0].specifications = ledge;
  const revision = (id: string, pricing: any) => ({
    franchiseId: 'review-franchise', pricingModelId: 'review-model', pricingModelName: 'Review Model',
    isDefault: true, version: 'test', revisionId: id, revisionNumber: id.charCodeAt(0) - 64, pricing,
  });
  for (const entry of [revision('A', withoutSpecs), revision('B', priced), revision('C', pricedWithSpecs)]) {
    localStorage.setItem(`submerge.pricingModelSnapshot.review-franchise.review-model.${entry.revisionId}`, JSON.stringify(entry));
  }
  const proposal = {
    ...getDefaultProposal(), franchiseId: 'review-franchise', pricingModelId: 'review-model',
    pricingModelFranchiseId: 'review-franchise', pricingModelRevisionId: 'A', pricingModelName: 'Review Model',
    poolSpecs: { ...getDefaultProposal().poolSpecs!, poolType: 'fiberglass', fiberglassSize: 'small',
      fiberglassModelName: 'Apollo 14', surfaceArea: 391, perimeter: 87, shallowDepth: 3.5,
      endDepth: 6, maxWidth: 14, maxLength: 32 },
  } as Proposal;
  currentReviewModel = revision('S', clone(base));
  const specificationOnly = await buildPricingRevisionComparison(proposal);
  const informationalNotice = await buildPricingRevisionComparison(proposal, { includeSpecificationOnly: true });
  currentReviewModel = revision('B', priced);
  const genuinePriceChange = await buildPricingRevisionComparison(proposal);
  currentReviewModel = revision('C', pricedWithSpecs);
  const declined = { ...proposal, pricingRevisionReview: {
    decision: 'declined', pricingModelId: 'review-model', baselineRevisionId: 'A', latestRevisionId: 'B',
  } } as Proposal;
  const afterDecliningPriceChange = await buildPricingRevisionComparison(declined);
  const declinedInformationalNotice = await buildPricingRevisionComparison(declined, { includeSpecificationOnly: true });
  return {
    specificationOnly: specificationOnly === null,
    informationalNotice: informationalNotice?.specificationOnly === true && informationalNotice.affectsProposal === false,
    genuinePriceChange: Boolean(genuinePriceChange),
    afterDecliningPriceChange: afterDecliningPriceChange === null,
    declinedInformationalNotice: declinedInformationalNotice?.specificationOnly === true,
  };
};
(window as any).testFiberglassContractSpaPerimeter = async () => {
  const proposal = getDefaultProposal() as Proposal;
  proposal.poolSpecs = { ...proposal.poolSpecs, fiberglassSpecAutofillEnabled: true,
    spaType: 'fiberglass', spaFiberglassModelName: 'Mystic',
    fiberglassSpaSpecifications: spa, spaPerimeter: 0 };
  const fields = await getEditableContractFields(proposal, undefined, 'fixture' as any, {
    fields: [{ id: 'p2_spa_perimeter', page: 2, rect: [0, 0, 100, 20], label: 'Spa Perimeter (lnft)' }],
  } as any);
  return fields[0]?.autoValue;
};
(window as any).testSeparateLedgeNoDeduction = () => {
  const specs = { ...getDefaultProposal().poolSpecs!, fiberglassSpecAutofillEnabled: true,
    poolType: 'fiberglass' as const, fiberglassTanningLedgeName: 'Hermosa Tanning Ledge',
    fiberglassLedgeSpecifications: ledge, hasTanningShelf: true,
    surfaceArea: 100, shallowDepth: 4, endDepth: 4 };
  return { pool: PoolCalculations.calculateGallons(specs), total: PoolCalculations.calculateWaterTruckGallons(specs) };
};
(window as any).testHistoricalGallons = () => {
  const specs = { ...getDefaultProposal().poolSpecs!, poolType: 'fiberglass' as const,
    fiberglassTanningLedgeName: 'Hermosa Tanning Ledge', fiberglassLedgeSpecifications: ledge,
    hasTanningShelf: true, surfaceArea: 100, shallowDepth: 4, endDepth: 4 };
  return PoolCalculations.calculateWaterTruckGallons(specs);
};

async function mount() {
  await initPricingDataStore(franchiseId, model.pricingModelId);
  function Builder() {
    const defaults = getDefaultProposal();
    const [poolSpecs, setPoolSpecs] = useState({ ...defaults.poolSpecs!, fiberglassSpecAutofillEnabled: true });
    const [customerInfo, setCustomerInfo] = useState(defaults.customerInfo!);
    (window as any).fiberglassFixturePoolSpecs = poolSpecs;
    (window as any).fiberglassFixtureWaterGallons = PoolCalculations.calculateWaterTruckGallons(poolSpecs);
    (window as any).fiberglassFixtureWaterTruckLine = () =>
      MasterPricingEngine.calculateCompleteProposal({ ...getDefaultProposal(), poolSpecs } as Proposal)
        .costBreakdown.waterTruck[0];
    return <PoolSpecsSectionNew data={poolSpecs} onChange={setPoolSpecs} customerInfo={customerInfo} onChangeCustomerInfo={setCustomerInfo} />;
  }
  function SpecNotice() {
    const [open, setOpen] = useState(true);
    return <PricingRevisionPromptModal
      isOpen={open}
      pricingModelName="Fixture Model"
      specificationOnly
      onCompare={() => undefined}
      onDismiss={() => setOpen(false)}
    />;
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    params.has('admin')
      ? <PricingDataModal franchiseId={franchiseId} onClose={() => undefined} />
      : params.has('specNotice') ? <SpecNotice />
      : <Builder />
  );
}
void mount();
