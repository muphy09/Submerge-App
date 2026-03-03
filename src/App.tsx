import { HashRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import HomePage from './pages/HomePage';
import ProposalForm from './pages/ProposalForm';
import ProposalView from './pages/ProposalView';
import ProposalsListPage from './pages/ProposalsListPage';
import TemplatesPage from './pages/TemplatesPage';
import SettingsPage from './pages/SettingsPage';
import NavigationBar from './components/NavigationBar';
import UpdateNotification from './components/UpdateNotification';
import PricingDataModal from './components/PricingDataModal';
import { initPricingDataStore, setActiveFranchiseId } from './services/pricingDataStore';
import { ToastProvider } from './components/Toast';
import LoginModal from './components/LoginModal';
import AdminPanelPage from './pages/AdminPanelPage';
import { getSupabaseReachability, isSupabaseEnabled } from './services/supabaseClient';
import CloudConnectionNotice, { CloudConnectionIssue } from './components/CloudConnectionNotice';
import useKeyboardNavigation from './hooks/useKeyboardNavigation';
import PasswordResetModal from './components/PasswordResetModal';
import { completePasswordReset, loadSessionFromSupabase, signInWithEmail, signOut } from './services/auth';
import { assertLoginAllowed, clearLoginAttempts, recordLoginFailure } from './services/loginRateLimiter';
import { DEFAULT_FRANCHISE_ID, type UserSession, updateSession } from './services/session';
import MasterPage from './pages/MasterPage';
import './App.css';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  useKeyboardNavigation();
  const [updateStatus, setUpdateStatus] = useState<'downloading' | 'ready' | 'error' | null>(null);
  const [updateError, setUpdateError] = useState<string>('');
  const [showPricingData, setShowPricingData] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [cloudIssue, setCloudIssue] = useState<CloudConnectionIssue>(null);

  const loadPricingForFranchise = useCallback(async (franchiseId: string) => {
    try {
      await initPricingDataStore(franchiseId);
      await setActiveFranchiseId(franchiseId);
    } catch (error) {
      console.warn('Unable to load pricing for franchise', franchiseId, error);
    }
  }, []);

  useEffect(() => {
    // Restore session from Supabase Auth if possible
    let cancelled = false;
    const restoreSession = async () => {
      try {
        const restored = await loadSessionFromSupabase();
        if (cancelled) return;
        if (restored?.session) {
          setSession(restored.session);
          setShowLogin(false);
          setShowPasswordReset(restored.passwordResetRequired);
          const targetId = restored.session.franchiseId || DEFAULT_FRANCHISE_ID;
          void loadPricingForFranchise(targetId);
        } else {
          setSession(null);
          void signOut();
          setShowLogin(true);
        }
      } catch (error) {
        console.warn('Unable to restore saved session:', error);
        setShowLogin(true);
      }
    };

    void restoreSession();

    // Listen for proposals opened from file system
    if (window.electron && window.electron.onOpenProposal) {
      window.electron.onOpenProposal((proposal: any) => {
        // Navigate to the proposal view page
        navigate(`/proposal/view/${proposal.proposalNumber}`);
      });
    }

    // Listen for update events
    if (window.electron) {
      window.electron.onUpdateAvailable(() => {
        setUpdateStatus('downloading');
      });

      window.electron.onUpdateDownloaded(() => {
        setUpdateStatus('ready');
      });

      window.electron.onUpdateError((error: string) => {
        console.error('Auto-update error:', error);
        setUpdateStatus('error');
        setUpdateError('Error checking for updates');
        // Clear error after 10 seconds
        setTimeout(() => setUpdateStatus(null), 10000);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (session?.franchiseId) {
      void loadPricingForFranchise(session.franchiseId);
    }
  }, [session?.franchiseId, loadPricingForFranchise]);

  const handleInstallUpdate = () => {
    if (window.electron) {
      window.electron.installUpdate();
    }
  };

  const handleLogin = async ({
    email,
    password,
    franchiseCode,
  }: {
    email: string;
    password: string;
    franchiseCode?: string;
  }) => {
    assertLoginAllowed(email, franchiseCode);
    try {
      const result = await signInWithEmail({ email, password, franchiseCode });
      clearLoginAttempts(email, franchiseCode);
      setSession(result.session);
      setShowLogin(false);
      setShowPasswordReset(result.passwordResetRequired);
      navigate('/', { replace: true });
      const targetId = result.session.franchiseId || DEFAULT_FRANCHISE_ID;
      await loadPricingForFranchise(targetId);
    } catch (error) {
      recordLoginFailure(email, franchiseCode);
      throw error;
    }
  };

  const handleLogout = async () => {
    await signOut();
    setSession(null);
    setShowLogin(true);
    setShowPasswordReset(false);
    try {
      await loadPricingForFranchise(DEFAULT_FRANCHISE_ID);
    } catch (error) {
      console.warn('Unable to reset pricing to default on logout:', error);
    }
  };

  const handlePasswordReset = async (newPassword: string) => {
    await completePasswordReset(newPassword);
    const updated = updateSession({ passwordResetRequired: false });
    if (updated) {
      setSession(updated);
    }
    setShowPasswordReset(false);
  };

  useEffect(() => {
    if (!isSupabaseEnabled()) return;
    let cancelled = false;

    const updateCloudStatus = async (forceRefresh = false) => {
      const reachability = await getSupabaseReachability(forceRefresh);
      if (cancelled) return;
      if (!reachability.reachable && (reachability.reason === 'no-internet' || reachability.reason === 'server-issue')) {
        setCloudIssue(reachability.reason);
      } else {
        setCloudIssue(null);
      }
    };

    const handleOffline = () => setCloudIssue('no-internet');
    const handleOnline = () => void updateCloudStatus(true);

    void updateCloudStatus(true);
    const intervalId = window.setInterval(() => {
      void updateCloudStatus(true);
    }, 15000);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Show navigation bar on main pages, hide it on proposal form/view pages
  const showNavigation = !location.pathname.startsWith('/proposal/');

  return (
    <div className="app">
      {showNavigation && (
        <NavigationBar
          userName={session?.userName || session?.userEmail || 'User'}
          onLogout={session ? handleLogout : undefined}
          isAdmin={['owner', 'admin'].includes((session?.role || '').toLowerCase())}
          isMaster={(session?.role || '').toLowerCase() === 'master'}
          franchiseId={session?.franchiseId}
        />
      )}
      <Routes>
        <Route
          path="/"
          element={<HomePage session={session} />}
        />
        <Route
          path="/admin"
          element={
            <AdminPanelPage
              onOpenPricingData={() => setShowPricingData(true)}
              session={session}
            />
          }
        />
        <Route path="/proposals" element={<ProposalsListPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/master" element={<MasterPage session={session} />} />
        <Route path="/proposal/new" element={<ProposalForm key="new" />} />
        <Route path="/proposal/edit/:proposalNumber" element={<ProposalForm key={location.pathname} />} />
        <Route path="/proposal/view/:proposalNumber" element={<ProposalView />} />
      </Routes>
      {location.pathname === '/' && (
        <div className="app-version">v{window.electron?.appVersion || '1.0.5'}</div>
      )}
      <UpdateNotification
        status={updateStatus}
        onInstall={handleInstallUpdate}
        errorMessage={updateError}
      />
      <CloudConnectionNotice reason={cloudIssue} />
      {session && location.pathname === '/' && (
        <div className="app-session-meta">
          <div className="app-session-line">
            Role: {session.role ? session.role.charAt(0).toUpperCase() + session.role.slice(1) : 'Designer'}
          </div>
          <div className="app-session-line">
            {session.franchiseName || session.franchiseCode || session.franchiseId || 'Unknown'}
          </div>
        </div>
      )}
      {showPricingData && (
        <PricingDataModal
          onClose={() => setShowPricingData(false)}
          franchiseId={session?.franchiseId}
        />
      )}
      {showLogin && (
        <LoginModal onSubmit={handleLogin} existingEmail={session?.userEmail} />
      )}
      {showPasswordReset && (
        <PasswordResetModal onSubmit={handlePasswordReset} onLogout={handleLogout} />
      )}
    </div>
  );
}

function App() {
  return (
    <Router>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </Router>
  );
}

export default App;
