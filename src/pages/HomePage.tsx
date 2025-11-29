import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Proposal } from '../types/proposal-new';
import { useToast } from '../components/Toast';
import './HomePage.css';
import heroImage from '../assets/homepagetestbck.jpg';
import { listPricingModels as listPricingModelsRemote } from '../services/pricingModelsAdapter';
import { listProposals, deleteProposal } from '../services/proposalsAdapter';
import { getSessionFranchiseId, getSessionUserName } from '../services/session';

function HomePage() {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultModelMap, setDefaultModelMap] = useState<Record<string, string | null>>({});
  const [availableModelMap, setAvailableModelMap] = useState<Record<string, Set<string>>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; proposalNumber: string } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadProposals();
  }, []);

  const loadProposals = async () => {
    setLoading(true);
    try {
      const userName = getSessionUserName();
      const data = await listProposals(getSessionFranchiseId());
      const filtered = userName
        ? (data || []).filter((p) => (p.designerName || '').toLowerCase() === userName.toLowerCase())
        : data || [];
      setProposals(filtered);
      await populateDefaultModels(filtered);
    } catch (error) {
      console.error('Failed to load proposals:', error);
    } finally {
      setLoading(false);
    }
  };

  const populateDefaultModels = async (data: Proposal[]) => {
    const franchiseIds = Array.from(new Set(data.map((p) => p.franchiseId || 'default')));
    const defaultMap: Record<string, string | null> = {};
    const availableMap: Record<string, Set<string>> = {};
    for (const id of franchiseIds) {
      try {
        const rows = await listPricingModelsRemote(id);
        const def = rows?.find((r: any) => r.isDefault);
        defaultMap[id] = def?.id || null;
        availableMap[id] = new Set((rows || []).map((r: any) => r.id));
      } catch (error) {
        defaultMap[id] = null;
        availableMap[id] = new Set();
      }
    }
    setDefaultModelMap(defaultMap);
    setAvailableModelMap(availableMap);
  };

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
      await deleteProposal(proposalNumber, getSessionFranchiseId());
      setProposals(prev => prev.filter(p => p.proposalNumber !== proposalNumber));
      setContextMenu(null);
      showToast({ type: 'success', message: 'Proposal deleted.' });
    } catch (error) {
      console.error('Failed to delete proposal', error);
      showToast({ type: 'error', message: 'Failed to delete proposal. Please try again.' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return '#ddc720ff';
      case 'submitted': return '#04bc17ff';
      case 'approved': return '#10b981';
      case 'rejected': return '#ef4444';
      default: return '#6b7280';
    }
  };

  // Get last 4 proposals sorted by most recent
  const recentProposals = [...proposals]
    .sort((a, b) => new Date(b.lastModified || b.createdDate).getTime() - new Date(a.lastModified || a.createdDate).getTime())
    .slice(0, 4);

  // Calculate stats
  const totalProposalsCreated = proposals.length;
  const averageRetailCost = proposals.length > 0
    ? proposals.reduce((sum, p) => sum + (p.totalCost || 0), 0) / proposals.length
    : 0;

  // Get proposals by month for the chart (last 5 months)
  const getProposalsByMonth = () => {
    const monthCounts: { [key: string]: number } = {};
    const now = new Date();

    // Initialize last 5 months
    for (let i = 4; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toLocaleString('default', { month: 'short' });
      monthCounts[monthKey] = 0;
    }

    // Count proposals by month
    proposals.forEach(proposal => {
      const date = new Date(proposal.createdDate);
      const monthKey = date.toLocaleString('default', { month: 'short' });
      if (monthKey in monthCounts) {
        monthCounts[monthKey]++;
      }
    });

    return monthCounts;
  };

  const proposalsByMonth = getProposalsByMonth();
  const maxProposals = Math.max(...Object.values(proposalsByMonth), 1);

  return (
    <div className="dashboard-page">
      <div className="hero-section">
        <img src={heroImage} alt="Pool Design" className="hero-image" />
        <div className="hero-content">
          <h1 className="hero-title">Design, Build, Present.</h1>
          <p className="hero-subtitle">A passion for splashin'</p>
          <button className="btn-create-proposal" onClick={handleNewProposal}>
            Create New Proposal
          </button>
          <button className="btn-presentation-mode" onClick={handlePresentationMode}>
            Presentation Mode
          </button>
        </div>
      </div>

      <div className="dashboard-columns">
        {/* Recent Proposals Column */}
        <div className="dashboard-column">
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
                  <div className="proposal-item-header">
                    <div className="proposal-item-name">{proposal.customerInfo.customerName}</div>
                    <div className="proposal-item-price">
                      ${(proposal.totalCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="proposal-item-footer">
                  {(() => {
                    const fid = proposal.franchiseId || 'default';
                    const modelId = proposal.pricingModelId || '';
                    const defaultId = defaultModelMap[fid];
                    const availableSet = availableModelMap[fid] || new Set<string>();
                    const explicitRemoved = (proposal.pricingModelName || '').toLowerCase().includes('(removed)');
                    const isRemoved = Boolean(modelId) && (!availableSet.has(modelId) || explicitRemoved);
                    const isActive =
                      Boolean(modelId) &&
                      defaultId &&
                      modelId === defaultId &&
                      availableSet.has(modelId) &&
                      !explicitRemoved;
                    const isInactive = Boolean(modelId) && !isActive && !isRemoved;
                    const className = isActive
                      ? 'proposal-model-pill active'
                      : isRemoved
                      ? 'proposal-model-pill removed'
                      : 'proposal-model-pill inactive';
                    return (
                      <span className={className}>
                        {(proposal.pricingModelName || 'Pricing Model') +
                          (isRemoved && !explicitRemoved ? ' (Removed)' : '')}
                      </span>
                    );
                  })()}
                    <span
                      className="proposal-item-status"
                      style={{ backgroundColor: getStatusColor(proposal.status) }}
                    >
                      {proposal.status}
                    </span>
                    <span className="proposal-item-date">
                      {new Date(proposal.lastModified || proposal.createdDate).toLocaleDateString()}
                    </span>
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
            <button className="quick-action-btn" onClick={handleNewProposal}>New Proposal</button>
            <button className="quick-action-btn" onClick={handlePresentationMode}>Presentation Mode</button>
          </div>
        </div>

        {/* Performance Overview Column */}
        <div className="dashboard-column">
          <h2 className="column-title">Performance Overview</h2>
          <div className="performance-chart">
            <div className="chart-title">Proposals Created</div>
            <div className="bar-chart">
              {Object.entries(proposalsByMonth).map(([month, count]) => (
                <div key={month} className="bar-container">
                  <div
                    className="bar"
                    style={{ height: `${(count / maxProposals) * 100}%` }}
                  >
                    <span className="bar-value">{count}</span>
                  </div>
                  <div className="bar-label">{month}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="performance-stats">
            <div className="stat-item">
              <div className="stat-label">Total Proposals Created:</div>
              <div className="stat-value">{totalProposalsCreated}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Average Retail Cost:</div>
              <div className="stat-value">
                ${averageRetailCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
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
