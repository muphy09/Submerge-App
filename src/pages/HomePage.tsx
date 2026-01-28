import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Proposal } from '../types/proposal-new';
import { useToast } from '../components/Toast';
import './HomePage.css';
import heroImage from '../../docs/img/newback.jpg';
import { listProposals, deleteProposal } from '../services/proposalsAdapter';
import { getSessionFranchiseId, getSessionUserName, type UserSession } from '../services/session';
import syncGoodIcon from '../../docs/img/syncgood.png';
import syncBadIcon from '../../docs/img/syncbad.png';
import { initPricingDataStore } from '../services/pricingDataStore';
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
  getDefaultCustomFeatures,
  getDefaultInteriorFinish,
  getDefaultManualAdjustments,
} from '../utils/proposalDefaults';
import { normalizeEquipmentLighting } from '../utils/lighting';

type HomePageProps = {
  session?: UserSession | null;
};

function HomePage({ session }: HomePageProps) {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; proposalNumber: string } | null>(null);
  const { showToast } = useToast();
  const sessionFranchiseId = session?.franchiseId || getSessionFranchiseId();
  const sessionUserName = session?.userName || getSessionUserName();

  const loadProposals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProposals(sessionFranchiseId);
      const filtered = sessionUserName
        ? (data || []).filter((p) => (p.designerName || '').toLowerCase() === sessionUserName.toLowerCase())
        : data || [];

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
          customerInfo: { ...(base.customerInfo || {}), ...(input.customerInfo || {}) },
          poolSpecs,
          excavation: { ...getDefaultExcavation(), ...(input.excavation || {}) },
          plumbing: { ...getDefaultPlumbing(), ...(input.plumbing || {}) },
          electrical: { ...getDefaultElectrical(), ...(input.electrical || {}) },
          tileCopingDecking: { ...getDefaultTileCopingDecking(), ...(input.tileCopingDecking || {}) },
          drainage: { ...getDefaultDrainage(), ...(input.drainage || {}) },
          equipment: mergedEquipment,
          waterFeatures: { ...getDefaultWaterFeatures(), ...(input.waterFeatures || {}) },
          customFeatures: { ...getDefaultCustomFeatures(), ...(input.customFeatures || {}) },
          interiorFinish: { ...getDefaultInteriorFinish(), ...(input.interiorFinish || {}) },
          manualAdjustments: { ...getDefaultManualAdjustments(), ...(input.manualAdjustments || {}) },
          papDiscounts: input.papDiscounts || (base as any).papDiscounts,
        };
      };

      const recalculated: Proposal[] = [];
      for (const raw of filtered) {
        try {
          const merged = mergeWithDefaults(raw);
          await initPricingDataStore(merged.franchiseId || sessionFranchiseId, merged.pricingModelId || undefined);
          const calculated = MasterPricingEngine.calculateCompleteProposal(merged, (merged as any).papDiscounts);
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
  }, [sessionFranchiseId, sessionUserName]);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  useEffect(() => {
    const handleOnline = () => void loadProposals();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [loadProposals]);

  const handleNewProposal = () => {
    navigate('/proposal/new');
  };

  const handlePresentationMode = () => {
    showToast({ type: 'info', message: 'Presentation Mode coming soon!' });
  };

  const handleOpenProposal = (proposalNumber: string) => {
    navigate(`/proposal/view/${proposalNumber}`);
  };

  const handleDeleteProposal = async (proposalNumber: string) => {
    try {
      await deleteProposal(proposalNumber, sessionFranchiseId);
      setProposals(prev => prev.filter(p => p.proposalNumber !== proposalNumber));
      setContextMenu(null);
      showToast({ type: 'success', message: 'Proposal deleted.' });
    } catch (error) {
      console.error('Failed to delete proposal', error);
      showToast({ type: 'error', message: 'Failed to delete proposal. Please try again.' });
    }
  };

  const getStatusColor = (status: string) => {
    const key = (status || '').toLowerCase();
    switch (key) {
      case 'submitted':
      case 'approved':
      case 'sent':
        return '#c8ead3'; // slightly darker light green
      case 'draft':
        return '#f7e08a'; // slightly darker light yellow
      case 'modified':
      case 'rejected':
        return '#f6baba'; // slightly darker light red
      default:
        return '#e5e7eb';
    }
  };

  // Get last 4 proposals sorted by most recent
  const recentProposals = [...proposals]
    .sort((a, b) => new Date(b.lastModified || b.createdDate).getTime() - new Date(a.lastModified || a.createdDate).getTime())
    .slice(0, 4);

  const renderSyncIcon = (proposal: Proposal) => {
    const synced = (proposal.syncStatus || 'synced') === 'synced';
    const src = synced ? syncGoodIcon : syncBadIcon;
    const label = synced ? 'Cloud synced' : 'Pending cloud sync';
    return <img src={src} alt={label} title={label} className="proposal-sync-icon" />;
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
            <button className="btn-create-proposal" onClick={handleNewProposal}>
              Create New Proposal
            </button>
            <button className="btn-presentation-mode" onClick={handlePresentationMode}>
              Presentation Mode
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-columns">
        {/* Recent Proposals Column */}
        <div className="dashboard-column recent-column">
          <h2 className="column-title">Recent Proposals</h2>
          <div className="recent-proposals-list">
            {loading ? (
              <div className="loading-message">Loading...</div>
            ) : recentProposals.length === 0 ? (
              <div className="empty-message">No proposals yet</div>
            ) : (
              recentProposals.map((proposal) => (
                <div
                  key={proposal.proposalNumber}
                  className="recent-proposal-item"
                  onClick={() => handleOpenProposal(proposal.proposalNumber)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, proposalNumber: proposal.proposalNumber });
                  }}
                >
                  <div className="proposal-item-body">
                    <div className="proposal-avatar" aria-hidden="true">
                      <svg viewBox="0 0 32 32" focusable="false" className="proposal-avatar-icon">
                        <path
                          d="M9 12.5c0-3.59 2.91-6.5 6.5-6.5S22 8.91 22 12.5 19.09 19 15.5 19 9 16.09 9 12.5Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                        <path
                          d="M7 22.5c1.5 1 4.5 1 6 0s4.5-1 6 0 4.5 1 6 0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                        <path
                          d="M7 18.5c1.5 1 4.5 1 6 0s4.5-1 6 0 4.5 1 6 0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <div className="proposal-item-content">
                      <div className="proposal-item-header-line">
                        <div className="proposal-item-name">
                          {proposal.customerInfo.customerName}
                          {renderSyncIcon(proposal)}
                        </div>
                      </div>
                      <div className="proposal-item-meta">
                        <span className="proposal-item-date">
                          {new Date(proposal.lastModified || proposal.createdDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="proposal-status-right">
                      <span
                        className="proposal-item-status"
                        style={{ backgroundColor: getStatusColor(proposal.status), borderColor: getStatusColor(proposal.status) }}
                      >
                        {proposal.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="dashboard-column">
          <h2 className="column-title">Quick Actions</h2>
          <div className="quick-actions-list">
            <button className="quick-action-btn" onClick={handleNewProposal}>
              <svg className="quick-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              New Proposal
            </button>
            <button className="quick-action-btn" onClick={handlePresentationMode}>
              <svg className="quick-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              Presentation Mode
            </button>
          </div>
        </div>

      </div>

      {contextMenu && (
        <>
          <div
            className="context-menu-backdrop"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="proposal-context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              className="context-menu-item delete"
              onClick={() => handleDeleteProposal(contextMenu.proposalNumber)}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default HomePage;
