import { HashRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import HomePage from './pages/HomePage';
import ProposalForm from './pages/ProposalForm';
import ProposalView from './pages/ProposalView';
import ProposalsListPage from './pages/ProposalsListPage';
import TemplatesPage from './pages/TemplatesPage';
import SettingsPage from './pages/SettingsPage';
import NavigationBar from './components/NavigationBar';
import UpdateNotification from './components/UpdateNotification';
import ChangelogModal from './components/ChangelogModal';
import { setActiveFranchiseId } from './services/pricingDataStore';
import { ToastProvider } from './components/Toast';
import LoginModal from './components/LoginModal';
import AdminPanelPage from './pages/AdminPanelPage';
import AdminPricingPage from './pages/AdminPricingPage';
import { getSupabaseClient, getSupabaseReachability, isSupabaseEnabled } from './services/supabaseClient';
import CloudConnectionNotice, { CloudConnectionIssue } from './components/CloudConnectionNotice';
import useKeyboardNavigation from './hooks/useKeyboardNavigation';
import PasswordResetModal from './components/PasswordResetModal';
import ConfirmDialog from './components/ConfirmDialog';
import {
  completePasswordReset,
  confirmSessionTakeover,
  loadSessionFromSupabase,
  signInWithEmail,
  signOut,
} from './services/auth';
import { assertLoginAllowed, clearLoginAttempts, recordLoginFailure } from './services/loginRateLimiter';
import { APP_SESSION_HEARTBEAT_INTERVAL_MS, heartbeatUserAppSession } from './services/appSession';
import {
  DEFAULT_FRANCHISE_ID,
  type MasterImpersonation,
  type UserSession,
  clearSession,
  clearMasterImpersonation,
  readMasterImpersonation,
  saveMasterImpersonation,
  updateSession,
} from './services/session';
import {
  acknowledgeChangelog,
  getCurrentAppVersion,
  hasPendingChangelog,
  recordAppLaunch,
} from './services/changelogPrompt';
import MasterPage from './pages/MasterPage';
import type { MasterFranchise } from './services/masterAdminAdapter';
import AdminPinModal from './components/AdminPinModal';
import { useFranchiseAppName } from './hooks/useFranchiseAppName';
import {
  ADMIN_PANEL_PIN_LENGTH,
  ADMIN_PANEL_PIN_LOCKOUT_MESSAGE,
  clearAdminPanelPinFailures,
  getAdminPanelPinLockout,
  isAdminPanelPinValid,
  recordFailedAdminPanelPinAttempt,
  sanitizeAdminPanelPinInput,
} from './services/adminPanelPin';
import './App.css';

type PendingSessionTakeover = {
  session: UserSession;
};

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  useKeyboardNavigation();
  const [updateStatus, setUpdateStatus] = useState<'downloading' | 'ready' | 'error' | null>(null);
  const [updateError, setUpdateError] = useState<string>('');
  const [session, setSession] = useState<UserSession | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showChangelogPrompt, setShowChangelogPrompt] = useState(false);
  const [cloudIssue, setCloudIssue] = useState<CloudConnectionIssue>(null);
  const [masterImpersonation, setMasterImpersonation] = useState<MasterImpersonation | null>(() => readMasterImpersonation());
  const [pendingSessionTakeover, setPendingSessionTakeover] = useState<PendingSessionTakeover | null>(null);
  const [pendingSessionTakeoverError, setPendingSessionTakeoverError] = useState('');
  const [pendingSessionTakeoverLoading, setPendingSessionTakeoverLoading] = useState(false);
  const [showLoggedOutElsewhereNotice, setShowLoggedOutElsewhereNotice] = useState(false);
  const [adminPanelPin, setAdminPanelPin] = useState('');
  const [adminPanelPinError, setAdminPanelPinError] = useState('');
  const [adminPanelPinPrompt, setAdminPanelPinPrompt] = useState<{
    isOpen: boolean;
    targetPath: string | null;
    cancelDestination: string | null;
  }>({
    isOpen: false,
    targetPath: null,
    cancelDestination: null,
  });
  const [adminPanelAccessFranchiseId, setAdminPanelAccessFranchiseId] = useState<string | null>(null);
  const [adminPanelLockoutUntil, setAdminPanelLockoutUntil] = useState<number | null>(null);
  const forcingRemoteLogoutRef = useRef(false);
  const expectedLocalSignOutRef = useRef(false);
  const expectedLocalSignOutTimeoutRef = useRef<number | null>(null);
  const sessionRef = useRef<UserSession | null>(null);
  const appVersion = getCurrentAppVersion();

  const loadPricingForFranchise = useCallback(async (franchiseId: string) => {
    try {
      await setActiveFranchiseId(franchiseId);
    } catch (error) {
      console.warn('Unable to load pricing for franchise', franchiseId, error);
    }
  }, []);

  const resetSignedOutUiState = useCallback(() => {
    clearSession();
    clearMasterImpersonation();
    setSession(null);
    setShowLogin(true);
    setShowPasswordReset(false);
    setShowChangelogPrompt(false);
    setMasterImpersonation(null);
    setPendingSessionTakeover(null);
    setPendingSessionTakeoverError('');
    setPendingSessionTakeoverLoading(false);
    setAdminPanelAccessFranchiseId(null);
    setAdminPanelLockoutUntil(null);
    setAdminPanelPin('');
    setAdminPanelPinError('');
    setAdminPanelPinPrompt({ isOpen: false, targetPath: null, cancelDestination: null });
    void loadPricingForFranchise(DEFAULT_FRANCHISE_ID);
  }, [loadPricingForFranchise]);

  const markExpectedLocalSignOut = useCallback(() => {
    expectedLocalSignOutRef.current = true;
    if (expectedLocalSignOutTimeoutRef.current) {
      window.clearTimeout(expectedLocalSignOutTimeoutRef.current);
    }
    expectedLocalSignOutTimeoutRef.current = window.setTimeout(() => {
      expectedLocalSignOutRef.current = false;
      expectedLocalSignOutTimeoutRef.current = null;
    }, 5000);
  }, []);

  useEffect(() => {
    recordAppLaunch(appVersion);
  }, [appVersion]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      const shouldShowRemoteLogoutNotice =
        !expectedLocalSignOutRef.current && Boolean(sessionRef.current?.userId);
      if (expectedLocalSignOutTimeoutRef.current) {
        window.clearTimeout(expectedLocalSignOutTimeoutRef.current);
        expectedLocalSignOutTimeoutRef.current = null;
      }
      expectedLocalSignOutRef.current = false;

      window.setTimeout(() => {
        if (shouldShowRemoteLogoutNotice) {
          setShowLoggedOutElsewhereNotice(true);
        }
        resetSignedOutUiState();
      }, 0);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [resetSignedOutUiState]);

  useEffect(() => {
    // Restore session from Supabase Auth if possible
    let cancelled = false;
    const restoreSession = async () => {
      try {
        const restored = await loadSessionFromSupabase();
        if (cancelled) return;
        if (restored?.session) {
          setShowLoggedOutElsewhereNotice(false);
          setPendingSessionTakeover(null);
          setPendingSessionTakeoverError('');
          setPendingSessionTakeoverLoading(false);
          setSession(restored.session);
          setShowLogin(false);
          setShowPasswordReset(restored.passwordResetRequired);
          const isMaster = (restored.session.role || '').toLowerCase() === 'master';
          const activeImpersonation = isMaster ? readMasterImpersonation() : null;
          setMasterImpersonation(activeImpersonation);
          const targetId =
            activeImpersonation?.franchiseId ||
            restored.session.franchiseId ||
            DEFAULT_FRANCHISE_ID;
          void loadPricingForFranchise(targetId);
        } else {
          setShowLoggedOutElsewhereNotice(false);
          markExpectedLocalSignOut();
          void signOut();
          resetSignedOutUiState();
        }
      } catch (error) {
        console.warn('Unable to restore saved session:', error);
        setShowLoggedOutElsewhereNotice(false);
        resetSignedOutUiState();
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
  }, [markExpectedLocalSignOut, navigate, resetSignedOutUiState]);

  const isMaster = (session?.role || '').toLowerCase() === 'master';
  const effectiveSession = (() => {
    if (!session) return null;
    if (!isMaster || !masterImpersonation) return session;
    return {
      ...session,
      franchiseId: masterImpersonation.franchiseId,
      franchiseName: masterImpersonation.franchiseName || session.franchiseName,
      franchiseCode: masterImpersonation.franchiseCode || session.franchiseCode,
      role: (masterImpersonation.actingRole || 'owner') as UserSession['role'],
    };
  })();
  const { displayName } = useFranchiseAppName(effectiveSession?.franchiseId);

  useEffect(() => {
    if (effectiveSession?.franchiseId) {
      void loadPricingForFranchise(effectiveSession.franchiseId);
    }
  }, [effectiveSession?.franchiseId, loadPricingForFranchise]);

  useEffect(() => {
    document.title = `${displayName} Proposal Builder`;
  }, [displayName]);

  useEffect(() => {
    const appSessionId = session?.appSessionId;
    const appSessionLeaseToken = session?.appSessionLeaseToken;
    if (!appSessionId || !appSessionLeaseToken || showLogin) return;

    let cancelled = false;
    let inFlight = false;

    const verifyActiveSession = async () => {
      if (cancelled || inFlight || forcingRemoteLogoutRef.current) return;
      inFlight = true;
      try {
        const result = await heartbeatUserAppSession({
          appSessionId,
          appSessionLeaseToken,
        });
        if (!cancelled && result.status === 'displaced') {
          forcingRemoteLogoutRef.current = true;
          setShowLoggedOutElsewhereNotice(true);
          try {
            await signOut();
          } catch (error) {
            console.warn('Unable to sign out displaced session:', error);
          } finally {
            resetSignedOutUiState();
            forcingRemoteLogoutRef.current = false;
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Unable to verify active app session:', error);
        }
      } finally {
        inFlight = false;
      }
    };

    const handleFocusCheck = () => {
      if (document.visibilityState === 'hidden') return;
      void verifyActiveSession();
    };

    void verifyActiveSession();
    const intervalId = window.setInterval(() => {
      void verifyActiveSession();
    }, APP_SESSION_HEARTBEAT_INTERVAL_MS);

    window.addEventListener('focus', handleFocusCheck);
    window.addEventListener('online', handleFocusCheck);
    document.addEventListener('visibilitychange', handleFocusCheck);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocusCheck);
      window.removeEventListener('online', handleFocusCheck);
      document.removeEventListener('visibilitychange', handleFocusCheck);
    };
  }, [resetSignedOutUiState, session?.appSessionId, session?.appSessionLeaseToken, showLogin]);

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
      if (result.status === 'conflict') {
        setPendingSessionTakeover({
          session: result.session,
        });
        setPendingSessionTakeoverError('');
        setPendingSessionTakeoverLoading(false);
        return;
      }

      setShowLoggedOutElsewhereNotice(false);
      setPendingSessionTakeover(null);
      setPendingSessionTakeoverError('');
      setPendingSessionTakeoverLoading(false);
      setSession(result.session);
      setShowLogin(false);
      setShowPasswordReset(result.passwordResetRequired);
      const normalizedRole = (result.session.role || '').toLowerCase();
      if (normalizedRole === 'master') {
        setMasterImpersonation(readMasterImpersonation());
      } else {
        clearMasterImpersonation();
        setMasterImpersonation(null);
      }
      navigate('/', { replace: true });
      const targetId =
        (normalizedRole === 'master' ? readMasterImpersonation()?.franchiseId : null) ||
        result.session.franchiseId ||
        DEFAULT_FRANCHISE_ID;
      await loadPricingForFranchise(targetId);
    } catch (error) {
      recordLoginFailure(email, franchiseCode);
      throw error;
    }
  };

  const handleConfirmPendingSessionTakeover = useCallback(async () => {
    if (!pendingSessionTakeover) return;
    try {
      setPendingSessionTakeoverLoading(true);
      setPendingSessionTakeoverError('');
      const result = await confirmSessionTakeover(pendingSessionTakeover.session);
      setShowLoggedOutElsewhereNotice(false);
      setPendingSessionTakeover(null);
      setPendingSessionTakeoverLoading(false);
      setSession(result.session);
      setShowLogin(false);
      setShowPasswordReset(result.passwordResetRequired);
      const normalizedRole = (result.session.role || '').toLowerCase();
      if (normalizedRole === 'master') {
        setMasterImpersonation(readMasterImpersonation());
      } else {
        clearMasterImpersonation();
        setMasterImpersonation(null);
      }
      navigate('/', { replace: true });
      const targetId =
        (normalizedRole === 'master' ? readMasterImpersonation()?.franchiseId : null) ||
        result.session.franchiseId ||
        DEFAULT_FRANCHISE_ID;
      await loadPricingForFranchise(targetId);
    } catch (error: any) {
      setPendingSessionTakeoverError(error?.message || 'Unable to take over the existing session.');
      setPendingSessionTakeoverLoading(false);
    }
  }, [loadPricingForFranchise, navigate, pendingSessionTakeover]);

  const handleCancelPendingSessionTakeover = useCallback(async () => {
    setPendingSessionTakeover(null);
    setPendingSessionTakeoverError('');
    setPendingSessionTakeoverLoading(false);
    try {
      markExpectedLocalSignOut();
      await signOut();
    } catch (error) {
      console.warn('Unable to cancel pending session takeover:', error);
    } finally {
      resetSignedOutUiState();
    }
  }, [resetSignedOutUiState]);

  const handleLogout = async () => {
    setShowLoggedOutElsewhereNotice(false);
    try {
      markExpectedLocalSignOut();
      await signOut();
    } finally {
      resetSignedOutUiState();
    }
  };

  const handleActAsFranchise = useCallback(
    async (franchise: MasterFranchise) => {
      if (!franchise?.id) return;
      const next: MasterImpersonation = {
        franchiseId: franchise.id,
        franchiseName: franchise.name || undefined,
        franchiseCode: franchise.franchiseCode || undefined,
        actingRole: 'owner',
        startedAt: new Date().toISOString(),
      };
      saveMasterImpersonation(next);
      setMasterImpersonation(next);
      await loadPricingForFranchise(next.franchiseId);
      navigate('/', { replace: true });
    },
    [loadPricingForFranchise, navigate]
  );

  const handleStopActing = useCallback(async () => {
    clearMasterImpersonation();
    setMasterImpersonation(null);
    const targetId = session?.franchiseId || DEFAULT_FRANCHISE_ID;
    await loadPricingForFranchise(targetId);
    navigate('/master', { replace: true });
  }, [loadPricingForFranchise, navigate, session?.franchiseId]);

  const handleMasterFranchiseUpdated = useCallback((franchise: MasterFranchise) => {
    if (!franchise?.id) return;
    setMasterImpersonation((current) => {
      if (!current || current.franchiseId !== franchise.id) return current;
      const next: MasterImpersonation = {
        ...current,
        franchiseName: franchise.name || undefined,
        franchiseCode: franchise.franchiseCode || undefined,
      };
      saveMasterImpersonation(next);
      return next;
    });
  }, []);

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

  const isOffline = cloudIssue === 'no-internet' || cloudIssue === 'server-issue';
  const allowOfflineEditing =
    Boolean(session) &&
    (location.pathname.startsWith('/proposal/new') || location.pathname.startsWith('/proposal/edit/'));
  const showOfflineGate = isOffline && !allowOfflineEditing;

  // Show navigation bar on main pages, hide it on proposal form/view pages
  const showNavigation = !location.pathname.startsWith('/proposal/');
  const effectiveRole = (effectiveSession?.role || '').toLowerCase();
  const isAdmin = effectiveRole === 'admin' || effectiveRole === 'owner';
  const isMasterActingAsOwner =
    isMaster &&
    Boolean(masterImpersonation?.franchiseId) &&
    (masterImpersonation?.actingRole || 'owner') === 'owner';
  const adminPanelRequiresPin =
    isAdmin &&
    Boolean(effectiveSession?.franchiseId) &&
    !isMasterActingAsOwner;
  const isAdminPanelUnlocked = adminPanelAccessFranchiseId === (effectiveSession?.franchiseId || null);
  const canRenderAdminPanel = !adminPanelRequiresPin || isAdminPanelUnlocked;
  const isAdminPanelLocked = Boolean(adminPanelLockoutUntil && adminPanelLockoutUntil > Date.now());
  const isAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
  const actingLabel = isMaster && masterImpersonation
    ? masterImpersonation.franchiseName && masterImpersonation.franchiseCode
      ? `${masterImpersonation.franchiseName} (${masterImpersonation.franchiseCode})`
      : masterImpersonation.franchiseName ||
        masterImpersonation.franchiseCode ||
        masterImpersonation.franchiseId
    : null;

  useEffect(() => {
    if (!effectiveSession || showLogin || showPasswordReset) return;
    if (effectiveRole !== 'admin' && effectiveRole !== 'owner') return;
    if (!hasPendingChangelog(appVersion)) return;

    acknowledgeChangelog(appVersion);
    setShowChangelogPrompt(true);
  }, [appVersion, effectiveRole, effectiveSession, showLogin, showPasswordReset]);

  const openAdminPanelPrompt = useCallback(
    (options?: { targetPath?: string | null; cancelDestination?: string | null }) => {
      if (!adminPanelRequiresPin) return;
      const franchiseId = effectiveSession?.franchiseId;
      const lockout = franchiseId ? getAdminPanelPinLockout(franchiseId) : null;
      setAdminPanelPin('');
      setAdminPanelLockoutUntil(lockout?.lockedUntil ?? null);
      setAdminPanelPinError(lockout?.locked ? ADMIN_PANEL_PIN_LOCKOUT_MESSAGE : '');
      setAdminPanelPinPrompt({
        isOpen: true,
        targetPath: options?.targetPath ?? '/admin',
        cancelDestination: options?.cancelDestination ?? null,
      });
    },
    [adminPanelRequiresPin, effectiveSession?.franchiseId]
  );

  const handleAdminPanelTabClick = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>) => {
      if (!adminPanelRequiresPin || isAdminPanelUnlocked) return;
      event.preventDefault();
      openAdminPanelPrompt({ targetPath: '/admin', cancelDestination: null });
    },
    [adminPanelRequiresPin, isAdminPanelUnlocked, openAdminPanelPrompt]
  );

  const closeAdminPanelPrompt = useCallback(() => {
    const cancelDestination = adminPanelPinPrompt.cancelDestination;
    setAdminPanelPin('');
    setAdminPanelPinError((current) => (current === ADMIN_PANEL_PIN_LOCKOUT_MESSAGE ? current : ''));
    setAdminPanelPinPrompt({ isOpen: false, targetPath: null, cancelDestination: null });
    if (cancelDestination) {
      navigate(cancelDestination, { replace: true });
    }
  }, [adminPanelPinPrompt.cancelDestination, navigate]);

  const submitAdminPanelPin = useCallback(() => {
    const franchiseId = effectiveSession?.franchiseId;
    if (!franchiseId) return;

    const lockout = getAdminPanelPinLockout(franchiseId);
    if (lockout.locked) {
      setAdminPanelPin('');
      setAdminPanelLockoutUntil(lockout.lockedUntil ?? null);
      setAdminPanelPinError(ADMIN_PANEL_PIN_LOCKOUT_MESSAGE);
      return;
    }

    const normalizedPin = sanitizeAdminPanelPinInput(adminPanelPin);
    if (normalizedPin.length !== ADMIN_PANEL_PIN_LENGTH) {
      setAdminPanelPinError(`Enter ${ADMIN_PANEL_PIN_LENGTH} digits.`);
      return;
    }

    if (!isAdminPanelPinValid(franchiseId, normalizedPin)) {
      const failedAttempt = recordFailedAdminPanelPinAttempt(franchiseId);
      setAdminPanelPin('');
      setAdminPanelLockoutUntil(failedAttempt.lockedUntil ?? null);
      setAdminPanelPinError(failedAttempt.locked ? ADMIN_PANEL_PIN_LOCKOUT_MESSAGE : 'Incorrect PIN.');
      return;
    }

    clearAdminPanelPinFailures(franchiseId);
    const targetPath = adminPanelPinPrompt.targetPath;
    setAdminPanelAccessFranchiseId(franchiseId);
    setAdminPanelLockoutUntil(null);
    setAdminPanelPin('');
    setAdminPanelPinError('');
    setAdminPanelPinPrompt({ isOpen: false, targetPath: null, cancelDestination: null });
    if (targetPath) {
      navigate(targetPath);
    }
  }, [adminPanelPin, adminPanelPinPrompt.targetPath, effectiveSession?.franchiseId, navigate]);

  useEffect(() => {
    setAdminPanelAccessFranchiseId(null);
    setAdminPanelLockoutUntil(null);
    setAdminPanelPin('');
    setAdminPanelPinError('');
    setAdminPanelPinPrompt((current) => (current.isOpen ? { isOpen: false, targetPath: null, cancelDestination: null } : current));
  }, [effectiveSession?.userId, effectiveSession?.franchiseId]);

  useEffect(() => {
    if (!adminPanelLockoutUntil) return;
    const remainingMs = adminPanelLockoutUntil - Date.now();
    if (remainingMs <= 0) {
      setAdminPanelLockoutUntil(null);
      setAdminPanelPinError((current) => (current === ADMIN_PANEL_PIN_LOCKOUT_MESSAGE ? '' : current));
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAdminPanelLockoutUntil(null);
      setAdminPanelPinError((current) => (current === ADMIN_PANEL_PIN_LOCKOUT_MESSAGE ? '' : current));
    }, remainingMs + 50);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [adminPanelLockoutUntil]);

  useEffect(() => {
    if (!isAdminRoute) {
      setAdminPanelAccessFranchiseId(null);
    }
  }, [isAdminRoute]);

  useEffect(() => {
    if (!adminPanelPinPrompt.isOpen || isAdminPanelLocked) return;
    if (adminPanelPin.length !== ADMIN_PANEL_PIN_LENGTH) return;
    submitAdminPanelPin();
  }, [adminPanelPin, adminPanelPinPrompt.isOpen, isAdminPanelLocked, submitAdminPanelPin]);

  useEffect(() => {
    if (!isAdminRoute) return;
    if (!adminPanelRequiresPin || isAdminPanelUnlocked || adminPanelPinPrompt.isOpen) return;
    openAdminPanelPrompt({ targetPath: null, cancelDestination: '/' });
  }, [adminPanelPinPrompt.isOpen, adminPanelRequiresPin, isAdminPanelUnlocked, isAdminRoute, openAdminPanelPrompt]);

  return (
    <div className="app">
      {showNavigation && (
        <NavigationBar
          userName={session?.userName || session?.userEmail || 'User'}
          onLogout={session ? handleLogout : undefined}
          isAdmin={isAdmin}
          isMaster={isMaster}
          franchiseId={effectiveSession?.franchiseId}
          onAdminPanelClick={handleAdminPanelTabClick}
        />
      )}
      <Routes>
        <Route
          path="/"
          element={<HomePage session={effectiveSession} />}
        />
        <Route
          path="/admin"
          element={
            canRenderAdminPanel ? (
              <AdminPanelPage
                onOpenPricingData={() => navigate('/admin/pricing')}
                session={effectiveSession}
              />
            ) : null
          }
        />
        <Route
          path="/admin/pricing"
          element={canRenderAdminPanel ? <AdminPricingPage franchiseId={effectiveSession?.franchiseId} /> : null}
        />
        <Route path="/proposals" element={<ProposalsListPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route
          path="/master"
          element={
            <MasterPage
              session={session}
              onActAsFranchise={handleActAsFranchise}
              actingFranchiseId={masterImpersonation?.franchiseId}
              onFranchiseUpdated={handleMasterFranchiseUpdated}
            />
          }
        />
        <Route path="/proposal/new" element={<ProposalForm key="new" cloudIssue={cloudIssue} />} />
        <Route
          path="/proposal/edit/:proposalNumber"
          element={<ProposalForm key={location.pathname} cloudIssue={cloudIssue} />}
        />
        <Route path="/proposal/view/:proposalNumber" element={<ProposalView />} />
      </Routes>
      {(actingLabel || location.pathname === '/') && (
        <div className="app-bottom-left-meta">
          {actingLabel && (
            <div className="app-acting">
              <span className="app-acting-text">Acting as Owner for Franchise {actingLabel}</span>
              <button className="app-acting-btn" type="button" onClick={handleStopActing}>
                Sign Out
              </button>
            </div>
          )}
          {location.pathname === '/' && (
            <div className="app-version">v{window.electron?.appVersion || '1.0.5'}</div>
          )}
        </div>
      )}
      <UpdateNotification
        status={updateStatus}
        onInstall={handleInstallUpdate}
        errorMessage={updateError}
      />
      <CloudConnectionNotice reason={cloudIssue} />
      {showOfflineGate && (
        <div className="offline-gate" role="alert" aria-live="assertive">
          <div className="offline-gate-card">
            <div className="offline-gate-title">
              {cloudIssue === 'server-issue' ? 'Cloud Unavailable' : 'No Internet Connection'}
            </div>
            <div className="offline-gate-subtitle">
              {cloudIssue === 'server-issue'
                ? 'Cloud connection cannot be reached. Reconnect to continue.'
                : 'Reconnect to continue using Submerge.'}
            </div>
          </div>
        </div>
      )}
      {effectiveSession && location.pathname === '/' && (
        <div className="app-session-meta">
          <div className="app-session-line">
            Role: {effectiveSession.role ? effectiveSession.role.charAt(0).toUpperCase() + effectiveSession.role.slice(1) : 'Designer'}
          </div>
          <div className="app-session-line">
            {effectiveSession.franchiseName || effectiveSession.franchiseCode || effectiveSession.franchiseId || 'Unknown'}
          </div>
        </div>
      )}
      {showLogin && (
        <LoginModal onSubmit={handleLogin} existingEmail={session?.userEmail} />
      )}
      {showPasswordReset && (
        <PasswordResetModal onSubmit={handlePasswordReset} onLogout={handleLogout} />
      )}
      <ConfirmDialog
        open={Boolean(pendingSessionTakeover)}
        title="Account logged in on another device"
        message="Account logged in on another device. Sign out the other device?"
        confirmLabel="Yes, log me in"
        cancelLabel="No, go back"
        errorMessage={pendingSessionTakeoverError}
        isLoading={pendingSessionTakeoverLoading}
        onConfirm={() => {
          void handleConfirmPendingSessionTakeover();
        }}
        onCancel={() => {
          void handleCancelPendingSessionTakeover();
        }}
      />
      <ConfirmDialog
        open={showLoggedOutElsewhereNotice}
        title="Account logged in elsewhere"
        message="Account logged in elsewhere."
        confirmLabel="OK"
        hideCancel
        onConfirm={() => setShowLoggedOutElsewhereNotice(false)}
        onCancel={() => setShowLoggedOutElsewhereNotice(false)}
      />
      <AdminPinModal
        isOpen={adminPanelPinPrompt.isOpen}
        pin={adminPanelPin}
        error={adminPanelPinError}
        isDisabled={isAdminPanelLocked}
        onPinChange={(value) => {
          setAdminPanelPin(value);
          if (adminPanelPinError && adminPanelPinError !== ADMIN_PANEL_PIN_LOCKOUT_MESSAGE) {
            setAdminPanelPinError('');
          }
        }}
        onSubmit={submitAdminPanelPin}
        onClose={closeAdminPanelPrompt}
      />
      <ChangelogModal isOpen={showChangelogPrompt} onClose={() => setShowChangelogPrompt(false)} />
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
