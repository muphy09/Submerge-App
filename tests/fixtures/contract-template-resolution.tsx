import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import ProposalView from '../../src/pages/ProposalView';
import ProposalForm from '../../src/pages/ProposalForm';
import { ToastProvider } from '../../src/components/Toast';
import { getDefaultProposal } from '../../src/utils/proposalDefaults';
import { checkProposalContractRevision, adoptContractRevision } from '../../src/services/contractTemplateRegistry';
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
(window as any).electron = {
  getProposal: async () => structuredClone(proposal),
  saveProposal: async (value: any) => { fixture.saved.push(structuredClone(value)); return 1; },
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
fixture.pricingMeta = getActivePricingModelMeta;

function Navigation() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(`/proposal/view/${proposal.proposalNumber}`)}>Go to test summary</button>;
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
