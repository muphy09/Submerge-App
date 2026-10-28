import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Proposal } from '../types/proposal-new';
import { useToast } from '../components/Toast';
import FeedbackReplyInboxModal from '../components/FeedbackReplyInboxModal';
import DashboardProposalsPanel from '../components/DashboardProposalsPanel';
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
  const [collaborationRollout, setCollaborationRollout] = useState(false);
  const [proposalLoadIssues, setProposalLoadIssues] = useState<LocalProposalLoadIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingFeedbackReplies, setPendingFeedbackReplies] = useState<FeedbackEntry[]>([]);
  const [feedbackInboxOpen, setFeedbackInboxOpen] = useState(false);
  const [acknowledgingFeedbackId, setAcknowledgingFeedbackId] = useState<string | null>(null);
  const proposalLoadRequestRef = useRef(0);
  const { showToast } = useToast();
  const sessionFranchiseId = session?.franchiseId || getSessionFranchiseId();
  const { enabled: collaborationCapability } = useFranchiseCapability('sharedProposals', sessionFranchiseId);
  const collaborationAvailable = collaborationCapability && collaborationRollout;
  useEffect(() => {
    setCollaborationRollout(false);
    if (!collaborationCapability) return;
    let canceled = false;
    let requestId = 0;
    const context = captureProposalContext();
    const checkRollout = async (forceRefresh = false) => {
      const currentRequest = ++requestId;
      try {
        const enabled = await isCollaborationAvailable(sessionFranchiseId, forceRefresh);
        if (!canceled && currentRequest === requestId && context === captureProposalContext()) setCollaborationRollout(enabled);
      } catch (error) {
        if (!canceled && context === captureProposalContext()) console.warn('Unable to check proposal sharing availability.', error);
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
  }, [collaborationCapability, sessionFranchiseId, session?.userId, session?.isTestAccount, session?.testAccountId]);
  const isProposalEditingRestricted = isMasterActingAsOwnerSession();
  const proposalEditingRestrictedReason =
    'Master accounts acting as owner can view proposals but cannot create or edit them.';

  const loadProposals = useCallback(async (options: { silent?: boolean } = {}) => {
    const requestId = ++proposalLoadRequestRef.current;
    if (!session?.userId) {
      setProposals([]);
      setSharedProposals([]);
      setSharedOwnedProposalNumbers([]);
      setSharedOwnedRecipients({});
      setCollaborationUpdates([]);
      setProposalLoadIssues([]);
      setLoading(false);
      return;
    }
    const currentUserId = session.userId;
    if (readSession()?.userId !== currentUserId) return;
    if (!options.silent) setLoading(true);
    try {
      // The dashboard only displays saved proposal metadata. Repricing every
      // proposal here made launch time grow with proposal history and repeated
      // the revision checks already performed when a proposal is opened.
      const loadedProposals = await listDashboardProposals(sessionFranchiseId);
      if (requestId !== proposalLoadRequestRef.current || readSession()?.userId !== currentUserId) return;
      setProposals(loadedProposals);
      setProposalLoadIssues(getLocalProposalLoadIssues());
      setLoading(false);
      if (collaborationAvailable) {
        const [shared, updates, readShares, ownedSharedRecipients] = await Promise.all([
          listSharedProposals(), listCollaborationEvents(500, { unreadOnly: true }),
          listCollaborationEvents(500, { readSharesOnly: true }),
          listOwnedSharedProposalRecipients(loadedProposals.map((proposal) => proposal.proposalNumber)),
        ]);
        if (requestId !== proposalLoadRequestRef.current || readSession()?.userId !== currentUserId) return;
        setSharedProposals(shared);
        setSharedOwnedProposalNumbers(Object.keys(ownedSharedRecipients));
        setSharedOwnedRecipients(ownedSharedRecipients);
        setCollaborationUpdates([...updates, ...readShares]);
      } else {
        setSharedProposals([]);
        setSharedOwnedProposalNumbers([]);
        setSharedOwnedRecipients({});
        setCollaborationUpdates([]);
      }
    } catch (error) {
      if (readSession()?.userId === currentUserId) console.error('Failed to load proposals:', error);
    } finally {
      if (requestId === proposalLoadRequestRef.current) setLoading(false);
    }
  }, [session, sessionFranchiseId, collaborationAvailable]);

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

  return (
    <div className="dashboard-page">
      <RecentActivity
        proposals={[...proposals, ...sharedProposals.map((entry) => entry.proposal)]}
        loading={loading}
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
          loading={loading}
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
