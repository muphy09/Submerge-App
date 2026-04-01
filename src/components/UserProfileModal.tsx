import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';
import { changeCurrentUserPassword } from '../services/auth';
import type { UserSession } from '../services/session';
import { updateCurrentUserProfile } from '../services/userProfile';
import './UserProfileModal.css';

type StatusMessage = {
  type: 'success' | 'error';
  text: string;
} | null;

type UserProfileModalProps = {
  isOpen: boolean;
  session: UserSession | null;
  onClose: () => void;
  onLogout: () => Promise<void> | void;
  onSessionUpdated: (partial: Partial<Pick<UserSession, 'userName' | 'userEmail'>>) => void;
};

function formatRole(role?: string) {
  const normalized = String(role || '').trim().toLowerCase();
  if (!normalized) return 'Designer';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getFranchiseLabel(session: UserSession | null) {
  const franchiseName = String(session?.franchiseName || '').trim();
  const franchiseCode = String(session?.franchiseCode || '').trim();
  if (franchiseName && franchiseCode) return `${franchiseName} (${franchiseCode})`;
  if (franchiseName) return franchiseName;
  if (franchiseCode) return franchiseCode;
  if (String(session?.role || '').trim().toLowerCase() === 'master') return 'Master Account';
  return 'No Franchise';
}

function UserProfileModal({
  isOpen,
  session,
  onClose,
  onLogout,
  onSessionUpdated,
}: UserProfileModalProps) {
  const { showToast } = useToast();
  const [savedName, setSavedName] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileStatus, setProfileStatus] = useState<StatusMessage>(null);
  const [passwordStatus, setPasswordStatus] = useState<StatusMessage>(null);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pendingEmailChange, setPendingEmailChange] = useState<{ name: string; email: string } | null>(null);
  const backdropMouseDownRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    const initialName = String(session?.userName || '').trim();
    const initialEmail = String(session?.userEmail || '').trim().toLowerCase();
    setSavedName(initialName);
    setSavedEmail(initialEmail);
    setName(initialName);
    setEmail(initialEmail);
    setProfileStatus(null);
    setPasswordStatus(null);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPendingEmailChange(null);
  }, [isOpen, session?.userId]);

  const roleLabel = useMemo(() => formatRole(session?.role), [session?.role]);
  const franchiseLabel = useMemo(() => getFranchiseLabel(session), [session]);
  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const hasProfileChanges = normalizedName !== savedName || normalizedEmail !== savedEmail;

  if (!isOpen || !session) return null;

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    backdropMouseDownRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    const shouldClose = backdropMouseDownRef.current && event.target === event.currentTarget;
    backdropMouseDownRef.current = false;
    if (shouldClose && !profileLoading && !passwordLoading) {
      onClose();
    }
  };

  const persistProfile = async (nextValues: { name: string; email: string }, shouldLogoutAfterSave: boolean) => {
    try {
      setProfileLoading(true);
      setProfileStatus(null);
      const updated = await updateCurrentUserProfile(nextValues);

      setSavedName(updated.name);
      setSavedEmail(updated.email);
      setName(updated.name);
      setEmail(updated.email);

      if (shouldLogoutAfterSave) {
        showToast({
          type: 'success',
          message: 'Email updated. Please log in with your new email.',
          durationMs: 5000,
        });
        setPendingEmailChange(null);
        await Promise.resolve(onLogout());
        return;
      }

      onSessionUpdated({
        userName: updated.name,
        userEmail: updated.email,
      });
      setProfileStatus({ type: 'success', text: 'Profile updated successfully.' });
      showToast({ type: 'success', message: 'Profile updated.' });
    } catch (error: any) {
      setProfileStatus({
        type: 'error',
        text: error?.message || 'Unable to update profile. Please try again.',
      });
      if (shouldLogoutAfterSave) {
        setPendingEmailChange(null);
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setProfileStatus(null);

    if (!normalizedName) {
      setProfileStatus({ type: 'error', text: 'Name is required.' });
      return;
    }

    if (!normalizedEmail) {
      setProfileStatus({ type: 'error', text: 'Email is required.' });
      return;
    }

    if (!hasProfileChanges) {
      setProfileStatus({ type: 'error', text: 'No profile changes to save.' });
      return;
    }

    if (normalizedEmail !== savedEmail) {
      setPendingEmailChange({ name: normalizedName, email: normalizedEmail });
      return;
    }

    await persistProfile({ name: normalizedName, email: normalizedEmail }, false);
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordStatus(null);

    const trimmedPassword = newPassword.trim();
    const trimmedConfirmPassword = confirmPassword.trim();
    const trimmedOldPassword = oldPassword.trim();

    if (!trimmedOldPassword) {
      setPasswordStatus({ type: 'error', text: 'Please enter your current password.' });
      return;
    }

    if (!trimmedPassword) {
      setPasswordStatus({ type: 'error', text: 'Please enter a new password.' });
      return;
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      setPasswordStatus({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    try {
      setPasswordLoading(true);
      await changeCurrentUserPassword(trimmedOldPassword, trimmedPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus({ type: 'success', text: 'Password updated successfully.' });
      showToast({ type: 'success', message: 'Password updated.' });
    } catch (error: any) {
      setPasswordStatus({
        type: 'error',
        text: error?.message || 'Unable to update password. Please try again.',
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const confirmEmailChange = () => {
    if (!pendingEmailChange) return;
    void persistProfile(pendingEmailChange, true);
  };

  return (
    <>
      <div
        className="user-profile-backdrop"
        onMouseDown={handleBackdropMouseDown}
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
      >
        <div className="user-profile-modal" onClick={(event) => event.stopPropagation()}>
          <div className="user-profile-header">
            <div>
              <h2>Profile Settings</h2>
              <p className="user-profile-subtitle">
                Update your account details and password for this signed-in account.
              </p>
            </div>
            <button
              className="user-profile-close"
              type="button"
              onClick={onClose}
              disabled={profileLoading || passwordLoading}
              aria-label="Close profile settings"
            >
              X
            </button>
          </div>

          <div className="user-profile-identity">
            <div className="user-profile-email">{savedEmail || session.userEmail || 'No email set'}</div>
            <div className="user-profile-badges">
              <span className="user-profile-badge">{roleLabel}</span>
              <span className="user-profile-badge user-profile-badge-secondary">{franchiseLabel}</span>
            </div>
          </div>

          <div className="user-profile-content">
            <section className="user-profile-section">
              <div className="user-profile-section-heading">
                <h3>Account Details</h3>
                <p>Changing your email will require you to log back in.</p>
              </div>
              <form className="user-profile-form" onSubmit={handleProfileSubmit}>
                <label className="user-profile-field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (profileStatus) {
                        setProfileStatus(null);
                      }
                    }}
                    placeholder="Enter your name"
                    disabled={profileLoading}
                  />
                </label>
                <label className="user-profile-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (profileStatus) {
                        setProfileStatus(null);
                      }
                    }}
                    placeholder="Enter your email"
                    disabled={profileLoading}
                  />
                </label>
                {profileStatus && (
                  <div className={`user-profile-status user-profile-status-${profileStatus.type}`}>
                    {profileStatus.text}
                  </div>
                )}
                <div className="user-profile-actions">
                  <button
                    className="user-profile-primary"
                    type="submit"
                    disabled={profileLoading || !hasProfileChanges}
                  >
                    {profileLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </section>

            <section className="user-profile-section user-profile-section-divider">
              <div className="user-profile-section-heading">
                <h3>Change Password</h3>
                <p>Enter your current password before setting a new one.</p>
              </div>
              <form className="user-profile-form" onSubmit={handlePasswordSubmit}>
                <label className="user-profile-field">
                  <span>Current Password</span>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(event) => {
                      setOldPassword(event.target.value);
                      if (passwordStatus) {
                        setPasswordStatus(null);
                      }
                    }}
                    placeholder="Enter current password"
                    disabled={passwordLoading}
                  />
                </label>
                <label className="user-profile-field">
                  <span>New Password</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      if (passwordStatus) {
                        setPasswordStatus(null);
                      }
                    }}
                    placeholder="Enter new password"
                    disabled={passwordLoading}
                  />
                </label>
                <label className="user-profile-field">
                  <span>Confirm Password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      if (passwordStatus) {
                        setPasswordStatus(null);
                      }
                    }}
                    placeholder="Re-enter new password"
                    disabled={passwordLoading}
                  />
                </label>
                {passwordStatus && (
                  <div className={`user-profile-status user-profile-status-${passwordStatus.type}`}>
                    {passwordStatus.text}
                  </div>
                )}
                <div className="user-profile-actions">
                  <button
                    className="user-profile-primary"
                    type="submit"
                    disabled={passwordLoading || !oldPassword.trim() || !newPassword.trim() || !confirmPassword.trim()}
                  >
                    {passwordLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingEmailChange)}
        title="Email Change Requires Login"
        message="You must log back in after changing the email."
        confirmLabel="Okay, log me out"
        cancelLabel="No, take me back"
        isLoading={profileLoading}
        onConfirm={confirmEmailChange}
        onCancel={() => setPendingEmailChange(null)}
      />
    </>
  );
}

export default UserProfileModal;
