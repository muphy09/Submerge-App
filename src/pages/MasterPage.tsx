import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TempPasswordModal from '../components/TempPasswordModal';
import {
  createFranchiseWithOwner,
  listAllFranchiseUsers,
  listAllFranchises,
  softDeleteFranchise,
  type MasterFranchise,
  type MasterUser,
} from '../services/masterAdminAdapter';
import type { UserSession } from '../services/session';
import './MasterPage.css';

type MasterPageProps = {
  session?: UserSession | null;
};

function MasterPage({ session }: MasterPageProps) {
  const navigate = useNavigate();
  const [franchises, setFranchises] = useState<MasterFranchise[]>([]);
  const [users, setUsers] = useState<MasterUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [hideInactive, setHideInactive] = useState(true);

  const [franchiseName, setFranchiseName] = useState('');
  const [franchiseCode, setFranchiseCode] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');

  const isMaster = (session?.role || '').toLowerCase() === 'master';

  const loadData = async () => {
    setLoading(true);
    try {
      const [franchiseRows, userRows] = await Promise.all([
        listAllFranchises(),
        listAllFranchiseUsers(),
      ]);
      setFranchises(franchiseRows || []);
      setUsers(userRows || []);
    } catch (error) {
      console.error('Failed to load master data:', error);
      setFranchises([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isMaster) {
      void loadData();
    }
  }, [isMaster]);

  const visibleFranchises = useMemo(() => {
    if (!hideInactive) return franchises;
    return franchises.filter((franchise) => !franchise.deletedAt && franchise.isActive !== false);
  }, [franchises, hideInactive]);

  const usersByFranchise = useMemo(() => {
    const map = new Map<string, MasterUser[]>();
    users.forEach((user) => {
      const key = user.franchiseId || 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(user);
    });
    return map;
  }, [users]);

  const handleCreateFranchise = async () => {
    const trimmedName = franchiseName.trim();
    const trimmedCode = franchiseCode.trim().toUpperCase();
    const trimmedOwnerEmail = ownerEmail.trim().toLowerCase();
    const trimmedOwnerName = ownerName.trim();

    if (!trimmedName || !trimmedCode || !trimmedOwnerEmail || !trimmedOwnerName) {
      setFormError('Please enter a franchise name, code, owner email, and owner display name.');
      return;
    }

    setFormError(null);
    setCreating(true);
    try {
      const result = await createFranchiseWithOwner({
        franchiseName: trimmedName,
        franchiseCode: trimmedCode,
        ownerEmail: trimmedOwnerEmail,
        ownerName: trimmedOwnerName,
      });
      setTempPassword(result?.tempPassword || null);
      setFranchiseName('');
      setFranchiseCode('');
      setOwnerEmail('');
      setOwnerName('');
      await loadData();
    } catch (error: any) {
      console.error('Failed to create franchise:', error);
      setFormError(error?.message || 'Unable to create franchise.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteFranchise = async (franchiseId: string, franchiseName?: string | null) => {
    const confirmDelete = window.confirm(
      `Soft delete ${franchiseName || franchiseId}? Users will be disabled until restored.`
    );
    if (!confirmDelete) return;
    setDeletingId(franchiseId);
    try {
      await softDeleteFranchise(franchiseId);
      await loadData();
    } catch (error) {
      console.error('Failed to delete franchise:', error);
    } finally {
      setDeletingId(null);
    }
  };

  if (!isMaster) {
    return (
      <div className="master-page">
        <div className="master-locked-card">
          <h2>Master access required</h2>
          <p>Sign in with the master account to manage franchises.</p>
          <button className="master-primary-btn" type="button" onClick={() => navigate('/')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="master-page">
      <div className="master-header">
        <h1>Master Console</h1>
        <p>Manage franchises, owners, admins, and designers.</p>
      </div>

      <div className="master-grid">
        <div className="master-card">
          <h2>Create Franchise + Owner</h2>
          <div className="master-form">
            <input
              type="text"
              value={franchiseName}
              onChange={(e) => setFranchiseName(e.target.value)}
              placeholder="Franchise name"
            />
            <input
              type="text"
              value={franchiseCode}
              onChange={(e) => setFranchiseCode(e.target.value.toUpperCase())}
              placeholder="Franchise code"
            />
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="Owner email"
            />
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Owner display name"
            />
            {formError && <div className="master-error">{formError}</div>}
            <button
              className="master-primary-btn"
              type="button"
              onClick={handleCreateFranchise}
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create Franchise'}
            </button>
          </div>
        </div>

        <div className="master-card">
          <div className="master-card-header">
            <h2>Franchises</h2>
            <label className="master-toggle">
              <input
                type="checkbox"
                checked={hideInactive}
                onChange={(e) => setHideInactive(e.target.checked)}
              />
              Hide inactive
            </label>
          </div>
          {loading ? (
            <div className="master-empty">Loading franchises...</div>
          ) : visibleFranchises.length === 0 ? (
            <div className="master-empty">No franchises found.</div>
          ) : (
            <div className="master-franchise-list">
              {visibleFranchises.map((franchise) => {
                const franchiseUsers = usersByFranchise.get(franchise.id) || [];
                const owners = franchiseUsers.filter((u) => u.role === 'owner');
                const admins = franchiseUsers.filter((u) => u.role === 'admin');
                const designers = franchiseUsers.filter((u) => u.role === 'designer');
                const designerNames = designers
                  .map((designer) => (designer.name || '').trim())
                  .filter((name) => name.length > 0);
                const designerLabel = designerNames.length
                  ? designerNames.join(', ')
                  : designers.length
                  ? 'Unnamed'
                  : 'None';
                const inactive = franchise.deletedAt || franchise.isActive === false;
                return (
                  <div className={`master-franchise-row${inactive ? ' is-inactive' : ''}`} key={franchise.id}>
                    <div className="master-franchise-meta">
                      <div className="master-franchise-name">{franchise.name || franchise.id}</div>
                      <div className="master-franchise-code">{franchise.franchiseCode || 'No code'}</div>
                      {inactive && <div className="master-franchise-status">Inactive</div>}
                    </div>
                    <div className="master-franchise-users">
                      <div>
                        <strong>Owners:</strong>{' '}
                        {owners.length ? owners.map((u) => u.email).join(', ') : 'None'}
                      </div>
                      <div>
                        <strong>Admins:</strong>{' '}
                        {admins.length ? admins.map((u) => u.email).join(', ') : 'None'}
                      </div>
                      <div>
                        <strong>Designers:</strong>{' '}
                        {designerLabel}
                      </div>
                    </div>
                    <div className="master-franchise-actions">
                      <button
                        className="master-danger-btn"
                        type="button"
                        onClick={() => handleDeleteFranchise(franchise.id, franchise.name)}
                        disabled={deletingId === franchise.id}
                      >
                        {deletingId === franchise.id ? 'Deleting...' : 'Soft Delete'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {tempPassword && (
        <TempPasswordModal
          tempPassword={tempPassword}
          onClose={() => setTempPassword(null)}
          title="Owner Temporary Password"
          description="Copy this password for the owner. It will only be shown once."
        />
      )}
    </div>
  );
}

export default MasterPage;
