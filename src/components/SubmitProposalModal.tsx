import { TooltipAnchor } from './AppTooltip';
import './SubmitProposalModal.css';

type SubmitProposalVersionOption = {
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
};

type SubmitProposalModalProps = {
  isOpen: boolean;
  kicker?: string;
  title?: string;
  versionName?: string;
  versionOptions?: SubmitProposalVersionOption[];
  selectedVersionId?: string | null;
  versionFieldLabel?: string;
  isAddendum?: boolean;
  willAutoApprove?: boolean;
  messages?: string[];
  confirmLabel?: string;
  submittingLabel?: string;
  allowManualReview?: boolean;
  manualReviewRequested?: boolean;
  note: string;
  isSubmitting?: boolean;
  confirmDisabled?: boolean;
  confirmDisabledReason?: string;
  onVersionChange?: (value: string) => void;
  onNoteChange: (value: string) => void;
  onManualReviewToggle: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function SubmitProposalModal({
  isOpen,
  kicker = 'Submission Review',
  title,
  versionName,
  versionOptions,
  selectedVersionId,
  versionFieldLabel = 'Proposal Version',
  isAddendum = false,
  willAutoApprove = false,
  messages,
  confirmLabel,
  submittingLabel = 'Submitting...',
  allowManualReview = true,
  manualReviewRequested = false,
  note,
  isSubmitting = false,
  confirmDisabled = false,
  confirmDisabledReason,
  onVersionChange,
  onNoteChange,
  onManualReviewToggle,
  onCancel,
  onConfirm,
}: SubmitProposalModalProps) {
  if (!isOpen) return null;

  const trimmedVersionName = String(versionName || '').trim() || 'this version';
  const selectedOption =
    versionOptions?.find((option) => option.id === selectedVersionId) || null;
  const selectedOptionDisabled = selectedOption?.disabled === true;
  const resolvedConfirmDisabled = confirmDisabled || selectedOptionDisabled;
  const resolvedConfirmDisabledReason = selectedOptionDisabled
    ? selectedOption?.detail || 'Choose a different version to continue.'
    : confirmDisabledReason;
  const resolvedMessages =
    messages ||
    [
      willAutoApprove
        ? 'This Proposal will be automatically Approved, based on your Admin settings.'
        : 'This Proposal version will be sent for Approval.',
      'This Proposal version will remain editable after submission. If more changes are made, it must be submitted again before it can be marked as signed.',
      isAddendum
        ? 'The current signed proposal remains in effect until this addendum is approved if needed and marked as signed.'
        : 'Other proposal versions will stay available until one proposal version is marked as signed.',
    ];
  const resolvedTitle =
    title || (isAddendum ? `Submit ${trimmedVersionName} as a Proposal Addendum?` : `Submit ${trimmedVersionName}?`);

  return (
    <div className="submit-proposal-backdrop" role="dialog" aria-modal="true" aria-labelledby="submit-proposal-title">
      <div className="submit-proposal-modal">
        <div className="submit-proposal-header">
          <p className="submit-proposal-kicker">{kicker}</p>
          <h2 id="submit-proposal-title">{resolvedTitle}</h2>
        </div>

        <div className="submit-proposal-body">
          {versionOptions && versionOptions.length > 0 && (
            <div className="submit-proposal-version-group">
              <span className="submit-proposal-field-label">{versionFieldLabel}</span>
              <div className="submit-proposal-version-list" role="radiogroup" aria-label={versionFieldLabel}>
                {versionOptions.map((option) => (
                  <label
                    key={option.id}
                    className={`submit-proposal-version-option${
                      selectedVersionId === option.id ? ' is-selected' : ''
                    }${option.disabled ? ' is-disabled' : ''}`}
                  >
                    <input
                      type="radio"
                      name="submit-proposal-version"
                      value={option.id}
                      checked={selectedVersionId === option.id}
                      disabled={option.disabled || !onVersionChange}
                      onChange={(event) => onVersionChange?.(event.target.value)}
                    />
                    <span className="submit-proposal-version-copy">
                      <span className="submit-proposal-version-label">{option.label}</span>
                      {option.detail && <span className="submit-proposal-version-detail">{option.detail}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {resolvedMessages.map((message, index) => (
            <p key={`${message}-${index}`} className="submit-proposal-message">
              {message}
            </p>
          ))}

          {allowManualReview && manualReviewRequested && (
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
          {allowManualReview && (
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
          )}
          <TooltipAnchor tooltip={resolvedConfirmDisabledReason}>
            <button
              type="button"
              className="submit-proposal-button submit-proposal-button--primary"
              onClick={onConfirm}
              disabled={isSubmitting || resolvedConfirmDisabled}
            >
              {isSubmitting ? submittingLabel : confirmLabel || (isAddendum ? 'Submit Addendum' : 'Submit Proposal')}
            </button>
          </TooltipAnchor>
        </div>
      </div>
    </div>
  );
}

export default SubmitProposalModal;
