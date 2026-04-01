import { useEffect, useMemo, useState } from 'react';
import TempPasswordModal from './TempPasswordModal';
import './MasterFranchiseEditorModal.css';
import {
  saveMasterFranchiseSettings,
  type MasterFranchise,
  type MasterUser,
} from '../services/masterAdminAdapter';
import {
  createFranchiseUser,
  deleteFranchiseUser,
  resetFranchiseUserPassword,
  updateFranchiseUserRole,
} from '../services/franchiseUsersAdapter';

type StatusMessage = {
  type: 'success' | 'error';
  message: string;
} | null;

type TempPasswordState = {
  password: string;
  title: string;
  description: string;
} | null;

type MasterFranchiseEditorModalProps = {
  franchise: MasterFranchise;
  users: MasterUser[];
  updatedBy?: string | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onFranchiseUpdated?: (franchise: MasterFranchise) => void;
};

const getDisplayName = (user: Pick<MasterUser, 'name' | 'email'>) => {
  const trimmedName = String(user.name || '').trim();
  return trimmedName || user.email;
};

function MasterFranchiseEditorModal({
  franchise,
  users,
  updatedBy,
  onClose,
  onRefresh,
  onFranchiseUpdated,
}: MasterFranchiseEditorModalProps) {
  const [pendingName, setPendingName] = useState(franchise.name || '');
  const [pendingCode, setPendingCode] = useState(franchise.franchiseCode || '');
  const [newDesignerName, setNewDesignerName] = useState('');
  const [newDesignerEmail, setNewDesignerEmail] = useState('');
  const [status, setStatus] = useState<StatusMessage>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [addingDesigner, setAddingDesigner] = useState(false);
  const [promotingUserId, setPromotingUserId] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [demotingUserId, setDemotingUserId] = useState<string | null>(null);
  const [makingOwnerId, setMakingOwnerId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<TempPasswordState>(null);

  useEffect(() => {
    setPendingName(franchise.name || '');
    setPendingCode(franchise.franchiseCode || '');
    setStatus(null);
    setNewDesignerName('');
    setNewDesignerEmail('');
  }, [franchise.franchiseCode, franchise.id, franchise.name]);

  const activeUsers = useMemo(() => {
    const roleWeight = { owner: 3, admin: 2, designer: 1, master: 0 } as Record<string, number>;
    return [...users]
      .filter((user) => user.isActive !== false)
      .sort(
        (a, b) =>
          (roleWeight[b.role] || 0) - (roleWeight[a.role] || 0) ||
          getDisplayName(a).localeCompare(getDisplayName(b)) ||
          a.email.localeCompare(b.email)
      );
  }, [users]);

  const owners = activeUsers.filter((user) => user.role === 'owner');
  const admins = activeUsers.filter((user) => user.role === 'admin');
  const designers = activeUsers.filter((user) => user.role === 'designer');
  const isInactive = Boolean(franchise.deletedAt || franchise.isActive === false);

  const normalizedPendingName = pendingName.trim();
  const normalizedPendingCode = pendingCode.trim().toUpperCase();
  const normalizedCurrentName = String(franchise.name || '').trim();
  const normalizedCurrentCode = String(franchise.franchiseCode || '').trim().toUpperCase();
  const hasSettingsChange =
    normalizedPendingName !== normalizedCurrentName || normalizedPendingCode !== normalizedCurrentCode;

  const handleSaveSettings = async () => {
    if (!normalizedPendingName) {
      setStatus({ type: 'error', message: 'Franchise name is required.' });
      return;
    }
    if (!normalizedPendingCode) {
      setStatus({ type: 'error', message: 'Franchise code is required.' });
      return;
    }

    setSavingSettings(true);
    setStatus(null);
    try {
      const updatedFranchise = await saveMasterFranchiseSettings({
        franchiseId: franchise.id,
        franchiseName: normalizedPendingName,
        franchiseCode: normalizedPendingCode,
        previousName: franchise.name,
        previousCode: franchise.franchiseCode,
        updatedBy: updatedBy ?? null,
      });
      onFranchiseUpdated?.(updatedFranchise);
      await onRefresh();
      setStatus({ type: 'success', message: 'Franchise settings updated.' });
    } catch (error: any) {
      console.error('Failed to save franchise settings:', error);
      setStatus({
        type: 'error',
        message: error?.message || 'Unable to save franchise settings.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddDesigner = async () => {
    const trimmedName = newDesignerName.trim();
    const trimmedEmail = newDesignerEmail.trim().toLowerCase();
    if (!trimmedName) {
      setStatus({ type: 'error', message: 'Designer name is required.' });
      return;
    }
    if (!trimmedEmail) {
      setStatus({ type: 'error', message: 'Designer email is required.' });
      return;
    }

    setAddingDesigner(true);
    setStatus(null);
    try {
      const result = await createFranchiseUser({
        franchiseId: franchise.id,
        email: trimmedEmail,
        name: trimmedName,
        role: 'designer',
      });
      setNewDesignerName('');
      setNewDesignerEmail('');
      await onRefresh();
      setStatus({ type: 'success', message: 'Designer created.' });
      if (result?.tempPassword) {
        setTempPassword({
          password: result.tempPassword,
          title: 'Designer Temporary Password',
          description: 'Copy this password for the new designer. It will only be shown once.',
        });
      }
    } catch (error: any) {
      console.error('Failed to create designer:', error);
      setStatus({
        type: 'error',
        message: error?.message || 'Unable to create the designer.',
      });
    } finally {
      setAddingDesigner(false);
    }
  };

  const handlePromoteDesigner = async (user: MasterUser) => {
    setPromotingUserId(user.id);
    setStatus(null);
    try {
      await updateFranchiseUserRole(user.id, 'admin');
      await onRefresh();
      setStatus({ type: 'success', message: `${getDisplayName(user)} is now an admin.` });
    } catch (error: any) {
      console.error('Failed to promote designer:', error);
      setStatus({
        type: 'error',
        message: error?.message || 'Unable to promote the designer.',
      });
    } finally {
      setPromotingUserId(null);
    }
  };

  const handleResetPassword = async (user: MasterUser) => {
    setResettingUserId(user.id);
    setStatus(null);
    try {
      const result = await resetFranchiseUserPassword(user.id);
      if (result?.tempPassword) {
        setTempPassword({
          password: result.tempPassword,
          title: 'Temporary Password',
          description: `Copy this password for ${getDisplayName(user)}. It will only be shown once.`,
        });
      }
      setStatus({ type: 'success', message: `Password reset for ${getDisplayName(user)}.` });
    } catch (error: any) {
      console.error('Failed to reset password:', error);
      setStatus({
        type: 'error',
        message: error?.message || 'Unable to reset the password.',
      });
    } finally {
      setResettingUserId(null);
    }
  };

  const handleRemoveDesigner = async (user: MasterUser) => {
    const confirmDelete = window.confirm(`Remove ${getDisplayName(user)} from this franchise?`);
    if (!confirmDelete) return;

    setRemovingUserId(user.id);
    setStatus(null);
    try {
      await deleteFranchiseUser(user.id);
      await onRefresh();
      setStatus({ type: 'success', message: `${getDisplayName(user)} was removed.` });
    } catch (error: any) {
      console.error('Failed to remove designer:', error);
      setStatus({
        type: 'error',
        message: error?.message || 'Unable to remove the designer.',
      });
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleDemoteOwner = async (user: MasterUser) => {
    const confirmDemote = window.confirm(
      `Demote ${getDisplayName(user)} to admin? If no owner remains, you can promote an admin back to owner from this window.`
    );
    if (!confirmDemote) return;

    setDemotingUserId(user.id);
    setStatus(null);
    try {
      await updateFranchiseUserRole(user.id, 'admin');
      await onRefresh();
      setStatus({ type: 'success', message: `${getDisplayName(user)} is now an admin.` });
    } catch (error: any) {
      console.error('Failed to demote owner:', error);
      setStatus({
        type: 'error',
        message: error?.message || 'Unable to demote the owner.',
      });
    } finally {
      setDemotingUserId(null);
    }
  };

  const handleMakeOwner = async (user: MasterUser) => {
    const confirmPromote = window.confirm(`Promote ${getDisplayName(user)} to owner?`);
    if (!confirmPromote) return;

    setMakingOwnerId(user.id);
    setStatus(null);
    try {
      await updateFranchiseUserRole(user.id, 'owner');
      await onRefresh();
      setStatus({ type: 'success', message: `${getDisplayName(user)} is now the owner.` });
    } catch (error: any) {
      console.error('Failed to promote admin to owner:', error);
      setStatus({
        type: 'error',
        message: error?.message || 'Unable to promote this admin to owner.',
      });
    } finally {
      setMakingOwnerId(null);
    }
  };

  const handleDemoteAdmin = async (user: MasterUser) => {
    const confirmDemote = window.confirm(
      `Demote ${getDisplayName(user)} to designer? They will lose admin access for this franchise until promoted again.`
    );
    if (!confirmDemote) return;

    setDemotingUserId(user.id);
    setStatus(null);
    try {
      await updateFranchiseUserRole(user.id, 'designer');
      await onRefresh();
      setStatus({ type: 'success', message: `${getDisplayName(user)} is now a designer.` });
    } catch (error: any) {
      console.error('Failed to demote admin:', error);
      setStatus({
        type: 'error',
        message: error?.message || 'Unable to demote this admin.',
      });
    } finally {
      setDemotingUserId(null);
    }
  };

  const renderUserRow = (
    user: MasterUser,
    options: {
      canMakeOwner?: boolean;
      canPromoteDesigner?: boolean;
      canDemoteOwner?: boolean;
      canDemoteAdmin?: boolean;
      canRemoveDesigner?: boolean;
    }
  ) => (
    <div className={`master-editor-user-row role-${user.role}`} key={user.id}>
      <div className="master-editor-user-meta">
        <div className="master-editor-user-name">{getDisplayName(user)}</div>
        <div className="master-editor-user-email">{user.email}</div>
      </div>
      <div className="master-editor-user-actions">
        {options.canMakeOwner && (
          <button
            className="master-secondary-btn"
            type="button"
            onClick={() => handleMakeOwner(user)}
            disabled={makingOwnerId === user.id || isInactive}
          >
            {makingOwnerId === user.id ? 'Saving...' : 'Make Owner'}
          </button>
        )}
        {options.canPromoteDesigner && (
          <button
            className="master-secondary-btn"
            type="button"
            onClick={() => handlePromoteDesigner(user)}
            disabled={promotingUserId === user.id || isInactive}
          >
            {promotingUserId === user.id ? 'Saving...' : 'Make Admin'}
          </button>
        )}
        <button
          className="master-secondary-btn"
          type="button"
          onClick={() => handleResetPassword(user)}
          disabled={resettingUserId === user.id || isInactive}
        >
          {resettingUserId === user.id ? 'Resetting...' : 'Reset Password'}
        </button>
        {options.canDemoteOwner && (
          <button
            className="master-secondary-btn"
            type="button"
            onClick={() => handleDemoteOwner(user)}
            disabled={demotingUserId === user.id || isInactive}
          >
            {demotingUserId === user.id ? 'Saving...' : 'Demote to Admin'}
          </button>
        )}
        {options.canDemoteAdmin && (
          <button
            className="master-secondary-btn"
            type="button"
            onClick={() => handleDemoteAdmin(user)}
            disabled={demotingUserId === user.id || isInactive}
          >
            {demotingUserId === user.id ? 'Saving...' : 'Demote to Designer'}
          </button>
        )}
        {options.canRemoveDesigner && (
          <button
            className="master-danger-btn"
            type="button"
            onClick={() => handleRemoveDesigner(user)}
            disabled={removingUserId === user.id || isInactive}
          >
            {removingUserId === user.id ? 'Removing...' : 'Remove'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="master-editor-backdrop" onClick={onClose}>
        <div className="master-editor-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="master-editor-header">
            <div>
              <p className="master-editor-kicker">Franchise Settings</p>
              <h2 className="master-editor-title">{franchise.name || franchise.id}</h2>
            </div>
            <button
              className="master-editor-close"
              type="button"
              onClick={onClose}
              aria-label="Close franchise editor"
            >
              x
            </button>
          </div>

          {status && <div className={status.type === 'error' ? 'master-error' : 'master-success'}>{status.message}</div>}

          <div className="master-editor-section">
            <div className="master-editor-section-header">
              <div>
                <h3>Basic Settings</h3>
                <p>Update the franchise name and login code.</p>
              </div>
              <button
                className="master-primary-btn master-small-btn"
                type="button"
                onClick={handleSaveSettings}
                disabled={!hasSettingsChange || savingSettings}
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
            <div className="master-editor-field-grid">
              <label className="master-editor-field">
                <span>Franchise Name</span>
                <input
                  type="text"
                  value={pendingName}
                  onChange={(event) => setPendingName(event.target.value)}
                  placeholder="Franchise name"
                  disabled={savingSettings}
                />
              </label>
              <label className="master-editor-field">
                <span>Franchise Code</span>
                <input
                  type="text"
                  value={pendingCode}
                  onChange={(event) => setPendingCode(event.target.value.toUpperCase())}
                  placeholder="Franchise code"
                  disabled={savingSettings}
                />
              </label>
            </div>
          </div>

          <div className="master-editor-section">
            <div className="master-editor-section-header">
              <div>
                <h3>Owner</h3>
                <p>
                  {isInactive
                    ? 'This franchise is inactive. User management actions are disabled.'
                    : 'Reset the password or demote the owner to admin.'}
                </p>
              </div>
            </div>
            {owners.length === 0 ? (
              <div className="master-empty">No active owner is assigned to this franchise.</div>
            ) : (
              <div className="master-editor-user-list">
                {owners.map((user) => renderUserRow(user, { canDemoteOwner: true }))}
              </div>
            )}
          </div>

          <div className="master-editor-section">
            <div className="master-editor-section-header">
              <div>
                <h3>Admins</h3>
                <p>
                  {isInactive
                    ? 'This franchise is inactive. User management actions are disabled.'
                    : 'Reset admin passwords, demote admins to designers, or promote an admin to owner if no owner exists.'}
                </p>
              </div>
            </div>
            {admins.length === 0 ? (
              <div className="master-empty">No active admins found.</div>
            ) : (
              <div className="master-editor-user-list">
                {admins.map((user) =>
                  renderUserRow(user, {
                    canMakeOwner: owners.length === 0,
                    canDemoteAdmin: true,
                  })
                )}
              </div>
            )}
          </div>

          <div className="master-editor-section">
            <div className="master-editor-section-header">
              <div>
                <h3>Designers</h3>
                <p>
                  {isInactive
                    ? 'This franchise is inactive. User management actions are disabled.'
                    : 'Add designers, reset passwords, promote them to admin, or remove them.'}
                </p>
              </div>
            </div>
            <div className="master-editor-add-card">
              <label className="master-editor-field">
                <span>Designer Name</span>
                <input
                  type="text"
                  value={newDesignerName}
                  onChange={(event) => setNewDesignerName(event.target.value)}
                  placeholder="Enter designer name"
                  disabled={addingDesigner || isInactive}
                />
              </label>
              <label className="master-editor-field">
                <span>Designer Email</span>
                <input
                  type="email"
                  value={newDesignerEmail}
                  onChange={(event) => setNewDesignerEmail(event.target.value)}
                  placeholder="Enter designer email"
                  disabled={addingDesigner || isInactive}
                />
              </label>
              <button
                className="master-primary-btn master-small-btn"
                type="button"
                onClick={handleAddDesigner}
                disabled={addingDesigner || isInactive}
              >
                {addingDesigner ? 'Adding...' : 'Add Designer'}
              </button>
            </div>
            {designers.length === 0 ? (
              <div className="master-empty">No active designers found.</div>
            ) : (
              <div className="master-editor-user-list">
                {designers.map((user) =>
                  renderUserRow(user, {
                    canPromoteDesigner: true,
                    canRemoveDesigner: true,
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {tempPassword && (
        <TempPasswordModal
          tempPassword={tempPassword.password}
          onClose={() => setTempPassword(null)}
          title={tempPassword.title}
          description={tempPassword.description}
        />
      )}
    </>
  );
}

export default MasterFranchiseEditorModal;
