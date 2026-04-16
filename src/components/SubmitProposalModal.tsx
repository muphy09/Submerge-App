import { TooltipAnchor } from './AppTooltip';
import './SubmitProposalModal.css';

type SubmitProposalModalProps = {
  isOpen: boolean;
  versionName?: string;
  isAddendum?: boolean;
  willAutoApprove?: boolean;
  manualReviewRequested?: boolean;
  note: string;
  isSubmitting?: boolean;
  confirmDisabled?: boolean;
  confirmDisabledReason?: string;
  onNoteChange: (value: string) => void;
  onManualReviewToggle: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function SubmitProposalModal({
  isOpen,
  versionName,
  isAddendum = false,
  willAutoApprove = false,
  manualReviewRequested = false,
  note,
  isSubmitting = false,
  confirmDisabled = false,
  confirmDisabledReason,
  onNoteChange,
  onManualReviewToggle,
  onCancel,
  onConfirm,
}: SubmitProposalModalProps) {
  if (!isOpen) return null;

  const trimmedVersionName = String(versionName || '').trim() || 'this version';

  return (
    <div className="submit-proposal-backdrop" role="dialog" aria-modal="true" aria-labelledby="submit-proposal-title">
      <div className="submit-proposal-modal">
        <div className="submit-proposal-header">
          <p className="submit-proposal-kicker">Submission Review</p>
          <h2 id="submit-proposal-title">
            {isAddendum ? `Add ${trimmedVersionName} as a Proposal Addendum?` : `Submit ${trimmedVersionName}?`}
          </h2>
        </div>

        <div className="submit-proposal-body">
          <p className="submit-proposal-message">
            {willAutoApprove
              ? 'This Proposal will be automatically Approved, based on your Admin settings.'
              : 'This Proposal version will be sent for Approval.'}
          </p>
          <p className="submit-proposal-message">
            This Proposal version will remain editable after submission. If more changes are made, it must be submitted again before it can be marked as signed.
          </p>
          {isAddendum ? (
            <p className="submit-proposal-message">
              The current signed proposal remains in effect until this addendum is approved if needed and marked as signed.
            </p>
          ) : (
            <p className="submit-proposal-message">
              Other proposal versions will stay available until one proposal version is marked as signed.
            </p>
          )}

          {manualReviewRequested && (
            <label className="submit-proposal-note">
              <span>Message for reviewer</span>
              <textarea
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
                placeholder="Add context for the Book Keeper / Admin"
                disabled={isSubmitting}
                rows={5}
              />
            </label>
          )}
        </div>

        <div className="submit-proposal-actions">
          <button type="button" className="submit-proposal-button submit-proposal-button--ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            type="button"
            className={`submit-proposal-button submit-proposal-button--manual-review${
              manualReviewRequested ? ' is-active' : ''
            }`}
            onClick={onManualReviewToggle}
            disabled={isSubmitting}
            aria-pressed={manualReviewRequested}
          >
            Mark for Manual Review
          </button>
          <TooltipAnchor tooltip={confirmDisabledReason}>
            <button
              type="button"
              className="submit-proposal-button submit-proposal-button--primary"
              onClick={onConfirm}
              disabled={isSubmitting || confirmDisabled}
            >
              {isSubmitting ? 'Submitting...' : isAddendum ? 'Submit Addendum' : 'Submit Proposal'}
            </button>
          </TooltipAnchor>
        </div>
      </div>
    </div>
  );
}

export default SubmitProposalModal;
