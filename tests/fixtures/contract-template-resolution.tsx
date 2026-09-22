import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import ProposalView from '../../src/pages/ProposalView';
import ProposalForm from '../../src/pages/ProposalForm';
import { ToastProvider } from '../../src/components/Toast';
import { getDefaultProposal } from '../../src/utils/proposalDefaults';
import { checkProposalContractRevision, adoptContractRevision, declineContractRevision } from '../../src/services/contractTemplateRegistry';
import { getEditableContractFields } from '../../src/services/contractGenerator';
import { getActivePricingModelMeta } from '../../src/services/pricingDataStore';
import '../../src/index.css';

const fixture = (window as any).contractFixture;
const proposal = {
  ...getDefaultProposal(),
  ...fixture.proposal,
  customerInfo: { ...getDefaultProposal().customerInfo, ...fixture.proposal.customerInfo },
  versions: [],
};
fixture.proposal = proposal;
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

function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  fixture.navigateTo = (number: string) => navigate(`/proposal/view/${number}`);
  return <>
    <span data-testid="fixture-route" hidden>{location.pathname}</span>
    <button onClick={() => navigate(`/proposal/view/${proposal.proposalNumber}`)}>Go to test summary</button>
    {fixture.secondProposalNumber && <button onClick={() => navigate(`/proposal/view/${fixture.secondProposalNumber}`)}>Go to second proposal</button>}
  </>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <MemoryRouter initialEntries={[`/proposal/${fixture.edit ? 'edit' : 'view'}/${proposal.proposalNumber}`]}>
        <Navigation />
        <Routes>
          <Route path="/proposal/view/:proposalNumber" element={<ProposalView />} />
          <Route path="/proposal/edit/:proposalNumber" element={<ProposalForm />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  </React.StrictMode>
);
