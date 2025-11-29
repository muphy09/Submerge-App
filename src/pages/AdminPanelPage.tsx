import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Proposal } from '../types/proposal-new';
import MasterPricingEngine from '../services/masterPricingEngine';
import { listPricingModels, setDefaultPricingModel } from '../services/pricingModelsAdapter';
import './AdminPanelPage.css';

const DEFAULT_FRANCHISE_ID = 'default';

type SessionInfo = {
  userName?: string;
  franchiseId?: string;
  franchiseName?: string;
  franchiseCode?: string;
  role?: 'admin' | 'designer';
};

interface AdminPanelPageProps {
  onOpenPricingData?: () => void;
  session?: SessionInfo | null;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'draft': return '#ddc720ff';
    case 'submitted': return '#04bc17ff';
    case 'approved': return '#10b981';
    case 'rejected': return '#ef4444';
    default: return '#6b7280';
  }
};

const formatDate = (value?: string) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString();
};

function AdminPanelPage({ onOpenPricingData, session }: AdminPanelPageProps) {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [pricingModels, setPricingModels] = useState<any[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [activatingModelId, setActivatingModelId] = useState<string | null>(null);

  const franchiseId = session?.franchiseId || DEFAULT_FRANCHISE_ID;
  const isAdmin = (session?.role || '').toLowerCase() === 'admin';

  useEffect(() => {
    if (!isAdmin) {
      setLoadingProposals(false);
      setLoadingModels(false);
      return;
    }
    void loadProposals(franchiseId);
    void loadPricingModels(franchiseId);
  }, [franchiseId, isAdmin]);

  useEffect(() => {
    const handleModelsUpdated = () => {
      void loadPricingModels(franchiseId);
    };
    window.addEventListener('pricing-models-updated', handleModelsUpdated);
    return () => window.removeEventListener('pricing-models-updated', handleModelsUpdated);
  }, [franchiseId]);

  const loadProposals = async (targetFranchiseId: string) => {
    if (!window.electron?.getAllProposals) {
      setLoadingProposals(false);
      return;
    }
    setLoadingProposals(true);
    try {
      const data = await window.electron.getAllProposals();
      const filtered = (data || []).filter(
        (proposal: Proposal) => (proposal.franchiseId || DEFAULT_FRANCHISE_ID) === (targetFranchiseId || DEFAULT_FRANCHISE_ID)
      );
      const enriched = filtered.map((proposal: Proposal) => {
        try {
          const calculated = MasterPricingEngine.calculateCompleteProposal(
            proposal,
            (proposal as any).papDiscounts
          );
          return {
            ...proposal,
            pricing: calculated.pricing,
            costBreakdown: calculated.costBreakdown,
            subtotal: calculated.subtotal,
            totalCost: calculated.totalCost,
          };
        } catch (error) {
          console.warn(`Unable to recalc pricing for proposal ${proposal.proposalNumber}`, error);
          return proposal;
        }
      });
      setProposals(enriched);
    } catch (error) {
      console.error('Failed to load proposals for admin panel:', error);
    } finally {
      setLoadingProposals(false);
    }
  };

  const loadPricingModels = async (targetFranchiseId: string) => {
    setLoadingModels(true);
    try {
      const rows = await listPricingModels(targetFranchiseId);
      setPricingModels(rows || []);
    } catch (error) {
      console.error('Failed to load pricing models for admin panel:', error);
      setPricingModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSetActiveModel = async (modelId: string) => {
    if (!modelId) return;
    setActivatingModelId(modelId);
    try {
      await setDefaultPricingModel({
        franchiseId,
        pricingModelId: modelId,
      });
      await loadPricingModels(franchiseId);
      window.dispatchEvent(new Event('pricing-models-updated'));
    } catch (error) {
      console.error('Failed to set active pricing model:', error);
    } finally {
      setActivatingModelId(null);
    }
  };

  const performanceData = useMemo(
    () => [
      { name: session?.userName || 'Designer One', proposals: 7 },
      { name: 'Designer Two', proposals: 5 },
      { name: 'Designer Three', proposals: 3 },
      { name: 'Designer Four', proposals: 2 },
    ],
    [session?.userName]
  );

  const maxPerformance = Math.max(...performanceData.map((item) => item.proposals), 1);

  const sortedProposals = useMemo(
    () =>
      [...proposals].sort(
        (a, b) =>
          new Date(b.lastModified || b.createdDate).getTime() -
          new Date(a.lastModified || a.createdDate).getTime()
      ),
    [proposals]
  );

  const sortedPricingModels = useMemo(
    () =>
      [...pricingModels]
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt || 0).getTime() -
            new Date(a.updatedAt || a.createdAt || 0).getTime()
        )
        .sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault))),
    [pricingModels]
  );

  const totalProposalsSubmitted = proposals.length;
  const averageRetailCost = proposals.length
    ? proposals.reduce((sum, proposal) => {
        const retail = proposal.pricing?.retailPrice || proposal.totalCost || 0;
        return sum + retail;
      }, 0) / proposals.length
    : 0;

  const getGrossProfitAmount = (proposal: Proposal) => proposal.pricing?.grossProfit || 0;
  const getGrossProfitPercent = (proposal: Proposal) => proposal.pricing?.grossProfitMargin || 0;

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <div className="admin-locked-card">
          <h2>Admin access required</h2>
          <p>Switch to an admin account to view franchise performance and pricing tools.</p>
          <button className="admin-primary-btn" type="button" onClick={() => navigate('/')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-top-grid">
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Notifications</h2>
              <p className="admin-kicker">Franchise updates</p>
            </div>
          </div>
          <div className="admin-divider" />
          <div className="admin-notifications">
            <div className="admin-notification-item">
              <div className="notification-title">Feature coming soon!</div>
              <div className="notification-meta">Stay tuned for franchise-wide alerts.</div>
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Franchise Pricing</h2>
              <p className="admin-kicker">Manage Pricing Models</p>
            </div>
            <button
              className="admin-primary-btn"
              type="button"
              onClick={onOpenPricingData}
              disabled={!onOpenPricingData}
            >
              Open Admin Pricing
            </button>
          </div>
          <div className="admin-divider" />
          <div className="admin-models-list" role="list">
            {loadingModels ? (
              <div className="admin-empty">Loading pricing models...</div>
            ) : sortedPricingModels.length === 0 ? (
              <div className="admin-empty">No pricing models found for this franchise.</div>
            ) : (
              sortedPricingModels.map((model) => (
                <div className="admin-model-row" key={model.id} role="listitem">
                  <div className="admin-model-name">
                    {model.name}
                  </div>
                  <div className="admin-model-actions">
                    {model.isDefault ? (
                      <span className="admin-model-pill">Active</span>
                    ) : (
                      <button
                        className="admin-primary-btn ghost"
                        type="button"
                        onClick={() => handleSetActiveModel(model.id)}
                        disabled={activatingModelId === model.id}
                      >
                        {activatingModelId === model.id ? 'Setting...' : 'Set as Active'}
                      </button>
                    )}
                    <div className="admin-model-date">{formatDate(model.updatedAt || model.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Franchise Performance</h2>
              <p className="admin-kicker">Proposals submitted by designer</p>
            </div>
          </div>
          <div className="admin-divider" />
          <div className="admin-performance">
            <div className="admin-performance-chart">
              {performanceData.map((item) => (
                <div className="performance-row" key={item.name}>
                  <div className="performance-name">{item.name}</div>
                  <div className="performance-bar-track">
                    <div
                      className="performance-bar-fill"
                      style={{ width: `${(item.proposals / maxPerformance) * 100}%` }}
                    />
                    <div className="performance-value">{item.proposals}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="admin-performance-stats">
              <div className="admin-stat">
                <div className="admin-stat-label">Total Proposals Submitted</div>
                <div className="admin-stat-value">{totalProposalsSubmitted}</div>
              </div>
              <div className="admin-stat">
                <div className="admin-stat-label">Average Retail Cost</div>
                <div className="admin-stat-value">
                  ${averageRetailCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-section-divider" />

      <div className="admin-table-card">
        <div className="admin-table-header">
          <div>
            <p className="admin-kicker">All franchise locations</p>
            <h2 className="admin-card-title">Franchise Proposals</h2>
          </div>
          <div className="admin-table-meta">{totalProposalsSubmitted} total</div>
        </div>

        {loadingProposals ? (
          <div className="admin-empty padded">Loading proposals...</div>
        ) : sortedProposals.length === 0 ? (
          <div className="admin-empty padded">No proposals for this franchise yet.</div>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Designer</th>
                  <th>Customer Name</th>
                  <th>Date Modified</th>
                  <th>Proposal Status</th>
                  <th className="th-right">Retail Price</th>
                  <th className="th-right">Total COGS</th>
                  <th className="th-right">Gross Profit %</th>
                  <th className="th-right">Gross Profit Amount</th>
                </tr>
              </thead>
              <tbody>
                {sortedProposals.map((proposal) => {
                  const retailPrice = proposal.pricing?.retailPrice || proposal.totalCost || 0;
                  const totalCOGS = proposal.pricing?.totalCOGS || 0;
                  const grossProfitAmount = getGrossProfitAmount(proposal);
                  const grossProfitPercent = getGrossProfitPercent(proposal);
                  const designerName = session?.userName || 'Designer';

                  return (
                    <tr
                      key={proposal.proposalNumber}
                      onClick={() => navigate(`/proposal/view/${proposal.proposalNumber}`)}
                      className="proposal-row"
                    >
                      <td className="designer-cell">{designerName}</td>
                      <td className="customer-name">{proposal.customerInfo.customerName}</td>
                      <td>{new Date(proposal.lastModified || proposal.createdDate).toLocaleDateString()}</td>
                      <td>
                        <span
                          className="status-badge-table"
                          style={{ backgroundColor: getStatusColor(proposal.status) }}
                        >
                          {proposal.status}
                        </span>
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
      </div>
    </div>
  );
}

export default AdminPanelPage;
