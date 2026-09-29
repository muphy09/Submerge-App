import React from 'react';
import ReactDOM from 'react-dom/client';
import { BreakdownCostExportPage, BreakdownWarrantyExportPages } from '../../src/components/BreakdownExportPages';
import useGlobalModalScrollLock from '../../src/hooks/useGlobalModalScrollLock';
import { getDefaultProposal } from '../../src/utils/proposalDefaults';
import MaterialsOrderForm from '../../src/components/MaterialsOrderForm';
import { buildMaterialsOrderForm } from '../../src/utils/materialsOrderForm';
import pricingData from '../../src/services/pricingData';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import '../../src/index.css';
import '../../src/App.css';
import '../../src/pages/ProposalView.css';

const proposal = {
  ...getDefaultProposal(),
  franchiseId: new URLSearchParams(location.search).get('franchise') || 'playwright-west',
  customerInfo: { ...getDefaultProposal().customerInfo, customerName: 'Export Regression Customer' },
  warrantySections: Array.from({ length: 12 }, (_, index) => ({
    id: `section-${index}`, title: `Coverage section ${index + 1}`, icon: 'pool' as const,
    featureItems: Array.from({ length: 5 }, (_, item) => ({
      id: `feature-${index}-${item}`, label: `Coverage ${index + 1} item ${item + 1}`,
      detail: `Complete installation specification for section ${index + 1} item ${item + 1}.`,
    })),
    advantageItems: [{ id: `advantage-${index}`, text: `Warranty benefit ${index + 1}` }],
  })),
};
const original = JSON.stringify(proposal);
pricingData.equipment.packageOptions.push({
  id: 'pmf03-standard-automation', name: 'PMF03 Standard Automation Package', mode: 'fixed', enabled: true,
  includedPumpName: 'Jandy 1.65HP Variable Pump', includedPumpQuantity: 1,
  includedFilterName: 'CV3030 Filter', includedFilterQuantity: 1,
  includedAutomationName: 'HL Base', includedAutomationQuantity: 1,
  includedSaltSystemName: 'Included Salt Cell', includedSaltSystemQuantity: 1,
  includedPoolLightName: 'Pool Light', includedPoolLightQuantity: 1,
  includeCheckValve: true,
});
const orderProposal = {
  ...proposal,
  proposalNumber: 'ORDER-100',
  versionName: 'Original',
  poolSpecs: { ...proposal.poolSpecs, perimeter: 100, hasAutomaticCover: true },
  tileCopingDecking: { ...proposal.tileCopingDecking, tileLevel: 1 as const, copingType: 'flagstone', copingLength: 110,
    deckingType: 'paver', deckingArea: 200 },
  waterFeatures: { ...proposal.waterFeatures, selections: [{ featureId: 'wok-fire-30', quantity: 2, includeValveActuator: false }] },
  equipment: { ...proposal.equipment, packageSelectionId: 'pmf03-standard-automation', packageSelectionTouched: true,
    pump: { ...proposal.equipment.pump, name: 'Jandy 1.65HP Variable Pump' }, pumpQuantity: 1,
    filter: { ...proposal.equipment.filter, name: 'CV3030 Filter' }, filterQuantity: 1,
    automation: { ...proposal.equipment.automation, name: 'HL Base' }, automationQuantity: 1,
    saltSystem: { name: 'Included Salt Cell' }, saltSystemQuantity: 1,
    poolLights: [{ type: 'pool' as const, name: 'Pool Light' }],
    additionalFilters: [{ name: 'Extra Filter' }],
  },
  costBreakdown: { ...proposal.costBreakdown,
    stoneRockworkLabor: [{ category: 'Masonry Labor', description: '18" RBB Panel Ledge Facing', quantity: 25, unitPrice: 0, total: 0 }],
    stoneRockworkMaterial: [{ category: 'Masonry Material', description: '18" RBB Panel Ledge Facing', quantity: 28.75, unitPrice: 0, total: 0 }],
  },
};
const customOrderProposal = {
  ...orderProposal,
  equipment: { ...orderProposal.equipment, packageSelectionId: 'custom',
    pump: { ...orderProposal.equipment.pump, name: 'Custom Package Pump' },
    filter: { ...orderProposal.equipment.filter, name: 'Custom Package Filter' },
    saltSystem: { name: 'Custom Salt System' },
  },
};
const orderFixtureMode = new URLSearchParams(location.search).get('mode');
const activeOrderProposal = orderFixtureMode === 'materials-custom' ? customOrderProposal : orderProposal;
const orderData = buildMaterialsOrderForm(activeOrderProposal, activeOrderProposal.costBreakdown);
(window as any).breakdownFixture = {
  unchanged: () => JSON.stringify(proposal) === original,
  orderData: () => orderData,
  readPdf: async (bytes: number[], renderPage?: number) => {
    // Electron 29 predates Promise.withResolvers, required by the PDF test reader.
    (Promise as any).withResolvers ??= () => {
      let resolve: any, reject: any;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
    const texts = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const text = await page.getTextContent();
      texts.push(text.items.map((item: any) => item.str || '').join(' '));
      if (index === renderPage) {
        const canvas = document.createElement('canvas');
        canvas.id = 'pdf-render';
        canvas.style.cssText = 'position: relative; z-index: 2147483647; display: block;';
        const viewport = page.getViewport({ scale: 1.2 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        document.body.appendChild(canvas);
      }
    }
    return texts;
  },
};

function Fixture() {
  useGlobalModalScrollLock();
  const mode = new URLSearchParams(location.search).get('mode') || 'combined';
  return <div className="app app--with-navigation">
    <div className="app-route-shell"><div className="proposal-view">
      <div style={{ height: 1400 }}>Proposal screen behind the modal</div>
      <div className="modal-overlay" data-scroll-lock="true">Open breakdown modal</div>
      <div className="export-print-area print-mode">
        {mode.startsWith('materials') && <MaterialsOrderForm proposal={activeOrderProposal} data={orderData} />}
        {mode !== 'warranty' && !mode.startsWith('materials') && <div className="export-breakdown-page export-breakdown-page--cost">
          <BreakdownCostExportPage costBreakdown={proposal.costBreakdown!} customerName={proposal.customerInfo.customerName} proposal={proposal} />
        </div>}
        {mode !== 'cost' && !mode.startsWith('materials') && <BreakdownWarrantyExportPages proposal={proposal} />}
      </div>
    </div></div>
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Fixture />);
