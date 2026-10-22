import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import ProposalView from '../../src/pages/ProposalView';
import ProposalForm from '../../src/pages/ProposalForm';
import { ToastProvider } from '../../src/components/Toast';
import { getDefaultProposal } from '../../src/utils/proposalDefaults';
import { checkProposalContractRevision, adoptContractRevision, declineContractRevision, prefetchWestContractRevisions } from '../../src/services/contractTemplateRegistry';
import { getEditableContractFields } from '../../src/services/contractGenerator';
import { getActivePricingModelMeta, initPricingDataStore } from '../../src/services/pricingDataStore';
import { getPricingDataSnapshot } from '../../src/services/pricingDataStore';
import MasterPricingEngine from '../../src/services/masterPricingEngine';
import { calculateProposalRetailAdjustmentDraft } from '../../src/utils/proposalPricingPersistence';
import '../../src/index.css';

const fixture = (window as any).contractFixture;
const proposal = {
  ...getDefaultProposal(),
  ...fixture.proposal,
  customerInfo: { ...getDefaultProposal().customerInfo, ...fixture.proposal.customerInfo },
  excavation: { ...getDefaultProposal().excavation, ...fixture.proposal.excavation },
  equipment: { ...getDefaultProposal().equipment, ...fixture.proposal.equipment },
  pricing: { ...getDefaultProposal().pricing, ...fixture.proposal.pricing },
  versions: [],
};
fixture.proposal = proposal;
if (fixture.retailDraft) {
  proposal.excavation.customOptions = [{ name: 'Preview baseline', description: 'Isolated pricing test', laborCost: 30000, materialCost: 0, totalCost: 30000, isOffContract: false }];
  Object.assign(proposal, MasterPricingEngine.calculateCompleteProposal(proposal));
  if (fixture.retailDraft === 'protected') {
    proposal.historicalPricingAdjustment = -4940;
    Object.assign(proposal, MasterPricingEngine.calculateCompleteProposal(proposal));
  }
  if (fixture.retailDraft === 'historical') {
    delete (proposal as any).pricingEngineVersion;
    proposal.pricing.retailPrice += 500;
    proposal.totalCost = proposal.pricing.retailPrice;
    proposal.pricing = calculateProposalRetailAdjustmentDraft({
      proposal, retailAdjustments: proposal.retailAdjustments,
      pricingSnapshot: getPricingDataSnapshot(), mergeWithDefaults: (value) => value,
    }).pricing;
  }
}
fixture.expectedRetailDraft = (amount: number) => calculateProposalRetailAdjustmentDraft({
  proposal: structuredClone(storedProposals.get(proposal.proposalNumber)),
  retailAdjustments: [{ name: '', amount }, { name: '', amount: 0 }],
  pricingSnapshot: getPricingDataSnapshot(),
  mergeWithDefaults: (value) => value,
});
if (fixture.multiVersionSubmittedOffContract) {
  // Synthetic regression modeled on a submitted West proposal with seven versions.
  Object.assign(proposal, {
    versionId: 'submitted-decking', activeVersionId: 'submitted-decking',
    versionName: 'Submitted Off-Contract Decking', isOriginalVersion: false,
    totalCost: 130000.00051874999,
    pricing: { ...proposal.pricing, retailPrice: 130000.00051874999, offContractTotal: 17074.20051875 },
    contractOverrides: { p1_7: '$130,000.00' },
    workflow: {
      ...proposal.workflow,
      reviewVersionId: 'submitted-decking', submittedVersionId: 'submitted-decking',
      history: [{ id: 'submitted-decking-event', type: 'submitted', versionId: 'submitted-decking', createdAt: '2026-09-20T00:00:00.000Z' }],
    },
  });
  proposal.versions = Array.from({ length: 6 }, (_, index) => ({
    ...structuredClone(proposal),
    versionId: index === 0 ? 'original' : `sibling-${index}`,
    versionName: index === 0 ? 'Original Version' : `Sibling ${index}`,
    isOriginalVersion: index === 0, status: 'draft', versionSubmittedAt: null,
    totalCost: index === 1 ? 131958.20051875 : 143260,
    pricing: { ...proposal.pricing, retailPrice: index === 1 ? 131958.20051875 : 143260, offContractTotal: index === 1 ? 17074.20051875 : 0 },
    excavation: { ...proposal.excavation, customOptions: [] },
    workflow: undefined, versions: [],
  })) as any;
}
fixture.saved = [];
const storedProposals = new Map<string, any>([[proposal.proposalNumber, structuredClone(proposal)]]);
if (fixture.secondProposalNumber) {
  storedProposals.set(fixture.secondProposalNumber, {
    ...structuredClone(proposal),
    proposalNumber: fixture.secondProposalNumber,
    customerInfo: { ...proposal.customerInfo, customerName: 'SECOND CONTRACT TEST' },
  });
}
fixture.storedProposals = storedProposals;
(window as any).electron = {
  getProposal: async (number: string) => structuredClone(storedProposals.get(number) || null),
  saveProposal: async (value: any) => {
    const saved = structuredClone(value);
    fixture.saved.push(saved);
    storedProposals.set(saved.proposalNumber, saved);
    return 1;
  },
  loadPricingModel: async () => null,
  listPricingModels: async () => [],
  getSetting: async () => null,
  getFranchiseSetting: async () => null,
  setSetting: async () => undefined,
};
fixture.check = async (overrides: any = {}) => {
  const input = { ...proposal, ...overrides };
  const before = JSON.stringify(input);
  const check = await checkProposalContractRevision(input);
  return {
    check,
    unchanged: before === JSON.stringify(input),
    adopted: check ? adoptContractRevision(input, check.pinned) : null,
  };
};
fixture.returnValues = async (overrides: any = {}) => {
  const input = { ...proposal, ...overrides };
  const check = await checkProposalContractRevision(input);
  if (!check) return null;
  const readValue = async (template: typeof check.pinned.contractTemplate) =>
    (await getEditableContractFields(input, input.contractOverrides, undefined, template))
      .find((field) => field.id === 'p1_36')?.value;
  return {
    pinned: await readValue(check.pinned.contractTemplate),
    latest: await readValue(check.latest.contractTemplate),
    changeNotes: check.changeNotes,
    requiresReview: check.requiresReview,
    afterDeclineRequiresReview: (
      await checkProposalContractRevision(declineContractRevision(input, check.pinned, check.latest))
    )?.requiresReview,
  };
};
fixture.pricingMeta = getActivePricingModelMeta;
fixture.activateOtherPricing = (modelId: string, revisionId: string) => initPricingDataStore(
  proposal.franchiseId, modelId, proposal.pricingModelFranchiseId, 'normal', revisionId
);
fixture.timingChecks = async (overrides: any = {}, render = false) => {
  const input = { ...proposal, ...overrides };
  const check = await checkProposalContractRevision(input);
  if (!check) throw new Error('Missing timing test contract');
  const fields = await getEditableContractFields(input, input.contractOverrides, undefined, check.pinned.contractTemplate);
  const { createVersionFromProposal, applyActiveVersion, upsertVersionInContainer } = await import('../../src/utils/proposalVersions');
  const versions = await Promise.all(['scratch', 'copy'].map(async (mode) => {
    const created = createVersionFromProposal(input, { mode } as any);
    const reloaded = applyActiveVersion(JSON.parse(JSON.stringify(upsertVersionInContainer(
      created.container, created.newVersion, created.newVersion.versionId
    ))));
    const versionCheck = await checkProposalContractRevision(reloaded);
    return { mode, marker: reloaded.westConstructionTimingVersion || null,
      dateFieldCount: versionCheck?.pinned.contractTemplate.fields.filter((field) => ['p1_8', 'p1_9'].includes(field.id)).length };
  }));
  const result: any = {
    dateFields: fields.filter((field) => ['p1_8', 'p1_9'].includes(field.id)),
    patches: check.pinned.contractTemplate.staticPatches,
    requiresReview: check.requiresReview,
    revisionId: check.pinned.revisionId,
    versions,
  };
  if (!render) return result;

  const [{ buildContractPdf }, { PDFDocument }, { getDocument, GlobalWorkerOptions }] = await Promise.all([
    import('../../src/services/contractPdf'), import('pdf-lib'), import('pdfjs-dist'),
  ]);
  GlobalWorkerOptions.workerSrc = pdfWorker;
  const legacy = await checkProposalContractRevision({ ...input, westConstructionTimingVersion: undefined });
  if (!legacy) throw new Error('Missing legacy timing test contract');
  const oldTemplate = legacy.pinned.contractTemplate;
  const oldFields = await getEditableContractFields(input, input.contractOverrides, undefined, oldTemplate);
  const otherOldFields = oldFields.filter((field) => !['p1_8', 'p1_9'].includes(field.id));
  result.otherFieldDifferences = fields.flatMap((field, index) =>
    JSON.stringify(field) === JSON.stringify(otherOldFields[index]) ? [] : [{ before: otherOldFields[index], after: field }]);
  const file = `NEW 2026 Contract ${input.customerInfo.state} ${input.poolSpecs.poolType === 'fiberglass' ? 'Fiberglass' : 'Shotcrete'}.pdf`;
  const pdfUrl = `/docs/Contracts/${encodeURIComponent(file)}`;
  const template = { ...check.pinned.contractTemplate, pdfUrl };
  const after = await buildContractPdf(fields, { template, flatten: true });
  const before = await buildContractPdf(oldFields, { template: { ...oldTemplate, pdfUrl }, flatten: true });
  // The editor draws HTML inputs over this PDF, rather than creating duplicate
  // AcroForm fields for cells mirrored on later pages.
  const editable = await buildContractPdf(fields, { template, includeFormFields: false });
  result.editableDateFieldNames = (await PDFDocument.load(editable.pdfBytes)).getForm().getFields()
    .map((field) => field.getName()).filter((id) => ['p1_8', 'p1_9'].includes(id));
  result.flattenedFields = (await PDFDocument.load(after.pdfBytes)).getForm().getFields().length;
  const oldDoc = await getDocument({ data: before.pdfBytes }).promise;
  const newDoc = await getDocument({ data: after.pdfBytes }).promise;
  try {
    result.pageCount = newDoc.numPages;
    result.changedPixelsOutsideTiming = 0;
    result.changedPixelsInsideTiming = 0;
    const patch = template.staticPatches[template.staticPatches.length - 1];
    for (let pageNumber = 1; pageNumber <= newDoc.numPages; pageNumber += 1) {
      const oldPage = await oldDoc.getPage(pageNumber);
      const newPage = await newDoc.getPage(pageNumber);
      const viewport = newPage.getViewport({ scale: 2 });
      const canvases = await Promise.all([oldPage, newPage].map(async (pdfPage) => {
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const canvasContext = canvas.getContext('2d')!;
        await pdfPage.render({ canvas, canvasContext, viewport }).promise;
        return canvas;
      }));
      const [oldPixels, newPixels] = canvases.map((canvas) => canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data);
      for (let index = 0; index < oldPixels.length; index += 4) {
        if (oldPixels[index] === newPixels[index] && oldPixels[index + 1] === newPixels[index + 1] && oldPixels[index + 2] === newPixels[index + 2]) continue;
        const x = ((index / 4) % canvases[0].width) / 2;
        const y = Math.floor(index / 4 / canvases[0].width) / 2;
        const inside = pageNumber === 1 && x >= patch.rect[0] - 1 && x <= patch.rect[0] + patch.rect[2] + 1 &&
          y >= 792 - patch.rect[1] - patch.rect[3] - 1 && y <= 792 - patch.rect[1] + 1;
        if (inside) result.changedPixelsInsideTiming += 1;
        else result.changedPixelsOutsideTiming += 1;
      }
      if (pageNumber === 1) {
        result.image = canvases[1].toDataURL('image/png').split(',')[1];
        result.text = (await newPage.getTextContent()).items.map((item: any) => item.str || '').join('\n');
      }
    }
  } finally { await oldDoc.destroy(); await newDoc.destroy(); }
  return result;
};
fixture.diggingChecks = async () => {
  const [{ default: pricingData }, { default: Engine }, { getContractTemplate },
    { syncAdditionalDiggingFromContract }, { sanitizeEditableProposalVersions },
    { calculateExcavationPriceImpact }, { buildContractPdf }, { PDFDocument }] = await Promise.all([
    import('../../src/services/pricingData'), import('../../src/services/masterPricingEngine'),
    import('../../src/services/contractTemplates'), import('../../src/utils/additionalDigging'),
    import('../../src/utils/proposalSelectionSanitizer'), import('../../src/services/priceImpact'),
    import('../../src/services/contractPdf'), import('pdf-lib'),
  ]);
  const previousRate = pricingData.excavation.additionalDiggingPerDay;
  try {
    const results = [];
    for (const code of ['5555', '9724']) {
      for (const templateId of ['nc-gunite', 'sc-gunite', 'nc-fiberglass', 'sc-fiberglass'] as const) {
        const input = getDefaultProposal();
        input.designerCode = code;
        input.franchiseId = code === '9724' ? 'aa414a3a-f9b2-4c96-b3c0-8ea496105354' : 'playwright-west';
        input.poolSpecs = { ...input.poolSpecs, poolType: templateId.includes('fiberglass') ? 'fiberglass' : 'shotcrete',
          surfaceArea: 500, perimeter: 100, maxLength: 25, maxWidth: 20, shallowDepth: 3, endDepth: 6 };
        pricingData.excavation.additionalDiggingPerDay = 0;
        const before = JSON.stringify(input);
        const base = Engine.calculateCompleteProposal(input);
        input.excavation = { ...input.excavation, hasAdditionalDigging: true, additionalDiggingDays: 2 };
        const selected = Engine.calculateCompleteProposal(input);
        const template = { ...getContractTemplate(templateId), pdfUrl: 'http://127.0.0.1:54321/storage/v1/object/sign/fixture.pdf' };
        const fields = await getEditableContractFields(input, {}, templateId, template);
        const pdf = await buildContractPdf(fields.filter((field) => field.page === 1), { template });
        const document = await PDFDocument.load(pdf.pdfBytes);
        pricingData.excavation.additionalDiggingPerDay = 350;
        const charged = Engine.calculateCompleteProposal(input);
        const impact = calculateExcavationPriceImpact({ proposal: input, target: { kind: 'additionalDigging' } });
        const manual = syncAdditionalDiggingFromContract({ ...input, contractOverrides: { p1_30: '4', p1_7: '$123' } });
        const signed = { ...input, status: 'signed' as const, versionLocked: true, contractOverrides: { p1_30: '4' } };
        const signedBefore = JSON.stringify(signed);
        const signedAfter = sanitizeEditableProposalVersions(signed);
        results.push({ code, templateId, zeroPriceChange: selected.pricing.retailPrice - base.pricing.retailPrice,
          field: fields.find((field) => field.id === 'p1_30')?.value,
          pdfField: document.getForm().getTextField('p1_30').getText(),
          charge: charged.costBreakdown.excavation.find((line) => line.description === 'Additional Digging (Days)'),
          impact: impact.costChangeBeforeOverhead, manual: manual.excavation, manualOverrides: manual.contractOverrides,
          signedUnchanged: JSON.stringify(signedAfter) === signedBefore,
          baseUnchanged: before === JSON.stringify({ ...input, excavation: getDefaultProposal().excavation }),
        });
      }
    }
    return results;
  } finally { pricingData.excavation.additionalDiggingPerDay = previousRate; }
};
fixture.prefetchWest = () => prefetchWestContractRevisions(proposal.franchiseId === 'default' ? proposal.pricingModelFranchiseId : proposal.franchiseId);

function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  fixture.navigateTo = (number: string) => navigate(`/proposal/view/${number}`);
  fixture.navigateToEditor = (number: string) => navigate(`/proposal/edit/${number}`);
  fixture.navigateToNewProposal = () => navigate('/proposal/new');
  fixture.selectVersion = (versionId: string) => navigate(`/proposal/view/${proposal.proposalNumber}`, { state: { versionId } });
  return <>
    <span data-testid="fixture-route" hidden>{location.pathname}</span>
    <button onClick={() => navigate(`/proposal/view/${proposal.proposalNumber}`)}>Go to test summary</button>
    {fixture.secondProposalNumber && <button onClick={() => navigate(`/proposal/view/${fixture.secondProposalNumber}`)}>Go to second proposal</button>}
  </>;
}

function FixtureRoutes() {
  const [mountId, setMountId] = useState(0);
  fixture.remountSummary = () => setMountId((current) => current + 1);
  return <Routes key={mountId}>
    <Route path="/proposal/view/:proposalNumber" element={<ProposalView />} />
    <Route path="/proposal/edit/:proposalNumber" element={<ProposalForm />} />
    <Route path="/proposal/new" element={<ProposalForm />} />
  </Routes>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <MemoryRouter initialEntries={[`/proposal/${fixture.edit ? 'edit' : 'view'}/${proposal.proposalNumber}`]}>
        <Navigation />
        <FixtureRoutes />
      </MemoryRouter>
    </ToastProvider>
  </React.StrictMode>
);
