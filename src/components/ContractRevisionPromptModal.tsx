import './PricingRevisionComparisonModal.css';

type ContractRevisionPromptModalProps = {
  isOpen: boolean;
  currentRevision?: number | null;
  latestRevision?: number | null;
  currentTemplateName?: string;
  latestTemplateName?: string;
  changeNotes?: string[];
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
  currentTemplateName,
  latestTemplateName,
  changeNotes = [],
  busy = false,
  error,
  previewOnly = false,
  onUpgrade,
  onKeepCurrent,
  onClose,
}: ContractRevisionPromptModalProps) {
  if (!isOpen) return null;
  const templateChanged = Boolean(currentTemplateName && latestTemplateName && currentTemplateName !== latestTemplateName);
  return (
    <div className="pricing-revision-backdrop" role="dialog" aria-modal="true" aria-labelledby="contract-revision-title">
      <div className="pricing-revision-modal">
        <header className="pricing-revision-header">
          <div>
            <p className="pricing-revision-kicker">Contract Template Update</p>
            <h2 id="contract-revision-title">
              {templateChanged
                ? previewOnly
                  ? 'This proposal matches a different contract template. Which would you like to preview?'
                  : 'This proposal matches a different contract template. Use the matching template?'
                : previewOnly
                ? 'A newer contract template is available. Which version would you like to preview?'
                : 'Your Admin has made changes to this Contract Template. Upgrade to newest Contract?'}
            </h2>
            <p>
              {currentTemplateName ? `${currentTemplateName} — ` : ''}Revision {currentRevision || 'Current'}
              {' to '}
              {latestTemplateName ? `${latestTemplateName} — ` : ''}Revision {latestRevision || 'Latest'}
            </p>
          </div>
          <button type="button" className="pricing-revision-close" onClick={onClose} disabled={busy} aria-label="Close">
            x
          </button>
        </header>
        {(changeNotes.length > 0 || error) && (
          <div className="pricing-revision-body">
            {changeNotes.length === 1 ? (
              <div className="pricing-revision-message">
                {changeNotes[0]} {previewOnly
                  ? 'Preview the updated contract revision or view your current contract?'
                  : 'Apply the updated contract revision or keep your current contract?'}
              </div>
            ) : changeNotes.length > 1 ? (
              <div className="pricing-revision-message">
                <p>These changes are included in the updated contract revision:</p>
                <ul>{changeNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}</ul>
                <p>{previewOnly
                  ? 'Preview the updated contract revision or view your current contract?'
                  : 'Apply the updated contract revision or keep your current contract?'}</p>
              </div>
            ) : null}
            {error && <div className="pricing-revision-message is-error">{error}</div>}
          </div>
        )}
        <footer className="pricing-revision-actions">
          <button type="button" className="pricing-revision-btn is-secondary" onClick={onKeepCurrent} disabled={busy}>
            {previewOnly ? 'View Current' : templateChanged ? 'Keep Saved Template' : changeNotes.length ? 'Keep Current' : 'No'}
          </button>
          <button type="button" className="pricing-revision-btn is-primary" onClick={onUpgrade} disabled={busy}>
            {busy ? (previewOnly ? 'Opening...' : 'Saving...') : previewOnly ? 'Preview Latest' : templateChanged ? 'Use Matching Template' : changeNotes.length ? 'Apply Update' : 'Yes'}
          </button>
        </footer>
      </div>
    </div>
  );
}
