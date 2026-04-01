import type { FeedbackEntry } from '../services/feedback';
import './FeedbackUi.css';

type FeedbackReplyInboxModalProps = {
  isOpen: boolean;
  entries: FeedbackEntry[];
  acknowledgingId?: string | null;
  onAcknowledge: (feedback: FeedbackEntry) => void;
};

function formatDateTime(value?: string | null) {
  if (!value) return 'Unknown time';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown time' : parsed.toLocaleString();
}

function getResponderLabel(entries: FeedbackEntry[]) {
  const names = Array.from(
    new Set(
      entries
        .map((entry) => String(entry.resolvedByName || '').trim())
        .filter((value) => value.length > 0)
    )
  );

  if (names.length === 1) return names[0];
  if (names.length > 1) return 'the owner';
  return 'your owner';
}

function FeedbackReplyInboxModal({
  isOpen,
  entries,
  acknowledgingId = null,
  onAcknowledge,
}: FeedbackReplyInboxModalProps) {
  if (!isOpen || entries.length === 0) return null;
  const responderLabel = getResponderLabel(entries);

  return (
    <div className="feedback-modal-backdrop">
      <div
        className="feedback-modal feedback-modal--inbox"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-inbox-title"
      >
        <div className="feedback-modal-header">
          <div>
            <p className="feedback-modal-kicker">Feedback Inbox</p>
            <h2 id="feedback-inbox-title">Feedback Reply</h2>
          </div>
          <div className="feedback-inbox-count">
            {entries.length} Pending
          </div>
        </div>
        <p className="feedback-modal-copy">
          Review the response{entries.length === 1 ? '' : 's'} sent from {responderLabel}.
        </p>
        <div className="feedback-inbox-list">
          {entries.map((entry, index) => (
            <div key={entry.id} className="feedback-inbox-item">
              <div className="feedback-inbox-meta">
                <div className="feedback-inbox-title">
                  {entry.franchiseName || 'Franchise Feedback'}
                </div>
                <div className="feedback-inbox-subtitle">
                  Sent {formatDateTime(entry.resolvedAt)}
                </div>
              </div>
              <div className="feedback-inbox-prompt">Original feedback</div>
              <div className="feedback-inbox-request">{entry.message}</div>
              <div className="feedback-inbox-prompt">Response</div>
              <div className="feedback-inbox-reply">{entry.resolutionMessage || 'No reply message available.'}</div>
              <div className="feedback-inbox-actions">
                <button
                  type="button"
                  className="feedback-primary-btn"
                  onClick={() => onAcknowledge(entry)}
                  disabled={acknowledgingId === entry.id}
                >
                  {acknowledgingId === entry.id ? 'Saving...' : 'Okay'}
                </button>
              </div>
              {index < entries.length - 1 && <div className="feedback-inbox-divider" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default FeedbackReplyInboxModal;
