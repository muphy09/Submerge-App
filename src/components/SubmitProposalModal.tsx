import './SubmitProposalModal.css';

type SubmitProposalModalProps = {
  isOpen: boolean;
  versionName?: string;
  manualReviewRequested: boolean;
  note: string;
  isSubmitting?: boolean;
  onManualReviewRequestedChange: (value: boolean) => void;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function SubmitProposalModal({
  isOpen,
  versionName,
  manualReviewRequested,
  note,
  isSubmitting = false,
  onManualReviewRequestedChange,
  onNoteChange,
  onCancel,
  onConfirm,
}: SubmitProposalModalProps) {
  if (!isOpen) return null;

  const trimmedVersionName = String(versionName || '').trim() || 'this version';

  return (
    <div className="submit-proposal-backdrop" role="dialog" aria-modal="true" aria-labelledby="submit-proposal-title">
      <div className="submit-proposal-modal">
        <div className="submit-proposal-header">
          <p className="submit-proposal-kicker">Submission Lock</p>
          <h2 id="submit-proposal-title">Submit {trimmedVersionName}?</h2>
        </div>

        <div className="submit-proposal-body">
          <p className="submit-proposal-message">
            Submitting this version will lock it from further edits. You can still create another version later and
            resubmit that new version before an admin or book keeper marks the proposal as completed.
          </p>
          <p className="submit-proposal-message">
            If additional changes are needed after submission, create a new version, update it, and submit that new
            version in place of the current review version.
          </p>

          <label className="submit-proposal-checkbox">
            <input
              type="checkbox"
              checked={manualReviewRequested}
              onChange={(event) => onManualReviewRequestedChange(event.target.checked)}
              disabled={isSubmitting}
            />
            <span>Attach a note for the reviewer</span>
          </label>

          {manualReviewRequested && (
            <label className="submit-proposal-note">
              <span>Submission note</span>
              <textarea
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
                placeholder="Add context here"
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
          <button type="button" className="submit-proposal-button submit-proposal-button--primary" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit Proposal'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SubmitProposalModal;
