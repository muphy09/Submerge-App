import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Proposal } from '../types/proposal-new';
import ConfirmDialog from './ConfirmDialog';
import { listPricingModels as listPricingModelsRemote } from '../services/pricingModelsAdapter';
import { getContractTemplateIdForProposal } from '../services/contractTemplates';
import { getReviewerVisibleVersions, isApprovedButNotSigned } from '../services/proposalWorkflow';
import { listAllVersions } from '../utils/proposalVersions';
import { getPricingTierName } from '../services/pricingTiers';
import { useAdaptiveTablePagination } from '../hooks/useAdaptiveTablePagination';
import type { LocalProposalLoadIssue } from '../services/proposalsAdapter';
import type { CollaborationEvent, SharedProposal } from '../services/proposalCollaboration';
import './DashboardProposalsPanel.css';
import TablePagination from './TablePagination';
import { useHorizontalWheelScroll } from '../hooks/useHorizontalWheelScroll';
import ProposalSharingIndicator from './ProposalSharingIndicator';
import { getCollaborationNotifications } from '../utils/collaborationNotifications';

export type DashboardPricingDirectory = {
  defaultModelMap: Record<string, string | null>;
  availableModelMap: Record<string, Set<string>>;
};

export async function loadDashboardPricingDirectory(proposals: Proposal[]): Promise<DashboardPricingDirectory> {
  const franchiseIds = Array.from(new Set(proposals.map(getPricingModelSourceFranchiseId)));
  const entries = await Promise.all(franchiseIds.map(async franchiseId => {
    try {
      const rows = await listPricingModelsRemote(franchiseId);
      return { franchiseId, defaultId: rows.find(row => row.isDefault)?.id || null, ids: new Set(rows.map(row => row.id)) };
    } catch (error) {
      console.warn('Unable to load pricing models for franchise', franchiseId, error);
      return { franchiseId, defaultId: null, ids: new Set<string>() };
    }
  }));
  return { defaultModelMap: Object.fromEntries(entries.map(entry => [entry.franchiseId, entry.defaultId])),
    availableModelMap: Object.fromEntries(entries.map(entry => [entry.franchiseId, entry.ids])) };
}

type DashboardProposalsPanelProps = {
  pricingDirectory?: DashboardPricingDirectory;
  proposals: Proposal[];
  sharedProposals?: SharedProposal[];
  sharedOwnedProposalNumbers?: string[];
  sharedOwnedRecipients?: Record<string, string[]>;
  collaborationEnabled?: boolean;
  collaborationUpdates?: CollaborationEvent[];
  loading: boolean;
  onCreateProposal: () => void;
  onDeleteProposal: (proposalNumber: string) => Promise<void> | void;
  onOpenProposal: (proposalNumber: string) => void;
  disableCreateProposal?: boolean;
  createProposalDisabledReason?: string;
  disableDeleteProposal?: boolean;
  viewerRole?: string | null;
  recoveryMode?: boolean;
  recoveryIssues?: LocalProposalLoadIssue[];
};

type SortField =
  | 'customerName'
  | 'lastModified'
  | 'status'
  | 'pricingModel'
  | 'pricingTier'
  | 'proposalVersions'
  | 'contractType';

type SortDirection = 'asc' | 'desc';

type ContextMenuState = {
  proposalNumber: string;
  x: number;
  y: number;
};

function getDisplayText(value: unknown, fallback: string) {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || fallback;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function formatProposalDate(proposal: Proposal) {
  const value = proposal.lastModified || proposal.createdDate;
  if (typeof value !== 'string' && typeof value !== 'number') return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
}

function getRecoveryIssueLabel(issue: LocalProposalLoadIssue) {
  const customerName = getDisplayText(issue.customerName, '');
  const proposalNumber = getDisplayText(issue.proposalNumber, '');
  if (customerName && proposalNumber) return `${customerName} — ${proposalNumber}`;
  if (proposalNumber) return proposalNumber;
  if (customerName) return customerName;
  return getDisplayText(issue.fileName, 'Unknown local proposal');
}

function getRecoveryIssueDescription(issue: LocalProposalLoadIssue) {
  if (issue.reason === 'local_only') return 'Local-only proposal';
  if (issue.reason === 'newer_local_changes') return 'Newer local changes';
  return 'Unreadable local copy';
}

function getContractTypeLabel(proposal: Proposal): string {
  try {
    const templateId = getContractTemplateIdForProposal(proposal);
    if (!templateId || !templateId.includes('-')) return 'Unknown';
    const [state, poolType] = templateId.split('-');
    const typeLabel = poolType === 'fiberglass' ? 'Fiberglass' : 'Shotcrete';
    return `${String(state || '').toUpperCase()} ${typeLabel}`;
  } catch (error) {
    console.warn('Unable to determine a proposal contract type.', error);
    return 'Unknown';
  }
}

function isReviewerRole(role?: string | null) {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized === 'owner' || normalized === 'admin' || normalized === 'bookkeeper';
}

function getVersionCount(proposal: Proposal, viewerRole?: string | null) {
  try {
    if (isReviewerRole(viewerRole)) {
      return Math.max(getReviewerVisibleVersions(proposal).length, 1);
    }
    return listAllVersions(proposal).length;
  } catch (error) {
    console.warn('Unable to count proposal versions.', error);
    return 1;
  }
}

function requiresPricingUserReview(proposal: Proposal) {
  const status = String(proposal.status || '').toLowerCase();
  return (
    proposal.pricingRevisionReview?.decision === 'pending' &&
    status !== 'draft' &&
    status !== 'signed' &&
    status !== 'completed'
  );
}

function getDashboardStatus(proposal: Proposal) {
  return requiresPricingUserReview(proposal)
    ? 'user_review'
    : String(proposal.status || 'draft').toLowerCase();
}

function getSortValue(proposal: Proposal, field: SortField, viewerRole?: string | null) {
  switch (field) {
    case 'customerName':
      return getDisplayText(proposal.customerInfo?.customerName, '').toLowerCase();
    case 'lastModified':
      return new Date(proposal.lastModified || proposal.createdDate || 0).getTime();
    case 'status':
      return getDashboardStatus(proposal);
    case 'pricingModel':
      return String(proposal.pricingModelName || '').toLowerCase();
    case 'pricingTier':
      return getPricingTierName(proposal.pricingTierId || proposal.pricingTierName).toLowerCase();
    case 'proposalVersions':
      return getVersionCount(proposal, viewerRole);
    case 'contractType':
      return getContractTypeLabel(proposal).toLowerCase();
    default:
      return '';
  }
}

function getStatusBadgeClass(status: string) {
  switch (String(status || '').toLowerCase()) {
    case 'submitted':
      return 'dashboard-status-pill is-submitted';
    case 'needs_approval':
      return 'dashboard-status-pill is-needs-approval';
    case 'changes_requested':
      return 'dashboard-status-pill is-changes-requested';
    case 'completed':
      return 'dashboard-status-pill is-completed';
    case 'approved':
      return 'dashboard-status-pill is-approved';
    case 'signed':
      return 'dashboard-status-pill is-signed';
    case 'rejected':
      return 'dashboard-status-pill is-rejected';
    case 'modified':
      return 'dashboard-status-pill is-modified';
    case 'user_review':
      return 'dashboard-status-pill is-user-review';
    case 'sent':
      return 'dashboard-status-pill is-sent';
    case 'draft':
    default:
      return 'dashboard-status-pill is-draft';
  }
}

function formatStatusLabel(status?: string | null) {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'Draft';
  if (normalized === 'changes_requested') return 'Returned';
  if (normalized === 'user_review') return 'User Review*';
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function getPricingModelSourceFranchiseId(proposal: Proposal) {
  return proposal.pricingModelFranchiseId || proposal.franchiseId || 'default';
}

function getPricingModelClass(
  proposal: Proposal,
  defaultModelMap: Record<string, string | null>,
  availableModelMap: Record<string, Set<string>>
) {
  const franchiseId = getPricingModelSourceFranchiseId(proposal);
  const directoryLoaded =
    Object.prototype.hasOwnProperty.call(defaultModelMap, franchiseId) &&
    Object.prototype.hasOwnProperty.call(availableModelMap, franchiseId);

  if (!directoryLoaded) return 'dashboard-model-pill is-loading';

  const modelId = proposal.pricingModelId || '';
  const defaultId = defaultModelMap[franchiseId];
  const availableSet = availableModelMap[franchiseId];
  const explicitRemoved = String(proposal.pricingModelName || '').toLowerCase().includes('(removed)');
  const isRemoved = Boolean(modelId) && (!availableSet.has(modelId) || explicitRemoved);
  const isActive =
    Boolean(modelId) &&
    Boolean(defaultId) &&
    modelId === defaultId &&
    availableSet.has(modelId) &&
    !explicitRemoved;

  if (isActive) return 'dashboard-model-pill is-active';
  if (isRemoved) return 'dashboard-model-pill is-removed';
  return 'dashboard-model-pill is-inactive';
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  return (
    <span className={`dashboard-sort-indicator${active ? ' is-active' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 12 12" focusable="false">
        <path
          d="M3 4.5 6 1.5l3 3"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.3"
          opacity={active && direction === 'asc' ? 1 : 0.38}
        />
        <path
          d="M3 7.5 6 10.5l3-3"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.3"
          opacity={active && direction === 'desc' ? 1 : 0.38}
        />
      </svg>
    </span>
  );
}

function DashboardProposalsPanel({
  proposals,
  sharedProposals = [],
  sharedOwnedProposalNumbers = [],
  sharedOwnedRecipients = {},
  collaborationEnabled = false,
  collaborationUpdates = [],
  pricingDirectory,
  loading,
  onCreateProposal,
  onDeleteProposal,
  onOpenProposal,
  disableCreateProposal = false,
  createProposalDisabledReason,
  disableDeleteProposal = false,
  viewerRole,
  recoveryMode = false,
  recoveryIssues = [],
}: DashboardProposalsPanelProps) {
  const [activeTab, setActiveTab] = useState<'mine' | 'shared'>('mine');
  const [sortField, setSortField] = useState<SortField>('lastModified');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [sharedSearchTerm, setSharedSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pricingModelFilter, setPricingModelFilter] = useState('all');
  const [contractTypeFilter, setContractTypeFilter] = useState('all');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [proposalToDelete, setProposalToDelete] = useState<string | null>(null);
  const [deletingProposalNumber, setDeletingProposalNumber] = useState<string | null>(null);
  const [loadedPricingDirectory, setLoadedPricingDirectory] = useState<DashboardPricingDirectory>({ defaultModelMap: {}, availableModelMap: {} });
  const { defaultModelMap, availableModelMap } = pricingDirectory || loadedPricingDirectory;
  useEffect(() => {
    if (pricingDirectory) return;
    let cancelled = false;
    void loadDashboardPricingDirectory(proposals).then(directory => { if (!cancelled) setLoadedPricingDirectory(directory); });
    return () => { cancelled = true; };
  }, [proposals, pricingDirectory]);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);

    return () => {
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [contextMenu]);

  const statusOptions = Array.from(
    new Set(proposals.map((proposal) => getDashboardStatus(proposal)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const pricingModelOptions = Array.from(
    new Set(proposals.map((proposal) => String(proposal.pricingModelName || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const contractTypeOptions = Array.from(
    new Set(proposals.map((proposal) => getContractTypeLabel(proposal)))
  ).sort((a, b) => a.localeCompare(b));

  const filteredProposals = proposals
    .filter((proposal) => {
      const searchValue = searchTerm.trim().toLowerCase();
      const customerName = String(proposal.customerInfo?.customerName || '').toLowerCase();
      const contractTypeLabel = getContractTypeLabel(proposal);

      const matchesSearch = !searchValue || customerName.includes(searchValue);
      const matchesStatus = statusFilter === 'all' || getDashboardStatus(proposal) === statusFilter;
      const matchesPricingModel =
        pricingModelFilter === 'all' || (proposal.pricingModelName || '') === pricingModelFilter;
      const matchesContractType = contractTypeFilter === 'all' || contractTypeLabel === contractTypeFilter;

      return matchesSearch && matchesStatus && matchesPricingModel && matchesContractType;
    })
    .sort((a, b) => {
      const aValue = getSortValue(a, sortField, viewerRole);
      const bValue = getSortValue(b, sortField, viewerRole);

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  const sharedOwnedNumbers = new Set(sharedOwnedProposalNumbers);
  const { newShares: unreadSharedNumbers, reviews: reviewNumbers } = getCollaborationNotifications(collaborationUpdates);
  const attentionDot = (label: string) => <span className="dashboard-attention-dot" role="img" aria-label={label} />;
  const filteredSharedProposals = sharedProposals.filter(({ proposal, ownerName }) => {
    const value = sharedSearchTerm.trim().toLowerCase();
    return !value || `${proposal.customerInfo?.customerName || ''} ${ownerName}`.toLowerCase().includes(value);
  });

  const dashboardPaginationResetKey = [
    searchTerm,
    statusFilter,
    pricingModelFilter,
    contractTypeFilter,
    sortField,
    sortDirection,
    activeTab,
  ].join('|');
  const {
    viewportRef: proposalTableViewportRef,
    currentPage: proposalPage,
    pageSize: proposalPageSize,
    totalPages: proposalTotalPages,
    startIndex: proposalStartIndex,
    endIndex: proposalEndIndex,
    goToPage: goToProposalPage,
  } = useAdaptiveTablePagination({
    itemCount: filteredProposals.length,
    maxPageSize: Math.max(filteredProposals.length, 1),
    estimatedRowHeight: 54,
    estimatedHeaderHeight: 44,
    resetKey: dashboardPaginationResetKey,
    fitToWindow: true,
    windowBottomOffset: 80,
  });
  useHorizontalWheelScroll(
    proposalTableViewportRef,
    !loading && filteredProposals.length > 0
  );
  const paginatedProposals = filteredProposals.slice(
    proposalStartIndex,
    proposalStartIndex + proposalPageSize
  );
  const {
    viewportRef: sharedTableViewportRef,
    currentPage: sharedPage,
    totalPages: sharedTotalPages,
    startIndex: sharedStartIndex,
    endIndex: sharedEndIndex,
    pageSize: sharedPageSize,
    goToPage: goToSharedPage,
  } = useAdaptiveTablePagination({
    itemCount: filteredSharedProposals.length,
    maxPageSize: Math.max(filteredSharedProposals.length, 1),
    estimatedRowHeight: 54,
    estimatedHeaderHeight: 44,
    resetKey: `${sharedSearchTerm}|${activeTab}`,
    fitToWindow: true,
    windowBottomOffset: 80,
  });
  useHorizontalWheelScroll(sharedTableViewportRef, activeTab === 'shared' && filteredSharedProposals.length > 0);

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    statusFilter !== 'all' ||
    pricingModelFilter !== 'all' ||
    contractTypeFilter !== 'all';

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortField(field);
    setSortDirection(field === 'lastModified' ? 'desc' : 'asc');
  };

  const handleOpenContextMenu = (event: ReactMouseEvent<HTMLTableRowElement>, proposalNumber: string) => {
    event.preventDefault();
    if (disableDeleteProposal) return;
    setContextMenu({
      proposalNumber,
      x: Math.min(event.clientX, Math.max(window.innerWidth - 188, 24)),
      y: Math.min(event.clientY, Math.max(window.innerHeight - 92, 24)),
    });
  };

  const handleDeleteRequest = () => {
    if (disableDeleteProposal) return;
    if (!contextMenu?.proposalNumber) return;
    setProposalToDelete(contextMenu.proposalNumber);
    setContextMenu(null);
  };

  const handleConfirmDelete = async () => {
    if (disableDeleteProposal) return;
    if (!proposalToDelete) return;

    try {
      setDeletingProposalNumber(proposalToDelete);
      await onDeleteProposal(proposalToDelete);
      setProposalToDelete(null);
    } finally {
      setDeletingProposalNumber(null);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPricingModelFilter('all');
    setContractTypeFilter('all');
  };

  return (
    <section className="dashboard-proposals-panel">
      <div className="dashboard-proposals-header">
        <div className="dashboard-proposals-header-copy">
          <p className="dashboard-proposals-kicker">Dashboard Workspace</p>
          <div className="dashboard-proposals-title-row">
            <h2>{activeTab === 'shared' ? 'Shared with Me' : 'My Proposals'}</h2>
          </div>
        </div>
        <div className="dashboard-proposals-header-actions">
          <button
            type="button"
            className="dashboard-proposals-header-btn dashboard-proposals-header-btn-primary"
            onClick={onCreateProposal}
            disabled={disableCreateProposal}
            title={disableCreateProposal ? createProposalDisabledReason : undefined}
          >
            Create New Proposal
          </button>
        </div>
      </div>

      {collaborationEnabled && <>
        <div className="dashboard-collaboration-tabs" role="tablist" aria-label="Proposal ownership">
          <button type="button" role="tab" aria-selected={activeTab === 'mine'} onClick={() => setActiveTab('mine')}>My Proposals ({proposals.length}){proposals.some(proposal => reviewNumbers.has(proposal.proposalNumber)) && attentionDot("Changes awaiting review")}</button>
          <button type="button" role="tab" aria-selected={activeTab === 'shared'} onClick={() => setActiveTab('shared')}>Shared with Me ({sharedProposals.length}){activeTab !== 'shared' && sharedProposals.some(({ proposal }) => unreadSharedNumbers.has(proposal.proposalNumber)) && attentionDot("New shared proposals")}</button>
        </div>
      </>}

      {(recoveryMode || recoveryIssues.length > 0) && (
        <aside className="dashboard-recovery-notice" role="alert" aria-live="polite">
          <div>
            <strong>
              {recoveryIssues.length > 0
                ? `${recoveryIssues.length} local proposal ${recoveryIssues.length === 1 ? 'copy needs' : 'copies need'} attention`
                : 'Recovery mode is active'}
            </strong>
            <p>
              {recoveryIssues.length > 0
                ? 'The local copies listed below are temporarily unavailable. Cloud copies are still shown when available. Send these identifiers to an administrator for repair.'
                : 'The dashboard is using cloud data. No specific proposal was found to be unavailable.'}
            </p>
          </div>
          {recoveryIssues.length > 0 && (
            <ul>
              {recoveryIssues.map((issue, index) => (
                <li key={`${issue.reason}:${issue.proposalNumber || issue.fileName || index}`}>
                  <code>{getRecoveryIssueLabel(issue)}</code>
                  <span>{getRecoveryIssueDescription(issue)}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}

      {collaborationEnabled && <div className="dashboard-shared-table-shell" hidden={activeTab !== 'shared'} role="tabpanel">
        <div className="dashboard-proposals-toolbar dashboard-shared-toolbar">
          <label className="dashboard-filter-field dashboard-filter-search"><span>Search shared proposals</span>
            <input value={sharedSearchTerm} onChange={(event) => setSharedSearchTerm(event.target.value)} placeholder="Customer or owner name" />
          </label>
        </div>
        <div className="dashboard-proposals-table-shell">
        {sharedProposals.length === 0 ? <div className="dashboard-proposals-state"><h3>No shared proposals</h3><p>Proposals shared with you will appear here.</p></div>
          : filteredSharedProposals.length === 0 ? <div className="dashboard-proposals-state"><h3>No matches</h3><p>Try a different customer or owner name.</p></div> :
          <><div ref={sharedTableViewportRef} className="dashboard-proposals-table-scroll"><table className="dashboard-proposals-table dashboard-shared-table"><thead><tr>
            <th>Customer Name</th><th>Owner</th><th>Your Permission</th><th>Proposal Status</th><th>Change Request</th><th>Date Modified</th>
          </tr></thead><tbody>{filteredSharedProposals.slice(sharedStartIndex, sharedStartIndex + sharedPageSize).map(({ proposal, share, ownerName, requestStatus }) => <tr key={share.id}
            className="dashboard-proposals-row" tabIndex={0} aria-label={`Open shared proposal ${proposal.customerInfo?.customerName || proposal.proposalNumber}`}
            onClick={() => onOpenProposal(proposal.proposalNumber)} onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenProposal(proposal.proposalNumber); }
            }}>
            <td><div className="dashboard-customer-cell"><span className="dashboard-customer-primary has-share"><span className="dashboard-customer-name">
              {getDisplayText(proposal.customerInfo?.customerName, 'Untitled Proposal')}
            </span>{unreadSharedNumbers.has(proposal.proposalNumber) && attentionDot("New shared proposal")}</span></div></td>
            <td>{ownerName}</td>
            <td>{share.permission === 'contribute' ? 'Can propose changes' : 'Can view'}</td>
            <td><span className={getStatusBadgeClass(getDashboardStatus(proposal))}>{formatStatusLabel(getDashboardStatus(proposal))}</span></td>
            <td>{requestStatus ? <span className="dashboard-shared-request-pill">{formatStatusLabel(requestStatus)}</span> : 'No request'}</td>
            <td>{formatProposalDate(proposal)}</td>
          </tr>)}</tbody></table></div><TablePagination currentPage={sharedPage} totalPages={sharedTotalPages}
            totalItems={filteredSharedProposals.length} startIndex={sharedStartIndex} endIndex={sharedEndIndex}
            onPageChange={goToSharedPage} /></>}
        </div>
      </div>}

      <div className="dashboard-proposals-body" hidden={collaborationEnabled && activeTab !== 'mine'}>
          <div className="dashboard-proposals-toolbar">
            <label className="dashboard-filter-field dashboard-filter-search">
              <span>Search</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Customer Name"
              />
            </label>

            <label className="dashboard-filter-field">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All Statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {formatStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="dashboard-filter-field">
              <span>Pricing Model</span>
              <select value={pricingModelFilter} onChange={(event) => setPricingModelFilter(event.target.value)}>
                <option value="all">All Models</option>
                {pricingModelOptions.map((modelName) => (
                  <option key={modelName} value={modelName}>
                    {modelName}
                  </option>
                ))}
              </select>
            </label>

            <label className="dashboard-filter-field">
              <span>Contract Type</span>
              <select value={contractTypeFilter} onChange={(event) => setContractTypeFilter(event.target.value)}>
                <option value="all">All Contracts</option>
                {contractTypeOptions.map((contractType) => (
                  <option key={contractType} value={contractType}>
                    {contractType}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="dashboard-clear-filters-btn"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
            >
              Clear Filters
            </button>
          </div>

          <div className="dashboard-proposals-table-shell">
            {loading ? (
              <div className="dashboard-proposals-state">
                <h3>Loading proposals</h3>
                <p>Pulling the latest proposal data into the dashboard.</p>
              </div>
            ) : proposals.length === 0 ? (
              <div className="dashboard-proposals-state">
                <h3>No proposals yet</h3>
                <p>Use Create New Proposal above to start building out this workspace.</p>
              </div>
            ) : filteredProposals.length === 0 ? (
              <div className="dashboard-proposals-state">
                <h3>No matches</h3>
                <p>Adjust or clear the filters to bring proposals back into view.</p>
                <button
                  type="button"
                  className="dashboard-empty-action dashboard-empty-action-secondary"
                  onClick={clearFilters}
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <>
                <div
                  ref={proposalTableViewportRef}
                  className="dashboard-proposals-table-scroll"
                >
                  <table className="dashboard-proposals-table">
                  <thead>
                    <tr>
                      <th>
                        <button type="button" onClick={() => handleSort('customerName')}>
                          <span>Customer Name</span>
                          <SortIndicator active={sortField === 'customerName'} direction={sortDirection} />
                        </button>
                      </th>
                      <th>
                        <button type="button" onClick={() => handleSort('lastModified')}>
                          <span>Date Modified</span>
                          <SortIndicator active={sortField === 'lastModified'} direction={sortDirection} />
                        </button>
                      </th>
                      <th>
                        <button type="button" onClick={() => handleSort('status')}>
                          <span>Proposal Status</span>
                          <SortIndicator active={sortField === 'status'} direction={sortDirection} />
                        </button>
                      </th>
                      <th>
                        <button type="button" onClick={() => handleSort('pricingModel')}>
                          <span>Pricing Model</span>
                          <SortIndicator active={sortField === 'pricingModel'} direction={sortDirection} />
                        </button>
                      </th>
                      <th>
                        <button type="button" onClick={() => handleSort('pricingTier')}>
                          <span>Pricing Tier</span>
                          <SortIndicator active={sortField === 'pricingTier'} direction={sortDirection} />
                        </button>
                      </th>
                      <th className="is-center">
                        <button type="button" onClick={() => handleSort('proposalVersions')}>
                          <span>Proposal Versions</span>
                          <SortIndicator active={sortField === 'proposalVersions'} direction={sortDirection} />
                        </button>
                      </th>
                      <th>
                        <button type="button" onClick={() => handleSort('contractType')}>
                          <span>Contract Type</span>
                          <SortIndicator active={sortField === 'contractType'} direction={sortDirection} />
                        </button>
                      </th>
                    </tr>
                  </thead>
                    <tbody>
                    {paginatedProposals.map((proposal) => {
                      const showApprovalMarker = isApprovedButNotSigned(proposal);
                      const dashboardStatus = getDashboardStatus(proposal);
                      const contractTypeLabel = getContractTypeLabel(proposal);
                      const versionCount = getVersionCount(proposal, viewerRole);
                      const pricingModelClass = getPricingModelClass(
                        proposal,
                        defaultModelMap,
                        availableModelMap
                      );
                      const pricingModelName = getDisplayText(proposal.pricingModelName, 'Pricing Model');
                      const explicitRemoved = String(proposal.pricingModelName || '').toLowerCase().includes('(removed)');
                      const shouldAppendRemoved =
                        pricingModelClass.includes('is-removed') && !explicitRemoved;

                      return (
                        <tr
                          key={proposal.proposalNumber}
                          className="dashboard-proposals-row"
                          tabIndex={0}
                          aria-label={`Open ${getDisplayText(proposal.customerInfo?.customerName, 'Untitled Proposal')}`}
                          onClick={() => onOpenProposal(proposal.proposalNumber)}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            onOpenProposal(proposal.proposalNumber);
                          }}
                          onContextMenu={(event) => handleOpenContextMenu(event, proposal.proposalNumber)}
                        >
                          <td>
                            <div className="dashboard-customer-cell">
                              <span className={`dashboard-customer-primary${sharedOwnedNumbers.has(proposal.proposalNumber) ? ' has-share' : ''}`}><span className="dashboard-customer-name">
                                  {getDisplayText(proposal.customerInfo?.customerName, 'Untitled Proposal')}
                                </span>
                                {reviewNumbers.has(proposal.proposalNumber) && attentionDot("Changes awaiting review")}
                                {sharedOwnedNumbers.has(proposal.proposalNumber) && <ProposalSharingIndicator
                                  tooltip={`Shared with ${sharedOwnedRecipients[proposal.proposalNumber]?.join(', ') || 'collaborators'}`} />}
                              </span>
                              {proposal.syncStatus === 'pending' && (
                                <span className="dashboard-sync-note">Local changes pending sync</span>
                              )}
                            </div>
                          </td>
                          <td className="dashboard-date-cell">
                            {formatProposalDate(proposal)}
                          </td>
                          <td>
                            <span
                              className={getStatusBadgeClass(dashboardStatus)}
                              data-tooltip={
                                dashboardStatus === 'user_review'
                                  ? 'Pricing Model has been modified. User review needed'
                                  : showApprovalMarker
                                    ? 'Proposal Approved but not Signed'
                                    : undefined
                              }
                            >
                              {formatStatusLabel(dashboardStatus)}
                              {showApprovalMarker && dashboardStatus !== 'user_review' ? '*' : ''}
                            </span>
                          </td>
                          <td>
                            <span
                              className={pricingModelClass}
                              aria-busy={pricingModelClass.includes('is-loading') ? 'true' : undefined}
                            >
                              {pricingModelName}
                              {shouldAppendRemoved ? ' (Removed)' : ''}
                            </span>
                          </td>
                          <td>
                            <span className="dashboard-tier-pill">
                              {getPricingTierName(proposal.pricingTierId || proposal.pricingTierName)}
                            </span>
                          </td>
                          <td className="dashboard-number-cell">{versionCount}</td>
                          <td className="dashboard-contract-cell">{contractTypeLabel}</td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  currentPage={proposalPage}
                  totalPages={proposalTotalPages}
                  totalItems={filteredProposals.length}
                  startIndex={proposalStartIndex}
                  endIndex={proposalEndIndex}
                  onPageChange={goToProposalPage}
                />
              </>
            )}
          </div>
        </div>

      {contextMenu && (
        <>
          <div className="dashboard-context-menu-backdrop" onClick={() => setContextMenu(null)} />
          <div
            className="dashboard-context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button type="button" className="dashboard-context-menu-item delete" onClick={handleDeleteRequest}>
              Delete Proposal
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(proposalToDelete)}
        title="Delete proposal?"
        message="This proposal will be removed permanently."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isLoading={Boolean(deletingProposalNumber)}
        onConfirm={() => {
          void handleConfirmDelete();
        }}
        onCancel={() => {
          if (deletingProposalNumber) return;
          setProposalToDelete(null);
        }}
      />
    </section>
  );
}

export default DashboardProposalsPanel;
