import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import ProposalView from '../../src/pages/ProposalView';
import ProposalForm from '../../src/pages/ProposalForm';
import { ToastProvider } from '../../src/components/Toast';
import { getDefaultProposal } from '../../src/utils/proposalDefaults';
import { checkProposalContractRevision, adoptContractRevision, declineContractRevision, prefetchWestContractRevisions } from '../../src/services/contractTemplateRegistry';
import { getEditableContractFields } from '../../src/services/contractGenerator';
import { getActivePricingModelMeta } from '../../src/services/pricingDataStore';
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
fixture.prefetchWest = () => prefetchWestContractRevisions(proposal.franchiseId === 'default' ? proposal.pricingModelFranchiseId : proposal.franchiseId);

function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  fixture.navigateTo = (number: string) => navigate(`/proposal/view/${number}`);
  fixture.navigateToEditor = (number: string) => navigate(`/proposal/edit/${number}`);
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
