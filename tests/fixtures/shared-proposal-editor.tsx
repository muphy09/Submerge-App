import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProposalForm from '../../src/pages/ProposalForm';
import ProposalView from '../../src/pages/ProposalView';
import HomePage from '../../src/pages/HomePage';
import { readSession } from '../../src/services/session';
import { ToastProvider } from '../../src/components/Toast';
import { getDefaultProposal } from '../../src/utils/proposalDefaults';
import MasterPricingEngine from '../../src/services/masterPricingEngine';
import '../../src/index.css';
import '../../src/styles/sharedButtons.css';

const proposal: any = { ...getDefaultProposal(), proposalNumber: 'PROP-SHARED-EDITOR', franchiseId: 'shared-fixture',
  designerCode: '5555', designerAuthUserId: 'owner', ownerAuthUserId: 'owner', designerName: 'Owner', designerRole: 'designer',
  contentRevision: 3, collaborationEnabled: true, pricingModelId: 'model-a', pricingModelFranchiseId: 'shared-fixture',
  pricingModelRevisionId: 'r1', pricingModelRevisionNumber: 1,
  customerInfo: { customerName: 'Shared editor test', city: 'Owner city', state: 'NC' },
  createdDate: '2026-10-27T12:00:00Z', lastModified: '2026-10-27T12:00:00Z' };
proposal.poolSpecs = { ...proposal.poolSpecs, perimeter: 100, surfaceArea: 600, shallowDepth: 3.5, endDepth: 6, maxWidth: 20, maxLength: 30, deckingArea: 600 };
proposal.pricing = { ...proposal.pricing, digCommissionRate: 0.01, closeoutCommissionRate: 0.02 };
Object.assign(proposal, MasterPricingEngine.calculateCompleteProposal(proposal));
(window as any).sharedEditorFixture = { proposal };
const normalCreation = new URLSearchParams(location.search).has('normalCreation');
(window as any).normalSavedProposals = [];
(window as any).electron = { getProposal: async (number: string) => normalCreation
  ? structuredClone((window as any).normalSavedProposals.find((value: any) => value.proposalNumber === number) || null)
  : structuredClone(proposal),
  getAllProposals: async () => normalCreation ? structuredClone((window as any).normalSavedProposals) : [structuredClone(proposal)],
  saveProposal: async (value: any) => {
    if (!normalCreation) throw Error('Owner IPC write is forbidden in this fixture');
    (window as any).normalSavedProposals.push(structuredClone(value));
    return value;
  },
  listPricingModels: async () => [], loadPricingModel: async () => null, getSetting: async () => null,
  getFranchiseSetting: async () => null, setSetting: async () => undefined };
ReactDOM.createRoot(document.getElementById('root')!).render(<ToastProvider>
  <MemoryRouter initialEntries={normalCreation ? ['/proposal/new'] : new URLSearchParams(location.search).has('summary')
    ? ['/proposal/view/PROP-SHARED-EDITOR'] : [{ pathname: '/proposal/edit/PROP-SHARED-EDITOR', state: {
    sharedWorkingCopy: true, sharedPermission: 'contribute', versionId: 'original' } }]}>
    <Routes><Route path="/proposal/new" element={<ProposalForm />} /><Route path="/proposal/edit/:proposalNumber" element={<ProposalForm />} />
      <Route path="/proposal/view/:proposalNumber" element={<ProposalView />} />
      <Route path="/" element={<HomePage session={readSession()} />} /></Routes>
  </MemoryRouter>
</ToastProvider>);
