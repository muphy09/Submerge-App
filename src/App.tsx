import { HashRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import HomePage from './pages/HomePage';
import ProposalForm from './pages/ProposalForm';
import ProposalView from './pages/ProposalView';
import WorkflowPage from './pages/WorkflowPage';
import SettingsPage from './pages/SettingsPage';
import NavigationBar from './components/NavigationBar';
import UpdateNotification from './components/UpdateNotification';
import ChangelogModal from './components/ChangelogModal';
import UserProfileModal from './components/UserProfileModal';
import { setActiveFranchiseId } from './services/pricingDataStore';
import { ToastProvider, useToast } from './components/Toast';
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
  clearRemoteSignoutNotice,
  markRemoteSignoutNotice,
  readMasterImpersonation,
  readSession,
  saveMasterImpersonation,
  subscribeToMasterImpersonationUpdates,
  shouldShowRemoteSignoutNotice,
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
import { useAdminPanelPin } from './hooks/useAdminPanelPin';
import { useGlobalFeedbackEnabled } from './hooks/useGlobalFeedbackEnabled';
import {
  ADMIN_PANEL_PIN_LENGTH,
  ADMIN_PANEL_PIN_LOCKOUT_MESSAGE,
  clearAdminPanelPinFailures,
  getAdminPanelPinLockout,
  isAdminPanelPinValid,
  recordFailedAdminPanelPinAttempt,
  sanitizeAdminPanelPinInput,
} from './services/adminPanelPin';
import {
  FEEDBACK_FEATURE_UNAVAILABLE_MESSAGE,
  GLOBAL_FEEDBACK_DISABLED_MESSAGE,
  isFeedbackFeatureUnavailableError,
  isGlobalFeedbackDisabledError,
  publishGlobalFeedbackEnabled,
  submitFeedback,
} from './services/feedback';
import { hasSeenFeedbackTutorial, markFeedbackTutorialSeen } from './services/feedbackTutorial';
import FeedbackLauncher from './components/FeedbackLauncher';
import FeedbackTutorialOverlay, { type FeedbackTutorialTargetRect } from './components/FeedbackTutorialOverlay';
import FeedbackSubmissionModal from './components/FeedbackSubmissionModal';
import { listProposals } from './services/proposalsAdapter';
import { countUnreadWorkflowEvents } from './services/proposalWorkflow';
import './App.css';

type PendingSessionTakeover = {
  session: UserSession;
};

function readFeedbackLauncherRect(element: HTMLButtonElement | null): FeedbackTutorialTargetRect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  useKeyboardNavigation();
  const [updateStatus, setUpdateStatus] = useState<'downloading' | 'ready' | 'error' | null>(null);
  const [updateError, setUpdateError] = useState<string>('');
  const [session, setSession] = useState<UserSession | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showChangelogPrompt, setShowChangelogPrompt] = useState(false);
  const [cloudIssue, setCloudIssue] = useState<CloudConnectionIssue>(null);
  const [masterImpersonation, setMasterImpersonation] = useState<MasterImpersonation | null>(() => readMasterImpersonation());
  const [pendingSessionTakeover, setPendingSessionTakeover] = useState<PendingSessionTakeover | null>(null);
  const [pendingSessionTakeoverError, setPendingSessionTakeoverError] = useState('');
  const [pendingSessionTakeoverLoading, setPendingSessionTakeoverLoading] = useState(false);
  const [showLoggedOutElsewhereNotice, setShowLoggedOutElsewhereNotice] = useState(() => shouldShowRemoteSignoutNotice());
  const [showSessionEndedNotice, setShowSessionEndedNotice] = useState(false);
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
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackAvailable, setFeedbackAvailable] = useState(true);
  const [feedbackTutorialSeen, setFeedbackTutorialSeen] = useState(true);
  const [feedbackInboxOpen, setFeedbackInboxOpen] = useState(false);
  const [feedbackInboxLoading, setFeedbackInboxLoading] = useState(false);
  const [feedbackLauncherRect, setFeedbackLauncherRect] = useState<FeedbackTutorialTargetRect | null>(null);
  const [workflowUnreadCount, setWorkflowUnreadCount] = useState(0);
  const forcingRemoteLogoutRef = useRef(false);
  const expectedLocalSignOutRef = useRef(false);
  const expectedLocalSignOutTimeoutRef = useRef<number | null>(null);
  const sessionRef = useRef<UserSession | null>(null);
  const feedbackLauncherRef = useRef<HTMLButtonElement | null>(null);
  const appVersion = getCurrentAppVersion();
  const { feedbackEnabled: globalFeedbackEnabled, isLoading: globalFeedbackEnabledLoading } =
    useGlobalFeedbackEnabled({ poll: Boolean(session) });

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
    setShowProfileSettings(false);
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

  const applySessionUiState = useCallback(
    async (
      nextSession: UserSession,
      options?: {
        passwordResetRequired?: boolean;
        navigateHome?: boolean;
      }
    ) => {
      clearRemoteSignoutNotice();
      setShowLoggedOutElsewhereNotice(false);
      setShowSessionEndedNotice(false);
      setPendingSessionTakeover(null);
      setPendingSessionTakeoverError('');
      setPendingSessionTakeoverLoading(false);
      setSession(nextSession);
      setShowLogin(false);
      setShowPasswordReset(Boolean(options?.passwordResetRequired));
      const normalizedRole = (nextSession.role || '').toLowerCase();
      if (normalizedRole === 'master') {
        setMasterImpersonation(readMasterImpersonation());
      } else {
        clearMasterImpersonation();
        setMasterImpersonation(null);
      }
      if (options?.navigateHome) {
        navigate('/', { replace: true });
      }
      const targetId =
        (normalizedRole === 'master' ? readMasterImpersonation()?.franchiseId : null) ||
        nextSession.franchiseId ||
        DEFAULT_FRANCHISE_ID;
      await loadPricingForFranchise(targetId);
    },
    [loadPricingForFranchise, navigate]
  );

  useEffect(() => {
    recordAppLaunch(appVersion);
  }, [appVersion]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!session?.userId) {
      setFeedbackTutorialSeen(true);
      return;
    }
    setFeedbackTutorialSeen(hasSeenFeedbackTutorial(session.userId));
  }, [session?.userId]);

  useEffect(() => {
    return subscribeToMasterImpersonationUpdates((nextImpersonation) => {
      setMasterImpersonation(nextImpersonation);
    });
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      const shouldShowNotice = !expectedLocalSignOutRef.current && Boolean(sessionRef.current?.userId);
      const shouldShowRemoteLogoutNotice =
        shouldShowNotice && (forcingRemoteLogoutRef.current || shouldShowRemoteSignoutNotice());
      const shouldShowSessionEndedMessage = shouldShowNotice && !shouldShowRemoteLogoutNotice;
      if (expectedLocalSignOutTimeoutRef.current) {
        window.clearTimeout(expectedLocalSignOutTimeoutRef.current);
        expectedLocalSignOutTimeoutRef.current = null;
      }
      expectedLocalSignOutRef.current = false;

      window.setTimeout(() => {
        if (shouldShowRemoteLogoutNotice) {
          markRemoteSignoutNotice();
          setShowLoggedOutElsewhereNotice(true);
          setShowSessionEndedNotice(false);
        } else if (shouldShowSessionEndedMessage) {
          clearRemoteSignoutNotice();
          setShowLoggedOutElsewhereNotice(false);
          setShowSessionEndedNotice(true);
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
      const savedSession = readSession();
      const hadSavedSession = Boolean(savedSession?.userId);
      try {
        const restored = await loadSessionFromSupabase();
        if (cancelled) return;
        if (restored.status === 'restored' || restored.status === 'unverified') {
          void applySessionUiState(restored.session, {
            passwordResetRequired: restored.passwordResetRequired,
          });
          return;
        }

        if (hadSavedSession && restored.reason === 'displaced') {
          markRemoteSignoutNotice();
          setShowLoggedOutElsewhereNotice(true);
          setShowSessionEndedNotice(false);
        } else if (hadSavedSession) {
          clearRemoteSignoutNotice();
          setShowLoggedOutElsewhereNotice(false);
          setShowSessionEndedNotice(true);
        } else {
          clearRemoteSignoutNotice();
          setShowLoggedOutElsewhereNotice(false);
          setShowSessionEndedNotice(false);
        }
        markExpectedLocalSignOut();
        void signOut();
        resetSignedOutUiState();
      } catch (error) {
        console.warn('Unable to restore saved session:', error);
        if (savedSession?.userId) {
          void applySessionUiState(savedSession, {
            passwordResetRequired: Boolean(savedSession.passwordResetRequired),
          });
          return;
        }
        clearRemoteSignoutNotice();
        setShowLoggedOutElsewhereNotice(false);
        setShowSessionEndedNotice(false);
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
  }, [applySessionUiState, markExpectedLocalSignOut, navigate, resetSignedOutUiState]);

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
  const effectiveRole = (effectiveSession?.role || '').toLowerCase();
  const isAdmin = effectiveRole === 'admin' || effectiveRole === 'owner';
  const canAccessWorkflow =
    Boolean(effectiveSession?.franchiseId) &&
    (effectiveRole === 'owner' || effectiveRole === 'admin' || effectiveRole === 'bookkeeper');
  const isMasterActingAsOwner =
    isMaster &&
    Boolean(masterImpersonation?.franchiseId) &&
    (masterImpersonation?.actingRole || 'owner') === 'owner';
  const canSubmitFeedback =
    Boolean(session) &&
    feedbackAvailable &&
    globalFeedbackEnabled &&
    !globalFeedbackEnabledLoading &&
    Boolean(effectiveSession?.franchiseId) &&
    (!isMaster || Boolean(masterImpersonation?.franchiseId));
  const isProposalBuilderRoute =
    location.pathname === '/proposal/new' || location.pathname.startsWith('/proposal/edit/');
  const adminPanelRequiresPin =
    isAdmin &&
    Boolean(effectiveSession?.franchiseId) &&
    !isMasterActingAsOwner;
  const { displayName } = useFranchiseAppName(effectiveSession?.franchiseId);
  const { adminPanelPin: storedAdminPanelPin, isLoading: adminPanelPinLoading } = useAdminPanelPin(
    adminPanelRequiresPin ? effectiveSession?.franchiseId : undefined
  );

  useEffect(() => {
    if (effectiveSession?.franchiseId) {
      void loadPricingForFranchise(effectiveSession.franchiseId);
    }
  }, [effectiveSession?.franchiseId, loadPricingForFranchise]);

  useEffect(() => {
    if (!canAccessWorkflow || !effectiveSession?.franchiseId || !effectiveSession?.userId) {
      setWorkflowUnreadCount(0);
      return;
    }

    let cancelled = false;

    const loadWorkflowUnreadCount = async () => {
      try {
        const proposals = await listProposals(effectiveSession.franchiseId);
        if (cancelled) return;
        const nextCount = proposals.reduce(
          (sum, proposal) => sum + countUnreadWorkflowEvents(proposal, effectiveSession.userId),
          0
        );
        setWorkflowUnreadCount(nextCount);
      } catch (error) {
        if (!cancelled) {
          console.warn('Unable to load workflow unread count:', error);
        }
      }
    };

    void loadWorkflowUnreadCount();
    const intervalId = window.setInterval(() => {
      void loadWorkflowUnreadCount();
    }, 30000);
    const handleOnline = () => {
      void loadWorkflowUnreadCount();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
    };
  }, [canAccessWorkflow, effectiveSession?.franchiseId, effectiveSession?.userId]);

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
          markRemoteSignoutNotice();
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

      await applySessionUiState(result.session, {
        passwordResetRequired: result.passwordResetRequired,
        navigateHome: true,
      });
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
      await applySessionUiState(result.session, {
        passwordResetRequired: result.passwordResetRequired,
        navigateHome: true,
      });
    } catch (error: any) {
      setPendingSessionTakeoverError(error?.message || 'Unable to take over the existing session.');
      setPendingSessionTakeoverLoading(false);
    }
  }, [applySessionUiState, pendingSessionTakeover]);

  const handleCancelPendingSessionTakeover = useCallback(async () => {
    setPendingSessionTakeover(null);
    setPendingSessionTakeoverError('');
    setPendingSessionTakeoverLoading(false);
    setShowSessionEndedNotice(false);
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
    clearRemoteSignoutNotice();
    setShowLoggedOutElsewhereNotice(false);
    setShowSessionEndedNotice(false);
    setShowProfileSettings(false);
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

  const handleProfileSessionUpdate = useCallback(
    (partial: Partial<Pick<UserSession, 'userName' | 'userEmail'>>) => {
      setSession((current) => {
        if (!current) return current;
        updateSession(partial);
        return { ...current, ...partial };
      });
    },
    []
  );

  const handleCloseChangelogPrompt = useCallback(() => {
    acknowledgeChangelog(appVersion);
    setShowChangelogPrompt(false);
  }, [appVersion]);

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
  const shouldShowFeedbackTutorial =
    location.pathname === '/' &&
    canSubmitFeedback &&
    Boolean(session?.userId) &&
    !feedbackTutorialSeen &&
    !showFeedbackModal &&
    !showChangelogPrompt &&
    !feedbackInboxLoading &&
    !feedbackInboxOpen &&
    !showOfflineGate &&
    Boolean(feedbackLauncherRect);

  useEffect(() => {
    if (showChangelogPrompt) return;
    if (!effectiveSession || showLogin || showPasswordReset) return;
    if (effectiveRole !== 'admin' && effectiveRole !== 'owner') return;
    if (!hasPendingChangelog(appVersion)) return;

    setShowChangelogPrompt(true);
  }, [appVersion, effectiveRole, effectiveSession, showChangelogPrompt, showLogin, showPasswordReset]);

  const openAdminPanelPrompt = useCallback(
    (options?: { targetPath?: string | null; cancelDestination?: string | null }) => {
      if (!adminPanelRequiresPin) return;
      const franchiseId = effectiveSession?.franchiseId;
      const lockout = franchiseId ? getAdminPanelPinLockout(franchiseId) : null;
      setAdminPanelPin('');
      setAdminPanelLockoutUntil(lockout?.lockedUntil ?? null);
      setAdminPanelPinError(
        adminPanelPinLoading ? '' : lockout?.locked ? ADMIN_PANEL_PIN_LOCKOUT_MESSAGE : ''
      );
      setAdminPanelPinPrompt({
        isOpen: true,
        targetPath: options?.targetPath ?? '/admin',
        cancelDestination: options?.cancelDestination ?? null,
      });
    },
    [adminPanelPinLoading, adminPanelRequiresPin, effectiveSession?.franchiseId]
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

  const dismissFeedbackTutorial = useCallback(() => {
    const userId = session?.userId;
    if (!userId) return;
    markFeedbackTutorialSeen(userId);
    setFeedbackTutorialSeen(true);
  }, [session?.userId]);

  const handleOpenFeedbackModal = useCallback(() => {
    if (!canSubmitFeedback) return;
    if (shouldShowFeedbackTutorial) {
      dismissFeedbackTutorial();
    }
    setFeedbackError('');
    setShowFeedbackModal(true);
  }, [canSubmitFeedback, dismissFeedbackTutorial, shouldShowFeedbackTutorial]);

  const handleCloseFeedbackModal = useCallback(() => {
    if (feedbackSubmitting) return;
    setShowFeedbackModal(false);
    setFeedbackError('');
    setFeedbackMessage('');
  }, [feedbackSubmitting]);

  const handleSubmitFeedback = useCallback(async () => {
    const franchiseId = effectiveSession?.franchiseId;
    const trimmedMessage = feedbackMessage.trim();
    if (!franchiseId) {
      setFeedbackError('A franchise is required to submit feedback.');
      return;
    }
    if (!trimmedMessage) {
      setFeedbackError('Please enter a feedback message before sending.');
      return;
    }

    setFeedbackSubmitting(true);
    setFeedbackError('');
    try {
      await submitFeedback({
        franchiseId,
        message: trimmedMessage,
        appVersion,
        effectiveRole: effectiveRole || null,
      });
      setShowFeedbackModal(false);
      setFeedbackMessage('');
      showToast({ type: 'success', message: 'Feedback submitted.' });
    } catch (error: any) {
      if (isFeedbackFeatureUnavailableError(error)) {
        setFeedbackAvailable(false);
        showToast({ type: 'error', message: FEEDBACK_FEATURE_UNAVAILABLE_MESSAGE });
        return;
      }
      if (isGlobalFeedbackDisabledError(error)) {
        publishGlobalFeedbackEnabled(false);
        setShowFeedbackModal(false);
        setFeedbackMessage('');
        setFeedbackError('');
        showToast({ type: 'error', message: GLOBAL_FEEDBACK_DISABLED_MESSAGE });
        return;
      }
      console.error('Failed to submit feedback:', error);
      setFeedbackError(error?.message || 'Unable to submit feedback.');
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [appVersion, effectiveRole, effectiveSession?.franchiseId, feedbackMessage, showToast]);

  const submitAdminPanelPin = useCallback(() => {
    const franchiseId = effectiveSession?.franchiseId;
    if (!franchiseId) return;
    if (adminPanelPinLoading) return;

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

    if (normalizedPin !== storedAdminPanelPin && !isAdminPanelPinValid(franchiseId, normalizedPin)) {
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
  }, [
    adminPanelPin,
    adminPanelPinLoading,
    adminPanelPinPrompt.targetPath,
    effectiveSession?.franchiseId,
    navigate,
    storedAdminPanelPin,
  ]);

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
    if (!adminPanelPinPrompt.isOpen || isAdminPanelLocked || adminPanelPinLoading) return;
    if (adminPanelPin.length !== ADMIN_PANEL_PIN_LENGTH) return;
    submitAdminPanelPin();
  }, [adminPanelPin, adminPanelPinLoading, adminPanelPinPrompt.isOpen, isAdminPanelLocked, submitAdminPanelPin]);

  useEffect(() => {
    if (!isAdminRoute) return;
    if (!adminPanelRequiresPin || isAdminPanelUnlocked || adminPanelPinPrompt.isOpen) return;
    openAdminPanelPrompt({ targetPath: null, cancelDestination: '/' });
  }, [adminPanelPinPrompt.isOpen, adminPanelRequiresPin, isAdminPanelUnlocked, isAdminRoute, openAdminPanelPrompt]);

  useEffect(() => {
    if (canSubmitFeedback) return;
    setShowFeedbackModal(false);
    setFeedbackMessage('');
    setFeedbackError('');
    setFeedbackSubmitting(false);
    setFeedbackLauncherRect(null);
  }, [canSubmitFeedback]);

  useEffect(() => {
    if (location.pathname === '/') return;
    setFeedbackInboxOpen(false);
    setFeedbackInboxLoading(false);
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname === '/' && session?.userId) {
      setFeedbackInboxLoading(true);
      return;
    }
    setFeedbackInboxLoading(false);
  }, [location.pathname, session?.userId]);

  useEffect(() => {
    if (!canSubmitFeedback || location.pathname !== '/') {
      setFeedbackLauncherRect(null);
      return;
    }

    const syncRect = () => {
      setFeedbackLauncherRect(readFeedbackLauncherRect(feedbackLauncherRef.current));
    };

    const animationFrame = window.requestAnimationFrame(syncRect);
    const handleResize = () => syncRect();
    window.addEventListener('resize', handleResize);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', handleResize);
    };
  }, [canSubmitFeedback, effectiveSession?.franchiseId, location.pathname, updateStatus]);

  return (
    <div className="app">
      {showNavigation && (
        <NavigationBar
          userName={session?.userName || session?.userEmail || 'User'}
          onLogout={session ? handleLogout : undefined}
          onProfileSettings={session ? () => setShowProfileSettings(true) : undefined}
          isAdmin={isAdmin}
          isMaster={isMaster}
          franchiseId={effectiveSession?.franchiseId}
          showWorkflowTab={canAccessWorkflow}
          workflowUnreadCount={workflowUnreadCount}
          onAdminPanelClick={handleAdminPanelTabClick}
        />
      )}
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              session={effectiveSession}
              onFeedbackInboxLoadingChange={setFeedbackInboxLoading}
              onFeedbackInboxVisibilityChange={setFeedbackInboxOpen}
            />
          }
        />
        <Route
          path="/admin"
          element={
            canRenderAdminPanel ? (
              <AdminPanelPage
                onOpenPricingData={() => navigate('/admin/pricing')}
                session={effectiveSession}
                offsetSettingsLauncher={Boolean(actingLabel)}
              />
            ) : null
          }
        />
        <Route
          path="/admin/pricing"
          element={canRenderAdminPanel ? <AdminPricingPage franchiseId={effectiveSession?.franchiseId} /> : null}
        />
        <Route path="/workflow" element={<WorkflowPage session={effectiveSession} />} />
        <Route path="/workflow/:proposalNumber" element={<WorkflowPage session={effectiveSession} />} />
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
        <Route
          path="/proposal/new"
          element={
            <ProposalForm
              key="new"
              cloudIssue={cloudIssue}
              showFeedbackButton={canSubmitFeedback}
              onOpenFeedback={handleOpenFeedbackModal}
            />
          }
        />
        <Route
          path="/proposal/edit/:proposalNumber"
          element={
            <ProposalForm
              key={location.pathname}
              cloudIssue={cloudIssue}
              showFeedbackButton={canSubmitFeedback}
              onOpenFeedback={handleOpenFeedbackModal}
            />
          }
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
      {canSubmitFeedback && !isProposalBuilderRoute && (
        <div
          className={`app-feedback-anchor${updateStatus ? ' has-update' : ''}${effectiveSession && location.pathname === '/' ? ' has-session-meta' : ''}`}
        >
          <FeedbackLauncher ref={feedbackLauncherRef} onClick={handleOpenFeedbackModal} />
        </div>
      )}
      {shouldShowFeedbackTutorial && feedbackLauncherRect && (
        <FeedbackTutorialOverlay
          isOpen={shouldShowFeedbackTutorial}
          targetRect={feedbackLauncherRect}
          onDismiss={dismissFeedbackTutorial}
        />
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
      <UserProfileModal
        isOpen={showProfileSettings}
        session={session}
        onClose={() => setShowProfileSettings(false)}
        onLogout={handleLogout}
        onSessionUpdated={handleProfileSessionUpdate}
      />
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
        onConfirm={() => {
          clearRemoteSignoutNotice();
          setShowLoggedOutElsewhereNotice(false);
        }}
        onCancel={() => {
          clearRemoteSignoutNotice();
          setShowLoggedOutElsewhereNotice(false);
        }}
      />
      <ConfirmDialog
        open={showSessionEndedNotice}
        title="Session ended"
        message="Your session ended. Please sign in again."
        confirmLabel="OK"
        hideCancel
        onConfirm={() => {
          setShowSessionEndedNotice(false);
        }}
        onCancel={() => {
          setShowSessionEndedNotice(false);
        }}
      />
      <AdminPinModal
        isOpen={adminPanelPinPrompt.isOpen}
        pin={adminPanelPin}
        error={adminPanelPinError}
        statusMessage={adminPanelPinLoading ? 'Loading current franchise PIN...' : ''}
        isDisabled={isAdminPanelLocked || adminPanelPinLoading}
        onPinChange={(value) => {
          setAdminPanelPin(value);
          if (adminPanelPinError && adminPanelPinError !== ADMIN_PANEL_PIN_LOCKOUT_MESSAGE) {
            setAdminPanelPinError('');
          }
        }}
        onSubmit={submitAdminPanelPin}
        onClose={closeAdminPanelPrompt}
      />
      <ChangelogModal isOpen={showChangelogPrompt} onClose={handleCloseChangelogPrompt} />
      <FeedbackSubmissionModal
        isOpen={showFeedbackModal}
        message={feedbackMessage}
        isSubmitting={feedbackSubmitting}
        errorMessage={feedbackError}
        onMessageChange={setFeedbackMessage}
        onSubmit={() => {
          void handleSubmitFeedback();
        }}
        onClose={handleCloseFeedbackModal}
      />
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
