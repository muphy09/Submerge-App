import React, { useEffect, useRef, useState } from 'react';
import submergeLogo from '../../Submerge Logo.png';
import { useFranchiseAppName } from '../hooks/useFranchiseAppName';
import { useFranchiseLogo } from '../hooks/useFranchiseLogo';
import { saveFranchiseAppName, saveFranchiseLogo } from '../services/franchiseBranding';
import { saveFranchiseCode } from '../services/franchisesAdapter';
import { setSupabaseContext } from '../services/supabaseClient';
import {
  getSessionFranchiseCode,
  getSessionFranchiseId,
  getSessionRole,
  getSessionUserName,
  readSession,
  SESSION_STORAGE_KEY,
} from '../services/session';
import './SettingsPage.css';

const MAX_LOGO_BYTES = 1024 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];

const SettingsPage: React.FC = () => {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogContent, setChangelogContent] = useState('');
  const [changelogError, setChangelogError] = useState('');
  const [changelogLoading, setChangelogLoading] = useState(false);
  const isChangelogDisabled = true;
  const sessionRole = getSessionRole();
  const isAdmin = sessionRole === 'admin' || sessionRole === 'owner';
  const franchiseId = getSessionFranchiseId();
  const { appName: savedAppName, displayName, isLoading: appNameLoading } = useFranchiseAppName(franchiseId);
  const { logoUrl: savedLogoUrl, isLoading: logoLoading } = useFranchiseLogo(franchiseId);
  const initialFranchiseCode = getSessionFranchiseCode() || '';
  const [currentFranchiseCode, setCurrentFranchiseCode] = useState(initialFranchiseCode);
  const [pendingFranchiseCode, setPendingFranchiseCode] = useState(initialFranchiseCode);
  const [franchiseCodeSaving, setFranchiseCodeSaving] = useState(false);
  const [franchiseCodeStatus, setFranchiseCodeStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(
    null
  );
  const [pendingLogoUrl, setPendingLogoUrl] = useState<string | null>(null);
  const [pendingLogoName, setPendingLogoName] = useState('');
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoStatus, setLogoStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(
    null
  );
  const [pendingAppName, setPendingAppName] = useState('');
  const [appNameSaving, setAppNameSaving] = useState(false);
  const [appNameStatus, setAppNameStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewLogoUrl = pendingLogoUrl || savedLogoUrl || submergeLogo;
  const hasCustomLogo = Boolean(savedLogoUrl);
  const hasPendingLogo = Boolean(pendingLogoUrl);
  const normalizedPendingName = pendingAppName.trim();
  const normalizedSavedName = (savedAppName || '').trim();
  const hasCustomAppName = Boolean(normalizedSavedName);
  const hasPendingNameChange = normalizedPendingName !== normalizedSavedName;
  const canResetAppName = hasCustomAppName || normalizedPendingName.length > 0;
  const normalizedPendingCode = pendingFranchiseCode.trim().toUpperCase();
  const normalizedCurrentCode = (currentFranchiseCode || '').trim().toUpperCase();
  const hasPendingCodeChange = normalizedPendingCode !== normalizedCurrentCode;
  const hasPendingCodeValue = normalizedPendingCode.length > 0;
  const pendingCodeHasAdminSuffix = normalizedPendingCode.endsWith('-A');
  const canResetFranchiseCode = pendingFranchiseCode !== currentFranchiseCode;

  const renderChangelog = (content: string) => {
    const lines = content.split(/\r?\n/);
    const elements: React.ReactNode[] = [];
    let listItems: Array<{ text: string; level: number }> = [];
    let hasContent = false;
    let lastWasDivider = false;

    const flushList = (index: number) => {
      if (!listItems.length) return;

      const renderNestedList = (items: Array<{ text: string; level: number }>, startIndex: number = 0): React.ReactNode => {
        const result: React.ReactNode[] = [];
        let i = startIndex;

        while (i < items.length) {
          const currentItem = items[i];
          const currentLevel = currentItem.level;

          const children: Array<{ text: string; level: number }> = [];
          let j = i + 1;
          while (j < items.length && items[j].level > currentLevel) {
            children.push(items[j]);
            j++;
          }

          result.push(
            <li key={`item-${i}`}>
              {currentItem.text}
              {children.length > 0 && (
                <ul className="changelog-list-nested">
                  {renderNestedList(children, 0)}
                </ul>
              )}
            </li>
          );

          i = j;
        }

        return result;
      };

      elements.push(
        <ul key={`list-${index}`} className="changelog-list">
          {renderNestedList(listItems)}
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
        const leadingSpaces = line.length - line.trimStart().length;
        const level = Math.floor(leadingSpaces / 4);
        listItems.push({
          text: trimmed.replace(/^-\s*/, ''),
          level: level
        });
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

  useEffect(() => {
    setPendingAppName(savedAppName || '');
  }, [savedAppName]);

  const updateStoredSessionCode = (nextCode: string) => {
    if (typeof localStorage === 'undefined') return;
    const session = readSession();
    if (!session) return;
    const updatedSession = { ...session, franchiseCode: nextCode };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedSession));
    setSupabaseContext({
      franchiseId: updatedSession.franchiseId,
      franchiseCode: nextCode,
      userName: updatedSession.userName,
      role: updatedSession.role || 'designer',
    });
  };

  const handleLogoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLogoStatus(null);
    const file = event.target.files?.[0];
    if (!file) {
      setPendingLogoUrl(null);
      setPendingLogoName('');
      return;
    }

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setLogoStatus({ type: 'error', message: 'Logo must be a PNG, JPG, SVG, or WebP file.' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setLogoStatus({ type: 'error', message: 'Logo must be smaller than 1 MB.' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        setLogoStatus({ type: 'error', message: 'Unable to read logo file.' });
        return;
      }
      setPendingLogoUrl(result);
      setPendingLogoName(file.name);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => {
      setLogoStatus({ type: 'error', message: 'Unable to read logo file.' });
    };
    reader.readAsDataURL(file);
  };

  const handleDiscardLogo = () => {
    setPendingLogoUrl(null);
    setPendingLogoName('');
    setLogoStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveLogo = async () => {
    if (!pendingLogoUrl) return;
    setLogoSaving(true);
    setLogoStatus(null);
    try {
      await saveFranchiseLogo({
        franchiseId,
        logoUrl: pendingLogoUrl,
        updatedBy: getSessionUserName(),
      });
      setPendingLogoUrl(null);
      setPendingLogoName('');
      setLogoStatus({ type: 'success', message: 'Franchise logo updated.' });
    } catch (error) {
      console.error('Failed to save franchise logo:', error);
      setLogoStatus({ type: 'error', message: 'Unable to save the franchise logo.' });
    } finally {
      setLogoSaving(false);
    }
  };

  const handleResetLogo = async () => {
    if (!hasCustomLogo && !pendingLogoUrl) return;
    setLogoSaving(true);
    setLogoStatus(null);
    try {
      await saveFranchiseLogo({
        franchiseId,
        logoUrl: null,
        updatedBy: getSessionUserName(),
      });
      setPendingLogoUrl(null);
      setPendingLogoName('');
      setLogoStatus({ type: 'success', message: 'Franchise logo reset to default.' });
    } catch (error) {
      console.error('Failed to reset franchise logo:', error);
      setLogoStatus({ type: 'error', message: 'Unable to reset the franchise logo.' });
    } finally {
      setLogoSaving(false);
    }
  };

  const handleAppNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAppNameStatus(null);
    setPendingAppName(event.target.value);
  };

  const handleSaveAppName = async () => {
    if (!hasPendingNameChange) return;
    setAppNameSaving(true);
    setAppNameStatus(null);
    const nextName = normalizedPendingName ? normalizedPendingName : null;
    try {
      await saveFranchiseAppName({
        franchiseId,
        appName: nextName,
        updatedBy: getSessionUserName(),
      });
      setAppNameStatus({
        type: 'success',
        message: nextName ? 'App name updated.' : 'App name reset to default.',
      });
    } catch (error) {
      console.error('Failed to save app name:', error);
      setAppNameStatus({ type: 'error', message: 'Unable to save the app name.' });
    } finally {
      setAppNameSaving(false);
    }
  };

  const handleResetAppName = async () => {
    if (!hasCustomAppName) {
      setPendingAppName('');
      return;
    }
    setAppNameSaving(true);
    setAppNameStatus(null);
    try {
      await saveFranchiseAppName({
        franchiseId,
        appName: null,
        updatedBy: getSessionUserName(),
      });
      setPendingAppName('');
      setAppNameStatus({ type: 'success', message: 'App name reset to default.' });
    } catch (error) {
      console.error('Failed to reset app name:', error);
      setAppNameStatus({ type: 'error', message: 'Unable to reset the app name.' });
    } finally {
      setAppNameSaving(false);
    }
  };

  const handleFranchiseCodeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFranchiseCodeStatus(null);
    setPendingFranchiseCode(event.target.value.toUpperCase());
  };

  const handleResetFranchiseCode = () => {
    setPendingFranchiseCode(currentFranchiseCode);
    setFranchiseCodeStatus(null);
  };

  const handleSaveFranchiseCode = async () => {
    if (!hasPendingCodeChange) return;
    if (!hasPendingCodeValue) {
      setFranchiseCodeStatus({ type: 'error', message: 'Franchise code is required.' });
      return;
    }
    if (pendingCodeHasAdminSuffix) {
      setFranchiseCodeStatus({ type: 'error', message: 'Franchise codes cannot end with "-A".' });
      return;
    }
    setFranchiseCodeSaving(true);
    setFranchiseCodeStatus(null);
    const session = readSession();
    try {
      await saveFranchiseCode({
        franchiseId,
        franchiseCode: normalizedPendingCode,
        previousCode: currentFranchiseCode,
        franchiseName: session?.franchiseName,
      });
      setCurrentFranchiseCode(normalizedPendingCode);
      setPendingFranchiseCode(normalizedPendingCode);
      updateStoredSessionCode(normalizedPendingCode);
      setFranchiseCodeStatus({ type: 'success', message: 'Franchise code updated.' });
    } catch (error: any) {
      console.error('Failed to update franchise code:', error);
      setFranchiseCodeStatus({
        type: 'error',
        message: error?.message || 'Unable to update the franchise code.',
      });
    } finally {
      setFranchiseCodeSaving(false);
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
              <h3>Changelog</h3>
              <p className="settings-description">See what changed in the latest builds.</p>
            </div>
            <button
              className="settings-button view-changelog-button"
              onClick={openChangelog}
              disabled={isChangelogDisabled || changelogLoading}
            >
              {changelogLoading ? 'Loading...' : 'View Changelog'}
            </button>
          </div>
        </div>

          {isAdmin && (
            <div className="settings-card">
              <h2>Global Logo</h2>
              <p className="settings-description">
                Upload a franchise-wide logo to replace the {displayName} logo throughout the app.
              </p>
              <p className="franchise-logo-meta">Applies to franchise {franchiseId}.</p>
              <div className="franchise-logo-grid">
                <div className="franchise-logo-preview">
                <div className="franchise-logo-label">Current logo</div>
                <div className="franchise-logo-frame">
                  <img src={previewLogoUrl} alt="Franchise logo preview" />
                </div>
                <p className="franchise-logo-note">Recommended: transparent PNG or SVG, max 1 MB.</p>
              </div>
              <div className="franchise-logo-controls">
                <label className="franchise-logo-label" htmlFor="franchise-logo-upload">
                  Upload new logo
                </label>
                <input
                  id="franchise-logo-upload"
                  ref={fileInputRef}
                  type="file"
                  className="franchise-logo-input"
                  accept={ALLOWED_LOGO_TYPES.join(',')}
                  onChange={handleLogoFileChange}
                  disabled={logoSaving}
                />
                {pendingLogoName && (
                  <div className="franchise-logo-file">Selected: {pendingLogoName}</div>
                )}
                <div className="franchise-logo-actions">
                  <button
                    className="settings-button branding-save-button"
                    onClick={handleSaveLogo}
                    disabled={!hasPendingLogo || logoSaving}
                  >
                    {logoSaving && hasPendingLogo ? 'Saving...' : 'Save Logo'}
                  </button>
                  {hasPendingLogo && (
                    <button
                      className="settings-button branding-discard-button"
                      onClick={handleDiscardLogo}
                      disabled={logoSaving}
                    >
                      Discard
                    </button>
                  )}
                    <button
                      className="settings-button branding-reset-button"
                      onClick={handleResetLogo}
                      disabled={!hasCustomLogo || logoSaving}
                    >
                      Reset to Default Logo
                    </button>
                  </div>
                  {logoStatus && (
                    <div className={`logo-status ${logoStatus.type}`}>{logoStatus.message}</div>
                  )}
                  {!logoStatus && logoLoading && (
                    <div className="logo-status info">Loading current logo...</div>
                  )}
                </div>
              </div>
              <div className="franchise-branding-divider" />
              <div className="franchise-name-section">
                <div className="franchise-logo-label">App Name</div>
                <p className="franchise-logo-note">
                  Replaces the app name throughout the app (except the About section).
                </p>
                <div className="franchise-name-current">
                  Current: <span className="franchise-name-value">{displayName}</span>
                </div>
                <input
                  type="text"
                  className="franchise-name-input"
                  placeholder="Enter a custom app name"
                  value={pendingAppName}
                  onChange={handleAppNameChange}
                  disabled={appNameSaving}
                />
                <div className="franchise-logo-actions">
                  <button
                    className="settings-button branding-save-button"
                    onClick={handleSaveAppName}
                    disabled={!hasPendingNameChange || appNameSaving}
                  >
                    {appNameSaving ? 'Saving...' : 'Save Name'}
                  </button>
                  <button
                    className="settings-button branding-reset-button"
                    onClick={handleResetAppName}
                    disabled={!canResetAppName || appNameSaving}
                  >
                    Reset to Default Name
                  </button>
                </div>
                {appNameStatus && (
                  <div className={`logo-status ${appNameStatus.type}`}>{appNameStatus.message}</div>
                )}
                {!appNameStatus && appNameLoading && (
                  <div className="logo-status info">Loading app name...</div>
                )}
              </div>
              <div className="franchise-branding-divider" />
              <div className="franchise-name-section franchise-code-section">
                <div className="franchise-logo-label">Franchise Code</div>
                <p className="franchise-logo-note">
                  Used when logging in. Admin and owner logins append "-A" (for example: {normalizedCurrentCode || 'CODE'}-A).
                  Codes cannot end with "-A".
                </p>
                <div className="franchise-name-current">
                  Current: <span className="franchise-name-value">{normalizedCurrentCode || 'Not set'}</span>
                </div>
                <input
                  type="text"
                  className="franchise-name-input franchise-code-input"
                  placeholder="Enter a new franchise code"
                  value={pendingFranchiseCode}
                  onChange={handleFranchiseCodeChange}
                  disabled={franchiseCodeSaving}
                />
                <div className="franchise-logo-actions">
                  <button
                    className="settings-button branding-save-button"
                    onClick={handleSaveFranchiseCode}
                    disabled={!hasPendingCodeChange || !hasPendingCodeValue || pendingCodeHasAdminSuffix || franchiseCodeSaving}
                  >
                    {franchiseCodeSaving ? 'Saving...' : 'Save Code'}
                  </button>
                  <button
                    className="settings-button branding-reset-button"
                    onClick={handleResetFranchiseCode}
                    disabled={!canResetFranchiseCode || franchiseCodeSaving}
                  >
                    Reset to Current Code
                  </button>
                </div>
                {franchiseCodeStatus && (
                  <div className={`logo-status ${franchiseCodeStatus.type}`}>{franchiseCodeStatus.message}</div>
                )}
                {!franchiseCodeStatus && franchiseCodeSaving && (
                  <div className="logo-status info">Updating franchise code...</div>
                )}
              </div>
            </div>
          )}

        <div className="settings-card">
          <h2>About</h2>
          <p className="about-text">Submerge Proposal Builder</p>
          <p className="about-text">Version {window.electron?.appVersion || '1.0.5'}</p>
          <p className="about-text">(c) {new Date().getFullYear()} Submerge - Designed by Brian Kummer</p>
        </div>
      </div>

      {showChangelog && (
        <div className="changelog-modal-backdrop" onClick={handleChangelogBackdropClick}>
          <div className="changelog-modal" onClick={(e) => e.stopPropagation()}>
            <div className="changelog-header">
              <h3>Changelog</h3>
              <button className="close-button" onClick={closeChangelog}>✕</button>
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

export default SettingsPage;
