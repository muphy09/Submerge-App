import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Proposal } from '../types/proposal-new';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import MasterPricingEngine from '../services/masterPricingEngine';
import { listPricingModels as listPricingModelsRemote } from '../services/pricingModelsAdapter';
import './ProposalsListPage.css';
import { deleteProposal as deleteProposalRemote, listProposals } from '../services/proposalsAdapter';
import { getSessionFranchiseId, getSessionUserName } from '../services/session';
import syncGoodIcon from '../../docs/img/syncgood.png';
import syncBadIcon from '../../docs/img/syncbad.png';

function ProposalsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<'customerName' | 'lastModified' | 'status' | 'pricingModel' | 'retailPrice' | 'totalCOGS' | 'grossProfitPercent' | 'grossProfitAmount'>('lastModified');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedProposals, setSelectedProposals] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [defaultModelMap, setDefaultModelMap] = useState<Record<string, string | null>>({});
  const [availableModelMap, setAvailableModelMap] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    loadProposals();
  }, []);

  useEffect(() => {
    const handleOnline = () => void loadProposals();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const loadProposals = async () => {
    setLoading(true);
    try {
      const data = await listProposals(getSessionFranchiseId());
      const userName = getSessionUserName();
      const filtered = userName
        ? (data || []).filter((p) => (p.designerName || '').toLowerCase() === userName.toLowerCase())
        : data || [];
      const enriched = filtered.map((proposal) => {
        try {
          const calculated = MasterPricingEngine.calculateCompleteProposal(
            proposal,
            proposal.papDiscounts
          );

          return {
            ...proposal,
            pricing: calculated.pricing,
            costBreakdown: calculated.costBreakdown,
            subtotal: calculated.subtotal,
            totalCost: calculated.totalCost,
          };
        } catch (error) {
          console.error(
            `Failed to recalculate pricing for proposal ${proposal.proposalNumber}:`,
            error
          );
          return proposal;
        }
      });

      setProposals(enriched);

      // Build maps for pricing model status by franchise to drive the pill UI
      const franchiseIds = Array.from(new Set((enriched || []).map((p) => p.franchiseId || 'default')));
      const defaultMap: Record<string, string | null> = {};
      const availableMap: Record<string, Set<string>> = {};
      for (const id of franchiseIds) {
        try {
          const rows = await listPricingModelsRemote(id);
          const def = rows?.find((r: any) => r.isDefault);
          defaultMap[id] = def?.id || null;
          availableMap[id] = new Set((rows || []).map((r: any) => r.id));
        } catch (error) {
          console.warn('Unable to load pricing models for franchise', id, error);
          defaultMap[id] = null;
          availableMap[id] = new Set();
        }
      }
      setDefaultModelMap(defaultMap);
      setAvailableModelMap(availableMap);
    } catch (error) {
      console.error('Failed to load proposals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getGrossProfitAmount = (proposal: Proposal) => {
    // Use the actual gross profit from pricing calculations (after commissions & fees)
    return proposal.pricing?.grossProfit || 0;
  };

  const getGrossProfitPercent = (proposal: Proposal) => {
    // Gross profit margin returned from pricing is already expressed as a percentage
    return proposal.pricing?.grossProfitMargin || 0;
  };

  const getSyncIcon = (proposal: Proposal) => {
    const synced = (proposal.syncStatus || 'synced') === 'synced';
    return {
      src: synced ? syncGoodIcon : syncBadIcon,
      label: synced ? 'Cloud synced' : 'Pending cloud sync',
    };
  };

  const sortedProposals = [...proposals].sort((a, b) => {
    let aValue: any;
    let bValue: any;

    switch (sortField) {
      case 'customerName':
        aValue = a.customerInfo.customerName.toLowerCase();
        bValue = b.customerInfo.customerName.toLowerCase();
        break;
      case 'lastModified':
        aValue = new Date(a.lastModified).getTime();
        bValue = new Date(b.lastModified).getTime();
        break;
      case 'status':
        aValue = a.status;
        bValue = b.status;
        break;
      case 'pricingModel':
        aValue = (a.pricingModelName || '').toLowerCase();
        bValue = (b.pricingModelName || '').toLowerCase();
        break;
      case 'retailPrice':
        aValue = a.pricing?.retailPrice || a.totalCost || 0;
        bValue = b.pricing?.retailPrice || b.totalCost || 0;
        break;
      case 'totalCOGS':
        aValue = a.pricing?.totalCOGS || 0;
        bValue = b.pricing?.totalCOGS || 0;
        break;
      case 'grossProfitPercent':
        aValue = getGrossProfitPercent(a);
        bValue = getGrossProfitPercent(b);
        break;
      case 'grossProfitAmount':
        aValue = getGrossProfitAmount(a);
        bValue = getGrossProfitAmount(b);
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const handleRowClick = (proposalNumber: string, e: React.MouseEvent) => {
    // Don't navigate if clicking on checkbox
    if ((e.target as HTMLElement).closest('.checkbox-cell')) {
      return;
    }
    navigate(`/proposal/view/${proposalNumber}`);
  };

  const handleCheckboxChange = (proposalNumber: string, e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const newSelected = new Set(selectedProposals);
    if (e.target.checked) {
      newSelected.add(proposalNumber);
    } else {
      newSelected.delete(proposalNumber);
    }
    setSelectedProposals(newSelected);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allProposalNumbers = new Set(sortedProposals.map(p => p.proposalNumber));
      setSelectedProposals(allProposalNumbers);
    } else {
      setSelectedProposals(new Set());
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      for (const proposalNumber of selectedProposals) {
        await deleteProposalRemote(proposalNumber, getSessionFranchiseId());
      }
      showToast({
        type: 'success',
        message: `${selectedProposals.size} proposal${selectedProposals.size > 1 ? 's' : ''} deleted.`
      });
      setSelectedProposals(new Set());
      loadProposals();
    } catch (error) {
      console.error('Failed to delete proposals:', error);
      showToast({ type: 'error', message: 'Failed to delete proposals.' });
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
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

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="proposals-list-page">
      <div className="proposals-list-header">
        <h1>All Proposals</h1>
        <div className="proposals-list-stats">
          {selectedProposals.size > 0 && (
            <button
              className="btn-delete-selected"
              onClick={handleDeleteClick}
              title={`Delete ${selectedProposals.size} selected proposal${selectedProposals.size > 1 ? 's' : ''}`}
            >
              🗑️
            </button>
          )}
          <span>Total: {proposals.length}</span>
        </div>
      </div>

      {loading ? (
        <div className="proposals-loading">Loading proposals...</div>
      ) : proposals.length === 0 ? (
        <div className="proposals-empty">
          <p>No proposals yet. Create your first proposal to get started!</p>
          <button className="btn-create" onClick={() => navigate('/proposal/new')}>
            Create New Proposal
          </button>
        </div>
      ) : (
        <div className="proposals-table-container">
          <table className="proposals-table">
            <colgroup>
              <col style={{ width: '40px' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="checkbox-header">
                  <input
                    type="checkbox"
                    checked={selectedProposals.size === sortedProposals.length && sortedProposals.length > 0}
                    onChange={handleSelectAll}
                    className="checkbox-select-all"
                  />
                </th>
                <th onClick={() => handleSort('customerName')}>
                  Customer Name <SortIcon field="customerName" />
                </th>
                <th onClick={() => handleSort('lastModified')}>
                  Date Modified <SortIcon field="lastModified" />
                </th>
                <th onClick={() => handleSort('status')}>
                  Proposal Status <SortIcon field="status" />
                </th>
                <th onClick={() => handleSort('pricingModel')}>
                  Pricing Model <SortIcon field="pricingModel" />
                </th>
                <th className="th-right" onClick={() => handleSort('retailPrice')}>
                  Retail Price <SortIcon field="retailPrice" />
                </th>
                <th className="th-right" onClick={() => handleSort('totalCOGS')}>
                  Total COGS <SortIcon field="totalCOGS" />
                </th>
                <th className="th-right" onClick={() => handleSort('grossProfitPercent')}>
                  Gross Profit % <SortIcon field="grossProfitPercent" />
                </th>
                <th className="th-right" onClick={() => handleSort('grossProfitAmount')}>
                  Gross Profit Amount <SortIcon field="grossProfitAmount" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedProposals.map((proposal) => {
                const retailPrice = proposal.pricing?.retailPrice || proposal.totalCost || 0;
                const totalCOGS = proposal.pricing?.totalCOGS || 0;
                const grossProfitAmount = getGrossProfitAmount(proposal);
                const grossProfitPercent = getGrossProfitPercent(proposal);

                return (
                  <tr
                    key={proposal.proposalNumber}
                    onClick={(e) => handleRowClick(proposal.proposalNumber, e)}
                    className="proposal-row"
                  >
                    <td className="checkbox-cell" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedProposals.has(proposal.proposalNumber)}
                        onChange={(e) => handleCheckboxChange(proposal.proposalNumber, e)}
                        className="checkbox-row"
                      />
                    </td>
                    <td className="customer-name">
                      <span className="customer-name-text">{proposal.customerInfo.customerName}</span>
                      {(() => {
                        const icon = getSyncIcon(proposal);
                        return (
                          <img
                            src={icon.src}
                            alt={icon.label}
                            title={icon.label}
                            className="proposal-sync-icon"
                          />
                        );
                      })()}
                    </td>
                    <td>{new Date(proposal.lastModified).toLocaleDateString()}</td>
                    <td>
                      <span
                        className="status-badge-table"
                        style={{ backgroundColor: getStatusColor(proposal.status) }}
                      >
                        {proposal.status}
                      </span>
                    </td>
                    <td>
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
                    </td>
                    <td className="price-cell">
                      ${retailPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="price-cell">
                      ${totalCOGS.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="percent-cell">
                      {grossProfitPercent.toFixed(2)}%
                    </td>
                    <td className="price-cell profit-cell">
                      ${grossProfitAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete proposals?"
        message={`Are you sure you want to delete ${selectedProposals.size} proposal${selectedProposals.size > 1 ? 's' : ''}? This action cannot be undone.`}
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
}

export default ProposalsListPage;
