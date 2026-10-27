import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../src/index.css';
import '../../src/App.css';

Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
let savedPricing: any = { pricingDefaults: { cogsOverheadRate: 0.01, targetMargin: 0.7 } };
let saveCount = 0;
(window as any).electron = {
  listPricingModels: async () => [{ id: 'fixture-model', name: 'Fixture Model', isDefault: true }],
  loadPricingModel: async () => ({ franchiseId: 'category-adjustment-fixture', pricingModelId: 'fixture-model', pricingModelName: 'Fixture Model', isDefault: true, pricing: savedPricing }),
  savePricingModel: async (payload: any) => { savedPricing = JSON.parse(JSON.stringify(payload.pricing)); saveCount++; return { pricingModelId: 'fixture-model', franchiseId: 'category-adjustment-fixture' }; },
};

async function mount() {
  const [{ default: PricingDataModal }, store, { getDefaultProposal }, { default: Engine }, { default: CostBreakdownPage }, { default: CostBreakdownView }, exports, { CogsReportDocument }, helpers] = await Promise.all([
    import('../../src/components/PricingDataModal'), import('../../src/services/pricingDataStore'), import('../../src/utils/proposalDefaults'),
    import('../../src/services/masterPricingEngine'), import('../../src/components/CostBreakdownPage'), import('../../src/components/CostBreakdownView'),
    import('../../src/components/BreakdownExportPages'), import('../../src/components/CogsReport'), import('../../src/utils/categoryAdjustments'),
  ]);
  (window as any).categoryAdjustmentFixture = {
    get: () => store.getPricingDataSnapshot().categoryAdjustments,
    saved: () => ({ pricing: savedPricing, saveCount }),
    calculate: (gasRun: number) => {
      const proposal = getDefaultProposal();
      Object.assign(proposal.poolSpecs!, { perimeter: 90, surfaceArea: 450, maxLength: 30, maxWidth: 15, shallowDepth: 3.5, endDepth: 6 });
      proposal.plumbing!.runs.gasRun = gasRun;
      return Engine.calculateCompleteProposal(proposal);
    },
  };
  const view = new URLSearchParams(location.search).get('view');
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  if (!view) {
    root.render(<PricingDataModal franchiseId="category-adjustment-fixture" initialModelId="fixture-model" onClose={() => undefined} />);
    return;
  }
  store.updatePricingValue(['categoryAdjustments'], [
    { id: 'tile-cost', title: 'Tile setup', category: 'tile', amount: 800, basis: 'cogs', mode: 'static' },
    { id: 'tile-retail', title: 'Tile courtesy discount', category: 'tile', amount: -125, basis: 'retail', mode: 'static' },
    { id: 'custom-cost', title: 'Site cost credit', category: 'customFeatures', amount: -50, basis: 'cogs', mode: 'static' },
  ]);
  const result = (window as any).categoryAdjustmentFixture.calculate(100);
  const baseline = store.withTemporaryPricingSnapshot({ ...store.getPricingDataSnapshot(), categoryAdjustments: [] }, () => (window as any).categoryAdjustmentFixture.calculate(100));
  (window as any).categoryAdjustmentReport = { result, baseline };
  const proposal = { ...getDefaultProposal(), customerInfo: { ...getDefaultProposal().customerInfo, customerName: 'Category Adjustment Customer' }, ...result };
  Object.assign(proposal.poolSpecs, { perimeter: 90, surfaceArea: 450, maxLength: 30, maxWidth: 15, shallowDepth: 3.5, endDepth: 6 });
  proposal.plumbing.runs.gasRun = 100;
  const extraBuckets: Record<string, string> = { shotcrete: 'shotcreteMaterial', tile: 'tileMaterial', copingDecking: 'copingDeckingMaterial', stoneRockwork: 'stoneRockworkMaterial' };
  const categories = helpers.CATEGORY_ADJUSTMENT_CATEGORIES.map(c => ({ name: c.label, items: [...result.costBreakdown[c.bucket], ...(result.costBreakdown[extraBuckets[c.id]] || [])] }));
  root.render(view === 'cogs' ? <CostBreakdownPage proposal={proposal} onClose={() => undefined} />
    : view === 'customer' || view === 'customer-export-layout' ? <CostBreakdownView costBreakdown={result.costBreakdown} customerName="Category Adjustment Customer" proposal={proposal} pricing={result.pricing} showWarranty={false} showZoomControl={false} exportLayout={view === 'customer-export-layout'} />
    : view === 'export' ? <exports.BreakdownCostExportPage costBreakdown={result.costBreakdown} customerName="Category Adjustment Customer" proposal={proposal} pricing={result.pricing} />
    : <CogsReportDocument categories={categories} customerName="Category Adjustment Customer" totalValue={result.pricing.totalCOGS} mode="export" />);
}
void mount();
