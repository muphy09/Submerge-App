import React from 'react';
import './UpdateNotification.css';

interface UpdateNotificationProps {
  status: 'downloading' | 'ready' | 'error' | null;
  onInstall?: () => void;
  errorMessage?: string;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({ status, onInstall, errorMessage }) => {
  if (!status) return null;

  const displayError = errorMessage || 'Error checking for updates';

  return (
    <div className="update-notification">
      {status === 'downloading' && (
        <div className="update-notification-message">
          <div className="update-notification-spinner"></div>
          <span>Update Downloading...</span>
        </div>
      )}
      {status === 'ready' && (
        <div className="update-notification-message update-notification-message--ready">
          <span>Update ready. Restart the app to apply it.</span>
          <button onClick={onInstall} className="update-notification-install-button">
            Restart Now
          </button>
        </div>
      )}
      {status === 'error' && (
        <div className="update-notification-message update-notification-message--error">
          <span>Update Error: {displayError}</span>
        </div>
      )}
    </div>
  );
};

export default UpdateNotification;
