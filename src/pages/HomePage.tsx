import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Proposal } from '../types/proposal-new';
import { useToast } from '../components/Toast';
import './HomePage.css';
import heroImage from '../assets/homepagetestbck.jpg';
import { listProposals, deleteProposal } from '../services/proposalsAdapter';
import { getSessionFranchiseId, getSessionUserName } from '../services/session';

function HomePage() {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
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
    } catch (error) {
      console.error('Failed to load proposals:', error);
    } finally {
      setLoading(false);
    }
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
  const yAxisSteps = 5;
  const yAxisMax = Math.max(5, Math.ceil(maxProposals / 10) * 10 || 10);
  const yAxisTicks = Array.from({ length: yAxisSteps + 1 }, (_, i) => Math.round((yAxisMax / yAxisSteps) * i));

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
                        <div className="proposal-item-name">{proposal.customerInfo.customerName}</div>
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

        {/* Performance Overview Column */}
        <div className="dashboard-column performance-card">
          <h2 className="column-title">Performance Overview</h2>
          <div className="performance-chart">
            <div className="chart-title">Proposals Created</div>
            <div className="chart-wrapper">
              <div className="chart-body">
                <div className="y-axis">
                  {[...yAxisTicks].reverse().map((tick) => (
                    <span key={tick} className="y-axis-tick">{tick}</span>
                  ))}
                </div>
                <div className="bar-chart">
                  {Object.entries(proposalsByMonth).map(([month, count]) => (
                    <div key={month} className="bar-container">
                      <div
                        className="bar"
                        style={{ height: `${(count / yAxisMax) * 100}%` }}
                        aria-label={`${count} proposals in ${month}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="bar-label-row">
                {Object.keys(proposalsByMonth).map((month) => (
                  <div key={month} className="bar-label">{month}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="performance-stats-inline">
            <div className="stat-block">
              <div className="stat-label">Total Proposals Created:</div>
              <div className="stat-value-row">
                <div className="stat-value">{totalProposalsCreated}</div>
                <svg className="stat-trend-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="18 15 12 9 6 15"/>
                </svg>
              </div>
            </div>
            <div className="stat-divider" aria-hidden="true" />
            <div className="stat-block">
              <div className="stat-label">Average Retail Cost:</div>
              <div className="stat-value">
                ${averageRetailCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
