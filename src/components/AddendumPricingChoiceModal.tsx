import type { PricingRevisionComparison } from '../services/pricingRevisionReview';
import './PricingRevisionComparisonModal.css';

type Props = {
  isOpen: boolean;
  comparison: PricingRevisionComparison | null;
  busy?: boolean;
  onUseUpdated: () => void;
  onUseOriginal: () => void;
  onCancel: () => void;
};

export default function AddendumPricingChoiceModal({
  isOpen,
  comparison,
  busy = false,
  onUseUpdated,
  onUseOriginal,
  onCancel,
}: Props) {
  if (!isOpen || !comparison) return null;
  return (
    <div className="pricing-revision-backdrop" role="dialog" aria-modal="true" aria-labelledby="addendum-pricing-title">
      <div className="pricing-revision-modal">
        <header className="pricing-revision-header">
          <div>
            <p className="pricing-revision-kicker">Addendum Pricing</p>
            <h2 id="addendum-pricing-title">
              The Pricing Model used when the Proposal was signed has since been modified by your Admin. Create this Addendum based on the new model?
            </h2>
            <p>
              {comparison.pricingModelName}: Revision {comparison.pinnedRevisionNumber || 'Original'} to Revision{' '}
              {comparison.latestRevisionNumber || 'Latest'}
            </p>
          </div>
        </header>
        <footer className="pricing-revision-actions">
          <button type="button" className="pricing-revision-btn is-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="pricing-revision-btn is-secondary" onClick={onUseOriginal} disabled={busy}>
            No, use the original model
          </button>
          <button type="button" className="pricing-revision-btn is-primary" onClick={onUseUpdated} disabled={busy}>
            Yes, use the updated model
          </button>
        </footer>
      </div>
    </div>
  );
}
