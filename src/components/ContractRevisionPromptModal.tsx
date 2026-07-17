import './PricingRevisionComparisonModal.css';

type ContractRevisionPromptModalProps = {
  isOpen: boolean;
  currentRevision?: number | null;
  latestRevision?: number | null;
  busy?: boolean;
  error?: string | null;
  previewOnly?: boolean;
  onUpgrade: () => void;
  onKeepCurrent: () => void;
  onClose: () => void;
};

export default function ContractRevisionPromptModal({
  isOpen,
  currentRevision,
  latestRevision,
  busy = false,
  error,
  previewOnly = false,
  onUpgrade,
  onKeepCurrent,
  onClose,
}: ContractRevisionPromptModalProps) {
  if (!isOpen) return null;
  return (
    <div className="pricing-revision-backdrop" role="dialog" aria-modal="true" aria-labelledby="contract-revision-title">
      <div className="pricing-revision-modal">
        <header className="pricing-revision-header">
          <div>
            <p className="pricing-revision-kicker">Contract Template Update</p>
            <h2 id="contract-revision-title">
              {previewOnly
                ? 'A newer contract template is available. Which version would you like to preview?'
                : 'Your Admin has made changes to this Contract Template. Upgrade to newest Contract?'}
            </h2>
            <p>Revision {currentRevision || 'Current'} to Revision {latestRevision || 'Latest'}</p>
          </div>
          <button type="button" className="pricing-revision-close" onClick={onClose} disabled={busy} aria-label="Close">
            x
          </button>
        </header>
        {error && <div className="pricing-revision-body"><div className="pricing-revision-message is-error">{error}</div></div>}
        <footer className="pricing-revision-actions">
          <button type="button" className="pricing-revision-btn is-secondary" onClick={onKeepCurrent} disabled={busy}>
            {previewOnly ? 'View Current' : 'No'}
          </button>
          <button type="button" className="pricing-revision-btn is-primary" onClick={onUpgrade} disabled={busy}>
            {busy ? (previewOnly ? 'Opening...' : 'Saving...') : previewOnly ? 'Preview Latest' : 'Yes'}
          </button>
        </footer>
      </div>
    </div>
  );
}
