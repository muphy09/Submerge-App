import './FeedbackUi.css';

type FeedbackLauncherProps = {
  className?: string;
  tooltip?: string;
  onClick: () => void;
};

function FeedbackLauncher({
  className = '',
  tooltip = 'Submit Feedback Here!',
  onClick,
}: FeedbackLauncherProps) {
  return (
    <button
      type="button"
      className={`feedback-launcher ${className}`.trim()}
      onClick={onClick}
      aria-label={tooltip}
    >
      <span className="feedback-launcher-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" role="presentation">
          <path d="M4 5.75A2.75 2.75 0 0 1 6.75 3h10.5A2.75 2.75 0 0 1 20 5.75v7.5A2.75 2.75 0 0 1 17.25 16H10.4l-3.92 3.16c-.74.6-1.82.07-1.82-.88V16.8A2.74 2.74 0 0 1 4 14.25Z" />
          <path d="M8 8.25h8" />
          <path d="M8 11.5h5.5" />
        </svg>
      </span>
      <span className="feedback-launcher-tooltip">{tooltip}</span>
    </button>
  );
}

export default FeedbackLauncher;
