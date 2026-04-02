import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Proposal } from '../types/proposal-new';
import { useToast } from '../components/Toast';
import FeedbackReplyInboxModal from '../components/FeedbackReplyInboxModal';
import DashboardProposalsPanel from '../components/DashboardProposalsPanel';
import './HomePage.css';
import heroImage from '../../docs/img/newback.jpg';
import { listDashboardProposals, deleteProposal } from '../services/proposalsAdapter';
import { getSessionFranchiseId, isMasterActingAsOwnerSession, type UserSession } from '../services/session';
import { loadPricingSnapshotForFranchise, withTemporaryPricingSnapshot } from '../services/pricingDataStore';
import MasterPricingEngine from '../services/masterPricingEngine';
import {
  getDefaultProposal,
  getDefaultPoolSpecs,
  getDefaultExcavation,
  getDefaultPlumbing,
  getDefaultElectrical,
  getDefaultTileCopingDecking,
  getDefaultDrainage,
  getDefaultEquipment,
  getDefaultWaterFeatures,
  getDefaultInteriorFinish,
  getDefaultManualAdjustments,
  mergeRetailAdjustments,
} from '../utils/proposalDefaults';
import { normalizeEquipmentLighting } from '../utils/lighting';
import { normalizeCustomFeatures } from '../utils/customFeatures';
import { normalizeWarrantySectionsSetting } from '../utils/warranty';
import {
  acknowledgeFeedbackReply,
  isFeedbackFeatureUnavailableError,
  listPendingFeedbackReplies,
  type FeedbackEntry,
} from '../services/feedback';

type HomePageProps = {
  session?: UserSession | null;
  onFeedbackInboxVisibilityChange?: (isOpen: boolean) => void;
  onFeedbackInboxLoadingChange?: (isLoading: boolean) => void;
};

function HomePage({
  session,
  onFeedbackInboxVisibilityChange,
  onFeedbackInboxLoadingChange,
}: HomePageProps) {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingFeedbackReplies, setPendingFeedbackReplies] = useState<FeedbackEntry[]>([]);
  const [feedbackInboxOpen, setFeedbackInboxOpen] = useState(false);
  const [acknowledgingFeedbackId, setAcknowledgingFeedbackId] = useState<string | null>(null);
  const { showToast } = useToast();
  const sessionFranchiseId = session?.franchiseId || getSessionFranchiseId();
  const isProposalEditingRestricted = isMasterActingAsOwnerSession();
  const proposalEditingRestrictedReason =
    'Master accounts acting as owner can view proposals but cannot create or edit them.';

  const loadProposals = useCallback(async () => {
    setLoading(true);
    try {
      const filtered = await listDashboardProposals(sessionFranchiseId);

      const mergeWithDefaults = (input: Partial<Proposal>): Partial<Proposal> => {
        const base = getDefaultProposal();
        const poolSpecs = { ...getDefaultPoolSpecs(), ...(input.poolSpecs || {}) };
        const mergedEquipment = normalizeEquipmentLighting(
          { ...getDefaultEquipment(), ...(input.equipment || {}) } as any,
          { poolSpecs, hasSpa: poolSpecs.spaType !== 'none' }
        );

        return {
          ...(base as Proposal),
          ...input,
          customerInfo: { ...(base.customerInfo || {}), ...(input.customerInfo || {}) } as Proposal['customerInfo'],
          poolSpecs,
          excavation: { ...getDefaultExcavation(), ...(input.excavation || {}) },
          plumbing: { ...getDefaultPlumbing(), ...(input.plumbing || {}) },
          electrical: { ...getDefaultElectrical(), ...(input.electrical || {}) },
          tileCopingDecking: { ...getDefaultTileCopingDecking(), ...(input.tileCopingDecking || {}) },
          drainage: { ...getDefaultDrainage(), ...(input.drainage || {}) },
          equipment: mergedEquipment,
          waterFeatures: { ...getDefaultWaterFeatures(), ...(input.waterFeatures || {}) },
          customFeatures: normalizeCustomFeatures(input.customFeatures),
          interiorFinish: { ...getDefaultInteriorFinish(), ...(input.interiorFinish || {}) },
          manualAdjustments: { ...getDefaultManualAdjustments(), ...(input.manualAdjustments || {}) },
          retailAdjustments: mergeRetailAdjustments(input.retailAdjustments),
          papDiscounts: input.papDiscounts || (base as any).papDiscounts,
          warrantySections: normalizeWarrantySectionsSetting(input.warrantySections),
        };
      };

      const recalculated: Proposal[] = [];
      const pricingCache = new Map<string, Awaited<ReturnType<typeof loadPricingSnapshotForFranchise>>>();
      for (const raw of filtered) {
        try {
          const targetFranchiseId = raw.franchiseId || sessionFranchiseId;
          const pricingCacheKey = `${targetFranchiseId}::${raw.pricingModelFranchiseId || targetFranchiseId}::${raw.pricingModelId || 'default'}`;
          let pricingSnapshot = pricingCache.get(pricingCacheKey);
          if (!pricingSnapshot) {
            pricingSnapshot = await loadPricingSnapshotForFranchise(
              targetFranchiseId,
              raw.pricingModelId || undefined,
              raw.pricingModelFranchiseId || undefined
            );
            pricingCache.set(pricingCacheKey, pricingSnapshot);
          }
          const merged = withTemporaryPricingSnapshot(pricingSnapshot.pricing, () => mergeWithDefaults(raw));
          const calculated = withTemporaryPricingSnapshot(pricingSnapshot.pricing, () =>
            MasterPricingEngine.calculateCompleteProposal(merged, (merged as any).papDiscounts)
          );
          recalculated.push({
            ...(merged as Proposal),
            pricing: calculated.pricing,
            costBreakdown: calculated.costBreakdown,
            subtotal: calculated.subtotal,
            totalCost: calculated.totalCost,
          } as Proposal);
        } catch (error) {
          console.warn(`Unable to recalc pricing for proposal ${raw.proposalNumber}`, error);
          recalculated.push(raw as Proposal);
        }
      }

      setProposals(recalculated);
    } catch (error) {
      console.error('Failed to load proposals:', error);
    } finally {
      setLoading(false);
    }
  }, [sessionFranchiseId]);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  useEffect(() => {
    const handleOnline = () => void loadProposals();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [loadProposals]);

  const loadFeedbackReplies = useCallback(async () => {
    if (!session?.userId) {
      setPendingFeedbackReplies([]);
      setFeedbackInboxOpen(false);
      onFeedbackInboxLoadingChange?.(false);
      return;
    }
    onFeedbackInboxLoadingChange?.(true);
    try {
      const rows = await listPendingFeedbackReplies(20);
      setPendingFeedbackReplies(rows);
    } catch (error) {
      console.error('Failed to load feedback replies:', error);
    } finally {
      onFeedbackInboxLoadingChange?.(false);
    }
  }, [onFeedbackInboxLoadingChange, session?.userId]);

  useEffect(() => {
    setFeedbackInboxOpen(pendingFeedbackReplies.length > 0);
  }, [pendingFeedbackReplies.length]);

  useEffect(() => {
    onFeedbackInboxVisibilityChange?.(feedbackInboxOpen);
  }, [feedbackInboxOpen, onFeedbackInboxVisibilityChange]);

  useEffect(() => {
    return () => {
      onFeedbackInboxVisibilityChange?.(false);
      onFeedbackInboxLoadingChange?.(false);
    };
  }, [onFeedbackInboxLoadingChange, onFeedbackInboxVisibilityChange]);

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
    navigate(`/proposal/view/${proposalNumber}`);
  };

  const handleDeleteProposal = async (proposalNumber: string) => {
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
      <div className="hero-section">
        <img src={heroImage} alt="Pool Design" className="hero-image" />
        <div className="hero-content">
          <div className="hero-text">
            <h1 className="hero-title">Design, Build, Present.</h1>
            <p className="hero-subtitle">A passion for splashin'</p>
          </div>
          <div className="hero-buttons">
            <button
              className="btn-create-proposal"
              onClick={handleNewProposal}
              disabled={isProposalEditingRestricted}
              title={isProposalEditingRestricted ? proposalEditingRestrictedReason : undefined}
            >
              Create New Proposal
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        <DashboardProposalsPanel
          proposals={proposals}
          loading={loading}
          onCreateProposal={handleNewProposal}
          onDeleteProposal={handleDeleteProposal}
          onOpenProposal={handleOpenProposal}
          disableCreateProposal={isProposalEditingRestricted}
          createProposalDisabledReason={proposalEditingRestrictedReason}
          viewerRole={session?.role}
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
