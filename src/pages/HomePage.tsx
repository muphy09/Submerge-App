import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Proposal } from '../types/proposal-new';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import './HomePage.css';
import ppasLogo from '../../PPAS Logo.png';

function HomePage() {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [proposalToDelete, setProposalToDelete] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadProposals();
  }, []);

  const loadProposals = async () => {
    if (!window.electron?.getAllProposals) {
      console.error('Electron bridge unavailable: cannot load proposals.');
      setLoading(false);
      return;
    }
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

  const handleOpenProposalsFolder = async () => {
    try {
      await window.electron.openProposalsFolder();
    } catch (error) {
      console.error('Failed to open proposals folder:', error);
    }
  };

  const handleOpenProposal = (proposalNumber: string) => {
    navigate(`/proposal/view/${proposalNumber}`);
  };

  const handleDeleteProposal = async (proposalNumber: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProposalToDelete(proposalNumber);
  };

  const confirmDelete = async () => {
    if (!proposalToDelete) return;
    try {
      await window.electron.deleteProposal(proposalToDelete);
      showToast({ type: 'success', message: 'Proposal deleted.' });
      loadProposals();
    } catch (error) {
      console.error('Failed to delete proposal:', error);
      showToast({ type: 'error', message: 'Failed to delete proposal.' });
    } finally {
      setProposalToDelete(null);
    }
  };

  const cancelDelete = () => {
    setProposalToDelete(null);
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

  return (
    <div className="home-page">
      <div className="home-container">
        <header className="home-header">
          <div className="header-title-container">
            <img src={ppasLogo} alt="PPAS Logo" className="header-logo" />
            <h1>Premier Pools and Spas Proposal Builder</h1>
          </div>
          <p className="header-tagline">A passion for splashin'</p>
        </header>

        <div className="action-section">
          <button className="btn-primary" onClick={handleNewProposal}>
            <span className="btn-icon">+</span>
            Create New Proposal
          </button>
          <button className="btn-primary" onClick={handleOpenProposalsFolder}>
            <span className="btn-icon">📁</span>
            Open Proposals Folder
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
                    <p className="proposal-number">#{proposal.proposalNumber.replace('PROP-', '')}</p>
                    <p className="proposal-location">{proposal.customerInfo.city}</p>
                    <p className="proposal-date">
                      {new Date(proposal.createdDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="proposal-footer">
                    <p className="proposal-total">
                      ${(proposal.totalCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
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

      <ConfirmDialog
        open={proposalToDelete !== null}
        title="Delete proposal?"
        message={
          proposalToDelete
            ? `Delete proposal #${proposalToDelete.replace('PROP-', '')}? This action cannot be undone.`
            : 'This action cannot be undone.'
        }
        confirmLabel="Delete"
        cancelLabel="Keep proposal"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
}

export default HomePage;
