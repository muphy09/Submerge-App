import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { TooltipAnchor } from '../components/AppTooltip';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useFranchiseSignedWorkflowDisabled } from '../hooks/useFranchiseSignedWorkflowDisabled';
import type { CostLineItem, Proposal, ProposalWorkflowEvent } from '../types/proposal-new';
import {
  DISABLED_SIGNED_WORKFLOW_MESSAGE,
  loadFranchiseSignedWorkflowDisabled,
} from '../services/franchiseBranding';
import {
  addWorkflowNote,
  approveWorkflowProposal,
  buildProposalSelectionCategories,
  buildSignedAddendumDiffSummaries,
  buildVersionDiffSummary,
  completeWorkflowProposal,
  countUnreadWorkflowEvents,
  ensureProposalWorkflow,
  getApprovedVersion,
  getApprovedVersionId,
  getPendingReviewVersion,
  getPendingReviewVersionId,
  getReviewVersionId,
  getSignedVersion,
  getWorkflowStatus,
  hasUnreadWorkflowEvents,
  markProposalAsSigned,
  markWorkflowRead,
  requestWorkflowChanges,
  willSigningRemoveNonActiveVersions,
} from '../services/proposalWorkflow';
import { listFranchiseUsers, type FranchiseUser } from '../services/franchiseUsersAdapter';
import { getProposal, listProposals, saveProposal } from '../services/proposalsAdapter';
import { normalizeCostBreakdownForDisplay } from '../utils/costBreakdownDisplay';
import {
  CUSTOM_OPTIONS_SUBCATEGORY,
  getLineItemSubcategory,
  isCustomOptionItem,
} from '../utils/costBreakdownSubcategories';
import { isOffContractLineItem } from '../utils/offContractLineItems';
import type { UserSession } from '../services/session';
import './WorkflowPage.css';

type WorkflowPageProps = {
  session?: UserSession | null;
};

type QueueFilter = 'needs_approval' | 'approved' | 'signed' | 'archive';
type WorkflowLocationState = {
  selectedFilter?: QueueFilter;
  selectedUserId?: string | null;
};

type WorkflowDetailTab = 'overview' | 'cogs' | 'proposal_selections' | 'notes';
type WorkflowNoteComposerMode = 'note' | 'request_changes';

type WorkflowCogsRow = {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  total: number;
  totalLabel: string;
  subcategory?: string | null;
};

type WorkflowCogsCategory = {
  key: string;
  label: string;
  itemCount: number;
  total: number;
  rows: WorkflowCogsRow[];
};

const normalizeIdentity = (value?: string | null) => String(value || '').trim().toLowerCase();

const normalizeStatusLabel = (value?: string | null) =>
  (() => {
    const normalized = String(value || 'draft').trim().toLowerCase();
    if (normalized === 'changes_requested') return 'Returned';
    return normalized.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  })();

const matchesQueueFilter = (proposal: Proposal, filter: QueueFilter) => {
  const status = getWorkflowStatus(proposal);
  if (filter === 'needs_approval') return status === 'needs_approval';
  if (filter === 'signed') return status === 'signed';
  if (filter === 'archive') return status === 'completed';
  return status === 'approved' || status === 'submitted';
};

const getQueueFilterForProposal = (proposal: Proposal): QueueFilter => {
  if (matchesQueueFilter(proposal, 'needs_approval')) return 'needs_approval';
  if (matchesQueueFilter(proposal, 'signed')) return 'signed';
  if (matchesQueueFilter(proposal, 'archive')) return 'archive';
  return 'approved';
};

const proposalBelongsToUser = (proposal: Proposal, user?: FranchiseUser | null) => {
  if (!user) return true;
  const proposalDesigner = normalizeIdentity(proposal.designerName);
  if (!proposalDesigner) return false;
  const candidates = [normalizeIdentity(user.name), normalizeIdentity(user.email)].filter(Boolean);
  return candidates.some((candidate) => candidate === proposalDesigner);
};

const getUserFilterLabel = (user: FranchiseUser) => {
  const name = String(user.name || '').trim();
  return name ? `${name} (${user.email})` : user.email;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const formatSignedCurrency = (value: number) => {
  const absolute = formatCurrency(Math.abs(value));
  if (!Number.isFinite(value) || value === 0) return absolute;
  return value > 0 ? `+${absolute}` : `-${absolute}`;
};

const formatSignedPercent = (value: number) => {
  if (!Number.isFinite(value) || value === 0) return '0.00%';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
};

const formatPercent = (value: number) => `${(Number.isFinite(value) ? value : 0).toFixed(2)}%`;

const formatQuantity = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';

const getQueueLabel = (filter: QueueFilter) => {
  if (filter === 'needs_approval') return 'Needs Approval';
  if (filter === 'approved') return 'Approved';
  if (filter === 'signed') return 'Signed';
  return 'Archived';
};

const getWorkflowEventActorLabel = (entry?: ProposalWorkflowEvent | null) =>
  entry?.actor?.name || entry?.actor?.email || 'User';

const isSelectionValueSet = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.length > 0 && normalized !== 'none';
};

const getSelectionDisplayValue = (value?: string | null) =>
  isSelectionValueSet(value) ? value : 'Not set';

const splitCustomOptionItems = (items: CostLineItem[] = []) => ({
  baseItems: items.filter((item) => !isCustomOptionItem(item)),
  customOptions: items.filter(isCustomOptionItem),
});

const toWorkflowCogsRow = (
  item: CostLineItem,
  index: number,
  explicitSubcategory?: string | null
): WorkflowCogsRow => {
  const numericQuantity = Number(item.quantity);
  const numericUnitPrice = Number(item.unitPrice);
  const numericTotal = Number(item.total);
  const isOffContract = isOffContractLineItem(item);
  return {
    id: `${explicitSubcategory || getLineItemSubcategory(item) || 'base'}-${index}-${item.description || item.category || 'line'}`,
    label: item.description || item.category || 'Line Item',
    quantity: Number.isFinite(numericQuantity) ? numericQuantity : 0,
    unitPrice: Number.isFinite(numericUnitPrice) ? numericUnitPrice : 0,
    total: isOffContract ? 0 : Number.isFinite(numericTotal) ? numericTotal : 0,
    totalLabel: isOffContract ? 'Off Contract' : formatCurrency(Number.isFinite(numericTotal) ? numericTotal : 0),
    subcategory: explicitSubcategory || getLineItemSubcategory(item),
  };
};

const buildWorkflowCogsRows = (items: CostLineItem[] = [], explicitSubcategory?: string | null) =>
  items.map((item, index) => toWorkflowCogsRow(item, index, explicitSubcategory));

const buildWorkflowCogsCategory = (
  key: string,
  label: string,
  rows: WorkflowCogsRow[]
): WorkflowCogsCategory | null => {
  if (rows.length === 0) return null;
  return {
    key,
    label,
    itemCount: rows.length,
    total: rows.reduce((sum, row) => sum + row.total, 0),
    rows,
  };
};

const buildWorkflowCogsCategories = (proposal?: Partial<Proposal> | null): WorkflowCogsCategory[] => {
  if (!proposal?.costBreakdown) return [];
  const costBreakdown = normalizeCostBreakdownForDisplay(proposal.costBreakdown);
  const tileLaborItems = costBreakdown.tileLabor || [];
  const tileMaterialItems = costBreakdown.tileMaterial || [];
  const { baseItems: tileLaborBase, customOptions: tileCustomFromLabor } = splitCustomOptionItems(tileLaborItems);
  const { baseItems: tileMaterialBase, customOptions: tileCustomFromMaterial } = splitCustomOptionItems(tileMaterialItems);
  const tileCustomOptions = [...tileCustomFromLabor, ...tileCustomFromMaterial];

  return [
    buildWorkflowCogsCategory('plansAndEngineering', 'Plans & Engineering', buildWorkflowCogsRows(costBreakdown.plansAndEngineering || [])),
    buildWorkflowCogsCategory('layout', 'Layout', buildWorkflowCogsRows(costBreakdown.layout || [])),
    buildWorkflowCogsCategory('permit', 'Permit', buildWorkflowCogsRows(costBreakdown.permit || [])),
    buildWorkflowCogsCategory('excavation', 'Excavation', buildWorkflowCogsRows(costBreakdown.excavation || [])),
    buildWorkflowCogsCategory('plumbing', 'Plumbing', buildWorkflowCogsRows(costBreakdown.plumbing || [])),
    buildWorkflowCogsCategory('gas', 'Gas', buildWorkflowCogsRows(costBreakdown.gas || [])),
    buildWorkflowCogsCategory('steel', 'Steel', buildWorkflowCogsRows(costBreakdown.steel || [])),
    buildWorkflowCogsCategory('electrical', 'Electrical', buildWorkflowCogsRows(costBreakdown.electrical || [])),
    buildWorkflowCogsCategory('shotcrete', 'Shotcrete', [
      ...buildWorkflowCogsRows(costBreakdown.shotcreteLabor || [], 'Labor'),
      ...buildWorkflowCogsRows(costBreakdown.shotcreteMaterial || [], 'Material'),
    ]),
    buildWorkflowCogsCategory('tile', 'Tile', [
      ...buildWorkflowCogsRows(tileLaborBase, 'Labor'),
      ...buildWorkflowCogsRows(tileCustomOptions, CUSTOM_OPTIONS_SUBCATEGORY),
      ...buildWorkflowCogsRows(tileMaterialBase, 'Material'),
    ]),
    buildWorkflowCogsCategory('copingDecking', 'Coping / Decking', [
      ...buildWorkflowCogsRows(costBreakdown.copingDeckingLabor || [], 'Labor'),
      ...buildWorkflowCogsRows(costBreakdown.copingDeckingMaterial || [], 'Material'),
    ]),
    buildWorkflowCogsCategory('stoneRockwork', 'Stone / Rockwork', [
      ...buildWorkflowCogsRows(costBreakdown.stoneRockworkLabor || [], 'Labor'),
      ...buildWorkflowCogsRows(costBreakdown.stoneRockworkMaterial || [], 'Material'),
    ]),
    buildWorkflowCogsCategory('drainage', 'Drainage', buildWorkflowCogsRows(costBreakdown.drainage || [])),
    buildWorkflowCogsCategory('waterFeatures', 'Water Features', buildWorkflowCogsRows(costBreakdown.waterFeatures || [])),
    buildWorkflowCogsCategory('equipmentOrdered', 'Equipment Ordered', buildWorkflowCogsRows(costBreakdown.equipmentOrdered || [])),
    buildWorkflowCogsCategory('equipmentSet', 'Equipment Set', buildWorkflowCogsRows(costBreakdown.equipmentSet || [])),
    buildWorkflowCogsCategory('cleanup', 'Cleanup', buildWorkflowCogsRows(costBreakdown.cleanup || [])),
    buildWorkflowCogsCategory('interiorFinish', 'Interior Finish', buildWorkflowCogsRows(costBreakdown.interiorFinish || [])),
    buildWorkflowCogsCategory('waterTruck', 'Water Truck', buildWorkflowCogsRows(costBreakdown.waterTruck || [])),
    buildWorkflowCogsCategory('fiberglassShell', 'Fiberglass Shell', buildWorkflowCogsRows(costBreakdown.fiberglassShell || [])),
    buildWorkflowCogsCategory('fiberglassInstall', 'Fiberglass Install', buildWorkflowCogsRows(costBreakdown.fiberglassInstall || [])),
    buildWorkflowCogsCategory('startupOrientation', 'Startup / Orientation', buildWorkflowCogsRows(costBreakdown.startupOrientation || [])),
    buildWorkflowCogsCategory('customFeatures', 'Custom Features', buildWorkflowCogsRows(costBreakdown.customFeatures || [])),
  ].filter((category): category is WorkflowCogsCategory => Boolean(category));
};

const getNonPapDiscountTotal = (proposal?: Partial<Proposal> | null) => {
  const retailAdjustments = Array.isArray(proposal?.retailAdjustments) ? proposal.retailAdjustments : [];
  const retailDiscountTotal = retailAdjustments.reduce((sum, adjustment) => {
    const amount = Number(adjustment?.amount);
    return Number.isFinite(amount) && amount < 0 ? sum + Math.abs(amount) : sum;
  }, 0);
  const manualAdjustments = proposal?.manualAdjustments || ({} as Proposal['manualAdjustments']);
  const negative1 = Number((manualAdjustments as any).negative1);
  const negative2 = Number((manualAdjustments as any).negative2);
  const manualDiscountTotal =
    Math.abs(Math.min(0, Number.isFinite(negative1) ? negative1 : 0)) +
    Math.abs(Math.min(0, Number.isFinite(negative2) ? negative2 : 0));
  return retailDiscountTotal + manualDiscountTotal;
};

function WorkflowPage({ session }: WorkflowPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { proposalNumber } = useParams();
  const { showToast } = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [franchiseUsers, setFranchiseUsers] = useState<FranchiseUser[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const workflowLocationState = (location.state as WorkflowLocationState | null) ?? null;
  const [selectedFilter, setSelectedFilter] = useState<QueueFilter>(
    () => workflowLocationState?.selectedFilter || 'needs_approval'
  );
  const [selectedUserId, setSelectedUserId] = useState<string>(
    () => workflowLocationState?.selectedUserId || ''
  );
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<WorkflowDetailTab>('overview');
  const [noteDraft, setNoteDraft] = useState('');
  const [showNoteComposer, setShowNoteComposer] = useState(false);
  const [noteComposerMode, setNoteComposerMode] = useState<WorkflowNoteComposerMode>('note');
  const [showMarkSignedConfirm, setShowMarkSignedConfirm] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [expandedCogsCategories, setExpandedCogsCategories] = useState<string[]>([]);
  const [expandedSelectionCategories, setExpandedSelectionCategories] = useState<string[]>([]);
  const [expandedComparisonCategories, setExpandedComparisonCategories] = useState<string[]>([]);

  const effectiveRole = String(session?.role || '').trim().toLowerCase();
  const canAccess =
    effectiveRole === 'owner' ||
    effectiveRole === 'admin' ||
    effectiveRole === 'bookkeeper' ||
    effectiveRole === 'master';
  const { disableSignedWorkflow } = useFranchiseSignedWorkflowDisabled(
    selectedProposal?.franchiseId || session?.franchiseId || undefined
  );

  const loadWorkspace = async (preferredProposalNumber?: string | null) => {
    if (!canAccess) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = (await listProposals(session?.franchiseId)).map((entry) => ensureProposalWorkflow(entry));
      setProposals(rows);

      const preferred = preferredProposalNumber || proposalNumber;
      if (preferred) {
        const selected = rows.find((entry) => entry.proposalNumber === preferred);
        if (selected) {
          await loadSelectedProposal(selected.proposalNumber, rows);
          return;
        }
      }

      setSelectedProposal(null);
    } catch (error) {
      console.error('Failed to load workflow workspace', error);
      showToast({ type: 'error', message: 'Unable to load the workflow workspace.' });
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedProposal = async (targetProposalNumber: string, sourceRows?: Proposal[]) => {
    try {
      const loaded = await getProposal(targetProposalNumber);
      if (!loaded) {
        setSelectedProposal(null);
        return;
      }
      const normalized = ensureProposalWorkflow(loaded);
      const readUpdated = markWorkflowRead(normalized, session?.userId);
      const didUpdateReadState =
        JSON.stringify(readUpdated.workflow?.history || []) !== JSON.stringify(normalized.workflow?.history || []);
      const persisted = didUpdateReadState ? await saveProposal(readUpdated) : readUpdated;
      const finalProposal = ensureProposalWorkflow(persisted as Proposal);
      setSelectedProposal(finalProposal);

      setProposals((current) => {
        const base = sourceRows || current;
        return base.map((entry) =>
          entry.proposalNumber === finalProposal.proposalNumber ? finalProposal : entry
        );
      });
    } catch (error) {
      console.error('Failed to load selected workflow proposal', error);
      showToast({ type: 'error', message: 'Unable to load the selected proposal.' });
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, [canAccess, proposalNumber, session?.franchiseId]);

  useEffect(() => {
    if (!canAccess || !session?.franchiseId) {
      setFranchiseUsers([]);
      setUsersLoaded(true);
      return;
    }

    let cancelled = false;
    setUsersLoaded(false);

    const loadUsers = async () => {
      try {
        const rows = await listFranchiseUsers(session.franchiseId as string);
        if (!cancelled) {
          setFranchiseUsers(rows);
          setUsersLoaded(true);
        }
      } catch (error) {
        console.error('Failed to load franchise users for workflow filter', error);
        if (!cancelled) {
          setFranchiseUsers([]);
          setUsersLoaded(true);
        }
      }
    };

    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, [canAccess, session?.franchiseId]);

  useEffect(() => {
    const hasFilterOverride = workflowLocationState?.selectedFilter !== undefined;
    const hasUserOverride = workflowLocationState?.selectedUserId !== undefined;
    if (!hasFilterOverride && !hasUserOverride) return;
    if (hasFilterOverride) {
      setSelectedFilter(workflowLocationState?.selectedFilter || 'needs_approval');
    }
    if (hasUserOverride) {
      setSelectedUserId(workflowLocationState?.selectedUserId || '');
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, navigate, workflowLocationState?.selectedFilter, workflowLocationState?.selectedUserId]);

  useEffect(() => {
    const handleOnline = () => {
      void loadWorkspace(selectedProposal?.proposalNumber || proposalNumber);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [proposalNumber, selectedProposal?.proposalNumber]);

  useEffect(() => {
    setActiveDetailTab('overview');
    setNoteDraft('');
    setShowNoteComposer(false);
    setShowCompleteConfirm(false);
  }, [selectedProposal?.proposalNumber]);

  useEffect(() => {
    setExpandedCogsCategories([]);
    setExpandedSelectionCategories([]);
    setExpandedComparisonCategories([]);
  }, [selectedProposal?.proposalNumber]);

  useEffect(() => {
    if (!selectedProposal || !proposalNumber || workflowLocationState?.selectedFilter) return;
    const inferredFilter = getQueueFilterForProposal(selectedProposal);
    if (inferredFilter !== selectedFilter) {
      setSelectedFilter(inferredFilter);
    }
  }, [proposalNumber, selectedFilter, selectedProposal, workflowLocationState?.selectedFilter]);

  const selectedUser = useMemo(
    () => franchiseUsers.find((entry) => entry.id === selectedUserId) || null,
    [franchiseUsers, selectedUserId]
  );

  useEffect(() => {
    if (!usersLoaded || !selectedUserId) return;
    if (!selectedUser) {
      setSelectedUserId('');
    }
  }, [selectedUser, selectedUserId, usersLoaded]);

  useEffect(() => {
    if (!selectedProposal) return;
    if (matchesQueueFilter(selectedProposal, selectedFilter) && proposalBelongsToUser(selectedProposal, selectedUser)) {
      return;
    }
    setSelectedProposal(null);
    if (proposalNumber) {
      navigate('/workflow', { replace: true });
    }
  }, [navigate, proposalNumber, selectedFilter, selectedProposal, selectedUser]);

  const counts = useMemo(() => {
    const countForFilter = (filter: QueueFilter) =>
      proposals.filter((entry) => matchesQueueFilter(entry, filter) && proposalBelongsToUser(entry, selectedUser)).length;
    return {
      needsApproval: countForFilter('needs_approval'),
      approved: countForFilter('approved'),
      signed: countForFilter('signed'),
      archive: countForFilter('archive'),
    };
  }, [proposals, selectedUser]);

  const filteredProposals = useMemo(() => {
    return proposals
      .filter((entry) => matchesQueueFilter(entry, selectedFilter))
      .filter((entry) => proposalBelongsToUser(entry, selectedUser))
      .sort((a, b) => {
        const aTs = new Date(a.workflow?.submittedAt || a.lastModified || a.createdDate || 0).getTime();
        const bTs = new Date(b.workflow?.submittedAt || b.lastModified || b.createdDate || 0).getTime();
        return bTs - aTs;
      });
  }, [proposals, selectedFilter, selectedUser]);

  const selectedDiff = useMemo(
    () => (selectedProposal ? buildVersionDiffSummary(selectedProposal) : null),
    [selectedProposal]
  );
  const selectedSignedDiffs = useMemo(
    () => (selectedProposal ? buildSignedAddendumDiffSummaries(selectedProposal) : []),
    [selectedProposal]
  );
  const selectedReviewVersionId = selectedProposal ? getPendingReviewVersionId(selectedProposal) || getReviewVersionId(selectedProposal) : null;
  const selectedApprovedVersionId = selectedProposal ? getApprovedVersionId(selectedProposal) : null;
  const selectedReviewVersion = selectedProposal ? getPendingReviewVersion(selectedProposal) : null;
  const selectedApprovedVersion = selectedProposal ? getApprovedVersion(selectedProposal) : null;
  const selectedSignedVersion = selectedProposal ? getSignedVersion(selectedProposal) : null;
  const selectedDisplayVersion = selectedReviewVersion || selectedApprovedVersion || selectedSignedVersion || selectedProposal;
  const markSignedConfirmMessage = willSigningRemoveNonActiveVersions(selectedProposal)
    ? 'Marking as Signed will lock the current approved version, make it the signed baseline, and remove all non-active versions. All non-active versions will be removed when you do this. If changes are needed afterwards, they must be made through a Proposal Addendum.'
    : 'Marking as Signed will lock the current approved version and make it the signed baseline. If changes are needed afterwards, they must be made through a Proposal Addendum.';
  const selectedWorkflowReasons = (selectedProposal?.workflow?.approvalReasons || []).filter(
    (reason) => reason.code !== 'manual_review'
  );
  const selectedBelowMarginThreshold = selectedWorkflowReasons.some(
    (reason) => reason.code === 'margin_below_threshold'
  );
  const selectedMarginReason = selectedWorkflowReasons.find(
    (reason) => reason.code === 'margin_below_threshold'
  );
  const selectedHasResubmission =
    (selectedProposal?.workflow?.history || []).filter((entry) => entry.type === 'submitted').length > 1;
  const selectedRetailTotal = Number(selectedDisplayVersion?.pricing?.retailPrice || selectedDisplayVersion?.totalCost || 0);
  const selectedTotalCogs = Number(selectedDisplayVersion?.pricing?.totalCOGS || 0);
  const selectedGrossProfitPercent = Number(selectedDisplayVersion?.pricing?.grossProfitMargin || 0);
  const selectedDiscountAmount = getNonPapDiscountTotal(selectedDisplayVersion);
  const selectedHistory = useMemo(
    () =>
      [...(selectedProposal?.workflow?.history || [])].sort(
        (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      ),
    [selectedProposal]
  );
  const selectedActivityEntries = useMemo(
    () => selectedHistory.filter((entry) => ['submitted', 'approved', 'signed', 'completed'].includes(entry.type)),
    [selectedHistory]
  );
  const selectedNoteEntries = useMemo(
    () =>
      selectedHistory.filter((entry) => {
        if (entry.type === 'note') return true;
        return Boolean(entry.message);
      }),
    [selectedHistory]
  );
  const selectedProposalSelectionCategories = useMemo(
    () => (selectedDisplayVersion ? buildProposalSelectionCategories(selectedDisplayVersion) : []),
    [selectedDisplayVersion]
  );
  const selectedCogsCategories = useMemo(
    () => buildWorkflowCogsCategories(selectedDisplayVersion),
    [selectedDisplayVersion]
  );
  const selectedCurrentStatus = selectedProposal ? getWorkflowStatus(selectedProposal) : 'draft';
  const selectedCanSendNotes = Boolean(selectedProposal?.workflow?.submittedAt) && selectedCurrentStatus !== 'completed';
  const selectedCanRequestChanges =
    selectedCurrentStatus !== 'completed' && selectedCurrentStatus !== 'signed';
  const selectedOverviewRows = [
    { label: 'Designer', value: selectedProposal?.designerName || 'Designer' },
    {
      label: selectedHasResubmission ? 'Resubmitted' : 'Submitted',
      value: formatDateTime(selectedProposal?.workflow?.submittedAt || selectedProposal?.lastModified),
    },
    { label: 'Proposal Number', value: selectedProposal?.proposalNumber || 'N/A' },
    { label: 'Pricing Model', value: selectedProposal?.pricingModelName || 'Pricing Model' },
    { label: 'Gross Profit %', value: formatPercent(selectedGrossProfitPercent) },
    { label: 'Total COGS', value: formatCurrency(selectedTotalCogs) },
    { label: 'Total Retail', value: formatCurrency(selectedRetailTotal) },
    { label: 'Discount Amount', value: formatCurrency(selectedDiscountAmount) },
  ];
  const selectedUserLabel = selectedUser ? getUserFilterLabel(selectedUser) : null;
  const emptyDetailMessage =
    filteredProposals.length === 0 && selectedUserLabel
      ? `No proposals for ${selectedUserLabel} in this view.`
      : selectedFilter === 'needs_approval' && filteredProposals.length > 0
      ? 'Select a Proposal that is Awaiting Approval on the left'
      : selectedFilter === 'signed' && filteredProposals.length > 0
      ? 'Select a signed proposal to review its addendum history.'
      : 'Select a proposal to review its workflow.';

  const handleFilterChange = (nextFilter: QueueFilter) => {
    setSelectedFilter(nextFilter);
    if (selectedProposal && !matchesQueueFilter(selectedProposal, nextFilter)) {
      setSelectedProposal(null);
      if (proposalNumber) {
        navigate('/workflow', {
          replace: true,
        });
      }
    }
  };

  const handleUserFilterChange = (nextUserId: string) => {
    setSelectedUserId(nextUserId);
    const nextUser = franchiseUsers.find((entry) => entry.id === nextUserId) || null;
    if (selectedProposal && !proposalBelongsToUser(selectedProposal, nextUser)) {
      setSelectedProposal(null);
      if (proposalNumber) {
        navigate('/workflow', {
          replace: true,
        });
      }
    }
  };

  const persistSelectedProposal = async (nextProposal: Proposal, successMessage: string) => {
    setSavingAction(successMessage);
    try {
      const saved = ensureProposalWorkflow((await saveProposal(nextProposal)) as Proposal);
      const nextRows = proposals.map((entry) =>
        entry.proposalNumber === saved.proposalNumber ? saved : entry
      );
      const nextSelected =
        matchesQueueFilter(saved, selectedFilter) && proposalBelongsToUser(saved, selectedUser)
          ? saved
          : nextRows.find(
              (entry) =>
                entry.proposalNumber !== saved.proposalNumber &&
                matchesQueueFilter(entry, selectedFilter) &&
                proposalBelongsToUser(entry, selectedUser)
            ) ||
            null;

      setSelectedProposal(nextSelected);
      setProposals(nextRows);
      setNoteDraft('');
      setShowNoteComposer(false);
      if (nextSelected) {
        navigate(`/workflow/${nextSelected.proposalNumber}`, { replace: true });
      } else {
        navigate('/workflow', { replace: true });
      }
      showToast({ type: 'success', message: successMessage });
    } catch (error) {
      console.error('Failed to save workflow action', error);
      showToast({ type: 'error', message: 'Unable to save the workflow action.' });
    } finally {
      setSavingAction(null);
    }
  };

  const handleApprove = async () => {
    if (!selectedProposal) return;
    await persistSelectedProposal(
      approveWorkflowProposal(selectedProposal, undefined, session),
      getSignedVersion(selectedProposal) ? 'Proposal addendum approved.' : 'Proposal approved.'
    );
  };

  const handleRequestChanges = async () => {
    if (!selectedProposal || !noteDraft.trim()) {
      setActiveDetailTab('notes');
      setNoteComposerMode('request_changes');
      setShowNoteComposer(true);
      return;
    }
    await persistSelectedProposal(
      requestWorkflowChanges(selectedProposal, noteDraft.trim(), session),
      'Proposal returned with requested changes.'
    );
  };

  const handleSendNote = async () => {
    if (!selectedProposal || !noteDraft.trim()) {
      setActiveDetailTab('notes');
      setNoteComposerMode('note');
      setShowNoteComposer(true);
      return;
    }
    await persistSelectedProposal(
      addWorkflowNote(selectedProposal, noteDraft.trim(), session),
      'Note sent.'
    );
  };

  const handleMarkAsSigned = async () => {
    if (!selectedProposal) return;
    const targetFranchiseId = selectedProposal.franchiseId || session?.franchiseId || null;

    try {
      const isSignedWorkflowDisabled = targetFranchiseId
        ? await loadFranchiseSignedWorkflowDisabled(targetFranchiseId, { force: true })
        : disableSignedWorkflow;
      if (isSignedWorkflowDisabled) {
        showToast({ type: 'error', message: DISABLED_SIGNED_WORKFLOW_MESSAGE });
        return;
      }
    } catch (error) {
      console.warn('Unable to verify signed workflow setting before marking proposal as signed:', error);
      if (disableSignedWorkflow) {
        showToast({ type: 'error', message: DISABLED_SIGNED_WORKFLOW_MESSAGE });
        return;
      }
    }

    await persistSelectedProposal(
      markProposalAsSigned(selectedProposal, session),
      'Proposal marked as signed.'
    );
  };

  const handleComplete = async () => {
    if (!selectedProposal || getWorkflowStatus(selectedProposal) !== 'signed') return;
    await persistSelectedProposal(
      completeWorkflowProposal(selectedProposal, undefined, session),
      'Proposal marked as completed.'
    );
  };

  const toggleCogsCategory = (categoryKey: string) => {
    setExpandedCogsCategories((current) =>
      current.includes(categoryKey)
        ? current.filter((entry) => entry !== categoryKey)
        : [...current, categoryKey]
    );
  };

  const toggleSelectionCategory = (categoryKey: string) => {
    setExpandedSelectionCategories((current) =>
      current.includes(categoryKey)
        ? current.filter((entry) => entry !== categoryKey)
        : [...current, categoryKey]
    );
  };

  const toggleComparisonCategory = (categoryKey: string) => {
    setExpandedComparisonCategories((current) =>
      current.includes(categoryKey)
        ? current.filter((entry) => entry !== categoryKey)
        : [...current, categoryKey]
    );
  };

  const openSelectedProposalVersion = (versionId?: string | null) => {
    if (!selectedProposal) return;
    navigate(`/proposal/view/${selectedProposal.proposalNumber}`, {
      state: {
        versionId: versionId || undefined,
        reviewerReturnTo: 'workflow',
        reviewerReturnPath: '/workflow',
        reviewerReturnFilter: selectedFilter,
        reviewerReturnUserId: selectedUserId || null,
      },
    });
  };

  const renderOverviewTab = () => (
    <div className="workflow-overview-grid">
      <div className="workflow-panel-card">
        <div className="workflow-panel-header">
          <div>
            <h3>Proposal Details</h3>
            <p>Core financials and review context for this version.</p>
          </div>
        </div>
        <div className="workflow-table-shell">
          <table className="workflow-data-table">
            <tbody>
              {selectedOverviewRows.map((row) => (
                <tr key={row.label}>
                  <th>{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="workflow-panel-card">
        <div className="workflow-panel-header">
          <div>
            <h3>Activity History</h3>
            <p>Status changes only. Notes live in the Notes tab.</p>
          </div>
        </div>
        {selectedActivityEntries.length === 0 ? (
          <div className="workflow-empty workflow-inline-empty">No activity recorded yet.</div>
        ) : (
          <div className="workflow-activity-list">
            {selectedActivityEntries.map((entry) => (
              <div key={entry.id} className="workflow-activity-item">
                <div className="workflow-activity-item-head">
                  <span className={`workflow-status-pill is-${entry.type}`}>
                    {normalizeStatusLabel(entry.type)}
                  </span>
                  <span>{formatDateTime(entry.createdAt)}</span>
                </div>
                <div className="workflow-activity-item-body">{getWorkflowEventActorLabel(entry)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderCogsTab = () => (
    <div className="workflow-panel-card">
      <div className="workflow-panel-header">
        <div>
          <h3>COGS Breakdown</h3>
          <p>Expand a category to inspect the line items inside it.</p>
        </div>
      </div>
      {selectedCogsCategories.length === 0 ? (
        <div className="workflow-empty workflow-inline-empty">No COGS data is available for this proposal.</div>
      ) : (
        <div className="workflow-table-shell">
          <table className="workflow-summary-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Line Items</th>
                <th>Total</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            {selectedCogsCategories.map((category) => {
              const expanded = expandedCogsCategories.includes(category.key);
              return (
                <tbody key={category.key}>
                  <tr className="workflow-summary-row">
                    <td>
                      <button
                        type="button"
                        className="workflow-table-toggle"
                        onClick={() => toggleCogsCategory(category.key)}
                        aria-expanded={expanded}
                      >
                        <span className="workflow-table-toggle-icon">{expanded ? '−' : '+'}</span>
                        <span>{category.label}</span>
                      </button>
                    </td>
                    <td>{category.itemCount}</td>
                    <td>{formatCurrency(category.total)}</td>
                    <td className="workflow-summary-row-action">{expanded ? 'Hide' : 'View'}</td>
                  </tr>
                  {expanded && (
                    <tr className="workflow-expand-row">
                      <td colSpan={4}>
                        <div className="workflow-expand-panel">
                          <table className="workflow-detail-table">
                            <thead>
                              <tr>
                                <th>Line Item</th>
                                <th>Type</th>
                                <th>Qty</th>
                                <th>Unit Cost</th>
                                <th>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {category.rows.map((row) => (
                                <tr key={row.id}>
                                  <td>{row.label}</td>
                                  <td>{row.subcategory || 'Base'}</td>
                                  <td>{formatQuantity(row.quantity)}</td>
                                  <td>{formatCurrency(row.unitPrice)}</td>
                                  <td>{row.totalLabel}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );

  const renderProposalSelectionsTab = () => (
    <div className="workflow-panel-card">
      <div className="workflow-panel-header">
        <div>
          <h3>Proposal Selections</h3>
          <p>Every builder section with the values selected for it.</p>
        </div>
      </div>
      {selectedProposalSelectionCategories.length === 0 ? (
        <div className="workflow-empty workflow-inline-empty">No proposal selections are available for this version.</div>
      ) : (
        <div className="workflow-table-shell">
          <table className="workflow-summary-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Filled</th>
                <th>Fields</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            {selectedProposalSelectionCategories.map((category) => {
              const expanded = expandedSelectionCategories.includes(category.key);
              const filledCount = category.fields.filter((field) => isSelectionValueSet(field.value)).length;
              return (
                <tbody key={category.key}>
                  <tr className="workflow-summary-row">
                    <td>
                      <button
                        type="button"
                        className="workflow-table-toggle"
                        onClick={() => toggleSelectionCategory(category.key)}
                        aria-expanded={expanded}
                      >
                        <span className="workflow-table-toggle-icon">{expanded ? '−' : '+'}</span>
                        <span>{category.label}</span>
                      </button>
                    </td>
                    <td>{filledCount}</td>
                    <td>{category.fields.length}</td>
                    <td className="workflow-summary-row-action">{expanded ? 'Hide' : 'View'}</td>
                  </tr>
                  {expanded && (
                    <tr className="workflow-expand-row">
                      <td colSpan={4}>
                        <div className="workflow-expand-panel">
                          <table className="workflow-detail-table">
                            <thead>
                              <tr>
                                <th>Setting</th>
                                <th>Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {category.fields.map((field) => (
                                <tr key={`${category.key}-${field.key}`}>
                                  <td>{field.label}</td>
                                  <td className={!isSelectionValueSet(field.value) ? 'is-empty' : ''}>
                                    {getSelectionDisplayValue(field.value)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );

  const renderNotesTab = () => (
    <div className="workflow-notes-grid">
      <div className="workflow-panel-card">
        <div className="workflow-panel-header">
          <div>
            <h3>Notes</h3>
            <p>Messages stay here so the activity history stays clean.</p>
          </div>
          {selectedCanSendNotes && !showNoteComposer && (
            <button
              type="button"
              className="workflow-secondary-btn"
              onClick={() => {
                setNoteComposerMode('note');
                setShowNoteComposer(true);
              }}
            >
              Add Note
            </button>
          )}
        </div>
        {selectedNoteEntries.length === 0 ? (
          <div className="workflow-empty workflow-inline-empty">No notes have been added for this proposal.</div>
        ) : (
          <div className="workflow-notes-list">
            {selectedNoteEntries.map((entry) => (
              <div key={entry.id} className="workflow-note-entry">
                <div className="workflow-note-entry-head">
                  <div className="workflow-note-entry-meta">
                    <span className={`workflow-status-pill is-${entry.type}`}>
                      {normalizeStatusLabel(entry.type)}
                    </span>
                    <span>{getWorkflowEventActorLabel(entry)}</span>
                  </div>
                  <span>{formatDateTime(entry.createdAt)}</span>
                </div>
                <div className="workflow-note-entry-message">{entry.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedCanSendNotes && showNoteComposer && (
        <div className="workflow-panel-card">
          <div className="workflow-panel-header">
            <div>
              <h3>{noteComposerMode === 'request_changes' ? 'Request Changes' : 'Send Note'}</h3>
              <p>
                {noteComposerMode === 'request_changes'
                  ? 'Explain what needs to change before the proposal can move forward.'
                  : 'Add a note visible to both reviewer and designer.'}
              </p>
            </div>
          </div>
          <textarea
            className="workflow-note-input"
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder={
              noteComposerMode === 'request_changes'
                ? 'Describe the changes that are required'
                : 'Add a note'
            }
          />
          <div className="workflow-note-actions">
            <button
              type="button"
              className="workflow-secondary-btn"
              disabled={!noteDraft.trim() || Boolean(savingAction)}
              onClick={() => {
                setNoteComposerMode('note');
                void handleSendNote();
              }}
            >
              Send Note
            </button>
            {selectedCanRequestChanges && (
              <button
                type="button"
                className="workflow-danger-btn"
                disabled={!noteDraft.trim() || Boolean(savingAction)}
                onClick={() => {
                  setNoteComposerMode('request_changes');
                  void handleRequestChanges();
                }}
              >
                Request Changes
              </button>
            )}
            <button
              type="button"
              className="workflow-secondary-btn"
              disabled={Boolean(savingAction)}
              onClick={() => {
                setNoteDraft('');
                setShowNoteComposer(false);
                setNoteComposerMode('note');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderChangeReviewSection = () => {
    if (!(selectedCurrentStatus === 'signed' && selectedSignedVersion) && !selectedDiff) {
      return null;
    }

    return (
      <div className="workflow-followup-card">
        <div className="workflow-followup-header">
          <div>
            <p className="workflow-kicker">Change Review</p>
            <h3>Comparison Details</h3>
          </div>
        </div>

        {selectedCurrentStatus === 'signed' && selectedSignedVersion && (
          <div className="workflow-compare-card">
            <div className="workflow-compare-header">
              <div>
                <div className="workflow-detail-label">Signed Proposal History</div>
                <div className="workflow-detail-value">
                  Original signed proposal vs approved addendums
                </div>
              </div>
            </div>

            <div className="workflow-signed-columns">
              <div className="workflow-signed-column workflow-signed-column--baseline">
                <div className="workflow-diff-category-title">Original Signed Proposal</div>
                <div className="workflow-detail-value">
                  {selectedSignedVersion.versionName || 'Signed Proposal'}
                </div>
                <div className="workflow-queue-item-meta">
                  <span>{formatDateTime(selectedProposal?.workflow?.signedAt || selectedProposal?.workflow?.submittedAt)}</span>
                </div>
                <button
                  type="button"
                  className="workflow-secondary-btn"
                  onClick={() => openSelectedProposalVersion(selectedSignedVersion.versionId || 'original')}
                >
                  Open Signed Proposal
                </button>
              </div>

              {selectedSignedDiffs.length > 0 ? (
                selectedSignedDiffs.map((diff) => (
                  <div key={diff.reviewVersionId} className="workflow-signed-column">
                    <div className="workflow-diff-category-title">{diff.reviewVersionName}</div>
                    <div className="workflow-detail-value">
                      Compared to {diff.compareVersionName}
                    </div>
                    <div className="workflow-metric-grid">
                      <div className="workflow-metric">
                        <span>Retail Delta</span>
                        <strong>{formatSignedCurrency(diff.retailDelta)}</strong>
                      </div>
                      <div className="workflow-metric">
                        <span>GP % Delta</span>
                        <strong>{formatSignedPercent(diff.grossMarginDelta)}</strong>
                      </div>
                    </div>
                    {diff.changedSections.length > 0 && (
                      <div className="workflow-queue-sections">
                        {diff.changedSections.slice(0, 4).map((section) => (
                          <span key={`${diff.reviewVersionId}-${section}`} className="workflow-section-chip">
                            {section}
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      className="workflow-secondary-btn"
                      onClick={() => openSelectedProposalVersion(diff.reviewVersionId)}
                    >
                      Open Addendum
                    </button>
                  </div>
                ))
              ) : (
                <div className="workflow-signed-column">
                  <div className="workflow-detail-value">No approved proposal addendums yet.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {selectedDiff && (
          <div className="workflow-compare-card">
            <div className="workflow-compare-header">
              <div>
                <div className="workflow-detail-label">Approved Proposal vs Proposal Addendum</div>
                <div className="workflow-detail-value">
                  {selectedDiff.compareVersionName} vs {selectedDiff.reviewVersionName}
                </div>
              </div>
              <div className="workflow-compare-actions">
                <button
                  type="button"
                  className="workflow-secondary-btn"
                  onClick={() => openSelectedProposalVersion(selectedReviewVersionId)}
                >
                  Open Addendum
                </button>
                {selectedApprovedVersionId && (
                  <button
                    type="button"
                    className="workflow-secondary-btn"
                    onClick={() => openSelectedProposalVersion(selectedApprovedVersionId)}
                  >
                    Open Approved Proposal
                  </button>
                )}
              </div>
            </div>

            <div className="workflow-diff-intro">
              <div className="workflow-diff-intro-title">
                {`${selectedDiff.compareVersionName} -> ${selectedDiff.reviewVersionName} Differences`}
              </div>
            </div>

            <div className="workflow-metric-grid">
              <div className="workflow-metric">
                <span>Retail Delta</span>
                <strong>{formatSignedCurrency(selectedDiff.retailDelta)}</strong>
              </div>
              <div className="workflow-metric">
                <span>COGS Delta</span>
                <strong>{formatSignedCurrency(selectedDiff.costDelta)}</strong>
              </div>
              <div className="workflow-metric">
                <span>Gross Profit Delta</span>
                <strong>{formatSignedCurrency(selectedDiff.grossProfitDelta)}</strong>
              </div>
              <div className="workflow-metric">
                <span>GP % Delta</span>
                <strong>{formatSignedPercent(selectedDiff.grossMarginDelta)}</strong>
              </div>
              <div className="workflow-metric">
                <span>Discount Delta</span>
                <strong>{formatSignedCurrency(selectedDiff.discountDelta)}</strong>
              </div>
              <div className="workflow-metric">
                <span>Contract Override Delta</span>
                <strong>{selectedDiff.contractOverrideDelta}</strong>
              </div>
            </div>

            <div className="workflow-diff-categories">
              {selectedDiff.categories.map((category) => (
                <div key={category.key} className="workflow-diff-category">
                  <div className="workflow-diff-category-header">
                    <div>
                      <div className="workflow-diff-category-title">{category.label}</div>
                      <div className="workflow-diff-category-meta">
                        {category.changeCount} change{category.changeCount === 1 ? '' : 's'} | {formatSignedCurrency(category.totalDelta)}
                      </div>
                    </div>
                  </div>

                  {category.fieldChanges.length > 0 && (
                    <div className="workflow-diff-block">
                      <div className="workflow-diff-block-title">Proposal Changes</div>
                      {category.fieldChanges.map((change) => (
                        <div key={`${category.key}-${change.label}`} className="workflow-diff-row">
                          <span className="workflow-diff-label">{change.label}</span>
                          <span className="workflow-diff-before">{change.before || 'None'}</span>
                          <span className="workflow-diff-arrow">{'->'}</span>
                          <span className="workflow-diff-after">{change.after || 'None'}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {category.costChanges.length > 0 && (
                    <div className="workflow-diff-block workflow-diff-block-collapsible">
                      <div className="workflow-diff-block-header">
                        <div className="workflow-diff-block-title">Cost Breakdown Impact</div>
                        <button
                          type="button"
                          className="workflow-diff-toggle-btn"
                          onClick={() => toggleComparisonCategory(category.key)}
                          aria-expanded={expandedComparisonCategories.includes(category.key)}
                        >
                          {expandedComparisonCategories.includes(category.key) ? 'Hide Details' : 'Show Details'}
                        </button>
                      </div>
                      {expandedComparisonCategories.includes(category.key) && (
                        <div className="workflow-diff-block-content">
                          {category.costChanges.map((change) => (
                            <div key={`${category.key}-${change.category}-${change.label}`} className="workflow-cost-row">
                              <div className="workflow-cost-row-copy">
                                <div className="workflow-cost-row-title">{change.label}</div>
                                <div className="workflow-cost-row-meta">
                                  {change.beforeQuantity.toLocaleString('en-US', { maximumFractionDigits: 2 })} {'->'} {change.afterQuantity.toLocaleString('en-US', { maximumFractionDigits: 2 })} qty
                                </div>
                              </div>
                              <div className="workflow-cost-row-values">
                                <span>{formatCurrency(change.beforeTotal)} {'->'} {formatCurrency(change.afterTotal)}</span>
                                <strong>{formatSignedCurrency(change.delta)}</strong>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDetailTab = () => {
    if (activeDetailTab === 'cogs') return renderCogsTab();
    if (activeDetailTab === 'proposal_selections') return renderProposalSelectionsTab();
    if (activeDetailTab === 'notes') return renderNotesTab();
    return renderOverviewTab();
  };

  if (!canAccess) {
    return (
      <div className="workflow-page">
        <div className="workflow-locked-card">
          <h2>Workflow access required</h2>
          <p>Switch to an owner, admin, or book keeper account to review submitted proposals.</p>
          <button type="button" className="workflow-primary-btn" onClick={() => navigate('/')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="workflow-page">
      <div className="workflow-header">
        <div>
          <p className="workflow-kicker">Review Workspace</p>
          <h1>Submitted Proposal Workflow</h1>
        </div>
        <div className="workflow-header-actions">
          <button
            type="button"
            className={`workflow-filter-pill${selectedFilter === 'needs_approval' ? ' is-active' : ''}`}
            onClick={() => handleFilterChange('needs_approval')}
          >
            Needs Approval ({counts.needsApproval})
          </button>
          <button
            type="button"
            className={`workflow-filter-pill${selectedFilter === 'approved' ? ' is-active' : ''}`}
            onClick={() => handleFilterChange('approved')}
          >
            Approved ({counts.approved})
          </button>
          <button
            type="button"
            className={`workflow-filter-pill${selectedFilter === 'signed' ? ' is-active' : ''}`}
            onClick={() => handleFilterChange('signed')}
          >
            Signed ({counts.signed})
          </button>
          <button
            type="button"
            className={`workflow-filter-pill${selectedFilter === 'archive' ? ' is-active' : ''}`}
            onClick={() => handleFilterChange('archive')}
          >
            Archived ({counts.archive})
          </button>
        </div>
      </div>

      <div className="workflow-layout">
        <aside className="workflow-queue">
          <div className="workflow-queue-header">
            <div className="workflow-queue-heading">
              <p className="workflow-queue-eyebrow">Proposals</p>
              <div className="workflow-queue-title">Proposals</div>
              <div className="workflow-queue-subtitle">{getQueueLabel(selectedFilter)} queue</div>
            </div>
            <div className="workflow-queue-header-controls">
              <label className="workflow-user-filter">
                <span className="workflow-user-filter-label">User</span>
                <select
                  className="workflow-user-filter-select"
                  value={selectedUserId}
                  onChange={(event) => handleUserFilterChange(event.target.value)}
                >
                  <option value="">All Franchise Users</option>
                  {franchiseUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {getUserFilterLabel(user)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {loading ? (
            <div className="workflow-empty">Loading workflow queue...</div>
          ) : filteredProposals.length === 0 ? (
            <div className="workflow-empty">
              {selectedUserLabel ? `No proposals for ${selectedUserLabel} in this view.` : 'No proposals match this view.'}
            </div>
          ) : (
            <div className="workflow-queue-list">
              {filteredProposals.map((entry) => {
                const unread = hasUnreadWorkflowEvents(entry, session?.userId);
                const status = getWorkflowStatus(entry);
                return (
                  <button
                    key={entry.proposalNumber}
                    type="button"
                    className={`workflow-queue-item${
                      selectedProposal?.proposalNumber === entry.proposalNumber ? ' is-selected' : ''
                    }`}
                    onClick={() => {
                      navigate(`/workflow/${entry.proposalNumber}`);
                      void loadSelectedProposal(entry.proposalNumber);
                    }}
                  >
                    <div className="workflow-queue-item-top">
                      <div className="workflow-queue-item-copy">
                        <div className="workflow-queue-customer">{entry.customerInfo?.customerName || 'Proposal'}</div>
                        <div className="workflow-queue-designer">{entry.designerName || 'Designer'}</div>
                      </div>
                      <div className={`workflow-status-pill is-${status}`}>
                        {normalizeStatusLabel(status)}
                      </div>
                    </div>
                    <div className="workflow-queue-item-meta">
                      <span>{formatDateTime(entry.workflow?.submittedAt || entry.lastModified)}</span>
                      {unread && (
                        <span className="workflow-unread-pill">
                          {countUnreadWorkflowEvents(entry, session?.userId)} New
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="workflow-detail">
          {!selectedProposal ? (
            <div className="workflow-empty workflow-empty-detail">{emptyDetailMessage}</div>
          ) : (
            <div className="workflow-detail-shell">
              <div className="workflow-detail-header">
                <div>
                  <p className="workflow-kicker">Proposal Review</p>
                  <h2>{selectedProposal.customerInfo?.customerName || selectedProposal.proposalNumber}</h2>
                  <div className="workflow-detail-subtitle">
                    <span>Designer: {selectedProposal.designerName || 'Designer'}</span>
                    <span>Submitted: {formatDateTime(selectedProposal.workflow?.submittedAt || selectedProposal.lastModified)}</span>
                  </div>
                </div>
                <div className={`workflow-status-pill is-${selectedCurrentStatus}`}>
                  {normalizeStatusLabel(selectedCurrentStatus)}
                </div>
              </div>

              <div className="workflow-metrics-grid">
                <div className="workflow-stat-card">
                  <div className="workflow-stat-label">Total Retail</div>
                  <div className="workflow-stat-value">{formatCurrency(selectedRetailTotal)}</div>
                </div>
                <div className="workflow-stat-card">
                  <div className="workflow-stat-label">Total COGS</div>
                  <div className="workflow-stat-value">{formatCurrency(selectedTotalCogs)}</div>
                </div>
                <div className="workflow-stat-card">
                  <div className="workflow-stat-head">
                    <div className="workflow-stat-label">Gross Profit %</div>
                    {selectedBelowMarginThreshold && (
                      <span
                        className="workflow-stat-flag"
                        title="Proposal is below minimum profit %"
                        aria-label="Proposal is below minimum profit %"
                      >
                        X
                      </span>
                    )}
                  </div>
                  <div className={`workflow-stat-value${selectedBelowMarginThreshold ? ' is-danger' : ' is-success'}`}>
                    {formatPercent(selectedGrossProfitPercent)}
                  </div>
                  <div className={`workflow-stat-note${selectedBelowMarginThreshold ? ' is-danger' : ''}`}>
                    {selectedBelowMarginThreshold
                      ? selectedMarginReason?.detail || 'Below minimum threshold'
                      : 'Within designer threshold'}
                  </div>
                </div>
                <div className="workflow-stat-card">
                  <div className="workflow-stat-label">Discount Amount</div>
                  <div className="workflow-stat-value">{formatCurrency(selectedDiscountAmount)}</div>
                </div>
              </div>

              {selectedWorkflowReasons.length > 0 && (
                <div className="workflow-reasons">
                  {selectedWorkflowReasons.map((reason) => (
                    <div key={`${reason.code}-${reason.label}`} className="workflow-reason-row">
                      <strong>{reason.label}</strong>
                      {reason.detail ? ` - ${reason.detail}` : ''}
                    </div>
                  ))}
                </div>
              )}

              <div className="workflow-tab-card">
                <div className="workflow-tab-strip" role="tablist" aria-label="Proposal review tabs">
                  <button type="button" role="tab" aria-selected={activeDetailTab === 'overview'} className={`workflow-tab-btn${activeDetailTab === 'overview' ? ' is-active' : ''}`} onClick={() => setActiveDetailTab('overview')}>Overview</button>
                  <button type="button" role="tab" aria-selected={activeDetailTab === 'cogs'} className={`workflow-tab-btn${activeDetailTab === 'cogs' ? ' is-active' : ''}`} onClick={() => setActiveDetailTab('cogs')}>COGS</button>
                  <button type="button" role="tab" aria-selected={activeDetailTab === 'proposal_selections'} className={`workflow-tab-btn${activeDetailTab === 'proposal_selections' ? ' is-active' : ''}`} onClick={() => setActiveDetailTab('proposal_selections')}>Proposal Selections</button>
                  <button type="button" role="tab" aria-selected={activeDetailTab === 'notes'} className={`workflow-tab-btn${activeDetailTab === 'notes' ? ' is-active' : ''}`} onClick={() => setActiveDetailTab('notes')}>Notes</button>
                </div>
                <div className="workflow-tab-panel">{renderDetailTab()}</div>
              </div>

              {renderChangeReviewSection()}

              <div className="workflow-action-bar">
                <button type="button" className="workflow-open-summary-btn" onClick={() => openSelectedProposalVersion()}>
                  Open Proposal Summary
                </button>
                <div className="workflow-action-buttons">
                  {selectedCurrentStatus === 'needs_approval' && (
                    <button type="button" className="workflow-success-btn" disabled={Boolean(savingAction)} onClick={() => { void handleApprove(); }}>
                      Approve
                    </button>
                  )}
                  {selectedCanRequestChanges && (
                    <button
                      type="button"
                      className="workflow-danger-btn"
                      disabled={Boolean(savingAction)}
                      onClick={() => {
                        if (noteDraft.trim()) {
                          void handleRequestChanges();
                          return;
                        }
                        setActiveDetailTab('notes');
                        setNoteComposerMode('request_changes');
                        setShowNoteComposer(true);
                      }}
                    >
                      Request Changes
                    </button>
                  )}
                  {selectedCurrentStatus === 'approved' && (
                    <TooltipAnchor tooltip={disableSignedWorkflow ? DISABLED_SIGNED_WORKFLOW_MESSAGE : undefined}>
                      <button
                        type="button"
                        className="workflow-primary-btn"
                        disabled={Boolean(savingAction) || disableSignedWorkflow}
                        onClick={() => setShowMarkSignedConfirm(true)}
                      >
                        Mark as Signed
                      </button>
                    </TooltipAnchor>
                  )}
                  {selectedCurrentStatus === 'signed' && (
                    <button type="button" className="workflow-primary-btn" disabled={Boolean(savingAction)} onClick={() => setShowCompleteConfirm(true)}>
                      Mark Complete
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={showMarkSignedConfirm}
        title="Are you sure?"
        message={markSignedConfirmMessage}
        confirmLabel="Yes I'm sure. Mark as Signed"
        cancelLabel="No, take me back"
        isLoading={Boolean(savingAction)}
        onConfirm={() => {
          setShowMarkSignedConfirm(false);
          void handleMarkAsSigned();
        }}
        onCancel={() => setShowMarkSignedConfirm(false)}
      />
      <ConfirmDialog
        open={showCompleteConfirm}
        title="Are you sure?"
        message="Are you sure you want to mark this proposal as complete? No further edits can be made, and it will be reconciled in the Archive."
        confirmLabel="Yes, I'm sure"
        cancelLabel="No, take me back"
        isLoading={Boolean(savingAction)}
        onConfirm={() => {
          setShowCompleteConfirm(false);
          void handleComplete();
        }}
        onCancel={() => setShowCompleteConfirm(false)}
      />
    </div>
  );
}

export default WorkflowPage;
