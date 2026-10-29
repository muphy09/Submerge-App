import { CogsReportDocument } from '../../src/components/CogsReport';
import { buildLineItemSubcategories } from '../../src/utils/costBreakdownSubcategories';
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import EquipmentSectionNew from '../../src/components/EquipmentSectionNew';
import InteriorFinishSectionNew from '../../src/components/InteriorFinishSectionNew';
import ContractView from '../../src/components/ContractView';
import { ToastProvider } from '../../src/components/Toast';
import pricingData from '../../src/services/pricingData';
import { getDefaultProposal } from '../../src/utils/proposalDefaults';
import { getEquipmentPackageOptions, createFreshEquipmentForPackage } from '../../src/utils/equipmentPackages';
import { calculateEquipmentPriceImpact, calculateInteriorFinishPriceImpact } from '../../src/services/priceImpact';
import MasterPricingEngine from '../../src/services/masterPricingEngine';
import { getEditableContractFields, buildContractSpecificationPlan } from '../../src/services/contractGenerator';
import { buildContractPdf } from '../../src/services/contractPdf';
import type { Proposal } from '../../src/types/proposal-new';
import type { ContractTemplate } from '../../src/services/contractTemplates';
import { PDFDocument } from 'pdf-lib';
import '../../src/index.css';

Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
const fixturePricing = {
  equipment: {
    addOns: [
      { id: 'e1', name: 'Equipment Fixture Add-on', cost1: 100, cost2: 50, includeByDefault: true },
      { id: 'e2', name: 'Second Equipment Add-on', cost1: 30, cost2: 20, includeByDefault: false },
    ],
    packageOptions: [
      { id: 'custom', name: 'Custom', mode: 'custom', enabled: true, basePrice: 0 },
      { id: 'allowed', name: 'Allowed Package', mode: 'fixed', enabled: true, basePrice: 1000, allowAddOns: true },
      { id: 'restricted', name: 'Restricted Package', mode: 'fixed', enabled: true, basePrice: 1000, allowAddOns: false },
    ],
  },
  interiorFinish: { addOns: [
    { id: 'i1', name: 'Finish Fixture Add-on', cost1: 200, cost2: 25, includeByDefault: true },
    { id: 'i2', name: 'Second Finish Add-on', cost1: 20, cost2: 30, includeByDefault: false },
  ] },
};
(window as any).electron = {
  listPricingModels: async () => [],
  loadPricingModel: async () => ({ franchiseId: 'add-ons-fixture', pricingModelId: 'fixture-model', pricingModelName: 'Fixture', version: 'fixture-v1', pricing: fixturePricing }),
  savePricingModel: async (payload: any) => { (window as any).savedAddOnPricing = payload.pricing; return { id: 'fixture-model', success: true }; },
};

async function mount() {
  const { default: PricingDataModal } = await import('../../src/components/PricingDataModal');
  const store = await import('../../src/services/pricingDataStore');
  await store.initPricingDataStore('add-ons-fixture');
  (window as any).getAddOnPricing = () => store.getPricingDataSnapshot();
  (window as any).saveAddOnPricing = () => store.savePricingModelSnapshot({ name: 'Fixture Pricing' });
  const query = new URLSearchParams(location.search);
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]); pdf.addPage([612, 792]);
  const templateBytes = await pdf.save();
  const templateUrl = URL.createObjectURL(new Blob([templateBytes as BlobPart], { type: 'application/pdf' }));
  const template: ContractTemplate = {
    id: 'nc-gunite', label: 'Isolated test template', pdfUrl: templateUrl, pdfPath: '', staticPatches: [],
    fields: Array.from({ length: 10 }, (_, i) => ({ id: `p2_additional_spec_${73 + i}`, page: 2,
      rect: [313, 270 + i * 18, 560, 284 + i * 18] as [number, number, number, number], label: 'Additional Specification', color: 'blue' as const })),
  };
  function Fixture() {
    const [view, setView] = useState(query.get('view') || 'equipment');
    const [proposal, setProposal] = useState<Proposal>(() => {
      const p = getDefaultProposal() as Proposal;
      Object.assign(p.poolSpecs, { maxLength: 30, maxWidth: 15, surfaceArea: 450, perimeter: 90, shallowDepth: 3.5, endDepth: 6,
        poolType: query.get('fiberglass') ? 'fiberglass' : 'gunite', fiberglassModelName: query.get('fiberglass') ? 'Fixture Shell' : undefined });
      p.equipment.packageSelectionId = 'custom'; p.equipment.packageSelectionTouched = true;
      if (query.has('overflow')) p.customFeatures.features = Array.from({ length: 42 }, (_, i) => ({ name: `Custom Feature ${i + 1}`, description: '', laborCost: 0, materialCost: 0, totalCost: 0 }));
      return p;
    });
    const calc = MasterPricingEngine.calculateCompleteProposal(proposal);
    (window as any).getAddOnProposal = () => ({ ...proposal, ...calc });
    (window as any).getContractAddOnPlan = () => buildContractSpecificationPlan(proposal);
    (window as any).buildAddOnPdf = async (flatten: boolean) => {
      const fields = await getEditableContractFields(proposal, {}, 'nc-gunite', template);
      const built = await buildContractPdf(fields, { template, flatten });
      const parsed = await PDFDocument.load(built.pdfBytes);
      const { getDocument } = await import('pdfjs-dist');
      const document = await getDocument({ data: built.pdfBytes.slice() }).promise;
      const textPages: string[] = [];
      for (let page = 1; page <= document.numPages; page += 1) {
        const content = await (await document.getPage(page)).getTextContent();
        textPages.push(content.items.map((item: any) => item.str || '').join(' '));
      }
      await document.destroy();
      return { pages: parsed.getPageCount(), textPages, fields: built.fields, values: fields.map(field => field.value),
        pdf: Array.from(built.pdfBytes) };
    };
    return <ToastProvider><nav>{['admin', 'equipment', 'interiorFinish', 'contract', 'cogs'].map(name =>
      <button key={name} onClick={() => setView(name)}>{name}</button>)}
      <button onClick={() => setProposal(JSON.parse(JSON.stringify((window as any).getAddOnProposal())))}>Save and reload</button>
    </nav>
      {view === 'admin' ? <PricingDataModal franchiseId="add-ons-fixture" onClose={() => setView('equipment')} /> :
      view === 'cogs' ? <CogsReportDocument mode="viewer" customerName="Add-ons Fixture"
        categories={[
          { name: 'Equipment Ordered', items: calc.costBreakdown.equipmentOrdered, subcategories: buildLineItemSubcategories(calc.costBreakdown.equipmentOrdered) },
          { name: 'Interior Finish', items: calc.costBreakdown.interiorFinish, subcategories: buildLineItemSubcategories(calc.costBreakdown.interiorFinish) },
        ]} totalValue={(calc.costBreakdown.totals.equipmentOrdered + calc.costBreakdown.totals.interiorFinish) * calc.pricing.overheadMultiplier}
        overheadRate={calc.pricing.overheadMultiplier - 1} /> :
      view === 'contract' ? <ContractView proposal={{ ...proposal, ...calc }} contractTemplate={template} /> :
      <main style={{ maxWidth: 1180, margin: '24px auto' }}>
        {view === 'equipment' ? <>
          <label>Fixture package<select aria-label="Fixture package" value={proposal.equipment.packageSelectionId}
            onChange={event => {
              const pkg = getEquipmentPackageOptions().find(pkg => pkg.id === event.target.value)!;
              const next = createFreshEquipmentForPackage(pkg, { hasPool: true, hasSpa: false });
              next.addOns = proposal.equipment.addOns;
              setProposal({ ...proposal, equipment: next });
            }}>{getEquipmentPackageOptions().map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}</select></label>
          <EquipmentSectionNew data={proposal.equipment} onChange={equipment => setProposal({ ...proposal, equipment })}
            onSelectPackage={() => {}} plumbingRuns={proposal.plumbing.runs} onChangePlumbingRuns={() => {}} hasPool hasSpa={false}
            priceImpactRequestKey={JSON.stringify(proposal)}
            getEquipmentPriceImpact={target => calculateEquipmentPriceImpact({ proposal, target })} />
        </> : <InteriorFinishSectionNew data={proposal.interiorFinish} onChange={interiorFinish => setProposal({ ...proposal, interiorFinish })}
          hasSpa={false} isFiberglass={proposal.poolSpecs.poolType === 'fiberglass'} priceImpactRequestKey={JSON.stringify(proposal)}
          getInteriorFinishPriceImpact={target => calculateInteriorFinishPriceImpact({ proposal, target })} />}
      </main>}
    </ToastProvider>;
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(<Fixture />);
}
void mount();
