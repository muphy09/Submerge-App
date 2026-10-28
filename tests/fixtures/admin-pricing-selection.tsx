import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import '../../src/index.css';

const franchiseId = 'admin-pricing-selection-fixture';
const models = [
  { id: 'active-model', name: 'Active model', isDefault: true, version: 'v1' },
  { id: 'chosen-model', name: 'Chosen model', isDefault: false, version: 'v1' },
];
Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
(window as any).pricingLoads = [];
(window as any).electron = {
  listPricingModels: async () => models,
  listProposals: async () => [],
  listFranchiseUsers: async () => [],
  loadPricingModel: async (payload: any) => {
    (window as any).pricingLoads.push(payload.pricingModelId || 'default');
    const model = models.find(model => model.id === payload.pricingModelId) || models[0];
    return { franchiseId, pricingModelId: model.id, pricingModelName: model.name,
      isDefault: model.isDefault, version: model.version,
      pricing: { misc: { taxRate: model.isDefault ? 0.01 : 0.09 } } };
  },
};

async function mount() {
  const [{ default: AdminPanelPage }, { default: AdminPricingPage }] = await Promise.all([
    import('../../src/pages/AdminPanelPage'), import('../../src/pages/AdminPricingPage'),
  ]);
  function Fixture() {
    const navigate = useNavigate();
    return <Routes>
      <Route path="/admin" element={<AdminPanelPage session={{ franchiseId, role: 'admin' }}
        onOpenPricingData={modelId => navigate(modelId ? `/admin/pricing?model=${encodeURIComponent(modelId)}` : '/admin/pricing')} />} />
      <Route path="/admin/pricing" element={<AdminPricingPage franchiseId={franchiseId} />} />
    </Routes>;
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(<HashRouter><Fixture /></HashRouter>);
}
void mount();
