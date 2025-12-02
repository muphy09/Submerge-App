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
import { assertDesignerAllowed, ensureAdminUser } from './services/franchiseUsersAdapter';
import './App.css';

type UserSession = {
  userName: string;
  franchiseId: string;
  franchiseName?: string;
  franchiseCode: string;
  role?: 'admin' | 'designer';
};

const SESSION_STORAGE_KEY = 'submerge-user-session';
const DEFAULT_FRANCHISE_ID = 'default';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [updateStatus, setUpdateStatus] = useState<'downloading' | 'ready' | 'error' | null>(null);
  const [updateError, setUpdateError] = useState<string>('');
  const [showPricingData, setShowPricingData] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  const loadPricingForFranchise = useCallback(async (franchiseId: string) => {
    try {
      await initPricingDataStore(franchiseId);
      await setActiveFranchiseId(franchiseId);
    } catch (error) {
      console.warn('Unable to load pricing for franchise', franchiseId, error);
    }
  }, []);

  useEffect(() => {
    // Restore session if present
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as UserSession;
        setSession(saved);
        void loadPricingForFranchise(saved.franchiseId);
      } else {
        setShowLogin(true);
      }
    } catch (error) {
      console.warn('Unable to restore saved session:', error);
      setShowLogin(true);
    }

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

  const handleLogin = async ({ userName, franchiseCode }: { userName: string; franchiseCode: string }) => {
    if (!window.electron?.enterFranchiseCode) {
      throw new Error('Franchise code login is not available.');
    }
    const response = await window.electron.enterFranchiseCode({
      franchiseCode,
      displayName: userName,
    });

    const isAdminLogin = String(franchiseCode || '').trim().toUpperCase().endsWith('-A');

    // Validate or create user in Supabase
    if (isAdminLogin) {
      await ensureAdminUser(response.franchiseId, userName);
    } else {
      await assertDesignerAllowed(response.franchiseId, userName);
    }

    const nextSession: UserSession = {
      userName,
      franchiseId: response.franchiseId,
      franchiseName: response.franchiseName,
      franchiseCode: response.franchiseCode,
      role: response.role || 'designer',
    };

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    setShowLogin(false);
    navigate('/', { replace: true });
    await loadPricingForFranchise(response.franchiseId);
  };

  const handleLogout = async () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
    setShowLogin(true);
    try {
      await loadPricingForFranchise(DEFAULT_FRANCHISE_ID);
    } catch (error) {
      console.warn('Unable to reset pricing to default on logout:', error);
    }
  };

  // Show navigation bar on main pages, hide it on proposal form/view pages
  const showNavigation = !location.pathname.startsWith('/proposal/');

  return (
    <div className="app">
      {showNavigation && (
        <NavigationBar
          userName={session?.userName || 'User'}
          onLogout={session ? handleLogout : undefined}
          isAdmin={(session?.role || '').toLowerCase() === 'admin'}
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
      {session && location.pathname === '/' && (
        <div className="app-session-meta">
          <div className="app-session-line">Role: {session.role ? session.role.charAt(0).toUpperCase() + session.role.slice(1) : 'Designer'}</div>
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
        <LoginModal onSubmit={handleLogin} existingName={session?.userName} />
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
