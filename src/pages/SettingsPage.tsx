import React, { useState } from 'react';
import ChangelogModal from '../components/ChangelogModal';
import { useFranchiseAppName } from '../hooks/useFranchiseAppName';
import { getSessionFranchiseId, getSessionRole } from '../services/session';
import './SettingsPage.css';

const SettingsPage: React.FC = () => {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [showChangelog, setShowChangelog] = useState(false);

  const franchiseId = getSessionFranchiseId();
  const sessionRole = getSessionRole();
  const canViewChangelog = sessionRole === 'admin' || sessionRole === 'owner' || sessionRole === 'master';
  const isChangelogDisabled = !canViewChangelog;
  const { displayName } = useFranchiseAppName(franchiseId);

  const handleCheckForUpdates = async () => {
    setChecking(true);
    setMessage('Checking for updates...');

    try {
      const result = await window.electron.checkForUpdates();

      if (result.message) {
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
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const openChangelog = () => {
    if (!canViewChangelog) return;
    setShowChangelog(true);
  };

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h1>Settings</h1>
      </div>

      <div className="settings-page-content">
        <div className="settings-card">
          <h2>Updates</h2>
          <p className="settings-description">
            Check for the latest version of {displayName} Proposal Builder
          </p>
          <button
            className="settings-button check-updates-button"
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
          <div className="section-row">
            <div>
              <h3>Patch Notes</h3>
            </div>
            <button
              className="settings-button view-changelog-button"
              onClick={openChangelog}
              disabled={isChangelogDisabled}
            >
              View Changelog
            </button>
          </div>
        </div>

        <div className="settings-card">
          <h2>About</h2>
          <p className="about-text">{displayName} Proposal Builder</p>
          <p className="about-text">Version {window.electron?.appVersion || '1.0.5'}</p>
          <p className="about-text">(c) {new Date().getFullYear()} Submerge - Designed by Brian Kummer</p>
        </div>
      </div>

      <ChangelogModal isOpen={showChangelog} onClose={() => setShowChangelog(false)} />
    </div>
  );
};

export default SettingsPage;
