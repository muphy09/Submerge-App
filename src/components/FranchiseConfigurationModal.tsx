import { useEffect, useState } from 'react';
import {
  loadFranchiseConfiguration,
  publishFranchiseConfiguration,
  type FranchiseConfiguration,
  type LoadedFranchiseConfiguration,
} from '../services/franchiseConfiguration';
import './FranchiseConfigurationModal.css';

type Props = {
  franchiseId: string;
  updatedBy?: string | null;
  onClose: () => void;
};

const CAPABILITIES = [
  ['pricingRevisionReview', 'Pricing revision review'],
  ['contractTemplateLibrary', 'Contract template library'],
  ['offlineDraftRecovery', 'Offline draft recovery'],
  ['signedWorkflow', 'Signed workflow'],
  ['offContractItems', 'Off-contract items'],
  ['financingSection', 'Financing section'],
] as const;

export default function FranchiseConfigurationModal({ franchiseId, updatedBy, onClose }: Props) {
  const [loaded, setLoaded] = useState<LoadedFranchiseConfiguration | null>(null);
  const [pending, setPending] = useState<FranchiseConfiguration | null>(null);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadFranchiseConfiguration(franchiseId, { force: true })
      .then((record) => {
        if (cancelled) return;
        setLoaded(record);
        setPending({ ...record.configuration, capabilities: { ...record.configuration.capabilities } });
      })
      .catch((error: any) => {
        if (!cancelled) setStatus({ type: 'error', message: error?.message || 'Unable to load configuration.' });
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => { cancelled = true; };
  }, [franchiseId]);

  const changed = Boolean(loaded && pending && JSON.stringify(loaded.configuration) !== JSON.stringify(pending));

  const publish = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const record = await publishFranchiseConfiguration({
        franchiseId,
        configuration: pending,
        changeSummary: summary.trim() || 'Franchise configuration updated',
        publishedBy: updatedBy || null,
      });
      setLoaded(record);
      setPending({ ...record.configuration, capabilities: { ...record.configuration.capabilities } });
      setSummary('');
      setStatus({ type: 'success', message: `Configuration revision ${record.revisionNumber} published.` });
    } catch (error: any) {
      setStatus({ type: 'error', message: error?.message || 'Unable to publish configuration.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="franchise-config-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="franchise-config-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p>Franchise Configuration</p>
            <h2>Revision {loaded?.revisionNumber || 0}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        {status && <div className={`franchise-config-status is-${status.type}`}>{status.message}</div>}
        {!pending ? <div className="franchise-config-empty">Loading configuration...</div> : (
          <>
            <div className="franchise-config-grid">
              <label><span>Theme Profile</span><input value={pending.themeProfile} onChange={(e) => setPending({ ...pending, themeProfile: e.target.value })} /></label>
              <label><span>Proposal Layout</span><input value={pending.proposalLayout} onChange={(e) => setPending({ ...pending, proposalLayout: e.target.value })} /></label>
              <label><span>Location Input</span><select value={pending.locationInputMode} onChange={(e) => setPending({ ...pending, locationInputMode: e.target.value === 'county' ? 'county' : 'state' })}><option value="state">State</option><option value="county">County</option></select></label>
              <label><span>Contract Resolution</span><select value={pending.contractResolutionMode} onChange={(e) => setPending({ ...pending, contractResolutionMode: e.target.value === 'pool_type_only' ? 'pool_type_only' : 'state_and_pool_type' })}><option value="state_and_pool_type">State + Pool Type</option><option value="pool_type_only">Pool Type Only</option></select></label>
            </div>
            <div className="franchise-config-capabilities">
              {CAPABILITIES.map(([key, label]) => (
                <label key={key}><input type="checkbox" checked={pending.capabilities[key] === true} onChange={(e) => setPending({ ...pending, capabilities: { ...pending.capabilities, [key]: e.target.checked } })} /><span>{label}</span></label>
              ))}
            </div>
            <label className="franchise-config-summary"><span>Change Summary</span><input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Describe this revision" /></label>
          </>
        )}
        <footer>
          <span>Publishing creates an immutable revision for this franchise only.</span>
          <button type="button" onClick={() => void publish()} disabled={!changed || busy}>{busy ? 'Working...' : 'Publish Configuration'}</button>
        </footer>
      </div>
    </div>
  );
}
