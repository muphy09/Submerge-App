import './SubmitProposalModal.css';

type SubmitProposalModalProps = {
  isOpen: boolean;
  versionName?: string;
  note: string;
  isSubmitting?: boolean;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function SubmitProposalModal({
  isOpen,
  versionName,
  note,
  isSubmitting = false,
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
            Every proposal submission requires admin or book keeper approval before it becomes the active approved
            proposal.
          </p>
          <p className="submit-proposal-message">
            This version will lock once submitted. If there is already a pending review version, this submission will
            replace it. After approval, it becomes the next approved proposal addendum baseline.
          </p>

          <label className="submit-proposal-note">
            <span>Reviewer note</span>
            <textarea
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Add context here"
              disabled={isSubmitting}
              rows={5}
            />
          </label>
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
