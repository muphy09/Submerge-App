import React from 'react';
import ReactDOM from 'react-dom/client';
import { BreakdownCostExportPage, BreakdownWarrantyExportPages } from '../../src/components/BreakdownExportPages';
import useGlobalModalScrollLock from '../../src/hooks/useGlobalModalScrollLock';
import { getDefaultProposal } from '../../src/utils/proposalDefaults';
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
(window as any).breakdownFixture = {
  unchanged: () => JSON.stringify(proposal) === original,
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
        {mode !== 'warranty' && <div className="export-breakdown-page export-breakdown-page--cost">
          <BreakdownCostExportPage costBreakdown={proposal.costBreakdown!} customerName={proposal.customerInfo.customerName} proposal={proposal} />
        </div>}
        {mode !== 'cost' && <BreakdownWarrantyExportPages proposal={proposal} />}
      </div>
    </div></div>
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Fixture />);
