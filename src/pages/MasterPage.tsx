import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MasterFranchiseEditorModal from '../components/MasterFranchiseEditorModal';
import TempPasswordModal from '../components/TempPasswordModal';
import { getLedgerRoleLabel, listLedgerEvents, type LedgerEvent } from '../services/ledger';
import {
  createFranchiseWithOwner,
  listAllPricingModels,
  listAllFranchiseUsers,
  listAllFranchises,
  softDeleteFranchise,
  type MasterFranchise,
  type MasterPricingModel,
  type MasterUser,
} from '../services/masterAdminAdapter';
import { loadPricingModel, savePricingModel } from '../services/pricingModelsAdapter';
import type { UserSession } from '../services/session';
import './MasterPage.css';

type MasterPageProps = {
  session?: UserSession | null;
  onActAsFranchise?: (franchise: MasterFranchise) => void;
  actingFranchiseId?: string | null;
  onFranchiseUpdated?: (franchise: MasterFranchise) => void;
};

const formatDate = (value?: string) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString();
};

const formatDateTime = (value?: string) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
};

const formatDetailLabel = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const formatDetailValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

const getUserNameLabel = (user: Pick<MasterUser, 'name'>) => {
  const trimmedName = String(user.name || '').trim();
  return trimmedName || 'Unnamed';
};

function MasterPage({ session, onActAsFranchise, actingFranchiseId, onFranchiseUpdated }: MasterPageProps) {
  const navigate = useNavigate();
  const [franchises, setFranchises] = useState<MasterFranchise[]>([]);
  const [users, setUsers] = useState<MasterUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [hideInactive, setHideInactive] = useState(true);
  const [pricingModels, setPricingModels] = useState<MasterPricingModel[]>([]);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingSearch, setPricingSearch] = useState('');
  const [pricingFranchiseFilter, setPricingFranchiseFilter] = useState('all');
  const [pricingSort, setPricingSort] = useState('updated-desc');
  const [hideInactivePricingFranchises, setHideInactivePricingFranchises] = useState(true);
  const [copyTargets, setCopyTargets] = useState<Record<string, string>>({});
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [editingFranchise, setEditingFranchise] = useState<MasterFranchise | null>(null);
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEvent[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerFranchiseFilter, setLedgerFranchiseFilter] = useState('all');
  const [selectedLedgerEvent, setSelectedLedgerEvent] = useState<LedgerEvent | null>(null);

  const [franchiseName, setFranchiseName] = useState('');
  const [franchiseCode, setFranchiseCode] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');

  const isMaster = (session?.role || '').toLowerCase() === 'master';

  const loadData = async () => {
    setLoading(true);
    try {
      const [franchiseRows, userRows] = await Promise.all([
        listAllFranchises(),
        listAllFranchiseUsers(),
      ]);
      setFranchises(franchiseRows || []);
      setUsers(userRows || []);
    } catch (error) {
      console.error('Failed to load master data:', error);
      setFranchises([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPricingModels = async () => {
    setPricingLoading(true);
    setPricingError(null);
    try {
      const rows = await listAllPricingModels();
      setPricingModels(rows || []);
    } catch (error: any) {
      console.error('Failed to load pricing models:', error);
      setPricingModels([]);
      setPricingError(error?.message || 'Unable to load pricing models.');
    } finally {
      setPricingLoading(false);
    }
  };

  const loadLedger = async () => {
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const events = await listLedgerEvents(200);
      setLedgerEvents(events || []);
    } catch (error: any) {
      console.error('Failed to load ledger events:', error);
      setLedgerEvents([]);
      setLedgerError(error?.message || 'Unable to load ledger events.');
    } finally {
      setLedgerLoading(false);
    }
  };

  const refreshMasterData = async () => {
    await Promise.all([loadData(), loadLedger()]);
  };

  useEffect(() => {
    if (isMaster) {
      void loadData();
      void loadPricingModels();
      void loadLedger();
    }
  }, [isMaster]);

  const franchiseLookup = useMemo(() => {
    const map = new Map<string, MasterFranchise>();
    franchises.forEach((franchise) => {
      map.set(franchise.id, franchise);
    });
    return map;
  }, [franchises]);

  const franchiseOptions = useMemo(() => {
    return [...franchises].sort((a, b) => {
      const nameA = (a.name || a.franchiseCode || a.id).toLowerCase();
      const nameB = (b.name || b.franchiseCode || b.id).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [franchises]);

  const pricingFranchiseOptions = useMemo(() => {
    if (!hideInactivePricingFranchises) return franchiseOptions;
    return franchiseOptions.filter((franchise) => !franchise.deletedAt && franchise.isActive !== false);
  }, [franchiseOptions, hideInactivePricingFranchises]);

  const pricingFranchiseOptionIds = useMemo(
    () => new Set(pricingFranchiseOptions.map((franchise) => franchise.id)),
    [pricingFranchiseOptions]
  );

  const visibleFranchises = useMemo(() => {
    if (!hideInactive) return franchises;
    return franchises.filter((franchise) => !franchise.deletedAt && franchise.isActive !== false);
  }, [franchises, hideInactive]);

  const usersByFranchise = useMemo(() => {
    const map = new Map<string, MasterUser[]>();
    users.forEach((user) => {
      const key = user.franchiseId || 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(user);
    });
    return map;
  }, [users]);

  const filteredPricingModels = useMemo(() => {
    const normalizedSearch = pricingSearch.trim().toLowerCase();
    let rows = pricingModels;
    if (hideInactivePricingFranchises) {
      rows = rows.filter((model) => {
        const franchise = franchiseLookup.get(model.franchiseId);
        return !franchise || (!franchise.deletedAt && franchise.isActive !== false);
      });
    }
    if (pricingFranchiseFilter !== 'all') {
      rows = rows.filter((model) => model.franchiseId === pricingFranchiseFilter);
    }
    if (normalizedSearch) {
      rows = rows.filter((model) => {
        const franchise = franchiseLookup.get(model.franchiseId);
        const franchiseLabel = (franchise?.name || franchise?.franchiseCode || model.franchiseId || '')
          .toLowerCase();
        const modelName = (model.name || '').toLowerCase();
        return modelName.includes(normalizedSearch) || franchiseLabel.includes(normalizedSearch);
      });
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (pricingSort === 'name-asc') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (pricingSort === 'franchise-asc') {
        const nameA = franchiseLookup.get(a.franchiseId);
        const nameB = franchiseLookup.get(b.franchiseId);
        const labelA = nameA?.name || nameA?.franchiseCode || a.franchiseId;
        const labelB = nameB?.name || nameB?.franchiseCode || b.franchiseId;
        return labelA.localeCompare(labelB);
      }
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      if (pricingSort === 'updated-asc') {
        return dateA - dateB;
      }
      return dateB - dateA;
    });
    return sorted;
  }, [pricingModels, pricingFranchiseFilter, pricingSearch, pricingSort, franchiseLookup, hideInactivePricingFranchises]);

  useEffect(() => {
    if (pricingFranchiseFilter === 'all') return;
    const selectedStillVisible = pricingFranchiseOptionIds.has(pricingFranchiseFilter);
    if (!selectedStillVisible) {
      setPricingFranchiseFilter('all');
    }
  }, [pricingFranchiseFilter, pricingFranchiseOptionIds]);

  useEffect(() => {
    setCopyTargets((prev) => {
      let changed = false;
      const next = Object.fromEntries(
        Object.entries(prev).filter(([, franchiseId]) => {
          const keep = pricingFranchiseOptionIds.has(franchiseId);
          if (!keep) changed = true;
          return keep;
        })
      );
      return changed ? next : prev;
    });
  }, [pricingFranchiseOptionIds]);

  const pricingCountLabel = useMemo(() => {
    if (pricingModels.length === 0) return '0 total';
    if (filteredPricingModels.length === pricingModels.length) {
      return `${pricingModels.length} total`;
    }
    return `${filteredPricingModels.length} of ${pricingModels.length} total`;
  }, [filteredPricingModels.length, pricingModels.length]);

  const filteredLedgerEvents = useMemo(() => {
    if (ledgerFranchiseFilter === 'all') return ledgerEvents;
    return ledgerEvents.filter((event) => event.franchiseId === ledgerFranchiseFilter);
  }, [ledgerEvents, ledgerFranchiseFilter]);

  useEffect(() => {
    if (ledgerFranchiseFilter === 'all') return;
    const selectedStillExists = franchiseOptions.some((franchise) => franchise.id === ledgerFranchiseFilter);
    if (!selectedStillExists) {
      setLedgerFranchiseFilter('all');
    }
  }, [franchiseOptions, ledgerFranchiseFilter]);

  const ledgerCountLabel = useMemo(() => {
    if (ledgerEvents.length === 0) return '0 total';
    if (filteredLedgerEvents.length === ledgerEvents.length) {
      return `${ledgerEvents.length} total`;
    }
    return `${filteredLedgerEvents.length} of ${ledgerEvents.length} total`;
  }, [filteredLedgerEvents.length, ledgerEvents.length]);

  const handleCreateFranchise = async () => {
    const trimmedName = franchiseName.trim();
    const trimmedCode = franchiseCode.trim().toUpperCase();
    const trimmedOwnerEmail = ownerEmail.trim().toLowerCase();
    const trimmedOwnerName = ownerName.trim();

    if (!trimmedName || !trimmedCode || !trimmedOwnerEmail || !trimmedOwnerName) {
      setFormError('Please enter a franchise name, code, owner email, and owner display name.');
      return;
    }

    setFormError(null);
    setCreating(true);
    try {
      const result = await createFranchiseWithOwner({
        franchiseName: trimmedName,
        franchiseCode: trimmedCode,
        ownerEmail: trimmedOwnerEmail,
        ownerName: trimmedOwnerName,
      });
      setTempPassword(result?.tempPassword || null);
      setFranchiseName('');
      setFranchiseCode('');
      setOwnerEmail('');
      setOwnerName('');
      await refreshMasterData();
    } catch (error: any) {
      console.error('Failed to create franchise:', error);
      setFormError(error?.message || 'Unable to create franchise.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteFranchise = async (franchiseId: string, franchiseName?: string | null) => {
    const confirmDelete = window.confirm(
      `Soft delete ${franchiseName || franchiseId}? Users will be disabled until restored.`
    );
    if (!confirmDelete) return;
    setDeletingId(franchiseId);
    try {
      await softDeleteFranchise(franchiseId);
      await refreshMasterData();
    } catch (error) {
      console.error('Failed to delete franchise:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const getFranchiseLabel = (franchiseId: string) => {
    const franchise = franchiseLookup.get(franchiseId);
    return franchise?.name || franchise?.franchiseCode || franchiseId;
  };

  const handleCopyTargetChange = (modelId: string, value: string) => {
    setCopyTargets((prev) => ({ ...prev, [modelId]: value }));
  };

  const handleCopyPricingModel = async (model: MasterPricingModel) => {
    const targetFranchiseId = copyTargets[model.id];
    if (!targetFranchiseId) {
      setCopyError('Select a target franchise before copying.');
      setCopySuccess(null);
      return;
    }
    setCopyError(null);
    setCopySuccess(null);
    setCopyingId(model.id);
    try {
      const loaded = await loadPricingModel(model.franchiseId, model.id);
      if (!loaded?.pricing) {
        throw new Error('Unable to load pricing model details.');
      }
      const name = loaded.pricingModelName || model.name || 'Pricing Model';
      await savePricingModel({
        franchiseId: targetFranchiseId,
        name,
        pricing: loaded.pricing,
        version: loaded.version,
        updatedBy: session?.userEmail || session?.userName || null,
        createNew: true,
        copiedFromFranchiseId: model.franchiseId,
        copiedFromFranchiseName: getFranchiseLabel(model.franchiseId),
        copiedFromPricingModelId: model.id,
        copiedFromPricingModelName: name,
      });
      setCopySuccess(`Copied "${name}" to ${getFranchiseLabel(targetFranchiseId)}.`);
      await Promise.all([loadPricingModels(), loadLedger()]);
    } catch (error: any) {
      console.error('Failed to copy pricing model:', error);
      setCopyError(error?.message || 'Unable to copy pricing model.');
    } finally {
      setCopyingId(null);
    }
  };

  const handleActAsFranchise = (franchise: MasterFranchise) => {
    if (!onActAsFranchise) return;
    onActAsFranchise(franchise);
  };

  const handleEditFranchise = (franchise: MasterFranchise) => {
    setEditingFranchise(franchise);
  };

  const handleFranchiseUpdated = (franchise: MasterFranchise) => {
    setEditingFranchise(franchise);
    setFranchises((prev) => prev.map((row) => (row.id === franchise.id ? { ...row, ...franchise } : row)));
    onFranchiseUpdated?.(franchise);
    void loadLedger();
  };

  const getLedgerFranchiseLabel = (event: LedgerEvent) => {
    if (event.franchiseName) return event.franchiseName;
    if (event.franchiseId) return getFranchiseLabel(event.franchiseId);
    return 'System';
  };

  const getLedgerUserLabel = (event: LedgerEvent) => {
    const actorName = String(event.actorName || '').trim();
    const actorEmail = String(event.actorEmail || '').trim();
    return actorName || actorEmail || 'Unknown User';
  };

  const selectedLedgerEntries = useMemo(() => {
    if (!selectedLedgerEvent?.details) return [] as Array<[string, unknown]>;
    return Object.entries(selectedLedgerEvent.details).filter(([, value]) => value !== undefined);
  }, [selectedLedgerEvent]);

  if (!isMaster) {
    return (
      <div className="master-page">
        <div className="master-locked-card">
          <h2>Master access required</h2>
          <p>Sign in with the master account to manage franchises.</p>
          <button className="master-primary-btn" type="button" onClick={() => navigate('/')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="master-page">
      <div className="master-header">
        <h1>Master Console</h1>
      </div>

      <div className="master-grid">
        <div className="master-card">
          <h2>Create Franchise + Owner</h2>
          <div className="master-form">
            <input
              type="text"
              value={franchiseName}
              onChange={(e) => setFranchiseName(e.target.value)}
              placeholder="Franchise name"
            />
            <input
              type="text"
              value={franchiseCode}
              onChange={(e) => setFranchiseCode(e.target.value.toUpperCase())}
              placeholder="Franchise code"
            />
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="Owner email"
            />
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Owner display name"
            />
            {formError && <div className="master-error">{formError}</div>}
            <button
              className="master-primary-btn"
              type="button"
              onClick={handleCreateFranchise}
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create Franchise'}
            </button>
          </div>
        </div>

        <div className="master-card">
          <div className="master-card-header">
            <h2>Franchises</h2>
            <label className="master-toggle">
              <input
                type="checkbox"
                checked={hideInactive}
                onChange={(e) => setHideInactive(e.target.checked)}
              />
              Hide inactive
            </label>
          </div>
          {loading ? (
            <div className="master-empty">Loading franchises...</div>
          ) : visibleFranchises.length === 0 ? (
            <div className="master-empty">No franchises found.</div>
          ) : (
            <div className="master-franchise-list">
              {visibleFranchises.map((franchise) => {
                const franchiseUsers = (usersByFranchise.get(franchise.id) || []).filter((user) => user.isActive !== false);
                const owners = franchiseUsers.filter((u) => u.role === 'owner');
                const admins = franchiseUsers.filter((u) => u.role === 'admin');
                const designers = franchiseUsers.filter((u) => u.role === 'designer');
                const designerNames = designers
                  .map((designer) => (designer.name || '').trim())
                  .filter((name) => name.length > 0);
                const designerLabel = designerNames.length
                  ? designerNames.join(', ')
                  : designers.length
                  ? 'Unnamed'
                  : 'None';
                const inactive = franchise.deletedAt || franchise.isActive === false;
                const canActAs = Boolean(onActAsFranchise);
                const isActing = Boolean(actingFranchiseId && actingFranchiseId === franchise.id);
                return (
                  <div
                    className={`master-franchise-row is-clickable${inactive ? ' is-inactive' : ''}${isActing ? ' is-acting' : ''}`}
                    key={franchise.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleEditFranchise(franchise)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleEditFranchise(franchise);
                      }
                    }}
                    title="Edit franchise settings"
                  >
                    <div className="master-franchise-meta">
                      <div className="master-franchise-name">{franchise.name || franchise.id}</div>
                      <div className="master-franchise-code">{franchise.franchiseCode || 'No code'}</div>
                      {isActing && <div className="master-franchise-acting">Acting as Owner</div>}
                      {inactive && <div className="master-franchise-status">Inactive</div>}
                    </div>
                    <div className="master-franchise-users">
                      <div>
                        <strong>Owners:</strong>{' '}
                        {owners.length ? owners.map((u) => getUserNameLabel(u)).join(', ') : 'None'}
                      </div>
                      <div>
                        <strong>Admins:</strong>{' '}
                        {admins.length ? admins.map((u) => getUserNameLabel(u)).join(', ') : 'None'}
                      </div>
                      <div>
                        <strong>Designers:</strong>{' '}
                        {designerLabel}
                      </div>
                    </div>
                    <div className="master-franchise-actions">
                      <button
                        className="master-secondary-btn"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleActAsFranchise(franchise);
                        }}
                        disabled={!canActAs}
                      >
                        Act as Owner
                      </button>
                      <button
                        className="master-danger-btn"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteFranchise(franchise.id, franchise.name);
                        }}
                        disabled={deletingId === franchise.id}
                      >
                        {deletingId === franchise.id ? 'Deleting...' : 'Soft Delete'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="master-card">
          <div className="master-card-header">
            <div>
              <h2>Pricing Models</h2>
              <p className="master-kicker">All franchise pricing models</p>
            </div>
          </div>
          <div className="master-table-actions">
            <div className="master-filter">
              <label htmlFor="pricing-search">Search</label>
              <input
                id="pricing-search"
                type="text"
                value={pricingSearch}
                onChange={(e) => setPricingSearch(e.target.value)}
                placeholder="Search by franchise or model"
              />
            </div>
            <div className="master-filter">
              <label htmlFor="pricing-franchise">Franchise</label>
              <select
                id="pricing-franchise"
                value={pricingFranchiseFilter}
                onChange={(e) => setPricingFranchiseFilter(e.target.value)}
              >
                <option value="all">All franchises</option>
                {pricingFranchiseOptions.map((franchise) => (
                  <option key={franchise.id} value={franchise.id}>
                    {franchise.name || franchise.franchiseCode || franchise.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="master-filter">
              <label htmlFor="pricing-sort">Sort</label>
              <select
                id="pricing-sort"
                value={pricingSort}
                onChange={(e) => setPricingSort(e.target.value)}
              >
                <option value="updated-desc">Date modified (newest)</option>
                <option value="updated-asc">Date modified (oldest)</option>
                <option value="name-asc">Pricing model name (A-Z)</option>
                <option value="franchise-asc">Franchise name (A-Z)</option>
              </select>
            </div>
            <label className="master-toggle master-toggle--table">
              <input
                type="checkbox"
                checked={hideInactivePricingFranchises}
                onChange={(e) => setHideInactivePricingFranchises(e.target.checked)}
              />
              Hide Inactive Franchises
            </label>
            <div className="master-table-meta">{pricingCountLabel}</div>
          </div>
          {pricingError && <div className="master-error">{pricingError}</div>}
          {copyError && <div className="master-error">{copyError}</div>}
          {copySuccess && <div className="master-success">{copySuccess}</div>}
          {pricingLoading ? (
            <div className="master-empty">Loading pricing models...</div>
          ) : filteredPricingModels.length === 0 ? (
            <div className="master-empty">
              {pricingModels.length === 0
                ? 'No pricing models found.'
                : 'No pricing models match the current filters.'}
            </div>
          ) : (
            <div className="master-table-wrapper">
              <table className="master-table">
                <colgroup>
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '20%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Franchise Name</th>
                    <th>Pricing Model Name</th>
                    <th>Date Modified</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPricingModels.map((model) => {
                    const franchise = franchiseLookup.get(model.franchiseId);
                    const franchiseLabel = getFranchiseLabel(model.franchiseId);
                    const inactive = Boolean(franchise?.deletedAt || franchise?.isActive === false);
                    const modelName = model.name || 'Unnamed model';
                    return (
                      <tr key={`${model.franchiseId}-${model.id}`}>
                        <td>
                          <div className="master-table-primary">{franchiseLabel}</div>
                          {inactive && <div className="master-table-secondary">Inactive</div>}
                        </td>
                        <td>{modelName}</td>
                        <td>{formatDate(model.updatedAt || model.createdAt)}</td>
                        <td>
                          <div className="master-copy-controls">
                            <select
                              value={copyTargets[model.id] || ''}
                              onChange={(e) => handleCopyTargetChange(model.id, e.target.value)}
                            >
                              <option value="">Copy to franchise...</option>
                              {pricingFranchiseOptions.map((franchiseOption) => (
                                <option key={franchiseOption.id} value={franchiseOption.id}>
                                  {franchiseOption.name || franchiseOption.franchiseCode || franchiseOption.id}
                                </option>
                              ))}
                            </select>
                            <button
                              className="master-primary-btn master-small-btn"
                              type="button"
                              onClick={() => handleCopyPricingModel(model)}
                              disabled={copyingId === model.id}
                            >
                              {copyingId === model.id ? 'Copying...' : 'Copy'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="master-card">
          <div className="master-card-header">
            <div>
              <h2>Ledger</h2>
              <p className="master-kicker">Recent Franchise Activity</p>
            </div>
            <button
              className="master-primary-btn master-small-btn"
              type="button"
              onClick={() => void loadLedger()}
              disabled={ledgerLoading}
            >
              {ledgerLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          <div className="master-table-actions">
            <div className="master-filter">
              <label htmlFor="ledger-franchise">Franchise</label>
              <select
                id="ledger-franchise"
                value={ledgerFranchiseFilter}
                onChange={(e) => setLedgerFranchiseFilter(e.target.value)}
              >
                <option value="all">All franchises</option>
                {franchiseOptions.map((franchise) => (
                  <option key={franchise.id} value={franchise.id}>
                    {franchise.name || franchise.franchiseCode || franchise.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="master-table-meta">{ledgerCountLabel}</div>
          </div>
          {ledgerError && <div className="master-error">{ledgerError}</div>}
          {ledgerLoading ? (
            <div className="master-empty">Loading ledger...</div>
          ) : filteredLedgerEvents.length === 0 ? (
            <div className="master-empty">
              {ledgerEvents.length === 0
                ? 'No ledger events recorded yet.'
                : 'No ledger events match the selected franchise.'}
            </div>
          ) : (
            <div className="master-table-wrapper">
              <table className="master-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Franchise Name</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLedgerEvents.map((event) => {
                    const userLabel = getLedgerUserLabel(event);
                    const userEmail = String(event.actorEmail || '').trim();
                    return (
                      <tr
                        key={event.id}
                        className="master-ledger-row"
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedLedgerEvent(event)}
                        onKeyDown={(keyboardEvent) => {
                          if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                            keyboardEvent.preventDefault();
                            setSelectedLedgerEvent(event);
                          }
                        }}
                      >
                        <td>{formatDateTime(event.createdAt)}</td>
                        <td>
                          <div className="master-table-primary">{getLedgerFranchiseLabel(event)}</div>
                        </td>
                        <td>
                          <div className="master-table-primary">{userLabel}</div>
                          {userEmail && userEmail !== userLabel && (
                            <div className="master-table-secondary master-table-secondary--muted">{userEmail}</div>
                          )}
                        </td>
                        <td>{getLedgerRoleLabel(event)}</td>
                        <td>
                          <div className="master-table-primary">{event.action}</div>
                          <div className="master-table-secondary master-table-secondary--muted">View details</div>
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

      {tempPassword && (
        <TempPasswordModal
          tempPassword={tempPassword}
          onClose={() => setTempPassword(null)}
          title="Owner Temporary Password"
          description="Copy this password for the owner. It will only be shown once."
        />
      )}

      {editingFranchise && (
        <MasterFranchiseEditorModal
          franchise={editingFranchise}
          users={usersByFranchise.get(editingFranchise.id) || []}
          updatedBy={session?.userEmail || session?.userName || null}
          onClose={() => setEditingFranchise(null)}
          onRefresh={refreshMasterData}
          onFranchiseUpdated={handleFranchiseUpdated}
        />
      )}

      {selectedLedgerEvent && (
        <div className="master-ledger-backdrop" onClick={() => setSelectedLedgerEvent(null)}>
          <div
            className="master-ledger-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="master-editor-header">
              <div>
                <p className="master-editor-kicker">Ledger Detail</p>
                <h2 className="master-editor-title">{selectedLedgerEvent.action}</h2>
              </div>
              <button
                className="master-editor-close"
                type="button"
                onClick={() => setSelectedLedgerEvent(null)}
                aria-label="Close ledger detail"
              >
                x
              </button>
            </div>
            <div className="master-ledger-meta">
              <div className="master-ledger-meta-row">
                <span>Time</span>
                <strong>{formatDateTime(selectedLedgerEvent.createdAt)}</strong>
              </div>
              <div className="master-ledger-meta-row">
                <span>Franchise</span>
                <strong>{getLedgerFranchiseLabel(selectedLedgerEvent)}</strong>
              </div>
              <div className="master-ledger-meta-row">
                <span>User</span>
                <strong>{getLedgerUserLabel(selectedLedgerEvent)}</strong>
              </div>
              <div className="master-ledger-meta-row">
                <span>Role</span>
                <strong>{getLedgerRoleLabel(selectedLedgerEvent)}</strong>
              </div>
            </div>
            <div className="master-ledger-details">
              <h3>Stored Detail</h3>
              {selectedLedgerEntries.length === 0 ? (
                <div className="master-empty">No additional details recorded.</div>
              ) : (
                <div className="master-ledger-detail-list">
                  {selectedLedgerEntries.map(([key, value]) => (
                    <div className="master-ledger-detail-row" key={key}>
                      <div className="master-ledger-detail-key">{formatDetailLabel(key)}</div>
                      <pre className="master-ledger-detail-value">{formatDetailValue(value)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MasterPage;
