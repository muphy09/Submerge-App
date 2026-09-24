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
import {
  getCollaborationAttentionCount, isCollaborationAvailable, listCollaborationEvents,
  listOwnedSharedProposalRecipients, listSharedProposals, markCollaborationEventRead,
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
  const [collaborationAttention, setCollaborationAttention] = useState(0);
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
    if (!collaborationCapability) { setCollaborationRollout(false); return; }
    let canceled = false;
    void isCollaborationAvailable(sessionFranchiseId).then((enabled) => { if (!canceled) setCollaborationRollout(enabled); });
    return () => { canceled = true; };
  }, [collaborationCapability, sessionFranchiseId]);
  const isProposalEditingRestricted = isMasterActingAsOwnerSession();
  const proposalEditingRestrictedReason =
    'Master accounts acting as owner can view proposals but cannot create or edit them.';

  const loadProposals = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!session?.userId) {
      setProposals([]);
      setSharedProposals([]);
      setSharedOwnedProposalNumbers([]);
      setSharedOwnedRecipients({});
      setCollaborationUpdates([]);
      setCollaborationAttention(0);
      setProposalLoadIssues([]);
      setLoading(false);
      return;
    }
    const requestId = ++proposalLoadRequestRef.current;
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
      if (collaborationAvailable) {
        const [shared, updates, attention, ownedSharedRecipients] = await Promise.all([
          listSharedProposals(), listCollaborationEvents(), getCollaborationAttentionCount(),
          listOwnedSharedProposalRecipients(loadedProposals.map((proposal) => proposal.proposalNumber)),
        ]);
        if (requestId !== proposalLoadRequestRef.current || readSession()?.userId !== currentUserId) return;
        setSharedProposals(shared);
        setSharedOwnedProposalNumbers(Object.keys(ownedSharedRecipients));
        setSharedOwnedRecipients(ownedSharedRecipients);
        setCollaborationUpdates(updates);
        setCollaborationAttention(attention);
      } else {
        setSharedProposals([]);
        setSharedOwnedProposalNumbers([]);
        setSharedOwnedRecipients({});
        setCollaborationUpdates([]);
        setCollaborationAttention(0);
      }
      setProposalLoadIssues(getLocalProposalLoadIssues());
    } catch (error) {
      if (readSession()?.userId === currentUserId) console.error('Failed to load proposals:', error);
    } finally {
      if (!options.silent && requestId === proposalLoadRequestRef.current) setLoading(false);
    }
  }, [session?.userId, sessionFranchiseId, collaborationAvailable]);

  useEffect(() => {
    void loadProposals();
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
          collaborationAttention={collaborationAttention}
          onOpenUpdate={(update) => {
            void markCollaborationEventRead(update.id).then(() => void loadProposals({ silent: true }));
            if (update.event_type === 'access_ended') {
              showToast({ type: 'warning', message: 'Access to this shared proposal has ended.' });
            } else {
              handleOpenProposal(update.proposal_number);
            }
          }}
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
