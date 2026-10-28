import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Proposal } from '../types/proposal-new';
import { useToast } from '../components/Toast';
import FeedbackReplyInboxModal from '../components/FeedbackReplyInboxModal';
import DashboardProposalsPanel, { loadDashboardPricingDirectory, type DashboardPricingDirectory } from '../components/DashboardProposalsPanel';
import RecentActivity from '../components/RecentActivity';
import { useFranchiseCapability } from '../hooks/useFranchiseCapability';
import './HomePage.css';
import {
  deleteProposal,
  getLocalProposalLoadIssues,
  listDashboardProposals,
  PROPOSAL_CLOUD_SYNC_EVENT,
  type LocalProposalLoadIssue,
} from '../services/proposalsAdapter';
import { isCloudOnlyRenderRecoveryEnabled } from '../services/renderRecovery';
import { getSessionFranchiseId, isMasterActingAsOwnerSession, readSession, type UserSession } from '../services/session';
import { recordRecentProposalOpen } from '../services/recentProposalActivity';
import { captureProposalContext } from '../services/proposalContext';
import {
  isCollaborationAvailable, listCollaborationEvents,
  listOwnedSharedProposalRecipients, listSharedProposals,
  type CollaborationEvent, type SharedProposal,
} from '../services/proposalCollaboration';
import {
  acknowledgeFeedbackReply,
  isFeedbackFeatureUnavailableError,
  listPendingFeedbackReplies,
  type FeedbackEntry,
} from '../services/feedback';

type HomePageProps = {
  session?: UserSession | null;
};

function HomePage({ session }: HomePageProps) {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [sharedProposals, setSharedProposals] = useState<SharedProposal[]>([]);
  const [sharedOwnedProposalNumbers, setSharedOwnedProposalNumbers] = useState<string[]>([]);
  const [sharedOwnedRecipients, setSharedOwnedRecipients] = useState<Record<string, string[]>>({});
  const [collaborationUpdates, setCollaborationUpdates] = useState<CollaborationEvent[]>([]);
  const [collaborationRollout, setCollaborationRollout] = useState<{ key: string; enabled: boolean } | null>(null);
  const [loadedDashboardKey, setLoadedDashboardKey] = useState('');
  const [pricingDirectory, setPricingDirectory] = useState<DashboardPricingDirectory>({ defaultModelMap: {}, availableModelMap: {} });
  const completedDashboardKeyRef = useRef('');
  const [proposalLoadIssues, setProposalLoadIssues] = useState<LocalProposalLoadIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingFeedbackReplies, setPendingFeedbackReplies] = useState<FeedbackEntry[]>([]);
  const [feedbackInboxOpen, setFeedbackInboxOpen] = useState(false);
  const [acknowledgingFeedbackId, setAcknowledgingFeedbackId] = useState<string | null>(null);
  const proposalLoadRequestRef = useRef(0);
  const { showToast } = useToast();
  const sessionFranchiseId = session?.franchiseId || getSessionFranchiseId();
  const { enabled: collaborationCapability, isLoading: capabilityLoading, isRefreshing: capabilityRefreshing } = useFranchiseCapability('sharedProposals', sessionFranchiseId);
  const dashboardContext = captureProposalContext();
  const rolloutKey = JSON.stringify([dashboardContext, capabilityLoading || capabilityRefreshing, collaborationCapability]);
  const rolloutReady = !capabilityLoading && !capabilityRefreshing && collaborationRollout?.key === rolloutKey;
  const collaborationAvailable = rolloutReady && Boolean(collaborationRollout?.enabled);
  const dashboardKey = JSON.stringify([rolloutKey, collaborationAvailable]);
  useEffect(() => {
    if (capabilityLoading || capabilityRefreshing) return;
    if (!collaborationCapability) { setCollaborationRollout({ key: rolloutKey, enabled: false }); return; }
    let canceled = false;
    let requestId = 0;
    const context = captureProposalContext();
    const checkRollout = async (forceRefresh = false) => {
      const currentRequest = ++requestId;
      try {
        const enabled = await isCollaborationAvailable(sessionFranchiseId, forceRefresh);
        if (!canceled && currentRequest === requestId && context === captureProposalContext()) setCollaborationRollout({ key: rolloutKey, enabled });
      } catch (error) {
        if (!canceled && currentRequest === requestId && context === captureProposalContext()) {
          console.warn('Unable to check proposal sharing availability.', error);
          setCollaborationRollout({ key: rolloutKey, enabled: false });
        }
      }
    };
    const recoverRollout = () => void checkRollout(true);
    void checkRollout();
    window.addEventListener('online', recoverRollout);
    window.addEventListener(PROPOSAL_CLOUD_SYNC_EVENT, recoverRollout);
    return () => {
      canceled = true;
      window.removeEventListener('online', recoverRollout);
      window.removeEventListener(PROPOSAL_CLOUD_SYNC_EVENT, recoverRollout);
    };
  }, [rolloutKey, capabilityLoading, capabilityRefreshing, collaborationCapability, sessionFranchiseId]);
  const isProposalEditingRestricted = isMasterActingAsOwnerSession();
  const proposalEditingRestrictedReason =
    'Master accounts acting as owner can view proposals but cannot create or edit them.';

  const loadProposals = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!rolloutReady) return;
    const requestId = ++proposalLoadRequestRef.current;
    if (!session?.userId) {
      setProposals([]);
      setSharedProposals([]);
      setSharedOwnedProposalNumbers([]);
      setSharedOwnedRecipients({});
      setCollaborationUpdates([]);
      setProposalLoadIssues([]);
      setLoadedDashboardKey(dashboardKey);
      setLoading(false);
      return;
    }
    const currentUserId = session.userId;
    if (readSession()?.userId !== currentUserId) return;
    if (!options.silent && completedDashboardKeyRef.current !== dashboardKey) setLoading(true);
    try {
      // The dashboard only displays saved proposal metadata. Repricing every
      // proposal here made launch time grow with proposal history and repeated
      // the revision checks already performed when a proposal is opened.
      const loadedProposals = await listDashboardProposals(sessionFranchiseId);
      if (requestId !== proposalLoadRequestRef.current || readSession()?.userId !== currentUserId) return;
      // Stage the entire initial view before publishing any cards or rows.
      const directoryPromise = loadDashboardPricingDirectory(loadedProposals);
      let shared: SharedProposal[] = [];
      let updates: CollaborationEvent[] = [];
      let readShares: CollaborationEvent[] = [];
      let ownedSharedRecipients: Record<string, string[]> = {};
      if (collaborationAvailable) {
        try {
          [shared, updates, readShares, ownedSharedRecipients] = await Promise.all([
            listSharedProposals(), listCollaborationEvents(500, { unreadOnly: true }),
            listCollaborationEvents(500, { readSharesOnly: true }),
            listOwnedSharedProposalRecipients(loadedProposals.map((proposal) => proposal.proposalNumber)),
          ]);
        } catch (error) {
          console.warn('Unable to load dashboard collaboration.', error);
          if (completedDashboardKeyRef.current === dashboardKey) return;
        }
      }
      const directory = await directoryPromise;
      if (requestId !== proposalLoadRequestRef.current || dashboardContext !== captureProposalContext()) return;
      setProposals(loadedProposals);
      setProposalLoadIssues(getLocalProposalLoadIssues());
      setPricingDirectory(directory);
      setSharedProposals(shared);
      setSharedOwnedProposalNumbers(Object.keys(ownedSharedRecipients));
      setSharedOwnedRecipients(ownedSharedRecipients);
      setCollaborationUpdates([...updates, ...readShares]);
      setLoadedDashboardKey(dashboardKey);
      completedDashboardKeyRef.current = dashboardKey;
    } catch (error) {
      if (requestId === proposalLoadRequestRef.current && dashboardContext === captureProposalContext()) {
        console.error('Failed to load proposals:', error);
        if (completedDashboardKeyRef.current !== dashboardKey) {
          // Never reveal another account/workspace's previous view on failure.
          setProposals([]);
          setSharedProposals([]);
          setSharedOwnedProposalNumbers([]);
          setSharedOwnedRecipients({});
          setCollaborationUpdates([]);
          setProposalLoadIssues([]);
          setPricingDirectory({ defaultModelMap: {}, availableModelMap: {} });
        }
        setLoadedDashboardKey(dashboardKey);
      }
    } finally {
      if (requestId === proposalLoadRequestRef.current) setLoading(false);
    }
  }, [session, sessionFranchiseId, collaborationAvailable, rolloutReady, dashboardKey, dashboardContext]);

  useEffect(() => {
    void loadProposals();
    return () => { proposalLoadRequestRef.current++; };
  }, [loadProposals]);

  useEffect(() => {
    if (!collaborationAvailable) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void loadProposals({ silent: true });
    }, 30000);
    return () => window.clearInterval(interval);
  }, [collaborationAvailable, loadProposals]);

  useEffect(() => {
    const handleOnline = () => void loadProposals({ silent: true });
    window.addEventListener('online', handleOnline);
    window.addEventListener(PROPOSAL_CLOUD_SYNC_EVENT, handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener(PROPOSAL_CLOUD_SYNC_EVENT, handleOnline);
    };
  }, [loadProposals]);

  const loadFeedbackReplies = useCallback(async () => {
    if (!session?.userId) {
      setPendingFeedbackReplies([]);
      setFeedbackInboxOpen(false);
      return;
    }
    if (readSession()?.userId !== session.userId) return;
    try {
      const rows = await listPendingFeedbackReplies(session.userId, 20);
      if (readSession()?.userId !== session.userId) return;
      setPendingFeedbackReplies(rows);
    } catch (error) {
      if (readSession()?.userId === session.userId) console.error('Failed to load feedback replies:', error);
    }
  }, [session?.userId]);

  useEffect(() => {
    setFeedbackInboxOpen(pendingFeedbackReplies.length > 0);
  }, [pendingFeedbackReplies.length]);

  useEffect(() => {
    void loadFeedbackReplies();
    if (!session?.userId) return;

    const intervalId = window.setInterval(() => {
      void loadFeedbackReplies();
    }, 30000);
    const handleOnline = () => void loadFeedbackReplies();

    window.addEventListener('online', handleOnline);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
    };
  }, [loadFeedbackReplies, session?.userId]);

  const handleAcknowledgeFeedback = useCallback(
    async (feedback: FeedbackEntry) => {
      setAcknowledgingFeedbackId(feedback.id);
      try {
        await acknowledgeFeedbackReply(feedback.id);
        setPendingFeedbackReplies((current) => current.filter((entry) => entry.id !== feedback.id));
      } catch (error) {
        if (!isFeedbackFeatureUnavailableError(error)) {
          console.error('Failed to acknowledge feedback reply:', error);
        }
        showToast({
          type: 'error',
          message:
            (error as any)?.message || 'Unable to acknowledge the feedback reply.',
        });
      } finally {
        setAcknowledgingFeedbackId(null);
      }
    },
    [showToast]
  );

  const handleNewProposal = () => {
    if (isProposalEditingRestricted) {
      showToast({
        type: 'warning',
        message: proposalEditingRestrictedReason,
      });
      return;
    }
    navigate('/proposal/new');
  };

  const handleOpenProposal = (proposalNumber: string) => {
    recordRecentProposalOpen(proposalNumber, {
      userId: session?.userId,
      franchiseId: sessionFranchiseId,
    });
    navigate(`/proposal/view/${proposalNumber}`);
  };

  const handleDeleteProposal = async (proposalNumber: string) => {
    if (isProposalEditingRestricted) {
      showToast({ type: 'warning', message: proposalEditingRestrictedReason });
      return;
    }
    try {
      await deleteProposal(proposalNumber, sessionFranchiseId);
      setProposals(prev => prev.filter(p => p.proposalNumber !== proposalNumber));
      showToast({ type: 'success', message: 'Proposal deleted.' });
    } catch (error) {
      console.error('Failed to delete proposal', error);
      showToast({ type: 'error', message: 'Failed to delete proposal. Please try again.' });
    }
  };

  const dashboardLoading = loading || !rolloutReady || loadedDashboardKey !== dashboardKey;
  return (
    <div className="dashboard-page" aria-busy={dashboardLoading}>
      {dashboardLoading ? <div className="dashboard-loading" role="status">
        <span className="dashboard-loading-spinner" aria-hidden="true" />
        <span>Dashboard loading...</span>
      </div> : <>
      <RecentActivity
        proposals={[...proposals, ...sharedProposals.map((entry) => entry.proposal)]}
        loading={false}
        sharedProposals={sharedProposals}
        sharedOwnedProposalNumbers={sharedOwnedProposalNumbers}
        sharedOwnedRecipients={sharedOwnedRecipients}
        collaborationUpdates={collaborationUpdates}
        userId={session?.userId}
        franchiseId={sessionFranchiseId}
        onOpenProposal={handleOpenProposal}
      />

      <div className="dashboard-content">
        <DashboardProposalsPanel
          proposals={proposals}
          sharedProposals={sharedProposals}
          sharedOwnedProposalNumbers={sharedOwnedProposalNumbers}
          sharedOwnedRecipients={sharedOwnedRecipients}
          collaborationEnabled={collaborationAvailable}
          collaborationUpdates={collaborationUpdates}
          loading={false}
          pricingDirectory={pricingDirectory}
          onCreateProposal={handleNewProposal}
          onDeleteProposal={handleDeleteProposal}
          onOpenProposal={handleOpenProposal}
          disableCreateProposal={isProposalEditingRestricted}
          createProposalDisabledReason={proposalEditingRestrictedReason}
          disableDeleteProposal={isProposalEditingRestricted}
          viewerRole={session?.role}
          recoveryMode={isCloudOnlyRenderRecoveryEnabled()}
          recoveryIssues={proposalLoadIssues}
        />
      </div>
      </>}
      <FeedbackReplyInboxModal
        isOpen={feedbackInboxOpen}
        entries={pendingFeedbackReplies}
        acknowledgingId={acknowledgingFeedbackId}
        onAcknowledge={(feedback) => {
          void handleAcknowledgeFeedback(feedback);
        }}
      />
    </div>
  );
}

export default HomePage;
