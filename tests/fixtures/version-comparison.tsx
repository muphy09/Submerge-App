import { TooltipAnchor } from '../../src/components/AppTooltip';
import ProposalVersionsHeader from '../../src/components/ProposalVersionsHeader';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import VersionComparisonModal from '../../src/components/VersionComparisonModal';
import { getDefaultProposal } from '../../src/utils/proposalDefaults';
import MasterPricingEngine from '../../src/services/masterPricingEngine';
import { getPricingDataSnapshot } from '../../src/services/pricingDataStore';
import { proposalCacheEnvironment } from '../../src/services/proposalContext';
import '../../src/index.css';
import '../../src/pages/ProposalView.css';
import '../../src/styles/sharedButtons.css';

const pricing = getPricingDataSnapshot();
localStorage.setItem(`submerge.pricingModelSnapshot.${proposalCacheEnvironment()}.fixture.model.pin`, JSON.stringify({
  franchiseId: 'fixture', pricingModelId: 'model', revisionId: 'pin', version: 'v1', pricing,
}));
const versions = Array.from({ length: new URLSearchParams(location.search).has('five') ? 5 : 3 }, (_, index) => {
  const p = getDefaultProposal();
  Object.assign(p, { versionId: `v${index}`, versionName: `Version ${index + 1}`, franchiseId: 'fixture', pricingModelId: 'model', pricingModelName: 'October 2026', pricingModelRevisionId: 'pin' });
  p.poolSpecs.surfaceArea = 400 + index * 100;
  p.poolSpecs.perimeter = 80 + index * 10;
  p.equipment.pump = { name: 'Saved Pump', model: `Model ${index}`, price: 1000 + index * 100 };
  p.equipment.pumpQuantity = index + 1;
  p.notes = index ? 'Updated notes' : 'Original notes';
  Object.assign(p, MasterPricingEngine.calculateCompleteProposal(p));
  return p;
});
(window as any).comparisonVersions = versions;
function Fixture() {
  const [open, setOpen] = useState(false);
  const [showCogs, setShowCogs] = useState(false);
  return <><h2>Versions &amp; Addendums</h2><label><input type="checkbox" aria-label="Summary Show COGS" checked={showCogs} onChange={e => setShowCogs(e.target.checked)} />Summary Show COGS</label><button onClick={() => setOpen(true)}>Compare</button>
    {open && <VersionComparisonModal versions={versions} initialBaselineId="v0" showCogs={showCogs} onShowCogsChange={setShowCogs} onClose={() => setOpen(false)} />}</>;
}
const headerMode = new URLSearchParams(location.search).get('header');
createRoot(document.getElementById('root')!).render(headerMode ? <div className="proposal-view" style={{ padding: 24 }}><div className="proposal-side-card proposal-nav-card" style={{ width: 340 }}>
  <ProposalVersionsHeader count={2} canCompare onCompare={() => {}} buildAction={headerMode === 'owner' ? <TooltipAnchor tooltip="Create a new version inside this proposal tree" className="proposal-nav-build-action"><button className="action-button action-button-version proposal-nav-build-button">Build Another Version</button></TooltipAnchor> : undefined} />
</div></div> : <Fixture />);
