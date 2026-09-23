import './PricingRevisionComparisonModal.css';

type PricingRevisionPromptModalProps = {
  isOpen: boolean;
  pricingModelName?: string | null;
  busy?: boolean;
  specificationOnly?: boolean;
  onCompare: () => void;
  onDismiss?: () => void;
};

export default function PricingRevisionPromptModal({
  isOpen,
  pricingModelName,
  busy = false,
  specificationOnly = false,
  onCompare,
  onDismiss,
}: PricingRevisionPromptModalProps) {
  if (!isOpen) return null;
  return (
    <div className="pricing-revision-backdrop" role="dialog" aria-modal="true" aria-labelledby="pricing-update-prompt-title">
      <div className="pricing-revision-modal pricing-revision-modal--prompt">
        <header className="pricing-revision-header">
          <div>
            <p className="pricing-revision-kicker">Pricing Model Update</p>
            <h2 id="pricing-update-prompt-title">
              {specificationOnly
                ? 'This model has been updated to work with Fiberglass Dimensions'
                : 'Your Admin has made changes to this Pricing Model.'}
            </h2>
            <p>
              {specificationOnly
                ? 'Your saved proposal dimensions and pricing are unchanged. New proposals can use the manufacturer measurements added to this pricing model.'
                : `${pricingModelName || 'This pricing model'} has a newer published revision. Review the differences before choosing whether to apply it or keep your saved pricing.`}
            </p>
          </div>
        </header>
        <footer className="pricing-revision-actions pricing-revision-actions--prompt">
          <button type="button" className="pricing-revision-btn is-primary" onClick={specificationOnly ? onDismiss : onCompare} disabled={busy}>
            {specificationOnly ? 'Continue with saved proposal' : 'Compare Difference'}
          </button>
        </footer>
      </div>
    </div>
  );
}
