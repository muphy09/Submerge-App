import React, { useState } from 'react';
import ChangelogModal from '../components/ChangelogModal';
import { useFranchiseAppName } from '../hooks/useFranchiseAppName';
import { useAdminCogsView } from '../hooks/useAdminCogsView';
import { getSessionFranchiseId, getSessionRole, readMasterImpersonation, readSession } from '../services/session';
import './SettingsPage.css';

const SettingsPage: React.FC = () => {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [showChangelog, setShowChangelog] = useState(false);
  const [adminCogsViewStatus, setAdminCogsViewStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const franchiseId = getSessionFranchiseId();
  const sessionRole = getSessionRole();
  const actualSessionRole = (readSession()?.role || '').toLowerCase();
  const isMasterImpersonating = Boolean(readMasterImpersonation()?.franchiseId);
  const showMasterCogsSetting = actualSessionRole === 'master' && !isMasterImpersonating;
  const canViewChangelog = sessionRole === 'admin' || sessionRole === 'owner' || sessionRole === 'master';
  const isChangelogDisabled = !canViewChangelog;
  const { displayName } = useFranchiseAppName(franchiseId);
  const { hideCogsFromProposalBuilder, setHideCogsFromProposalBuilder } = useAdminCogsView({ franchiseId });

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

  const handleToggleAdminCogsView = () => {
    try {
      const nextValue = !hideCogsFromProposalBuilder;
      setHideCogsFromProposalBuilder(nextValue);
      setAdminCogsViewStatus(null);
    } catch (error) {
      console.error('Failed to update admin COGS view setting:', error);
      setAdminCogsViewStatus({
        type: 'error',
        message: 'Unable to update the Admin COGS View setting.',
      });
    }
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

        {showMasterCogsSetting && (
          <div className="settings-card">
            <h2>Admin COGS View</h2>
            <div className="admin-cogs-settings-panel">
              <div className="section-row admin-cogs-settings-row">
                <div>
                  <h3>Hide COGS from Prop. Builder</h3>
                  <p className="settings-description">
                    Control whether COGS breakdowns are visible while you build and review proposals.
                  </p>
                </div>
                <button
                  className={`settings-button admin-cogs-toggle-button ${hideCogsFromProposalBuilder ? 'is-active' : ''}`}
                  onClick={handleToggleAdminCogsView}
                  type="button"
                >
                  {hideCogsFromProposalBuilder ? 'Enabled' : 'Disabled'}
                </button>
              </div>
              {adminCogsViewStatus?.type === 'error' && (
                <div className={`logo-status ${adminCogsViewStatus.type}`}>{adminCogsViewStatus.message}</div>
              )}
            </div>
          </div>
        )}

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
