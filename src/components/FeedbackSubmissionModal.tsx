import './FeedbackUi.css';

type FeedbackSubmissionModalProps = {
  isOpen: boolean;
  message: string;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

function FeedbackSubmissionModal({
  isOpen,
  message,
  isSubmitting = false,
  errorMessage = null,
  onMessageChange,
  onSubmit,
  onClose,
}: FeedbackSubmissionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="feedback-modal-backdrop" onClick={onClose}>
      <div
        className="feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-submit-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="feedback-modal-header">
          <div>
            <p className="feedback-modal-kicker">Franchise Feedback</p>
            <h2 id="feedback-submit-title">Submit Feedback</h2>
          </div>
          <button
            type="button"
            className="feedback-modal-close"
            onClick={onClose}
            aria-label="Close feedback form"
            disabled={isSubmitting}
          >
            x
          </button>
        </div>
        <p className="feedback-modal-copy">
          Share any issues, feature requests, or improvements you would like to see!
        </p>
        <textarea
          className="feedback-modal-textarea"
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          placeholder="Type your message here..."
          maxLength={4000}
          disabled={isSubmitting}
        />
        <div className="feedback-modal-footer">
          <div className="feedback-modal-count">{message.trim().length}/4000</div>
          <div className="feedback-modal-actions">
            <button
              type="button"
              className="feedback-secondary-btn"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="feedback-primary-btn"
              onClick={onSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending...' : 'Send Feedback'}
            </button>
          </div>
        </div>
        {errorMessage && <div className="feedback-inline-error">{errorMessage}</div>}
      </div>
    </div>
  );
}

export default FeedbackSubmissionModal;
