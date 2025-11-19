import React, { useState } from 'react';
import './SettingsModal.css';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogContent, setChangelogContent] = useState('');
  const [changelogError, setChangelogError] = useState('');
  const [changelogLoading, setChangelogLoading] = useState(false);

  const renderChangelog = (content: string) => {
    const lines = content.split(/\r?\n/);
    const elements: React.ReactNode[] = [];
    let listItems: string[] = [];
    let hasContent = false;
    let lastWasDivider = false;

    const flushList = (index: number) => {
      if (!listItems.length) return;
      elements.push(
        <ul key={`list-${index}`} className="changelog-list">
          {listItems.map((item, itemIndex) => (
            <li key={`list-${index}-${itemIndex}`}>{item}</li>
          ))}
        </ul>
      );
      hasContent = true;
      lastWasDivider = false;
      listItems = [];
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (!trimmed) {
        flushList(index);
        return;
      }

      if (/^-{3,}$/.test(trimmed)) {
        flushList(index);
        if (hasContent) {
          elements.push(<div key={`divider-${index}`} className="changelog-divider" />);
          lastWasDivider = true;
        }
        return;
      }

      if (trimmed.startsWith('## ')) {
        flushList(index);
        elements.push(
          <h3 key={`heading-${index}`} className="changelog-heading">
            {trimmed.replace(/^##\s*/, '')}
          </h3>
        );
        hasContent = true;
        lastWasDivider = false;
        return;
      }

      if (trimmed.startsWith('### ')) {
        flushList(index);
        elements.push(
          <h4 key={`subheading-${index}`} className="changelog-subheading">
            {trimmed.replace(/^###\s*/, '')}
          </h4>
        );
        hasContent = true;
        lastWasDivider = false;
        return;
      }

      if (trimmed.startsWith('- ')) {
        listItems.push(trimmed.replace(/^-+\s*/, ''));
        hasContent = true;
        lastWasDivider = false;
        return;
      }

      flushList(index);
      elements.push(
        <p key={`paragraph-${index}`} className="changelog-paragraph">
          {trimmed}
        </p>
      );
      hasContent = true;
      lastWasDivider = false;
    });

    flushList(lines.length);

    if (lastWasDivider) {
      elements.pop();
    }

    return elements;
  };

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

  const openChangelog = async () => {
    setShowChangelog(true);
    setChangelogLoading(true);
    setChangelogError('');

    if (!window.electron?.readChangelog) {
      setChangelogError('Changelog is unavailable in this environment.');
      setChangelogLoading(false);
      return;
    }

    try {
      const content = await window.electron.readChangelog();
      setChangelogContent(content);
    } catch (error) {
      console.error('Failed to load changelog:', error);
      setChangelogError('Unable to load the changelog right now.');
      setChangelogContent('');
    } finally {
      setChangelogLoading(false);
    }
  };

  const closeChangelog = () => {
    setShowChangelog(false);
  };

  const handleChangelogBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closeChangelog();
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
            <div className="section-row">
              <div>
                <h4>Changelog</h4>
                <p className="settings-description">See what changed in the latest builds.</p>
              </div>
              <button
                className="view-changelog-button"
                onClick={openChangelog}
                disabled={changelogLoading}
              >
                {changelogLoading ? 'Loading...' : 'View Changelog'}
              </button>
            </div>
          </div>

          <div className="settings-section">
            <h3>About</h3>
            <p className="about-text">PPAS Proposal Builder</p>
            <p className="about-text">Version {window.electron?.appVersion || '1.0.5'}</p>
            <p className="about-text">© {new Date().getFullYear()} Designed by Brian Kummer for Premier Pools and Spas</p>
          </div>
        </div>
      </div>
      {showChangelog && (
        <div className="changelog-modal-backdrop" onClick={handleChangelogBackdropClick}>
          <div className="changelog-modal" onClick={(e) => e.stopPropagation()}>
            <div className="changelog-header">
              <h3>Changelog</h3>
              <button className="close-button" onClick={closeChangelog}>X</button>
            </div>
            <div className="changelog-body">
              {changelogLoading && <p className="changelog-status">Loading changelog...</p>}
              {!changelogLoading && changelogError && (
                <p className="changelog-error">{changelogError}</p>
              )}
              {!changelogLoading && !changelogError && (
                <div className="changelog-content">
                  {renderChangelog(changelogContent)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsModal;
