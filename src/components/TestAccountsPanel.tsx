import { useEffect, useMemo, useState } from 'react';
import TempPasswordModal from './TempPasswordModal';
import {
  clearTestProposals,
  createTestAccount,
  listTestAccounts,
  resetTestAccountPassword,
  setTestAccountActive,
  type TestAccount,
  type TestAccountRole,
} from '../services/testAccountsAdapter';
import './TestAccountsPanel.css';

const ROLE_ROWS: Array<{ role: TestAccountRole; handle: string; label: string }> = [
  { role: 'designer', handle: 'dtest', label: 'Designer' },
  { role: 'bookkeeper', handle: 'bktest', label: 'Book Keeper' },
  { role: 'admin', handle: 'atest', label: 'Admin' },
  { role: 'owner', handle: 'otest', label: 'Owner' },
];

type TempPasswordState = { password: string; roleLabel: string } | null;

export default function TestAccountsPanel() {
  const [accounts, setAccounts] = useState<TestAccount[]>([]);
  const [emails, setEmails] = useState<Record<TestAccountRole, string>>({
    designer: '',
    bookkeeper: '',
    admin: '',
    owner: '',
  });
  const [loading, setLoading] = useState(true);
  const [workingRole, setWorkingRole] = useState<TestAccountRole | null>(null);
  const [clearing, setClearing] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [tempPassword, setTempPassword] = useState<TempPasswordState>(null);

  const byRole = useMemo(
    () => new Map(accounts.map((account) => [account.role, account])),
    [accounts]
  );

  const refresh = async () => {
    setLoading(true);
    try {
      setAccounts(await listTestAccounts());
    } catch (error: any) {
      setStatus({ tone: 'error', message: error?.message || 'Unable to load testing accounts.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const createAccount = async (role: TestAccountRole, handle: string, roleLabel: string) => {
    const email = String(emails[role] || '').trim().toLowerCase();
    if (!email) {
      setStatus({ tone: 'error', message: `Enter an email address for ${handle}.` });
      return;
    }
    setWorkingRole(role);
    setStatus(null);
    try {
      const result = await createTestAccount({ email, name: handle, role });
      setAccounts((current) => [...current.filter((entry) => entry.role !== role), result.account]);
      setTempPassword({ password: result.tempPassword, roleLabel });
      setStatus({ tone: 'success', message: `${roleLabel} testing account created.` });
    } catch (error: any) {
      setStatus({ tone: 'error', message: error?.message || 'Unable to create the testing account.' });
    } finally {
      setWorkingRole(null);
    }
  };

  const resetPassword = async (account: TestAccount, roleLabel: string) => {
    if (!window.confirm(`Reset the password for ${account.email}?`)) return;
    setWorkingRole(account.role);
    setStatus(null);
    try {
      const password = await resetTestAccountPassword(account.id);
      setTempPassword({ password, roleLabel });
      setAccounts((current) =>
        current.map((entry) => entry.id === account.id ? { ...entry, passwordResetRequired: true } : entry)
      );
      setStatus({ tone: 'success', message: `${roleLabel} temporary password created.` });
    } catch (error: any) {
      setStatus({ tone: 'error', message: error?.message || 'Unable to reset the testing password.' });
    } finally {
      setWorkingRole(null);
    }
  };

  const toggleActive = async (account: TestAccount) => {
    setWorkingRole(account.role);
    setStatus(null);
    try {
      const updated = await setTestAccountActive(account.id, !account.isActive);
      setAccounts((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setStatus({ tone: 'success', message: `${updated.email} ${updated.isActive ? 'enabled' : 'disabled'}.` });
    } catch (error: any) {
      setStatus({ tone: 'error', message: error?.message || 'Unable to update the testing account.' });
    } finally {
      setWorkingRole(null);
    }
  };

  const clearAllProposals = async () => {
    if (!window.confirm('Delete every isolated testing proposal across all franchises?')) return;
    setClearing(true);
    setStatus(null);
    try {
      const count = await clearTestProposals();
      setStatus({ tone: 'success', message: `${count} testing proposal${count === 1 ? '' : 's'} cleared.` });
    } catch (error: any) {
      setStatus({ tone: 'error', message: error?.message || 'Unable to clear testing proposals.' });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="master-card test-accounts-card">
      <div className="master-card-header test-accounts-header">
        <div>
          <h2>Designated Testing Accounts</h2>
          <p>
            One account per role can enter any active franchise code. Live pricing and contracts are read-only;
            proposals and workflow actions remain in the test sandbox.
          </p>
        </div>
        <button className="master-secondary-btn master-small-btn" type="button" onClick={clearAllProposals} disabled={clearing}>
          {clearing ? 'Clearing...' : 'Clear Test Proposals'}
        </button>
      </div>

      <div className="test-accounts-security-note">
        Each account receives a one-time temporary password. Set a different permanent password for every role after its first login.
      </div>

      {status && <div className={`test-accounts-status is-${status.tone}`}>{status.message}</div>}

      {loading ? (
        <div className="master-empty">Loading testing accounts...</div>
      ) : (
        <div className="test-accounts-list">
          {ROLE_ROWS.map(({ role, handle, label }) => {
            const account = byRole.get(role);
            const working = workingRole === role;
            return (
              <div className="test-account-row" key={role}>
                <div className="test-account-identity">
                  <strong>{handle}</strong>
                  <span>{label}</span>
                </div>
                {account ? (
                  <>
                    <div className="test-account-email">{account.email}</div>
                    <div className={`test-account-state${account.isActive ? ' is-active' : ''}`}>
                      {account.isActive ? 'Active' : 'Disabled'}
                      {account.passwordResetRequired ? ' · Password setup required' : ''}
                    </div>
                    <div className="test-account-actions">
                      <button className="master-secondary-btn master-small-btn" type="button" disabled={working} onClick={() => void resetPassword(account, label)}>
                        Reset Password
                      </button>
                      <button className="master-secondary-btn master-small-btn" type="button" disabled={working} onClick={() => void toggleActive(account)}>
                        {account.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <input
                      className="test-account-email-input"
                      type="email"
                      value={emails[role]}
                      onChange={(event) => setEmails((current) => ({ ...current, [role]: event.target.value }))}
                      placeholder={`${handle}@your-domain.com`}
                    />
                    <div className="test-account-state">Not created</div>
                    <div className="test-account-actions">
                      <button className="master-primary-btn master-small-btn" type="button" disabled={working} onClick={() => void createAccount(role, handle, label)}>
                        {working ? 'Creating...' : 'Create'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tempPassword && (
        <TempPasswordModal
          tempPassword={tempPassword.password}
          onClose={() => setTempPassword(null)}
          title={`${tempPassword.roleLabel} Testing Password`}
          description="Copy this temporary password now. The testing account must replace it with a unique permanent password at first login."
        />
      )}
    </div>
  );
}
