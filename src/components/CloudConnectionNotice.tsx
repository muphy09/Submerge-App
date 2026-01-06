import './CloudConnectionNotice.css';

export type CloudConnectionIssue = 'server-issue' | 'no-internet' | null;

interface CloudConnectionNoticeProps {
  reason: CloudConnectionIssue;
}

export default function CloudConnectionNotice({ reason }: CloudConnectionNoticeProps) {
  if (!reason) return null;

  const message =
    reason === 'no-internet'
      ? 'Cloud connection cannot be established: No internet'
      : 'Cloud connection cannot be established: Server issue';

  return (
    <div className={`cloud-notice cloud-notice-${reason}`}>
      <div className="cloud-notice-indicator" />
      <span className="cloud-notice-text">{message}</span>
    </div>
  );
}
