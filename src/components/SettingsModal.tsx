import React, { useState } from 'react';
import './SettingsModal.css';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');

  const handleCheckForUpdates = async () => {
    setChecking(true);
    setMessage('Checking for updates...');

    try {
      const result = await window.electron.checkForUpdates();

      if (result.message) {
        // Development mode or error
        setMessage(result.message);
      } else if (result.available) {
        setMessage('Update found! Download will start automatically.');
      } else {
        setMessage('Up to date!');
      }
    } catch (error) {
      setMessage('Error checking for updates');
      console.error('Update check error:', error);
    } finally {
      setChecking(false);
      // Clear message after 3 seconds
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="settings-modal-backdrop" onClick={handleBackdropClick}>
      <div className="settings-modal">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <div className="settings-content">
          <div className="settings-section">
            <h3>Updates</h3>
            <p className="settings-description">
              Check for the latest version of PPAS Proposal Builder
            </p>
            <button
              className="check-updates-button"
              onClick={handleCheckForUpdates}
              disabled={checking}
            >
              {checking ? 'Checking...' : 'Check for Updates'}
            </button>
            {message && (
              <div className={`update-message ${message.includes('Up to date') ? 'success' : ''}`}>
                {message}
              </div>
            )}
          </div>

          <div className="settings-section">
            <h3>About</h3>
            <p className="about-text">PPAS Proposal Builder</p>
            <p className="about-text">Version {window.electron?.appVersion || '1.0.5'}</p>
            <p className="about-text">© {new Date().getFullYear()} Premier Pools and Spas</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
