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
        <div className="update-message">
          <div className="update-spinner"></div>
          <span>Update Downloading...</span>
        </div>
      )}
      {status === 'ready' && (
        <div className="update-message update-ready">
          <span>Update Completed, restart the App to apply</span>
          <button onClick={onInstall} className="install-button">
            Restart Now
          </button>
        </div>
      )}
      {status === 'error' && (
        <div className="update-message update-error">
          <span>Update Error: {displayError}</span>
        </div>
      )}
    </div>
  );
};

export default UpdateNotification;
