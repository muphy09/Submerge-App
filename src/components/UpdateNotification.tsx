import React from 'react';
import './UpdateNotification.css';

export type UpdateStatus = 'available' | 'downloading' | 'ready' | 'installing' | 'error' | null;

interface UpdateNotificationProps {
  status: UpdateStatus;
  onInstall?: () => void;
  errorMessage?: string;
  progress?: number | null;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({ status, onInstall, errorMessage, progress }) => {
  if (!status) return null;
  const percent = typeof progress === 'number' && Number.isFinite(progress)
    ? Math.min(100, Math.max(0, Math.round(progress))) : null;
  const busy = status === 'available' || status === 'downloading' || status === 'installing';
  const copy = {
    available: ['Update available', 'Getting the latest version ready to download. You can keep working.'],
    downloading: ['Downloading update', 'The latest version is on its way. You can keep working.'],
    ready: ['Ready to restart', 'Your update is ready. Save your work, then restart to apply it.'],
    installing: ['Starting update', 'Submerge will close while the installer applies your update.'],
    error: ['Update needs attention', errorMessage || 'The update could not be completed. Try again from Settings.'],
  }[status];

  return (
    <aside className="update-notification" aria-label="App update">
      <div className={`update-notification-message update-notification-message--${status}`}>
        <div className="update-notification-heading">
          <span className="update-notification-icon" aria-hidden="true">
            {busy ? <span className="update-notification-spinner" /> : status === 'ready' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 12 4 4 8-8" /></svg>
            ) : '!'}
          </span>
          <span className="update-notification-eyebrow">Update Helper</span>
        </div>
        <div role={status === 'error' ? 'alert' : 'status'} aria-atomic="true">
          <h2>{copy[0]}</h2>
          <p>{copy[1]}</p>
        </div>
        {status === 'downloading' && <div className="update-notification-download">
          <div className="update-notification-progress-label"><span>{percent === 100 ? 'Preparing update' : 'Download progress'}</span><strong>{percent === null ? 'In progress' : `${percent}%`}</strong></div>
          <div className={`update-notification-track${percent === null ? ' is-indeterminate' : ''}`} role="progressbar" aria-label="Update download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
            <span style={percent === null ? undefined : { width: `${percent}%` }} />
          </div>
        </div>}
        {status === 'ready' && <button onClick={onInstall} className="update-notification-install-button">Restart &amp; update <span aria-hidden="true">↗</span></button>}
      </div>
    </aside>
  );
};

export default UpdateNotification;
