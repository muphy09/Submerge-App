import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import HomePage from '../../src/pages/HomePage';
import { ToastProvider } from '../../src/components/Toast';
import { getDefaultProposal } from '../../src/utils/proposalDefaults';
import { readSession } from '../../src/services/session';
import '../../src/index.css';

const session = readSession()!;
const proposal = { ...getDefaultProposal(), proposalNumber: 'PROP-DASHBOARD-LOCAL',
  franchiseId: session.franchiseId, designerAuthUserId: session.userId,
  ownerAuthUserId: session.userId, customerInfo: { customerName: 'Local sign-in customer', state: 'NC' },
  createdDate: '2026-10-27T12:00:00Z', lastModified: '2026-10-27T12:00:00Z' };
let first = true;
(window as any).dashboardLoadStarted = false;
(window as any).resolveFirstDashboardLoad = () => {};
(window as any).electron = {
  getAllProposals: () => {
    if (!first) return Promise.resolve([structuredClone(proposal)]);
    first = false;
    (window as any).dashboardLoadStarted = true;
    return new Promise(resolve => {
      (window as any).resolveFirstDashboardLoad = () => resolve([structuredClone(proposal)]);
    });
  },
  listPricingModels: async () => [], getFranchiseSetting: async () => null,
  getSetting: async () => null,
};
ReactDOM.createRoot(document.getElementById('root')!).render(<ToastProvider><MemoryRouter>
  <HomePage session={session} />
</MemoryRouter></ToastProvider>);
