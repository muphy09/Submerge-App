import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Proposal } from '../types/proposal';
import './HomePage.css';

function HomePage() {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProposals();
  }, []);

  const loadProposals = async () => {
    try {
      const data = await window.electron.getAllProposals();
      setProposals(data);
    } catch (error) {
      console.error('Failed to load proposals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewProposal = () => {
    navigate('/proposal/new');
  };

  const handleOpenProposal = (proposalNumber: string) => {
    navigate(`/proposal/view/${proposalNumber}`);
  };

  const handleDeleteProposal = async (proposalNumber: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this proposal?')) {
      try {
        await window.electron.deleteProposal(proposalNumber);
        loadProposals();
      } catch (error) {
        console.error('Failed to delete proposal:', error);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return '#fbbf24';
      case 'submitted': return '#3b82f6';
      case 'approved': return '#10b981';
      case 'rejected': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div className="home-page">
      <div className="home-container">
        <header className="home-header">
          <h1>Pool Proposal Manager</h1>
          <p>Create and manage professional pool proposals</p>
        </header>

        <div className="action-section">
          <button className="btn-primary" onClick={handleNewProposal}>
            <span className="btn-icon">+</span>
            Create New Proposal
          </button>
        </div>

        <div className="proposals-section">
          <h2>Recent Proposals</h2>
          {loading ? (
            <div className="loading">Loading proposals...</div>
          ) : proposals.length === 0 ? (
            <div className="empty-state">
              <p>No proposals yet. Create your first proposal to get started!</p>
            </div>
          ) : (
            <div className="proposals-grid">
              {proposals.map((proposal) => (
                <div
                  key={proposal.proposalNumber}
                  className="proposal-card"
                  onClick={() => handleOpenProposal(proposal.proposalNumber)}
                >
                  <div className="proposal-header">
                    <h3>{proposal.customerInfo.customerName}</h3>
                    <span
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(proposal.status) }}
                    >
                      {proposal.status}
                    </span>
                  </div>
                  <div className="proposal-details">
                    <p className="proposal-number">#{proposal.proposalNumber}</p>
                    <p className="proposal-location">{proposal.customerInfo.city}</p>
                    <p className="proposal-date">
                      {new Date(proposal.createdDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="proposal-footer">
                    <p className="proposal-total">
                      ${proposal.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                    <button
                      className="btn-delete"
                      onClick={(e) => handleDeleteProposal(proposal.proposalNumber, e)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HomePage;
