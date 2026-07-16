import type { PricingRevisionComparison } from '../services/pricingRevisionReview';
import './PricingRevisionComparisonModal.css';

type PricingRevisionComparisonModalProps = {
  isOpen: boolean;
  comparison: PricingRevisionComparison | null;
  loading?: boolean;
  error?: string | null;
  confirmLabel?: string;
  showDecline?: boolean;
  onConfirm: () => void;
  onDecline?: () => void;
  onClose: () => void;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export default function PricingRevisionComparisonModal({
  isOpen,
  comparison,
  loading = false,
  error,
  confirmLabel = 'Upgrade to newest version',
  showDecline = true,
  onConfirm,
  onDecline,
  onClose,
}: PricingRevisionComparisonModalProps) {
  if (!isOpen) return null;

  return (
    <div className="pricing-revision-backdrop" role="dialog" aria-modal="true" aria-labelledby="pricing-revision-title">
      <div className="pricing-revision-modal">
        <header className="pricing-revision-header">
          <div>
            <p className="pricing-revision-kicker">Pricing Model Update</p>
            <h2 id="pricing-revision-title">Your Admin has made changes to this Pricing Model.</h2>
            {comparison && (
              <p>
                {comparison.pricingModelName}: Revision {comparison.pinnedRevisionNumber || 'Current'} → Revision{' '}
                {comparison.latestRevisionNumber || 'Latest'}
              </p>
            )}
          </div>
          <button type="button" className="pricing-revision-close" onClick={onClose} aria-label="Close comparison">
            ×
          </button>
        </header>

        <div className="pricing-revision-body">
          {loading && <div className="pricing-revision-message">Comparing pricing revisions…</div>}
          {!loading && error && <div className="pricing-revision-message is-error">{error}</div>}
          {!loading && !error && comparison && !comparison.affectsProposal && (
            <div className="pricing-revision-message">
              The values changed by your admin do not impact this proposal.
            </div>
          )}
          {!loading && !error && comparison?.affectsProposal && (
            <div className="pricing-revision-table-wrap">
              <table className="pricing-revision-table">
                <thead>
                  <tr>
                    <th scope="col">Changed item</th>
                    <th scope="col">Before</th>
                    <th scope="col">After</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">
                        <span>{row.label}</span>
                        <small>
                          {row.category}
                          {row.quantity > 1 ? ` · Quantity ${row.quantity}` : ''}
                        </small>
                      </th>
                      <td>
                        {formatCurrency(row.beforeAmount)}
                        {row.quantity > 1 && row.beforeUnitAmount !== row.beforeAmount && (
                          <small>{formatCurrency(row.beforeUnitAmount)} each</small>
                        )}
                      </td>
                      <td className={row.direction === 'increase' ? 'is-increase' : 'is-decrease'}>
                        {formatCurrency(row.afterAmount)}
                        {row.quantity > 1 && row.afterUnitAmount !== row.afterAmount && (
                          <small>{formatCurrency(row.afterUnitAmount)} each</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="pricing-revision-derived-note">
                Only the pricing values changed directly by your admin are shown. Package, tax, and retail totals will
                be recalculated automatically if you upgrade.
              </p>
            </div>
          )}
        </div>

        <footer className="pricing-revision-actions">
          <button type="button" className="pricing-revision-btn is-secondary" onClick={onClose}>
            Cancel
          </button>
          {showDecline && onDecline && (
            <button type="button" className="pricing-revision-btn is-secondary" onClick={onDecline} disabled={loading || Boolean(error)}>
              No, keep current pricing
            </button>
          )}
          <button
            type="button"
            className="pricing-revision-btn is-primary"
            onClick={onConfirm}
            disabled={loading || Boolean(error) || !comparison}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
