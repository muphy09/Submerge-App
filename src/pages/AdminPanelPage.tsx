import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Proposal } from '../types/proposal-new';
import MasterPricingEngine from '../services/masterPricingEngine';
import { listPricingModels, setDefaultPricingModel } from '../services/pricingModelsAdapter';
import { listProposals as listProposalsRemote } from '../services/proposalsAdapter';
import { initPricingDataStore } from '../services/pricingDataStore';
import './AdminPanelPage.css';
import {
  addFranchiseUser,
  deleteFranchiseUser,
  listFranchiseUsers,
  markDesignerProposalsDeleted,
  updateFranchiseUserRole,
} from '../services/franchiseUsersAdapter';
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

const DEFAULT_FRANCHISE_ID = 'default';

type SessionInfo = {
  userName?: string;
  franchiseId?: string;
  franchiseName?: string;
  franchiseCode?: string;
  role?: 'owner' | 'admin' | 'designer';
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
  const [franchiseUsers, setFranchiseUsers] = useState<
    { id: string; name: string; role: 'owner' | 'admin' | 'designer'; isActive: boolean }[]
  >([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [addingUser, setAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [userError, setUserError] = useState<string | null>(null);
  const [promotingUserId, setPromotingUserId] = useState<string | null>(null);
  const userListRef = useRef<HTMLDivElement | null>(null);
  const userWheelLockRef = useRef<number>(0);

  const franchiseId = session?.franchiseId || DEFAULT_FRANCHISE_ID;
  const normalizedRole = (session?.role || '').toLowerCase();
  const isAdmin = normalizedRole === 'admin' || normalizedRole === 'owner';

  useEffect(() => {
    if (!isAdmin) {
      setLoadingProposals(false);
      setLoadingModels(false);
      setLoadingUsers(false);
      return;
    }
    void loadProposals(franchiseId);
    void loadPricingModels(franchiseId);
    void loadUsers(franchiseId);
  }, [franchiseId, isAdmin]);

  useEffect(() => {
    const handleModelsUpdated = () => {
      void loadPricingModels(franchiseId);
    };
    window.addEventListener('pricing-models-updated', handleModelsUpdated);
    return () => window.removeEventListener('pricing-models-updated', handleModelsUpdated);
  }, [franchiseId]);

  const loadProposals = async (targetFranchiseId: string) => {
    setLoadingProposals(true);
    try {
      const data = await listProposalsRemote(targetFranchiseId);
      const enriched: Proposal[] = [];

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

      for (const raw of data || []) {
        try {
          const merged = mergeWithDefaults(raw);
          await initPricingDataStore(merged.franchiseId || targetFranchiseId || DEFAULT_FRANCHISE_ID, merged.pricingModelId || undefined);
          const calculated = MasterPricingEngine.calculateCompleteProposal(
            merged,
            (merged as any).papDiscounts
          );
          enriched.push({
            ...(merged as Proposal),
            pricing: calculated.pricing,
            costBreakdown: calculated.costBreakdown,
            subtotal: calculated.subtotal,
            totalCost: calculated.totalCost,
          } as Proposal);
        } catch (error) {
          console.warn(`Unable to recalc pricing for proposal ${raw.proposalNumber}`, error);
          enriched.push(raw as Proposal);
        }
      }

      setProposals(enriched);
    } catch (error) {
      console.error('Failed to load proposals for admin panel:', error);
      setProposals([]);
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

  const loadUsers = async (targetFranchiseId: string) => {
    setLoadingUsers(true);
    try {
      const rows = await listFranchiseUsers(targetFranchiseId);
      setFranchiseUsers(
        (rows || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          role: row.role,
          isActive: Boolean(row.isActive),
        }))
      );
    } catch (error) {
      console.error('Failed to load franchise users:', error);
      setFranchiseUsers([]);
    } finally {
      setLoadingUsers(false);
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

  const handleAddUser = async () => {
    if (!newUserName.trim()) {
      setUserError('Please enter a name.');
      return;
    }
    setUserError(null);
    setAddingUser(true);
    try {
      await addFranchiseUser({
        franchiseId,
        name: newUserName.trim(),
        role: 'designer',
        isActive: true,
      });
      setNewUserName('');
      await loadUsers(franchiseId);
    } catch (error: any) {
      console.error('Failed to add user:', error);
      setUserError(error?.message || 'Unable to add user.');
    } finally {
      setAddingUser(false);
    }
  };

  const handleRemoveUser = async (userId: string, role: string) => {
    if (role === 'admin' || role === 'owner') {
      console.warn('Skipping removal of elevated user to prevent lockout.');
      return;
    }
    try {
      const targetName = franchiseUsers.find((u) => u.id === userId)?.name || '';
      await deleteFranchiseUser(userId);
      await markDesignerProposalsDeleted(franchiseId, targetName);
      await loadUsers(franchiseId);
      await loadProposals(franchiseId);
    } catch (error) {
      console.error('Failed to remove user:', error);
    }
  };

  const handlePromoteUser = async (userId: string) => {
    setPromotingUserId(userId);
    try {
      await updateFranchiseUserRole(userId, 'admin');
      await loadUsers(franchiseId);
    } catch (error) {
      console.error('Failed to promote user to admin:', error);
    } finally {
      setPromotingUserId(null);
    }
  };

  const performanceData = useMemo(() => {
    if (!proposals.length) {
      return [{ name: session?.userName || 'Designer', proposals: 0 }];
    }
    const counts: Record<string, number> = {};
    proposals.forEach((proposal) => {
      const name = proposal.designerName || session?.userName || 'Designer';
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, proposals: count }))
      .sort((a, b) => b.proposals - a.proposals);
  }, [proposals, session?.userName]);

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

  const defaultPricingModelId = useMemo(
    () => pricingModels.find((m: any) => m.isDefault)?.id || null,
    [pricingModels]
  );

  const availablePricingModelIds = useMemo(
    () => new Set((pricingModels || []).map((m: any) => m.id)),
    [pricingModels]
  );

  const handleUserListWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const container = userListRef.current;
    if (!container) return;
    const now = Date.now();
    if (now - userWheelLockRef.current < 140) {
      e.preventDefault();
      return;
    }
    const firstRow = container.querySelector('.admin-user-row') as HTMLElement | null;
    const styles = window.getComputedStyle(container);
    const rowGap = parseFloat(styles.rowGap || '0') || 0;
    const step = (firstRow?.offsetHeight || 60) + rowGap;
    e.preventDefault();
    userWheelLockRef.current = now;
    container.scrollTop += e.deltaY > 0 ? step : -step;
  };

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
              <h2 className="admin-card-title">Designers</h2>
              <p className="admin-kicker">Allowed users for this franchise</p>
            </div>
          </div>
          <div className="admin-divider" />
          <div className="admin-users">
            <div className="admin-users-form">
              <input
                type="text"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Designer name"
              />
              <button
                className="admin-primary-btn"
                type="button"
                onClick={handleAddUser}
                disabled={addingUser}
              >
                {addingUser ? 'Adding...' : 'Add Designer'}
              </button>
            </div>
            {userError && <div className="admin-error">{userError}</div>}
            {loadingUsers ? (
              <div className="admin-empty">Loading designers...</div>
            ) : franchiseUsers.length === 0 ? (
              <div className="admin-empty">No designers added yet.</div>
            ) : (
              <div
                className="admin-users-list"
                role="list"
                ref={userListRef}
                onWheel={handleUserListWheel}
              >
                {franchiseUsers.map((user) => (
                  <div className="admin-user-row" key={user.id} role="listitem">
                    <div className="admin-user-meta">
                      <div className="admin-user-name">{user.name}</div>
                      <div className="admin-user-role">
                        {user.role === 'owner' ? 'Owner' : user.role === 'admin' ? 'Admin' : 'Designer'}
                      </div>
                    </div>
                    <div className="admin-user-actions">
                      {user.role === 'designer' && (
                        <button
                          className="admin-primary-btn ghost"
                          type="button"
                          onClick={() => handlePromoteUser(user.id)}
                          disabled={promotingUserId === user.id}
                          title="Promote to admin"
                        >
                          {promotingUserId === user.id ? 'Promoting...' : 'Make Admin'}
                        </button>
                      )}
                      {user.role === 'designer' && (
                        <button
                          className="admin-remove-btn"
                          type="button"
                          onClick={() => handleRemoveUser(user.id, user.role)}
                          title="Remove user"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
            <h2 className="admin-card-title">Franchise Proposals</h2>
            <p className="admin-kicker">All Franchise Proposals</p>
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
                  <th>Pricing Model</th>
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
                  const designerName = proposal.designerName || session?.userName || 'Designer';
                  const modelId = proposal.pricingModelId || '';
                  const explicitRemoved = (proposal.pricingModelName || '').toLowerCase().includes('(removed)');
                  const isRemoved = Boolean(modelId) && (!availablePricingModelIds.has(modelId) || explicitRemoved);
                  const isActive =
                    Boolean(modelId) &&
                    defaultPricingModelId &&
                    modelId === defaultPricingModelId &&
                    availablePricingModelIds.has(modelId) &&
                    !explicitRemoved;
                  const isInactive = Boolean(modelId) && !isActive && !isRemoved;
                  const modelClass = isActive
                    ? 'proposal-model-pill active'
                    : isRemoved
                    ? 'proposal-model-pill removed'
                    : 'proposal-model-pill inactive';

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
                      <td>
                        <span className={modelClass}>
                          {(proposal.pricingModelName || 'Pricing Model') +
                            (isRemoved && !explicitRemoved ? ' (Removed)' : '')}
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
