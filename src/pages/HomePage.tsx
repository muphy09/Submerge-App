import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Proposal } from '../types/proposal-new';
import { useToast } from '../components/Toast';
import FeedbackReplyInboxModal from '../components/FeedbackReplyInboxModal';
import DashboardProposalsPanel from '../components/DashboardProposalsPanel';
import './HomePage.css';
import heroImage from '../../docs/img/newback.jpg';
import {
  deleteProposal,
  listDashboardProposals,
  PROPOSAL_CLOUD_SYNC_EVENT,
} from '../services/proposalsAdapter';
import { getSessionFranchiseId, isMasterActingAsOwnerSession, type UserSession } from '../services/session';
import { loadPricingSnapshotForExistingProposal, withTemporaryPricingSnapshot } from '../services/pricingDataStore';
import { resolveProposalPapDiscounts } from '../utils/papDiscounts';
import { getPricingTierName, isBronzePricingTier, normalizePricingTierId } from '../services/pricingTiers';
import { isPpasEastFranchiseCode } from '../utils/franchiseScope';
import {
  buildPricingRevisionComparison,
  markPricingRevisionPending,
} from '../services/pricingRevisionReview';
import { isVersionPermanentlyLocked } from '../services/proposalWorkflow';
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
    if (!session?.userId) {
      setProposals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [
        filtered,
        { default: MasterPricingEngine },
        proposalDefaultsModule,
        { normalizeEquipmentLighting },
        { normalizeCustomFeatures },
        { normalizeWarrantySectionsSetting },
      ] = await Promise.all([
        listDashboardProposals(sessionFranchiseId),
        import('../services/masterPricingEngine'),
        import('../utils/proposalDefaults'),
        import('../utils/lighting'),
        import('../utils/customFeatures'),
        import('../utils/warranty'),
      ]);
      const {
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
        mergePlumbingRuns,
        mergeRetailAdjustments,
      } = proposalDefaultsModule;

      const mergeWithDefaults = (input: Partial<Proposal>): Partial<Proposal> => {
        const base = getDefaultProposal();
        const pricingTierId = normalizePricingTierId(input.pricingTierId || input.pricingTierName);
        const poolSpecs = { ...getDefaultPoolSpecs(), ...(input.poolSpecs || {}) };
        const sourceEquipment = (input.equipment || {}) as Proposal['equipment'];
        const hasExplicitPackageTouchState = Object.prototype.hasOwnProperty.call(
          sourceEquipment,
          'packageSelectionTouched'
        );
        const mergedEquipment = normalizeEquipmentLighting(
          {
            ...getDefaultEquipment(),
            ...sourceEquipment,
            packageSelectionTouched: hasExplicitPackageTouchState
              ? sourceEquipment.packageSelectionTouched
              : sourceEquipment.packageSelectionId
                ? true
                : undefined,
          } as Proposal['equipment'],
          { poolSpecs, hasSpa: poolSpecs.spaType !== 'none' }
        );
        const defaultPlumbing = getDefaultPlumbing();
        const inputPlumbing = (input.plumbing || {}) as Partial<Proposal['plumbing']>;
        const defaultElectrical = getDefaultElectrical();
        const inputElectrical = (input.electrical || {}) as Partial<Proposal['electrical']>;

        const merged = {
          ...(base as Proposal),
          ...input,
          customerInfo: { ...(base.customerInfo || {}), ...(input.customerInfo || {}) } as Proposal['customerInfo'],
          poolSpecs,
          excavation: { ...getDefaultExcavation(), ...(input.excavation || {}) },
          plumbing: {
            ...defaultPlumbing,
            ...inputPlumbing,
            runs: mergePlumbingRuns(inputPlumbing.runs),
          },
          electrical: {
            ...defaultElectrical,
            ...inputElectrical,
            runs: { ...defaultElectrical.runs, ...(inputElectrical.runs || {}) },
          },
          tileCopingDecking: { ...getDefaultTileCopingDecking(), ...(input.tileCopingDecking || {}) },
          drainage: { ...getDefaultDrainage(), ...(input.drainage || {}) },
          equipment: mergedEquipment,
          waterFeatures: { ...getDefaultWaterFeatures(), ...(input.waterFeatures || {}) },
          customFeatures: normalizeCustomFeatures(input.customFeatures),
          interiorFinish: { ...getDefaultInteriorFinish(), ...(input.interiorFinish || {}) },
          manualAdjustments: { ...getDefaultManualAdjustments(), ...(input.manualAdjustments || {}) },
          retailAdjustments: mergeRetailAdjustments(input.retailAdjustments),
          papDiscounts: resolveProposalPapDiscounts(input, (base as any).papDiscounts),
          warrantySections: normalizeWarrantySectionsSetting(input.warrantySections),
          pricingTierId,
          pricingTierName: getPricingTierName(pricingTierId),
        };
        if (isBronzePricingTier(pricingTierId)) {
          merged.excavation = {
            ...merged.excavation,
            hasGravelInstall: isPpasEastFranchiseCode(merged.designerCode || session?.franchiseCode),
          };
          merged.interiorFinish = { ...merged.interiorFinish, hasWaterproofing: false };
        }
        return merged;
      };

      const recalculated: Proposal[] = [];
      const pricingCache = new Map<string, Awaited<ReturnType<typeof loadPricingSnapshotForExistingProposal>>>();
      for (const raw of filtered) {
        try {
          const targetFranchiseId = raw.franchiseId || sessionFranchiseId;
          const pricingTierId = normalizePricingTierId(raw.pricingTierId || raw.pricingTierName);
          const pricingCacheKey = `${targetFranchiseId}::${raw.pricingModelFranchiseId || targetFranchiseId}::${raw.pricingModelId || 'default'}::${raw.pricingModelRevisionId || 'current'}::${pricingTierId}`;
          let pricingSnapshot = pricingCache.get(pricingCacheKey);
          if (!pricingSnapshot) {
            pricingSnapshot = await loadPricingSnapshotForExistingProposal(
              targetFranchiseId,
              raw.pricingModelId || undefined,
              raw.pricingModelFranchiseId || undefined,
              pricingTierId,
              raw.pricingModelRevisionId || undefined
            );
            pricingCache.set(pricingCacheKey, pricingSnapshot);
          }
          const merged = withTemporaryPricingSnapshot(pricingSnapshot.pricing, () => mergeWithDefaults(raw));
          const calculated = withTemporaryPricingSnapshot(pricingSnapshot.pricing, () =>
            MasterPricingEngine.calculateCompleteProposal(merged, (merged as any).papDiscounts)
          );
          let nextProposal = {
            ...(merged as Proposal),
            pricingModelId: raw.pricingModelId || pricingSnapshot.pricingModelId || undefined,
            pricingModelName: raw.pricingModelName || pricingSnapshot.pricingModelName || undefined,
            pricingModelFranchiseId:
              raw.pricingModelFranchiseId || pricingSnapshot.pricingModelFranchiseId || undefined,
            pricingModelRevisionId:
              raw.pricingModelRevisionId || pricingSnapshot.pricingModelRevisionId || undefined,
            pricingModelRevisionNumber:
              raw.pricingModelRevisionNumber || pricingSnapshot.pricingModelRevisionNumber || undefined,
            pricing: calculated.pricing,
            costBreakdown: calculated.costBreakdown,
            subtotal: calculated.subtotal,
            totalCost: calculated.totalCost,
          } as Proposal;
          if (!isVersionPermanentlyLocked(nextProposal) && nextProposal.pricingModelRevisionId) {
            const comparison = await buildPricingRevisionComparison(nextProposal);
            if (comparison) {
              nextProposal = markPricingRevisionPending(nextProposal, comparison);
            }
          }
          recalculated.push(nextProposal);
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
  }, [session?.userId, sessionFranchiseId]);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  useEffect(() => {
    const handleOnline = () => void loadProposals();
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
          disableDeleteProposal={isProposalEditingRestricted}
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
