import './PricingRevisionComparisonModal.css';

type PricingRevisionPromptModalProps = {
  isOpen: boolean;
  pricingModelName?: string | null;
  busy?: boolean;
  onUpgrade: () => void;
  onDecline: () => void;
  onCompare: () => void;
};

export default function PricingRevisionPromptModal({
  isOpen,
  pricingModelName,
  busy = false,
  onUpgrade,
  onDecline,
  onCompare,
}: PricingRevisionPromptModalProps) {
  if (!isOpen) return null;
  return (
    <div className="pricing-revision-backdrop" role="dialog" aria-modal="true" aria-labelledby="pricing-update-prompt-title">
      <div className="pricing-revision-modal pricing-revision-modal--prompt">
        <header className="pricing-revision-header">
          <div>
            <p className="pricing-revision-kicker">Pricing Model Update</p>
            <h2 id="pricing-update-prompt-title">Your Admin has made changes to this Pricing Model.</h2>
            <p>
              {pricingModelName || 'This pricing model'} has a newer published revision. Upgrade to the newest version?
            </p>
          </div>
        </header>
        <footer className="pricing-revision-actions pricing-revision-actions--prompt">
          <button type="button" className="pricing-revision-btn is-secondary" onClick={onDecline} disabled={busy}>
            No, keep current pricing
          </button>
          <button type="button" className="pricing-revision-btn is-secondary" onClick={onCompare} disabled={busy}>
            Compare Difference
          </button>
          <button type="button" className="pricing-revision-btn is-primary" onClick={onUpgrade} disabled={busy}>
            {busy ? 'Updating…' : 'Yes, use newest version'}
          </button>
        </footer>
      </div>
    </div>
  );
}

