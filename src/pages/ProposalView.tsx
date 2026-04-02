import { useState, useEffect, useRef, type MouseEventHandler, type ReactNode } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CostLineItem, Proposal, RetailAdjustment } from '../types/proposal-new';
import CostBreakdownView from '../components/CostBreakdownView';
import { BreakdownCostExportPage, BreakdownWarrantyExportPages } from '../components/BreakdownExportPages';
import ContractView, { ContractViewHandle } from '../components/ContractView';
import FranchiseLogo from '../components/FranchiseLogo';
import OffContractItemsView from '../components/OffContractItemsView';
import { useToast } from '../components/Toast';
import RetiredEquipmentIndicator from '../components/RetiredEquipmentIndicator';
import SubmitProposalModal from '../components/SubmitProposalModal';
import './ProposalView.css';
import customerBreakIconImg from '../../docs/img/custbreak.png';
import cogsBreakIconImg from '../../docs/img/cogsbreak.png';
import summaryIconImg from '../../docs/img/summary.png';
import MasterPricingEngine from '../services/masterPricingEngine';
import { getProposal as getProposalRemote, saveProposal as saveProposalRemote } from '../services/proposalsAdapter';
import {
  initPricingDataStore,
  loadPricingSnapshotForFranchise,
  withTemporaryPricingSnapshot,
} from '../services/pricingDataStore';
import { getSessionRole, isMasterActingAsOwnerSession, readSession } from '../services/session';
import { getContractTemplateIdForProposal } from '../services/contractTemplates';
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
  getDefaultInteriorFinish,
  getDefaultManualAdjustments,
  mergeRetailAdjustments,
} from '../utils/proposalDefaults';
import { normalizeEquipmentLighting } from '../utils/lighting';
import { applyActiveVersion, createVersionFromProposal, listAllVersions } from '../utils/proposalVersions';
import { hasRetiredEquipment } from '../utils/retiredEquipment';
import { validateProposal } from '../utils/validation';
import { ContractOverrides } from '../services/contractGenerator';
import {
  buildLineItemSubcategories,
  CUSTOM_OPTIONS_SUBCATEGORY,
  hasLineItemSubcategory,
  isCustomOptionItem,
} from '../utils/costBreakdownSubcategories';
import { getOffContractItemGroups, getOffContractTotal } from '../utils/customOptions';
import { getEffectivePrimarySanitationSystemName, getSelectedEquipmentPackage } from '../utils/equipmentPackages';
import { normalizeCustomFeatures } from '../utils/customFeatures';
import { useAdminCogsView } from '../hooks/useAdminCogsView';
import { isOffContractLineItem } from '../utils/offContractLineItems';
import { normalizeWarrantySectionsSetting } from '../utils/warranty';
import {
  addWorkflowNote,
  ensureProposalWorkflow,
  getApprovedVersionId,
  getPendingReviewVersionId,
  getReviewerPrimaryVersionId,
  getReviewerVisibleVersions,
  getWorkflowStatus,
  isSubmittedVersionLocked,
  markWorkflowRead,
  submitProposalForWorkflow,
} from '../services/proposalWorkflow';

const splitCustomOptions = (items: CostLineItem[]) => ({
  baseItems: items.filter(item => !isCustomOptionItem(item)),
  customOptions: items.filter(isCustomOptionItem),
});

const normalizeSummaryName = (value?: string | null): string => (value ?? '').trim();

const hasNamedSelection = (value: string | undefined, placeholderToken: string): boolean => {
  const normalized = normalizeSummaryName(value).toLowerCase();
  return Boolean(normalized) && normalized !== 'none' && !normalized.includes(placeholderToken);
};

const summarizeNamedSelections = (names: string[]): string => {
  const normalizedNames = names.map((name) => normalizeSummaryName(name)).filter(Boolean);
  if (!normalizedNames.length) return 'None';
  if (normalizedNames.length === 1) return normalizedNames[0];

  const primary = normalizedNames[0];
  const allMatchPrimary = normalizedNames.every((name) => name.toLowerCase() === primary.toLowerCase());
  return allMatchPrimary ? `${primary} x${normalizedNames.length}` : `${primary} +${normalizedNames.length - 1}`;
};

const summarizeSelectionWithQuantity = (
  name: string | undefined,
  quantity: number | undefined,
  placeholderToken: string
): string => {
  const safeName = normalizeSummaryName(name);
  const safeQuantity = Number.isFinite(quantity) ? Math.max(quantity ?? 0, 0) : 0;
  if (!hasNamedSelection(name, placeholderToken) || safeQuantity <= 0) return 'None';
  return safeQuantity > 1 ? `${safeName} x${safeQuantity}` : safeName;
};

const summarizePumpSelection = (equipment: Proposal['equipment']): string => {
  return hasNamedSelection(equipment.pump?.name, 'no pump') ? normalizeSummaryName(equipment.pump.name) : 'None';
};

const summarizePoolLightSelection = (lights: Array<{ name?: string }> | undefined): string => {
  const names = (lights ?? [])
    .map((light) => light?.name)
    .filter((name): name is string => {
      const normalized = normalizeSummaryName(name).toLowerCase();
      return Boolean(normalized) && normalized !== 'none';
    });
  return summarizeNamedSelections(names);
};

const getEquipmentPackageLabel = (equipment: Proposal['equipment']): string | null => {
  const selectedPackage = getSelectedEquipmentPackage(equipment as any);
  if (!selectedPackage) return null;

  const packageName = normalizeSummaryName(selectedPackage.name);
  if (!packageName) {
    return selectedPackage.mode === 'custom' ? 'Custom Equipment Package' : null;
  }

  if (selectedPackage.mode !== 'custom') {
    return packageName;
  }

  const normalizedPackageName = packageName.toLowerCase();
  if (normalizedPackageName === 'custom') {
    return 'Custom Equipment Package';
  }

  return normalizedPackageName.includes('package') ? packageName : `${packageName} Equipment Package`;
};

const buildEquipmentSummary = (equipment: Proposal['equipment']) => {
  const selectedPackage = getSelectedEquipmentPackage(equipment as any);
  const packageSaltName = selectedPackage?.includedSaltSystemName;
  const effectiveSaltName = getEffectivePrimarySanitationSystemName(equipment as any);
  const packageIncludesSalt = hasNamedSelection(packageSaltName, 'no salt');
  const filterQuantity = equipment.filterQuantity ?? (hasNamedSelection(equipment.filter?.name, 'no filter') ? 1 : 0);
  const cleanerQuantity =
    equipment.cleanerQuantity ?? (hasNamedSelection(equipment.cleaner?.name, 'no cleaner') ? 1 : 0);
  const heaterQuantity = equipment.heaterQuantity ?? (hasNamedSelection(equipment.heater?.name, 'no heater') ? 1 : 0);
  const automationQuantity =
    equipment.automationQuantity ?? (hasNamedSelection(equipment.automation?.name, 'no automation') ? 1 : 0);
  const saltQuantity = Math.max(
    packageIncludesSalt
      ? Math.max(selectedPackage?.includedSaltSystemQuantity ?? 1, 1)
      : equipment.saltSystemQuantity ??
          (equipment.saltSystem?.name
            ? 1
            : hasNamedSelection(effectiveSaltName, 'no salt')
            ? 1
            : 0),
    0
  );
  const autoFillQuantity = Math.max(
    equipment.autoFillSystemQuantity ?? (hasNamedSelection(equipment.autoFillSystem?.name, 'no auto') ? 1 : 0),
    0
  );

  return {
    equipmentPackageLabel: getEquipmentPackageLabel(equipment),
    pumpSummary: summarizePumpSelection(equipment),
    filterSummary: summarizeSelectionWithQuantity(equipment.filter?.name, filterQuantity, 'no filter'),
    heaterSummary: summarizeSelectionWithQuantity(equipment.heater?.name, heaterQuantity, 'no heater'),
    cleanerSummary: summarizeSelectionWithQuantity(equipment.cleaner?.name, cleanerQuantity, 'no cleaner'),
    automationSummary: summarizeSelectionWithQuantity(
      equipment.automation?.name,
      automationQuantity,
      'no automation'
    ),
    sanitationSummary: (() => {
      const primarySummary = equipment.saltSystem?.includedSaltCellPlaceholder
        ? equipment.saltSystem.name
        : summarizeSelectionWithQuantity(effectiveSaltName, saltQuantity, 'no salt');
      const additionalSummary = hasNamedSelection(equipment.additionalSaltSystem?.name, 'no salt')
        ? normalizeSummaryName(equipment.additionalSaltSystem?.name)
        : '';
      if (!additionalSummary) return primarySummary;
      return primarySummary === 'None' ? additionalSummary : `${primarySummary} + ${additionalSummary}`;
    })(),
    autoFillSummary: summarizeSelectionWithQuantity(equipment.autoFillSystem?.name, autoFillQuantity, 'no auto'),
    poolLightSummary: summarizePoolLightSelection(equipment.poolLights),
  };
};

const resolveOverflowTooltipText = (children: ReactNode, tooltipText?: string): string => {
  if (typeof tooltipText === 'string') {
    return tooltipText.trim();
  }

  if (typeof children === 'string' || typeof children === 'number') {
    return String(children).trim();
  }

  return '';
};

const setOverflowTooltip: MouseEventHandler<HTMLElement> = (event) => {
  const target = event.currentTarget;
  const isOverflowing = target.scrollWidth > target.clientWidth || target.scrollHeight > target.clientHeight;

  if (!isOverflowing) {
    target.removeAttribute('title');
    return;
  }

  const fullText = target.dataset.fullText?.trim() || target.textContent?.trim() || '';
  if (fullText) {
    target.title = fullText;
    return;
  }

  target.removeAttribute('title');
};

type OverflowTooltipTextProps = {
  as?: 'span' | 'p';
  className?: string;
  children: ReactNode;
  tooltipText?: string;
};

const OverflowTooltipText = ({
  as = 'span',
  className,
  children,
  tooltipText,
}: OverflowTooltipTextProps) => {
  const fullText = resolveOverflowTooltipText(children, tooltipText);

  if (as === 'p') {
    return (
      <p className={className} data-full-text={fullText || undefined} onMouseEnter={setOverflowTooltip}>
        {children}
      </p>
    );
  }

  return (
    <span className={className} data-full-text={fullText || undefined} onMouseEnter={setOverflowTooltip}>
      {children}
    </span>
  );
};

function ProposalView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { proposalNumber } = useParams();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [versions, setVersions] = useState<Proposal[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string>('original');
  const [loading, setLoading] = useState(true);
  const [customerBreakdownVersionId, setCustomerBreakdownVersionId] = useState<string | null>(null);
  const [cogsBreakdownVersionId, setCogsBreakdownVersionId] = useState<string | null>(null);
  const [preCogsBreakdownVersionId, setPreCogsBreakdownVersionId] = useState<string | null>(null);
  const [offContractVersionId, setOffContractVersionId] = useState<string | null>(null);
  const [contractVersionId, setContractVersionId] = useState<string | null>(null);
  const [breakdownExportOpen, setBreakdownExportOpen] = useState(false);
  const [breakdownExporting, setBreakdownExporting] = useState(false);
  const [breakdownExportActive, setBreakdownExportActive] = useState(false);
  const [contractExportOpen, setContractExportOpen] = useState(false);
  const [contractDirty, setContractDirty] = useState(false);
  const [contractExporting, setContractExporting] = useState(false);
  const [contractSaving, setContractSaving] = useState(false);
  const [showVersionNameModal, setShowVersionNameModal] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitNote, setSubmitNote] = useState('');
  const [showWorkflowMessageComposer, setShowWorkflowMessageComposer] = useState(false);
  const [workflowMessageDraft, setWorkflowMessageDraft] = useState('');
  const [workflowMessageSaving, setWorkflowMessageSaving] = useState(false);
  const proposalRef = useRef<HTMLDivElement>(null);
  const breakdownExportControlRef = useRef<HTMLDivElement>(null);
  const breakdownExportAreaRef = useRef<HTMLDivElement>(null);
  const contractExportControlRef = useRef<HTMLDivElement>(null);
  const contractViewRef = useRef<ContractViewHandle | null>(null);
  const retailAdjustmentsSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warrantySectionsSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showToast } = useToast();
  const sessionRole = getSessionRole();
  const isProposalEditingRestricted = isMasterActingAsOwnerSession();
  const isReviewerRole = sessionRole === 'owner' || sessionRole === 'admin' || sessionRole === 'bookkeeper';
  const isReadOnlyReviewerView = isReviewerRole;
  const canViewFullSummary =
    sessionRole === 'master' || sessionRole === 'admin' || sessionRole === 'owner' || sessionRole === 'bookkeeper';
  const { hideCogsFromProposalBuilder } = useAdminCogsView();
  const canViewCogsBreakdown = canViewFullSummary && !hideCogsFromProposalBuilder;
  const activeEditableVersion =
    (versions.length
      ? versions.find((entry) => (entry.versionId || 'original') === activeVersionId)
      : proposal) || proposal;
  const proposalWorkflowStatus = getWorkflowStatus(proposal);
  const canManageVersionDrafts =
    !isProposalEditingRestricted &&
    !isReadOnlyReviewerView &&
    proposalWorkflowStatus !== 'completed';
  const canEditProposal =
    canManageVersionDrafts &&
    Boolean(activeEditableVersion) &&
    !isSubmittedVersionLocked(activeEditableVersion);
  const canSendWorkflowMessages = Boolean(proposal?.workflow?.submittedAt) && proposalWorkflowStatus !== 'completed';
  const editDisabledReason =
    isProposalEditingRestricted
      ? 'Master accounts acting as owner can view proposals but cannot edit them.'
      : isReadOnlyReviewerView
      ? 'Reviewer accounts can review submitted proposals but cannot edit their versions.'
      : proposalWorkflowStatus === 'completed'
      ? 'Completed proposals are locked.'
      : isSubmittedVersionLocked(activeEditableVersion)
      ? 'Submitted versions are locked. Create a new version to make changes.'
      : undefined;
  const franchiseLogoId = proposal?.franchiseId;
  const canSubmitProposal = Boolean(proposal?.customerInfo.customerName?.trim());
  const mergeProposalWithDefaults = (input: Partial<Proposal>): Partial<Proposal> => {
    const base = getDefaultProposal();
    const poolSpecs = { ...getDefaultPoolSpecs(), ...(input.poolSpecs || {}) };
    const mergedEquipment = normalizeEquipmentLighting(
      { ...getDefaultEquipment(), ...(input.equipment || {}) } as any,
      { poolSpecs, hasSpa: poolSpecs.spaType !== 'none' }
    );

    return {
      ...(base as Proposal),
      ...input,
      customerInfo: { ...(base.customerInfo || {}), ...(input.customerInfo || {}) } as Proposal['customerInfo'],
      poolSpecs,
      excavation: { ...getDefaultExcavation(), ...(input.excavation || {}) },
      plumbing: { ...getDefaultPlumbing(), ...(input.plumbing || {}) },
      electrical: { ...getDefaultElectrical(), ...(input.electrical || {}) },
      tileCopingDecking: { ...getDefaultTileCopingDecking(), ...(input.tileCopingDecking || {}) },
      drainage: { ...getDefaultDrainage(), ...(input.drainage || {}) },
      equipment: mergedEquipment,
      waterFeatures: { ...getDefaultWaterFeatures(), ...(input.waterFeatures || {}) },
      customFeatures: normalizeCustomFeatures(input.customFeatures),
      interiorFinish: { ...getDefaultInteriorFinish(), ...(input.interiorFinish || {}) },
      manualAdjustments: { ...getDefaultManualAdjustments(), ...(input.manualAdjustments || {}) },
      retailAdjustments: mergeRetailAdjustments(input.retailAdjustments),
      papDiscounts: input.papDiscounts || (base as any).papDiscounts,
      contractOverrides: (input as Proposal).contractOverrides || (base as Proposal).contractOverrides || {},
      warrantySections: normalizeWarrantySectionsSetting(input.warrantySections),
    };
  };

  useEffect(() => {
    if (canViewCogsBreakdown) return;
    if (cogsBreakdownVersionId) setCogsBreakdownVersionId(null);
    if (preCogsBreakdownVersionId) setPreCogsBreakdownVersionId(null);
  }, [canViewCogsBreakdown, cogsBreakdownVersionId, preCogsBreakdownVersionId]);

  const loadProposal = async (num: string) => {
    try {
      const data = await getProposalRemote(num);
      if (!data) {
        showToast({
          type: 'error',
          message: 'Proposal not found or access denied.',
        });
        navigate('/', { replace: true });
        return;
      }
      let sourceProposal = ensureProposalWorkflow(JSON.parse(JSON.stringify(data)) as Proposal);
      const currentUserId = readSession()?.userId;
      const readUpdated = markWorkflowRead(sourceProposal, currentUserId);
      if (JSON.stringify(readUpdated.workflow?.history || []) !== JSON.stringify(sourceProposal.workflow?.history || [])) {
        try {
          sourceProposal = await saveProposalRemote(readUpdated);
        } catch (markReadError) {
          console.warn('Failed to persist workflow read state', markReadError);
          sourceProposal = readUpdated;
        }
      }
      const pricingCache = new Map<string, Awaited<ReturnType<typeof loadPricingSnapshotForFranchise>>>();
      const mergeWithPricingSnapshot = async (input: Partial<Proposal>): Promise<Partial<Proposal>> => {
        const resolvedFranchiseId = input.franchiseId || sourceProposal.franchiseId || 'default';
        const pricingModelId = input.pricingModelId || undefined;
        const pricingModelFranchiseId = input.pricingModelFranchiseId || undefined;
        const pricingCacheKey = `${resolvedFranchiseId}::${pricingModelFranchiseId || resolvedFranchiseId}::${pricingModelId || 'default'}`;
        let pricingSnapshot = pricingCache.get(pricingCacheKey);
        if (!pricingSnapshot) {
          pricingSnapshot = await loadPricingSnapshotForFranchise(
            resolvedFranchiseId,
            pricingModelId,
            pricingModelFranchiseId
          );
          pricingCache.set(pricingCacheKey, pricingSnapshot);
        }
        return withTemporaryPricingSnapshot(pricingSnapshot.pricing, () => mergeProposalWithDefaults(input));
      };

      const activeApplied = ensureProposalWorkflow(applyActiveVersion(sourceProposal));
      const allVersions = (
        await Promise.all(
          listAllVersions(sourceProposal).map(async (v) => ({
            ...((await mergeWithPricingSnapshot(v)) as Proposal),
            versionId: v.versionId || 'original',
            versionName: v.versionName || (v.isOriginalVersion ? 'Original Version' : 'Version'),
            isOriginalVersion: v.isOriginalVersion,
            activeVersionId: v.activeVersionId,
            versions: [],
          }))
        )
      ) as Proposal[];
      const requestedVersionId = (location.state as any)?.versionId as string | undefined;
      const reviewerVisibleVersionIds = isReadOnlyReviewerView
        ? new Set(getReviewerVisibleVersions(sourceProposal).map((entry) => entry.versionId || 'original'))
        : null;
      const reviewerPrimaryVersionId = isReadOnlyReviewerView
        ? getReviewerPrimaryVersionId(sourceProposal)
        : null;
      const requestedVisibleVersionId =
        requestedVersionId &&
        (!reviewerVisibleVersionIds || reviewerVisibleVersionIds.has(requestedVersionId))
          ? requestedVersionId
          : undefined;
      const activeId =
        requestedVisibleVersionId ||
        reviewerPrimaryVersionId ||
        activeApplied.activeVersionId ||
        activeApplied.versionId ||
        'original';
      const activeVersion =
        allVersions.find((v) => v.versionId === activeId) ||
        ((await mergeWithPricingSnapshot(activeApplied)) as Proposal);

      await initPricingDataStore(
        activeVersion.franchiseId,
        activeVersion.pricingModelId || undefined,
        activeVersion.pricingModelFranchiseId || undefined
      );

      setVersions(allVersions);
      setActiveVersionId(activeId);
      setProposal(ensureProposalWorkflow({ ...(activeVersion as Proposal), workflow: sourceProposal.workflow, status: sourceProposal.status }));
    } catch (error) {
      console.error('Failed to load proposal:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (proposalNumber) {
      loadProposal(proposalNumber);
    }
  }, [location.state, navigate, proposalNumber, showToast]);

  useEffect(() => {
    if (!breakdownExportOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (breakdownExportControlRef.current && !breakdownExportControlRef.current.contains(event.target as Node)) {
        setBreakdownExportOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [breakdownExportOpen]);

  useEffect(() => {
    if (!customerBreakdownVersionId) {
      setBreakdownExportOpen(false);
      setBreakdownExporting(false);
      setBreakdownExportActive(false);
    }
  }, [customerBreakdownVersionId]);

  useEffect(() => {
    if (!contractExportOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (contractExportControlRef.current && !contractExportControlRef.current.contains(event.target as Node)) {
        setContractExportOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contractExportOpen]);

  useEffect(() => {
    if (!contractVersionId) {
      setContractExportOpen(false);
      setContractDirty(false);
      setContractExporting(false);
      setContractSaving(false);
    }
  }, [contractVersionId]);

  useEffect(() => {
    return () => {
      if (retailAdjustmentsSaveRef.current) {
        clearTimeout(retailAdjustmentsSaveRef.current);
      }
      if (warrantySectionsSaveRef.current) {
        clearTimeout(warrantySectionsSaveRef.current);
      }
    };
  }, []);

  const buildContainerFromVersions = (
    nextVersions: Proposal[],
    desiredActiveId?: string,
    statusOverride?: Proposal['status']
  ): Proposal | null => {
    if (!proposal) return null;
    const resolvedActiveId =
      desiredActiveId || activeVersionId || proposal.activeVersionId || proposal.versionId || 'original';
    const active =
      nextVersions.find((entry) => (entry.versionId || 'original') === resolvedActiveId) ||
      nextVersions[0];
    if (!active) return null;
    const others = nextVersions.filter(
      (entry) => (entry.versionId || 'original') !== (active.versionId || 'original')
    );
    return ensureProposalWorkflow({
      ...(active as Proposal),
      status: statusOverride || getWorkflowStatus(proposal),
      activeVersionId: resolvedActiveId,
      versions: others.map((entry) => ({ ...entry, versions: [] })),
      workflow: proposal.workflow,
    });
  };

  const handleEdit = (version?: Proposal) => {
    if (!canManageVersionDrafts) return;
    if (!version || isSubmittedVersionLocked(version) || proposalWorkflowStatus === 'completed') return;
    const targetVersionId = version?.versionId || proposal?.versionId || 'original';
    navigate(`/proposal/edit/${proposalNumber}`, { state: { versionId: targetVersionId, versionName: version?.versionName } });
  };

  const handleSetActiveVersion = async (versionId: string) => {
    if (!canManageVersionDrafts) return;
    if (!proposal) return;
    const all = versions.length ? versions : listAllVersions(proposal as Proposal);
    const target = all.find((v) => (v.versionId || 'original') === versionId);
    if (!target) return;

    try {
      const container = buildContainerFromVersions(
        all.map((entry) => ({ ...entry, versions: [] })),
        versionId
      );
      if (!container) return;
      await initPricingDataStore(
        container.franchiseId,
        container.pricingModelId || undefined,
        container.pricingModelFranchiseId || undefined
      );
      const saved = await saveProposalRemote(container);
      const updatedVersions = listAllVersions(saved as Proposal).map((v) => ({
        ...(mergeProposalWithDefaults(v) as Proposal),
        versionId: v.versionId || 'original',
        versionName: v.versionName || (v.isOriginalVersion ? 'Original Version' : 'Version'),
        isOriginalVersion: v.isOriginalVersion,
        activeVersionId: v.activeVersionId,
        versions: [],
      }));
      const activeApplied = ensureProposalWorkflow(applyActiveVersion(saved as Proposal));
      setActiveVersionId(versionId);
      setVersions(updatedVersions);
      setProposal(activeApplied as Proposal);
      showToast({ type: 'success', message: 'Active version updated.' });
    } catch (error) {
      console.error('Failed to set active version', error);
      showToast({ type: 'error', message: 'Could not set active version.' });
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if (!canManageVersionDrafts) return;
    if (!proposal) return;
    const all = versions.length ? versions : listAllVersions(proposal as Proposal);
    if (all.length <= 1) {
      showToast({ type: 'warning', message: 'Cannot delete the only version.' });
      return;
    }
    const target = all.find((v) => (v.versionId || 'original') === versionId);
    if (!target || (target.isOriginalVersion ?? versionId === 'original')) {
      showToast({ type: 'warning', message: 'The original version cannot be deleted.' });
      return;
    }
    if (isSubmittedVersionLocked(target)) {
      showToast({ type: 'warning', message: 'Submitted versions cannot be deleted.' });
      return;
    }

    const remaining = all.filter((v) => (v.versionId || 'original') !== versionId);
    const nextActive = remaining.find((v) => (v.versionId || 'original') === activeVersionId) || remaining[0];

    try {
      const container = buildContainerFromVersions(
        remaining.map((entry) => ({ ...entry, versions: [] })),
        nextActive.versionId || 'original'
      );
      if (!container) return;
      await initPricingDataStore(
        container.franchiseId,
        container.pricingModelId || undefined,
        container.pricingModelFranchiseId || undefined
      );
      const saved = await saveProposalRemote(container);
      const updatedVersions = listAllVersions(saved as Proposal).map((v) => ({
        ...(mergeProposalWithDefaults(v) as Proposal),
        versionId: v.versionId || 'original',
        versionName: v.versionName || (v.isOriginalVersion ? 'Original Version' : 'Version'),
        isOriginalVersion: v.isOriginalVersion,
        activeVersionId: v.activeVersionId,
        versions: [],
      }));
      const activeApplied = ensureProposalWorkflow(applyActiveVersion(saved as Proposal));
      setActiveVersionId(activeApplied.activeVersionId || nextActive.versionId || 'original');
      setVersions(updatedVersions);
      setProposal(activeApplied as Proposal);
      showToast({ type: 'success', message: 'Version deleted.' });
    } catch (error) {
      console.error('Failed to delete version', error);
      showToast({ type: 'error', message: 'Could not delete version.' });
    }
  };

  const handleBuildAnotherVersion = async () => {
    if (!canManageVersionDrafts) {
      showToast({ type: 'warning', message: editDisabledReason || 'This proposal is view only.' });
      return;
    }
    if (!proposal) return;
    if (getWorkflowStatus(proposal) === 'completed') {
      showToast({ type: 'warning', message: 'Completed proposals cannot create new versions.' });
      return;
    }
    const count = (versions.length ? versions.length : listAllVersions(proposal as Proposal).length) + 1;
    const defaultPrefix = getApprovedVersionId(proposal as Proposal) ? 'Proposal Addendum' : 'Version';
    setNewVersionName(`${defaultPrefix} ${count}`);
    setShowVersionNameModal(true);
  };

  const handleConfirmCreateVersion = async () => {
    if (!canManageVersionDrafts) return;
    if (!proposal) return;
    try {
      const container = {
        ...ensureProposalWorkflow(proposal as Proposal),
        versions,
        activeVersionId,
      } as Proposal;
      const approvedVersionId = getApprovedVersionId(container);
      const pendingReviewVersionId = getPendingReviewVersionId(container);
      const sourceVersionId =
        pendingReviewVersionId ||
        approvedVersionId ||
        proposal.versionId ||
        activeVersionId;
      const { container: nextContainer } = createVersionFromProposal(
        container,
        sourceVersionId,
        newVersionName && newVersionName.trim() ? newVersionName.trim() : undefined
      );
      await initPricingDataStore(
        nextContainer.franchiseId,
        nextContainer.pricingModelId || undefined,
        nextContainer.pricingModelFranchiseId || undefined
      );
      const saved = await saveProposalRemote(nextContainer);
      const updatedVersions = listAllVersions(saved as Proposal).map((v) => ({
        ...(mergeProposalWithDefaults(v) as Proposal),
        versionId: v.versionId || 'original',
        versionName: v.versionName || (v.isOriginalVersion ? 'Original Version' : 'Version'),
        isOriginalVersion: v.isOriginalVersion,
        activeVersionId: v.activeVersionId,
        versions: [],
      }));
      const activeApplied = ensureProposalWorkflow(applyActiveVersion(saved as Proposal));
      setVersions(updatedVersions);
      setProposal(activeApplied as Proposal);
      setActiveVersionId(activeApplied.activeVersionId || activeVersionId);
      setShowVersionNameModal(false);
      showToast({ type: 'success', message: 'New version created.' });
    } catch (error) {
      console.error('Failed to build version', error);
      showToast({ type: 'error', message: 'Could not create a new version.' });
    }
  };

  const handleSaveContractOverrides = async (versionId: string, overrides: ContractOverrides) => {
    if (isProposalEditingRestricted) return;
    if (!proposal) return;
    try {
      const all = versions.length ? versions : listAllVersions(proposal as Proposal);
      const updated = all.map((v) => {
        const id = v.versionId || 'original';
        if (id !== versionId) return v;
        return {
          ...(v as Proposal),
          contractOverrides: overrides,
          lastModified: new Date().toISOString(),
        };
      });

      const desiredActiveId =
        activeVersionId ||
        (proposal as Proposal).activeVersionId ||
        (proposal as Proposal).versionId ||
        'original';
      const container = buildContainerFromVersions(updated, desiredActiveId);
      if (!container) return;

      await initPricingDataStore(
        container.franchiseId,
        container.pricingModelId || undefined,
        container.pricingModelFranchiseId || undefined
      );
      const saved = await saveProposalRemote(container);
      const updatedVersions = listAllVersions(saved as Proposal).map((v) => ({
        ...(mergeProposalWithDefaults(v) as Proposal),
        versionId: v.versionId || 'original',
        versionName: v.versionName || (v.isOriginalVersion ? 'Original Version' : 'Version'),
        isOriginalVersion: v.isOriginalVersion,
        activeVersionId: v.activeVersionId,
        versions: [],
      }));
      const activeApplied = ensureProposalWorkflow(applyActiveVersion(saved as Proposal));
      setVersions(updatedVersions);
      setProposal(activeApplied as Proposal);
      setActiveVersionId(activeApplied.activeVersionId || desiredActiveId);
      showToast({ type: 'success', message: 'Contract overrides saved.' });
    } catch (error) {
      console.error('Failed to save contract overrides', error);
      showToast({ type: 'error', message: 'Could not save contract overrides.' });
    }
  };

  const scheduleRetailAdjustmentsSave = (updatedVersions: Proposal[]) => {
    if (retailAdjustmentsSaveRef.current) {
      clearTimeout(retailAdjustmentsSaveRef.current);
    }
    retailAdjustmentsSaveRef.current = setTimeout(() => {
      void persistRetailAdjustments(updatedVersions);
    }, 600);
  };

  const scheduleWarrantySectionsSave = (updatedVersions: Proposal[]) => {
    if (warrantySectionsSaveRef.current) {
      clearTimeout(warrantySectionsSaveRef.current);
    }
    warrantySectionsSaveRef.current = setTimeout(() => {
      void persistWarrantySections(updatedVersions);
    }, 600);
  };

  const persistRetailAdjustments = async (updatedVersions: Proposal[]) => {
    if (!proposal) return;
    try {
      const normalizedVersions = updatedVersions.map((v) => ({
        ...(mergeProposalWithDefaults(v) as Proposal),
        versions: [],
      }));
      const desiredActiveId =
        activeVersionId ||
        (proposal as Proposal).activeVersionId ||
        (proposal as Proposal).versionId ||
        'original';
      const active =
        normalizedVersions.find((v) => (v.versionId || 'original') === desiredActiveId) ||
        normalizedVersions[0];
      if (!active) return;
      const container = buildContainerFromVersions(normalizedVersions, desiredActiveId);
      if (!container) return;
      await initPricingDataStore(
        container.franchiseId,
        container.pricingModelId || undefined,
        container.pricingModelFranchiseId || undefined
      );
      const saved = await saveProposalRemote(container);
      const updated = listAllVersions(saved as Proposal).map((v) => ({
        ...(mergeProposalWithDefaults(v) as Proposal),
        versionId: v.versionId || 'original',
        versionName: v.versionName || (v.isOriginalVersion ? 'Original Version' : 'Version'),
        isOriginalVersion: v.isOriginalVersion,
        activeVersionId: v.activeVersionId,
        versions: [],
      }));
      const activeApplied = ensureProposalWorkflow(applyActiveVersion(saved as Proposal));
      setVersions(updated);
      setActiveVersionId(activeApplied.activeVersionId || active.versionId || 'original');
      setProposal(activeApplied as Proposal);
    } catch (error) {
      console.error('Failed to save retail adjustments', error);
      showToast({ type: 'error', message: 'Could not save retail adjustments.' });
    }
  };

  const persistWarrantySections = async (updatedVersions: Proposal[]) => {
    if (!proposal) return;
    try {
      const normalizedVersions = updatedVersions.map((version) => ({
        ...(mergeProposalWithDefaults(version) as Proposal),
        versions: [],
      }));
      const desiredActiveId =
        activeVersionId ||
        (proposal as Proposal).activeVersionId ||
        (proposal as Proposal).versionId ||
        'original';
      const active =
        normalizedVersions.find((version) => (version.versionId || 'original') === desiredActiveId) ||
        normalizedVersions[0];
      if (!active) return;
      const container = buildContainerFromVersions(normalizedVersions, desiredActiveId);
      if (!container) return;
      await initPricingDataStore(
        container.franchiseId,
        container.pricingModelId || undefined,
        container.pricingModelFranchiseId || undefined
      );
      const saved = await saveProposalRemote(container);
      const updated = listAllVersions(saved as Proposal).map((version) => ({
        ...(mergeProposalWithDefaults(version) as Proposal),
        versionId: version.versionId || 'original',
        versionName: version.versionName || (version.isOriginalVersion ? 'Original Version' : 'Version'),
        isOriginalVersion: version.isOriginalVersion,
        activeVersionId: version.activeVersionId,
        versions: [],
      }));
      const activeApplied = ensureProposalWorkflow(applyActiveVersion(saved as Proposal));
      setVersions(updated);
      setActiveVersionId(activeApplied.activeVersionId || active.versionId || 'original');
      setProposal(activeApplied as Proposal);
    } catch (error) {
      console.error('Failed to save warranty content', error);
      showToast({ type: 'error', message: 'Could not save warranty content.' });
    }
  };

  const handleRetailAdjustmentsChange = (versionId: string, nextAdjustments: RetailAdjustment[]) => {
    if (!proposal) return;
    const normalizedAdjustments = mergeRetailAdjustments(nextAdjustments);
    const all = versions.length ? versions : listAllVersions(proposal as Proposal);
    const updatedVersions = all.map((v) => {
      const id = v.versionId || 'original';
      if (id !== versionId) return v;
      return {
        ...(v as Proposal),
        retailAdjustments: normalizedAdjustments,
        lastModified: new Date().toISOString(),
      };
    });

    setVersions(updatedVersions);
    setProposal((prev) => {
      if (!prev) return prev;
      const id = prev.versionId || 'original';
      if (id !== versionId) return prev;
      return {
        ...prev,
        retailAdjustments: normalizedAdjustments,
        lastModified: new Date().toISOString(),
      };
    });

    scheduleRetailAdjustmentsSave(updatedVersions);
  };

  const handleWarrantySectionsChange = (
    versionId: string,
    nextSections: Proposal['warrantySections']
  ) => {
    if (!proposal) return;
    const all = versions.length ? versions : listAllVersions(proposal as Proposal);
    const updatedVersions = all.map((version) => {
      const id = version.versionId || 'original';
      if (id !== versionId) return version;
      return {
        ...(version as Proposal),
        warrantySections: nextSections,
        lastModified: new Date().toISOString(),
      };
    });

    setVersions(updatedVersions);
    setProposal((prev) => {
      if (!prev) return prev;
      const id = prev.versionId || 'original';
      if (id !== versionId) return prev;
      return {
        ...prev,
        warrantySections: nextSections,
        lastModified: new Date().toISOString(),
      };
    });

    scheduleWarrantySectionsSave(updatedVersions);
  };

  const handleBreakdownExportToggle = () => {
    setBreakdownExportOpen((prev) => !prev);
  };

  const getBreakdownExportFilename = () => {
    const customerName =
      customerModalView?.proposal?.customerInfo?.customerName ||
      proposal?.customerInfo?.customerName ||
      'Proposal';
    const today = new Date();
    const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate()
    ).padStart(2, '0')}`;
    return `${customerName}-job-cost-summary-warranty-${formattedDate}.pdf`;
  };

  const prepareBreakdownExport = async () => {
    setBreakdownExportActive(true);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  };

  const handleBreakdownPrint = async () => {
    if (breakdownExporting) return;
    setBreakdownExportOpen(false);
    setBreakdownExporting(true);
    try {
      await prepareBreakdownExport();
    } catch (error) {
      console.error('Failed to prepare breakdown export', error);
      showToast({ type: 'error', message: 'Could not prepare breakdown export.' });
      setBreakdownExporting(false);
      setBreakdownExportActive(false);
      return;
    }

    let didCleanup = false;
    const cleanup = () => {
      if (didCleanup) return;
      didCleanup = true;
      document.body.classList.remove('breakdown-print-mode');
      setBreakdownExportActive(false);
      setBreakdownExporting(false);
      window.removeEventListener('afterprint', cleanup);
    };

    document.body.classList.add('breakdown-print-mode');
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 1200);
  };

  const exportBreakdownPdfFallback = async (filename: string) => {
    const exportArea = breakdownExportAreaRef.current;
    const pages = exportArea
      ? Array.from(exportArea.querySelectorAll('.export-breakdown-page'))
      : [];
    if (!pages.length) {
      throw new Error('No breakdown pages available for export.');
    }

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    for (let i = 0; i < pages.length; i += 1) {
      const canvas = await html2canvas(pages[i] as HTMLElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        ignoreElements: (element) => element.tagName === 'IMG',
      });
      const imgData = canvas.toDataURL('image/png');
      if (i > 0) {
        pdf.addPage();
      }
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
    }

    pdf.save(filename);
  };

  const exportBreakdownPdf = async () => {
    const filename = getBreakdownExportFilename();
    setBreakdownExporting(true);
    try {
      await prepareBreakdownExport();
      document.body.classList.add('breakdown-print-mode');
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

      if (window.electron?.exportBreakdownPdf) {
        const result = await window.electron.exportBreakdownPdf({ filename });
        if (result?.canceled) return;
        if (!result?.filePath) throw new Error('No breakdown PDF file was saved.');
      } else {
        await exportBreakdownPdfFallback(filename);
      }

      showToast({ type: 'success', message: 'Breakdown PDF generated.' });
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to export breakdown PDF', error);
        showToast({ type: 'error', message: 'Could not export breakdown PDF.' });
      }
    } finally {
      document.body.classList.remove('breakdown-print-mode');
      setBreakdownExporting(false);
      setBreakdownExportActive(false);
    }
  };

  const handleBreakdownPdf = () => {
    if (breakdownExporting) return;
    setBreakdownExportOpen(false);
    void exportBreakdownPdf();
  };

  const handleContractSaveClick = () => {
    if (contractSaving) return;
    void contractViewRef.current?.saveOverrides();
  };

  const handleContractExportToggle = () => {
    if (contractExporting || contractSaving) return;
    setContractExportOpen((prev) => !prev);
  };

  const handleContractPrint = () => {
    setContractExportOpen(false);
    if (!contractViewRef.current) return;
    void contractViewRef.current.printContract();
  };

  const handleContractPdf = () => {
    setContractExportOpen(false);
    if (!contractViewRef.current) return;
    void contractViewRef.current.exportPdf();
  };

  const persistStatusChange = async (
    nextStatus: 'draft' | 'submitted',
    submissionRequest?: { manualReviewRequested: boolean; note: string }
  ) => {
    if (!proposal) return;
    try {
      const all = versions.length ? versions : listAllVersions(proposal as Proposal);
      const desiredActiveId =
        activeVersionId ||
        (proposal as Proposal).activeVersionId ||
        (proposal as Proposal).versionId ||
        'original';
      const normalizedVersions = all.map((v) => ({
        ...(mergeProposalWithDefaults(v) as Proposal),
        versions: [],
      }));
      const active =
        normalizedVersions.find((v) => (v.versionId || 'original') === desiredActiveId) ||
        normalizedVersions[0];
      if (!active) return;

      const container = buildContainerFromVersions(
        normalizedVersions,
        active.versionId || 'original',
        nextStatus === 'draft' ? 'draft' : getWorkflowStatus(proposal)
      );
      if (!container) return;
      const payload =
        nextStatus === 'submitted'
          ? submitProposalForWorkflow(container, active.versionId || 'original', {
              manualReviewRequested: submissionRequest?.manualReviewRequested,
              message: submissionRequest?.note,
            })
          : container;

      await initPricingDataStore(
        container.franchiseId,
        container.pricingModelId || undefined,
        container.pricingModelFranchiseId || undefined
      );
      const saved = await saveProposalRemote(payload);
      const updatedVersions = listAllVersions(saved as Proposal).map((v) => ({
        ...(mergeProposalWithDefaults(v) as Proposal),
        versionId: v.versionId || 'original',
        versionName: v.versionName || (v.isOriginalVersion ? 'Original Version' : 'Version'),
        isOriginalVersion: v.isOriginalVersion,
        activeVersionId: v.activeVersionId,
        versions: [],
      }));
      const activeApplied = ensureProposalWorkflow(applyActiveVersion(saved as Proposal));
      const isPending = (saved as any).syncStatus === 'pending';
      setVersions(updatedVersions);
      setActiveVersionId(activeApplied.activeVersionId || active.versionId || 'original');
      setProposal(activeApplied as Proposal);
      const savedWorkflowStatus = getWorkflowStatus(saved as Proposal);
      showToast({
        type: isPending ? 'warning' : 'success',
        message:
          nextStatus === 'submitted'
            ? isPending
              ? 'Saved locally. Will submit when back online.'
              : savedWorkflowStatus === 'needs_approval'
              ? 'Proposal submitted for approval.'
              : 'Proposal submitted successfully.'
            : isPending
            ? 'Saved locally. Will sync when back online.'
            : 'Proposal saved as draft.',
      });
    } catch (error) {
      console.error('Failed to update proposal status', error);
      showToast({ type: 'error', message: 'Could not update proposal status.' });
    }
  };

  const handleOpenSubmitModal = () => {
    if (!proposal) return;
    setSubmitNote('');
    setShowSubmitModal(true);
  };

  const handleSubmitProposal = async () => {
    if (!proposal) return;
    if (!canSubmitProposal) {
      showToast({ type: 'error', message: 'Customer name is required to submit.' });
      return;
    }
    const errors = validateProposal(proposal);
    if (errors.length > 0) {
      showToast({
        type: 'error',
        message: `Validation errors: ${errors.map((e) => e.message).join(', ')}`,
      });
      return;
    }
    handleOpenSubmitModal();
  };

  const handleConfirmSubmit = async () => {
    setShowSubmitModal(false);
    await persistStatusChange('submitted', {
      manualReviewRequested: false,
      note: submitNote,
    });
  };

  const handleSendWorkflowMessage = async () => {
    const trimmedMessage = workflowMessageDraft.trim();
    if (!proposal || !canSendWorkflowMessages || !trimmedMessage || workflowMessageSaving) return;

    setWorkflowMessageSaving(true);
    try {
      const all = versions.length ? versions : listAllVersions(proposal as Proposal);
      const normalizedVersions = all.map((version) => ({
        ...(mergeProposalWithDefaults(version) as Proposal),
        versions: [],
      }));
      const desiredActiveId =
        activeVersionId ||
        (proposal as Proposal).activeVersionId ||
        (proposal as Proposal).versionId ||
        'original';
      const container = buildContainerFromVersions(normalizedVersions, desiredActiveId);
      if (!container) return;

      const payload = addWorkflowNote(container, trimmedMessage);
      await initPricingDataStore(
        container.franchiseId,
        container.pricingModelId || undefined,
        container.pricingModelFranchiseId || undefined
      );
      const saved = await saveProposalRemote(payload);
      const updatedVersions = listAllVersions(saved as Proposal).map((version) => ({
        ...(mergeProposalWithDefaults(version) as Proposal),
        versionId: version.versionId || 'original',
        versionName: version.versionName || (version.isOriginalVersion ? 'Original Version' : 'Version'),
        isOriginalVersion: version.isOriginalVersion,
        activeVersionId: version.activeVersionId,
        versions: [],
      }));
      const activeApplied = ensureProposalWorkflow(applyActiveVersion(saved as Proposal));
      const isPending = (saved as any).syncStatus === 'pending';

      setVersions(updatedVersions);
      setActiveVersionId(activeApplied.activeVersionId || desiredActiveId);
      setProposal(activeApplied as Proposal);
      setWorkflowMessageDraft('');
      setShowWorkflowMessageComposer(false);
      showToast({
        type: 'success',
        message: isPending ? 'Message saved locally. Will sync when back online.' : 'Message sent.',
      });
    } catch (error) {
      console.error('Failed to send workflow message', error);
      showToast({ type: 'error', message: 'Could not send message.' });
    } finally {
      setWorkflowMessageSaving(false);
    }
  };

  const formatCurrency = (value: number): string =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);

  const formatGrossMarginIndicator = (value?: number): string => {
    const safeValue = Number.isFinite(value) ? (value as number) : 0;
    const sign = safeValue < 0 ? '-' : '';
    const fixed = Math.abs(safeValue).toFixed(2);
    const [whole, decimal] = fixed.split('.');
    const paddedWhole = (whole || '0').padStart(2, '0');
    return `${sign}${paddedWhole}.${decimal}`;
  };

  const buildProposalIndicator = (value?: number): string =>
    `Proposal #26${formatGrossMarginIndicator(value)}`;

  const formatNumber = (value: number | undefined, suffix?: string): string => {
    if (!Number.isFinite(value)) return 'N/A';
    const num = value ?? 0;
    const formatted = num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return suffix ? `${formatted} ${suffix}` : formatted;
  };

  const formatWorkflowStatusLabel = (value?: string | null) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return 'Draft';
    return normalized.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  };

  const getDisplayVersionLabel = (input: Proposal): string => {
    const name = input.versionName?.trim() || '';
    const versionId = input.versionId || 'original';
    const isOriginal = input.isOriginalVersion ?? versionId === 'original';

    if (isOriginal) {
      const lower = name.toLowerCase();
      if (!name || lower === 'version' || lower === 'original version') {
        return 'Original';
      }
      return name;
    }

    return name || 'Version';
  };

  const getContractTypeLabel = (input: Proposal): string => {
    const templateId = getContractTemplateIdForProposal(input);
    const [state, poolType] = templateId.split('-');
    const typeLabel = poolType === 'fiberglass' ? 'Fiberglass' : 'Shotcrete';
    return `${state.toUpperCase()} ${typeLabel}`;
  };

  const buildViewModel = (input: Proposal) => {
    const mergedProposal = mergeProposalWithDefaults(input) as Proposal;
    let calculated: ReturnType<typeof MasterPricingEngine.calculateCompleteProposal> | null = null;
    try {
      calculated = MasterPricingEngine.calculateCompleteProposal(mergedProposal, mergedProposal.papDiscounts);
    } catch (error) {
      console.error('Failed to recalculate proposal for view:', error);
    }

    const costBreakdownForDisplay = calculated?.costBreakdown || mergedProposal.costBreakdown;
    const subtotal = calculated?.subtotal ?? mergedProposal.subtotal ?? 0;
    const totalCost = calculated?.totalCost ?? mergedProposal.totalCost ?? 0;
    const pricing = calculated?.pricing ?? mergedProposal.pricing;
    const offContractDeckingLineItems = costBreakdownForDisplay
      ? [
          ...(costBreakdownForDisplay.copingDeckingLabor || []),
          ...(costBreakdownForDisplay.copingDeckingMaterial || []),
        ]
      : [];
    const retailPrice = pricing?.retailPrice ?? totalCost ?? subtotal ?? 0;
    const offContractTotal =
      pricing?.offContractTotal ?? getOffContractTotal(mergedProposal, offContractDeckingLineItems);
    const retailPriceForMargin = Math.max(0, retailPrice - offContractTotal);
    const digCommission = pricing?.digCommission ?? 0;
    const adminFee = pricing?.adminFee ?? 0;
    const closeoutCommission = pricing?.closeoutCommission ?? 0;
    const totalCOGS =
      pricing?.totalCOGS ??
      costBreakdownForDisplay?.totals?.grandTotal ??
      totalCost ??
      subtotal ??
      0;
    const grossMargin =
      pricing?.grossProfitMargin ??
      (retailPriceForMargin > 0 ? ((retailPriceForMargin - totalCOGS) / retailPriceForMargin) * 100 : 0);
    const papDiscountTotal = costBreakdownForDisplay
      ? Object.entries(costBreakdownForDisplay).reduce((sum, [key, value]) => {
          if (key === 'totals') return sum;
          if (Array.isArray(value)) {
            const papSum = value.reduce((innerSum, item) => {
              const description = (item.description || '').toString().toLowerCase();
              return description.includes('pap discount') ? innerSum + (item.total ?? 0) : innerSum;
            }, 0);
            return sum + papSum;
          }
          return sum;
        }, 0)
      : 0;

    const overheadMultiplier = pricing?.overheadMultiplier ?? 1.01;
    const totalCOGSBeforeOverhead =
      pricing?.totalCostsBeforeOverhead ??
      (overheadMultiplier > 0 ? totalCOGS / overheadMultiplier : totalCOGS);
    const totalCOGSWithoutOverhead = Math.max(totalCOGSBeforeOverhead, 0);
    const overheadReductionFactor =
      totalCOGS > 0 ? Math.min(Math.max(totalCOGSWithoutOverhead / totalCOGS, 0), 1) : 1;
    const preOverheadGrossProfit =
      retailPriceForMargin - totalCOGSWithoutOverhead - digCommission - adminFee - closeoutCommission;
    const overheadDifferential = totalCOGS - totalCOGSWithoutOverhead;
    const preOverheadGrossMarginPercent =
      retailPriceForMargin > 0 ? (preOverheadGrossProfit / retailPriceForMargin) * 100 : 0;
    const targetMargin = pricing?.targetMargin ?? 0.7;
    const costsBeforePapDiscounts = (pricing?.totalCostsBeforeOverhead ?? subtotal ?? 0) - papDiscountTotal;
    const baseRetailPriceBeforePap =
      Math.ceil(((costsBeforePapDiscounts * overheadMultiplier) / targetMargin) / 10) * 10;
    const g3UpgradeCost = pricing?.g3UpgradeCost ?? 1250;
    const retailPriceBeforeDiscounts = baseRetailPriceBeforePap + g3UpgradeCost + offContractTotal;
    const retailSalePrice = retailPrice;
    const totalSavings = retailPriceBeforeDiscounts - retailSalePrice;
    const totalSavingsPercent = retailPriceBeforeDiscounts > 0 ? (totalSavings / retailPriceBeforeDiscounts) * 100 : 0;

    const displayNumber = mergedProposal.proposalNumber.replace('PROP-', '');
    const submissionDate = new Date(
      mergedProposal.createdDate || mergedProposal.lastModified || Date.now()
    ).toLocaleDateString();

    const customerLocation = mergedProposal.customerInfo.city
      ? `${mergedProposal.customerInfo.customerName} (${mergedProposal.customerInfo.city})`
      : mergedProposal.customerInfo.customerName;

    const proposalStatus = mergedProposal.status ? mergedProposal.status.charAt(0).toUpperCase() + mergedProposal.status.slice(1) : 'Draft';
    const dateModified = new Date(mergedProposal.lastModified || Date.now()).toLocaleDateString();

    // Designer name - using a placeholder for now, update with actual field when available
    const designerName = 'Design Team';

    // Get the pricing model used for this proposal
      const priceModel = mergedProposal.pricingModelName || 'No Pricing Model';
      const isPriceModelActive = mergedProposal.pricingModelIsDefault ?? false;
      const isPriceModelRemoved = (mergedProposal.pricingModelName || '').toLowerCase().includes('removed');
      const priceModelStatus = isPriceModelRemoved ? 'removed' : isPriceModelActive ? 'active' : 'inactive';
      const hasRetiredEquipmentSelections = hasRetiredEquipment(mergedProposal.equipment);

    const poolTypeLabel =
      mergedProposal.poolSpecs.poolType === 'gunite'
        ? 'Shotcrete (Custom)'
        : mergedProposal.poolSpecs.fiberglassModelName
        ? `Fiberglass - ${mergedProposal.poolSpecs.fiberglassModelName}`
        : 'Fiberglass';

    const approximateGallons = Number.isFinite(mergedProposal.poolSpecs.approximateGallons)
      ? mergedProposal.poolSpecs.approximateGallons.toLocaleString('en-US')
      : 'N/A';

    const hasSpaSelected = mergedProposal.poolSpecs.spaType !== 'none';
    const maxWidth = formatNumber(mergedProposal.poolSpecs.maxWidth, 'ft');
    const maxLength = formatNumber(mergedProposal.poolSpecs.maxLength, 'ft');
    const shallowDepth = formatNumber(mergedProposal.poolSpecs.shallowDepth, 'ft');
    const endDepth = formatNumber(mergedProposal.poolSpecs.endDepth, 'ft');
    const spaLength = hasSpaSelected ? formatNumber(mergedProposal.poolSpecs.spaLength, 'ft') : 'No Spa';
    const spaWidth = hasSpaSelected ? formatNumber(mergedProposal.poolSpecs.spaWidth, 'ft') : 'No Spa';
    const equipmentSummary = buildEquipmentSummary(mergedProposal.equipment);

    const tileLaborItems = costBreakdownForDisplay?.tileLabor || [];
    const tileMaterialItems = costBreakdownForDisplay?.tileMaterial || [];
    const { baseItems: tileLaborBase, customOptions: tileCustomFromLabor } = splitCustomOptions(tileLaborItems);
    const { baseItems: tileMaterialBase, customOptions: tileCustomFromMaterial } = splitCustomOptions(tileMaterialItems);
    const tileCustomOptions = [...tileCustomFromLabor, ...tileCustomFromMaterial];
    const offContractItemGroups = getOffContractItemGroups(mergedProposal, offContractDeckingLineItems);
    const offContractItemCount = offContractItemGroups.reduce((sum, group) => sum + group.items.length, 0);

    const costLineItems: {
      name: string;
      items: CostLineItem[];
      subcategories?: { name: string; items: CostLineItem[] }[];
      hideBaseItems?: boolean;
    }[] = costBreakdownForDisplay
      ? [
          { name: 'Plans & Engineering', items: costBreakdownForDisplay.plansAndEngineering },
          { name: 'Layout', items: costBreakdownForDisplay.layout },
          { name: 'Permit', items: costBreakdownForDisplay.permit },
          {
            name: 'Excavation',
            items: costBreakdownForDisplay.excavation,
            subcategories: buildLineItemSubcategories(costBreakdownForDisplay.excavation),
          },
          {
            name: 'Plumbing',
            items: costBreakdownForDisplay.plumbing,
            subcategories: buildLineItemSubcategories(costBreakdownForDisplay.plumbing),
          },
          { name: 'Gas', items: costBreakdownForDisplay.gas },
          { name: 'Steel', items: costBreakdownForDisplay.steel },
          {
            name: 'Electrical',
            items: costBreakdownForDisplay.electrical,
            subcategories: buildLineItemSubcategories(costBreakdownForDisplay.electrical),
          },
          {
            name: 'Shotcrete',
            items: [...costBreakdownForDisplay.shotcreteLabor, ...costBreakdownForDisplay.shotcreteMaterial],
            subcategories: [
              { name: 'Labor', items: costBreakdownForDisplay.shotcreteLabor },
              { name: 'Material', items: costBreakdownForDisplay.shotcreteMaterial },
            ].filter((sub) => sub.items.length > 0),
            hideBaseItems: true,
          },
          {
            name: 'Tile',
            items: [...tileLaborItems, ...tileMaterialItems],
            subcategories: [
              { name: 'Labor', items: tileLaborBase },
              { name: CUSTOM_OPTIONS_SUBCATEGORY, items: tileCustomOptions },
              { name: 'Material', items: tileMaterialBase },
            ].filter((sub) => sub.items.length > 0),
            hideBaseItems: true,
          },
          {
            name: 'Coping/Decking',
            items: [
              ...costBreakdownForDisplay.copingDeckingLabor,
              ...costBreakdownForDisplay.copingDeckingMaterial,
            ],
            subcategories: [
              { name: 'Labor', items: costBreakdownForDisplay.copingDeckingLabor },
              { name: 'Material', items: costBreakdownForDisplay.copingDeckingMaterial },
            ].filter((sub) => sub.items.length > 0),
            hideBaseItems: true,
          },
          {
            name: 'Stone/Rockwork',
            items: [
              ...costBreakdownForDisplay.stoneRockworkLabor,
              ...costBreakdownForDisplay.stoneRockworkMaterial,
            ],
            subcategories: [
              { name: 'Labor', items: costBreakdownForDisplay.stoneRockworkLabor },
              { name: 'Material', items: costBreakdownForDisplay.stoneRockworkMaterial },
            ].filter((sub) => sub.items.length > 0),
            hideBaseItems: true,
          },
          {
            name: 'Drainage',
            items: costBreakdownForDisplay.drainage,
            subcategories: buildLineItemSubcategories(costBreakdownForDisplay.drainage),
          },
          {
            name: 'Water Features',
            items: costBreakdownForDisplay.waterFeatures,
            subcategories: buildLineItemSubcategories(costBreakdownForDisplay.waterFeatures),
          },
          { name: 'Equipment Ordered', items: costBreakdownForDisplay.equipmentOrdered },
          {
            name: 'Equipment Set',
            items: costBreakdownForDisplay.equipmentSet,
            subcategories: buildLineItemSubcategories(costBreakdownForDisplay.equipmentSet),
          },
          { name: 'Cleanup', items: costBreakdownForDisplay.cleanup },
          {
            name: 'Interior Finish',
            items: costBreakdownForDisplay.interiorFinish,
            subcategories: buildLineItemSubcategories(costBreakdownForDisplay.interiorFinish),
          },
          { name: 'Water Truck', items: costBreakdownForDisplay.waterTruck },
          { name: 'Fiberglass Shell', items: costBreakdownForDisplay.fiberglassShell },
          { name: 'Fiberglass Install', items: costBreakdownForDisplay.fiberglassInstall },
          { name: 'Startup/Orientation', items: costBreakdownForDisplay.startupOrientation },
          { name: 'Custom Features', items: costBreakdownForDisplay.customFeatures },
        ].filter((category) => (category.items || []).length > 0)
      : [];

    const adjustItemForNoOverhead = (item: CostLineItem): CostLineItem => ({
      ...item,
      unitPrice: (item.unitPrice ?? 0) * overheadReductionFactor,
      total: (item.total ?? 0) * overheadReductionFactor,
    });

    const preOverheadCostLineItems = costLineItems.map((category) => ({
      ...category,
      items: category.items.map(adjustItemForNoOverhead),
      subcategories: category.subcategories?.map((sub) => ({
        ...sub,
        items: sub.items.map(adjustItemForNoOverhead),
      })),
      hideBaseItems: category.hideBaseItems,
    }));

    return {
      proposal: mergedProposal,
      calculated,
      costBreakdownForDisplay,
      subtotal,
      totalCost,
      pricing,
      retailPrice,
      digCommission,
      adminFee,
      closeoutCommission,
      totalCOGS,
      grossMargin,
      papDiscountTotal,
      overheadMultiplier,
      totalCOGSBeforeOverhead,
      totalCOGSWithoutOverhead,
      overheadReductionFactor,
      preOverheadGrossProfit,
      overheadDifferential,
      preOverheadGrossMarginPercent,
      targetMargin,
      costsBeforePapDiscounts,
      baseRetailPriceBeforePap,
      g3UpgradeCost,
      retailPriceBeforeDiscounts,
      retailSalePrice,
      totalSavings,
      totalSavingsPercent,
      displayNumber,
      submissionDate,
      customerLocation,
      proposalStatus,
      dateModified,
      designerName,
        priceModel,
        isPriceModelActive,
        isPriceModelRemoved,
        priceModelStatus,
        hasRetiredEquipment: hasRetiredEquipmentSelections,
        poolTypeLabel,
      approximateGallons,
      maxWidth,
      maxLength,
      shallowDepth,
      endDepth,
      spaLength,
      spaWidth,
      ...equipmentSummary,
      offContractTotal,
      offContractItemGroups,
      offContractItemCount,
      costLineItems,
      preOverheadCostLineItems,
    };
  };

  if (loading) {
    return (
      <div className="proposal-view">
        <div className="loading-container">Loading proposal...</div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="proposal-view">
        <div className="error-container">
          <h2>Proposal not found</h2>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const allVersionsForRender = versions.length
    ? versions
    : proposal
    ? listAllVersions(proposal as Proposal)
    : [];

  const displayVersionContainer =
    proposal && allVersionsForRender.length
      ? buildContainerFromVersions(
          allVersionsForRender.map((entry) => ({ ...(entry as Proposal), versions: [] })),
          (proposal as Proposal).activeVersionId || activeVersionId
        ) || (proposal as Proposal)
      : proposal;

  const versionsForRender = isReadOnlyReviewerView && displayVersionContainer
    ? getReviewerVisibleVersions(displayVersionContainer as Proposal)
    : allVersionsForRender;

  const sortedVersions = [...versionsForRender].sort((a, b) => {
    const aIsOriginal = a.isOriginalVersion ?? (a.versionId || 'original') === 'original';
    const bIsOriginal = b.isOriginalVersion ?? (b.versionId || 'original') === 'original';
    if (aIsOriginal && !bIsOriginal) return -1;
    if (bIsOriginal && !aIsOriginal) return 1;
    return new Date(b.lastModified || b.createdDate).getTime() - new Date(a.lastModified || a.createdDate).getTime();
  });

  const viewModels = sortedVersions.map((v) => buildViewModel(v));
  const versionMap = new Map<string, ReturnType<typeof buildViewModel>>();
  viewModels.forEach((vm) => {
    versionMap.set(vm.proposal.versionId || 'original', vm);
  });
  const workflowHistory = [...(proposal?.workflow?.history || [])].sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  );
  const workflowReasons = (proposal?.workflow?.approvalReasons || []).filter(
    (reason) => reason.code !== 'manual_review'
  );
  const workflowStatusTooltip =
    proposalWorkflowStatus === 'needs_approval'
      ? 'Proposal submitted and awaiting approval'
      : proposal?.workflow?.approved && proposalWorkflowStatus === 'submitted'
      ? 'Proposal was approved. Future changes must be submitted as addendums.'
      : undefined;
  const workflowReviewVersionLabel =
    sortedVersions.find(
      (entry) =>
        (entry.versionId || 'original') ===
        (getPendingReviewVersionId(proposal as Proposal) || getApprovedVersionId(proposal as Proposal) || '')
    )?.versionName ||
    proposal?.versionName ||
    'Current Version';
  const displayPrimaryVersionId =
    (isReadOnlyReviewerView ? getReviewerPrimaryVersionId(displayVersionContainer as Proposal) : activeVersionId) ||
    activeVersionId;
  const primaryView = versionMap.get(displayPrimaryVersionId) || viewModels[0];
  const customerModalView = customerBreakdownVersionId
    ? versionMap.get(customerBreakdownVersionId) || primaryView
    : null;
  const cogsModalView = cogsBreakdownVersionId
    ? versionMap.get(cogsBreakdownVersionId) || primaryView
    : null;
  const preCogsModalView = preCogsBreakdownVersionId
    ? versionMap.get(preCogsBreakdownVersionId) || primaryView
    : null;
  const offContractModalView = offContractVersionId
    ? versionMap.get(offContractVersionId) || primaryView
    : null;
  const contractModalView = contractVersionId ? versionMap.get(contractVersionId) || primaryView : null;
  const hasMultipleVersions = viewModels.length > 1;
  const shouldRenderBreakdownExport = breakdownExportActive || breakdownExporting;

  const categoryTotal = (items: CostLineItem[] = []): number =>
    items.reduce((sum, item) => sum + (isOffContractLineItem(item) ? 0 : (item.total ?? 0)), 0);

  const isTaxLineItem = (item: CostLineItem): boolean =>
    (item.description || '').toLowerCase().includes('tax');

  const renderQuantity = (item: CostLineItem): string => {
    if (isTaxLineItem(item)) return '';
    return (item.quantity ?? 0).toLocaleString('en-US', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  };

  const renderUnitPrice = (item: CostLineItem): string => {
    if (isTaxLineItem(item)) return '';
    return formatCurrency(item.unitPrice);
  };

  const renderTotal = (item: CostLineItem): string =>
    isOffContractLineItem(item) ? 'OFF CONTRACT' : formatCurrency(item.total);

  const getCategoryClassName = (categoryName: string): string => {
    const classMap: { [key: string]: string } = {
      'Plans & Engineering': 'pool-specs',
      'Excavation': 'excavation',
      'Plumbing': 'plumbing',
      'Electrical': 'electrical',
      'Tile': 'tile',
      'Coping/Decking': 'tile',
      'Drainage': 'drainage',
      'Water Features': 'water-features',
      'Equipment Ordered': 'equipment',
      'Equipment Set': 'equipment',
      'Interior Finish': 'interior',
      'Fiberglass Shell': 'pool-specs',
      'Fiberglass Install': 'pool-specs',
      'Custom Features': 'custom',
    };
    return classMap[categoryName] || '';
  };

  const getCategoryIcon = (categoryName: string) => {
    const iconMap: { [key: string]: JSX.Element } = {
      'Plans & Engineering': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 3h12c.6 0 1 .4 1 1v12c0 .6-.4 1-1 1H4c-.6 0-1-.4-1-1V4c0-.6.4-1 1-1z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      Layout: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      Permit: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 3h10c.6 0 1 .4 1 1v13c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1V4c0-.6.4-1 1-1z" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M7 7h6M7 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="10" cy="14" r="1.5" fill="currentColor"/>
        </svg>
      ),
      Excavation: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 15h14M5 15L7 8l3 3 3-3 2 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      Plumbing: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 10h4m4 0h4M10 4v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      Gas: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 3v6m-3 3l3-3 3 3M6 13h8v3H6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      Steel: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      Electrical: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 3L6 11h5l-1 6 5-8h-5l1-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      ),
      Shotcrete: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M7 9h6M7 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      Tile: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="11" y="3" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="3" y="11" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="11" y="11" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      'Coping/Decking': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 12h14M3 8h14M3 12v3h14v-3M3 8V5h14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      'Stone/Rockwork': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 15l3-6 4 2 5-7M3 16h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      Drainage: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 3v14m-3-3l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M6 7h8v6H6z" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      'Equipment Ordered': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="5" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M7 9h6M7 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      'Equipment Set': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10 7v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      'Water Features': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 3c-2 2-3 4-3 6 0 1.7 1.3 3 3 3s3-1.3 3-3c0-2-1-4-3-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M4 15h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      Cleanup: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 6V4h6v2M4 6h12M6 6v9c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M8 9v4M12 9v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      'Interior Finish': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 10c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M6 10h8v6H6z" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      'Water Truck': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="6" width="11" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="6" cy="15" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="12" cy="15" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M14 9h2l1 2v2h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      'Fiberglass Shell': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="10" cy="10" rx="7" ry="5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M3 10h14" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      'Fiberglass Install': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 3v6m0 0L7 6m3 3l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <rect x="4" y="11" width="12" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      'Startup/Orientation': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 8l5 2-5 2V8z" fill="currentColor"/>
        </svg>
      ),
      'Custom Features': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 3l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6l2-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      ),
    };

    return iconMap[categoryName] || (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    );
  };

  const renderTiles = (vm: ReturnType<typeof buildViewModel>) => {
    const versionId = vm.proposal.versionId || 'original';
    const contractTypeLabel = getContractTypeLabel(vm.proposal);
    return (
      <div className="tiles-grid">
        <button className="summary-tile customer-tile" type="button" onClick={() => setCustomerBreakdownVersionId(versionId)}>
          <div className="tile-header">
            <div className="tile-icon customer-icon">
              <img src={customerBreakIconImg} alt="Customer breakdown icon" className="customer-break-icon" />
            </div>
            <div className="tile-header-text">
              <p className="tile-title">Customer Cost &amp;<br/>Warranty Breakdown</p>
            </div>
          </div>
          <div className="tile-content-box">
            <div className="tile-metrics">
              <div className="metric-row">
                <OverflowTooltipText as="p" className="metric-label">Retail Price:</OverflowTooltipText>
                <OverflowTooltipText as="p" className="metric-value">{formatCurrency(vm.retailPriceBeforeDiscounts)}</OverflowTooltipText>
              </div>
              <div className="metric-divider"></div>
              <div className="metric-row">
                <OverflowTooltipText as="p" className="metric-label">Retail Sale Price:</OverflowTooltipText>
                <OverflowTooltipText as="p" className="metric-value">{formatCurrency(vm.retailSalePrice)}</OverflowTooltipText>
              </div>
              <div className="metric-divider"></div>
              <div className="metric-row">
                <OverflowTooltipText as="p" className="metric-label">Total Savings:</OverflowTooltipText>
                <OverflowTooltipText as="p" className="metric-value">{formatCurrency(vm.totalSavings)}</OverflowTooltipText>
              </div>
              <div className="metric-divider"></div>
              <div className="metric-row">
                <OverflowTooltipText as="p" className="metric-label">Total Savings %:</OverflowTooltipText>
                <OverflowTooltipText as="p" className="metric-value">
                  {Number.isFinite(vm.totalSavingsPercent) ? `${vm.totalSavingsPercent.toFixed(1)}%` : 'N/A'}
                </OverflowTooltipText>
              </div>
            </div>
          </div>
          <span className="tile-link">
            View Detailed Breakdown
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 11L11 3M11 3H5M11 3V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </button>

        {canViewCogsBreakdown && (
          <button className="summary-tile cogs-tile" type="button" onClick={() => setCogsBreakdownVersionId(versionId)}>
            <div className="tile-header">
              <div className="tile-icon cogs-icon">
                <img src={cogsBreakIconImg} alt="COGS breakdown icon" className="cogs-break-icon" />
              </div>
              <div className="tile-header-text">
                <p className="tile-title">COGS Cost<br/>Breakdown</p>
              </div>
            </div>
            <div className="tile-content-box">
              <div className="tile-metrics">
                <div className="metric-row">
                  <OverflowTooltipText as="p" className="metric-label">Dig Commission:</OverflowTooltipText>
                  <OverflowTooltipText as="p" className="metric-value">{formatCurrency(vm.pricing?.digCommission ?? 0)}</OverflowTooltipText>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <OverflowTooltipText as="p" className="metric-label">Admin Fee:</OverflowTooltipText>
                  <OverflowTooltipText as="p" className="metric-value">{formatCurrency(vm.pricing?.adminFee ?? 0)}</OverflowTooltipText>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <OverflowTooltipText as="p" className="metric-label">Closeout Commission:</OverflowTooltipText>
                  <OverflowTooltipText as="p" className="metric-value">{formatCurrency(vm.pricing?.closeoutCommission ?? 0)}</OverflowTooltipText>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <OverflowTooltipText as="p" className="metric-label">Gross Profit:</OverflowTooltipText>
                  <OverflowTooltipText as="p" className="metric-value">
                    {formatCurrency(vm.pricing?.grossProfit ?? 0)} ({Number.isFinite(vm.grossMargin) ? `${vm.grossMargin.toFixed(1)}%` : 'N/A'})
                  </OverflowTooltipText>
                </div>
              </div>
            </div>
            <span className="tile-link">
              View Detailed Breakdown
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 11L11 3M11 3H5M11 3V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>
        )}

        {vm.offContractItemCount > 0 && (
          <button
            className="summary-tile off-contract-tile"
            type="button"
            onClick={() => setOffContractVersionId(versionId)}
          >
            <div className="tile-header">
              <div className="tile-icon off-contract-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="tile-header-text">
                <p className="tile-title">Off Contract<br/>Items</p>
              </div>
            </div>
            <div className="tile-content-box">
              <div className="tile-metrics">
                <div className="metric-row">
                  <OverflowTooltipText as="p" className="metric-label">Categories:</OverflowTooltipText>
                  <OverflowTooltipText as="p" className="metric-value">{vm.offContractItemGroups.length}</OverflowTooltipText>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <OverflowTooltipText as="p" className="metric-label">Items:</OverflowTooltipText>
                  <OverflowTooltipText as="p" className="metric-value">{vm.offContractItemCount}</OverflowTooltipText>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <OverflowTooltipText as="p" className="metric-label">Off Contract Total:</OverflowTooltipText>
                  <OverflowTooltipText as="p" className="metric-value">{formatCurrency(vm.offContractTotal)}</OverflowTooltipText>
                </div>
              </div>
            </div>
            <span className="tile-link">
              View Breakdown
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 11L11 3M11 3H5M11 3V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>
        )}

        <button className="summary-tile contract-tile" type="button" onClick={() => setContractVersionId(versionId)}>
          <div className="tile-header">
            <div className="tile-icon contract-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 3h8l4 4v14H7V3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M15 3v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 12h6M9 16h6M9 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="tile-header-text">
              <p className="tile-title">Contract</p>
            </div>
          </div>
          <div className="tile-content-box">
            <div className="tile-metrics">
              <div className="metric-row">
                <OverflowTooltipText as="p" className="metric-label">Retail Price:</OverflowTooltipText>
                <OverflowTooltipText as="p" className="metric-value">{formatCurrency(vm.pricing?.retailPrice ?? vm.retailPriceBeforeDiscounts)}</OverflowTooltipText>
              </div>
              <div className="metric-divider"></div>
              <div className="metric-row">
                <OverflowTooltipText as="p" className="metric-label">Pool Type:</OverflowTooltipText>
                <OverflowTooltipText as="p" className="metric-value">{vm.poolTypeLabel}</OverflowTooltipText>
              </div>
              <div className="metric-divider"></div>
              <div className="metric-row">
                <OverflowTooltipText as="p" className="metric-label">Contract Type:</OverflowTooltipText>
                <OverflowTooltipText as="p" className="metric-value">{contractTypeLabel}</OverflowTooltipText>
              </div>
            </div>
          </div>
          <span className="tile-link">
            View Contract
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 11L11 3M11 3H5M11 3V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </button>
      </div>
    );
  };

  const renderVersionSection = (vm: ReturnType<typeof buildViewModel>, index: number) => {
    const versionId = vm.proposal.versionId || `version-${index}`;
    const isOriginal = vm.proposal.isOriginalVersion ?? versionId === 'original';
    const versionLabel = getDisplayVersionLabel(vm.proposal);
    const isActive = versionId === activeVersionId;
    const proposalIndicator = buildProposalIndicator(vm.grossMargin);
    const canEditVersion =
      canManageVersionDrafts &&
      !isSubmittedVersionLocked(vm.proposal) &&
      proposalWorkflowStatus !== 'completed';
    const canDeleteVersion =
      canManageVersionDrafts &&
      !isOriginal &&
      !isSubmittedVersionLocked(vm.proposal) &&
      proposalWorkflowStatus !== 'completed';
    const versionActionReason =
      !canManageVersionDrafts
        ? editDisabledReason
        : proposalWorkflowStatus === 'completed'
        ? 'Completed proposals are locked.'
        : isSubmittedVersionLocked(vm.proposal)
        ? 'Submitted versions are locked. Create a new version to make changes.'
        : undefined;

    return (
      <div key={versionId} className={`version-section ${index > 0 ? 'has-divider' : ''}`}>
        {index > 0 && (
          <>
            <div className="version-divider-title">Additional Version - {versionLabel}</div>
            <div className="version-divider" />
          </>
        )}
        <div className="hero-card">
          <div className="hero-header">
            <div className="hero-icon">
              <img src={summaryIconImg} alt="Proposal summary icon" className="summary-icon" />
            </div>
            <div className="hero-header-text">
              <h2 className="hero-title">
                <span className="hero-title-text">{vm.customerLocation}</span>
                <span className="hero-title-separator">-</span>
                <span className={`version-pill ${isActive ? 'active' : 'inactive'}`}>
                  {versionLabel}
                </span>
                {vm.hasRetiredEquipment && <RetiredEquipmentIndicator />}
              </h2>
            </div>
            <div
              className={`hero-price-model ${vm.priceModelStatus}`}
              data-tooltip={
                vm.priceModelStatus === 'active'
                  ? 'Pricing Model is Current'
                  : vm.priceModelStatus === 'removed'
                  ? 'Pricing Model was removed; please select another'
                  : 'Pricing Model is not active, consider changing'
              }
              aria-label={
                vm.priceModelStatus === 'active'
                  ? 'Pricing Model is Current'
                  : vm.priceModelStatus === 'removed'
                  ? 'Pricing Model was removed; please select another'
                  : 'Pricing Model is not active, consider changing'
              }
            >
              {vm.priceModel}{vm.priceModelStatus === 'active' ? ' (Active)' : ''}
            </div>
            <div className="hero-actions">
              <button
                className="action-button"
                onClick={() => handleEdit(vm.proposal)}
                disabled={!canEditVersion}
                title={versionActionReason}
              >
                Edit Proposal
              </button>
              {!isOriginal && (
                <button
                  className="action-button danger"
                  onClick={() => handleDeleteVersion(versionId)}
                  disabled={!canDeleteVersion}
                  title={versionActionReason}
                >
                  Delete Version
                </button>
              )}
            </div>
          </div>

          <div className="hero-grid">
            <p className="hero-section-title hero-section-title-specs">Pool Specifications</p>
            <p className="hero-section-title hero-section-title-equipment">
              <span>Pool Equipment</span>
              {vm.equipmentPackageLabel && (
                <span className="hero-equipment-package-pill">{vm.equipmentPackageLabel}</span>
              )}
            </p>
            <div className="hero-column">
              <div className="hero-line">
                <span className="hero-label">Pool Type:</span>
                <OverflowTooltipText>{vm.poolTypeLabel}</OverflowTooltipText>
              </div>
              <div className="hero-line">
                <span className="hero-label">Max Width:</span>
                <OverflowTooltipText>{vm.maxWidth}</OverflowTooltipText>
              </div>
              <div className="hero-line">
                <span className="hero-label">Shallow Depth:</span>
                <OverflowTooltipText>{vm.shallowDepth}</OverflowTooltipText>
              </div>
              <div className="hero-line">
                <span className="hero-label">Spa Length:</span>
                <OverflowTooltipText>{vm.spaLength}</OverflowTooltipText>
              </div>
            </div>
            <div className="hero-column">
              <div className="hero-line">
                <span className="hero-label">Approx. Gallons:</span>
                <OverflowTooltipText>{vm.approximateGallons}</OverflowTooltipText>
              </div>
              <div className="hero-line">
                <span className="hero-label">Max Length:</span>
                <OverflowTooltipText>{vm.maxLength}</OverflowTooltipText>
              </div>
              <div className="hero-line">
                <span className="hero-label">End Depth:</span>
                <OverflowTooltipText>{vm.endDepth}</OverflowTooltipText>
              </div>
              <div className="hero-line">
                <span className="hero-label">Spa Width:</span>
                <OverflowTooltipText>{vm.spaWidth}</OverflowTooltipText>
              </div>
            </div>
            <div className="hero-column">
              <div className="hero-line">
                <span className="hero-label">Pump:</span>
                <OverflowTooltipText>{vm.pumpSummary}</OverflowTooltipText>
              </div>
              <div className="hero-line">
                <span className="hero-label">Filter:</span>
                <OverflowTooltipText>{vm.filterSummary}</OverflowTooltipText>
              </div>
              <div className="hero-line">
                <span className="hero-label">Heater:</span>
                <OverflowTooltipText>{vm.heaterSummary}</OverflowTooltipText>
              </div>
              <div className="hero-line">
                <span className="hero-label">Cleaner:</span>
                <OverflowTooltipText>{vm.cleanerSummary}</OverflowTooltipText>
              </div>
            </div>
            <div className="hero-column">
              <div className="hero-line">
                <span className="hero-label">Automation:</span>
                <OverflowTooltipText>{vm.automationSummary}</OverflowTooltipText>
              </div>
              <div className="hero-line">
                <span className="hero-label">Sanitation:</span>
                <OverflowTooltipText>{vm.sanitationSummary}</OverflowTooltipText>
              </div>
              <div className="hero-line">
                <span className="hero-label">Autofill:</span>
                <OverflowTooltipText>{vm.autoFillSummary}</OverflowTooltipText>
              </div>
              <div className="hero-line">
                <span className="hero-label">Pool Light:</span>
                <OverflowTooltipText>{vm.poolLightSummary}</OverflowTooltipText>
              </div>
            </div>
          </div>

          <div className="hero-total">
            <span className="proposal-gp-indicator">{proposalIndicator}</span>
            <span className="hero-total-amount">
              <strong>Total Retail Cost:</strong> {formatCurrency(vm.retailPrice || vm.subtotal || vm.totalCost)}
            </span>
          </div>
        </div>

        {renderTiles(vm)}
      </div>
    );
  };

  return (
    <div className="proposal-view">
      <div className="view-actions no-print">
        <div className="action-bar">
          <div className="action-bar-left">
            <button className="action-button" onClick={() => navigate('/')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 13L5 8L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back to Home
            </button>
            {hasMultipleVersions && (
              <div className="version-switcher">
                <label htmlFor="active-version">Active Version:</label>
                <select
                  id="active-version"
                  value={isReadOnlyReviewerView ? displayPrimaryVersionId : activeVersionId}
                  onChange={(e) => handleSetActiveVersion(e.target.value)}
                  disabled={!canManageVersionDrafts}
                  title={editDisabledReason}
                >
                  {viewModels.map((vm) => (
                    <option key={vm.proposal.versionId || 'original'} value={vm.proposal.versionId || 'original'}>
                      {getDisplayVersionLabel(vm.proposal)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="action-bar-right">
            <button
              className="action-button primary workflow-summary-submit-button"
              onClick={handleSubmitProposal}
              disabled={!canEditProposal || loading || !canSubmitProposal}
              title={
                !canEditProposal
                  ? editDisabledReason
                  : !canSubmitProposal
                  ? 'Must include Customer Name'
                  : undefined
              }
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Submit Proposal
            </button>
          </div>
        </div>
      </div>

      {proposal?.workflow && (
        <div className="workflow-summary-card no-print">
          <div className="workflow-summary-header">
            <div className="workflow-summary-heading">
              <p className="workflow-summary-kicker">Submission Workflow</p>
              <div
                className={`workflow-summary-pill is-${proposalWorkflowStatus}`}
                title={workflowStatusTooltip}
              >
                {formatWorkflowStatusLabel(proposalWorkflowStatus)}
                {proposal.workflow.approved ? ' *' : ''}
              </div>
            </div>
            <div className="workflow-summary-header-actions">
              <button
                className="action-button action-button-version workflow-summary-version-button"
                onClick={handleBuildAnotherVersion}
                disabled={!canManageVersionDrafts}
                title={!canManageVersionDrafts ? editDisabledReason : undefined}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Build Another Version
              </button>
            </div>
          </div>

          <div className="workflow-summary-grid">
            <div className="workflow-summary-block">
              <div className="workflow-summary-label">Review Version</div>
              <div className="workflow-summary-value">{workflowReviewVersionLabel}</div>
            </div>
            <div className="workflow-summary-block">
              <div className="workflow-summary-label">Submitted</div>
              <div className="workflow-summary-value">
                {proposal.workflow.submittedAt ? new Date(proposal.workflow.submittedAt).toLocaleString() : 'Not submitted'}
              </div>
            </div>
            <div className="workflow-summary-block">
              <div className="workflow-summary-label">Approved By</div>
              <div className="workflow-summary-value">
                {proposal.workflow.approvedBy?.name || proposal.workflow.approvedBy?.email || 'Not approved'}
              </div>
            </div>
            <div className="workflow-summary-block">
              <div className="workflow-summary-label">Completed By</div>
              <div className="workflow-summary-value">
                {proposal.workflow.completedBy?.name || proposal.workflow.completedBy?.email || 'Not completed'}
              </div>
            </div>
          </div>

          {workflowReasons.length > 0 && (
            <div className="workflow-summary-reasons">
              {workflowReasons.map((reason) => (
                <div key={`${reason.code}-${reason.label}`} className="workflow-summary-reason">
                  <strong>{reason.label}</strong>
                  {reason.detail ? ` - ${reason.detail}` : ''}
                </div>
              ))}
            </div>
          )}

          {(workflowHistory.length > 0 || canSendWorkflowMessages) && (
            <div className="workflow-summary-history">
              <div className="workflow-summary-history-title">Workflow Activity</div>
              {workflowHistory.map((entry) => (
                <div key={entry.id} className="workflow-summary-history-item">
                  <div className="workflow-summary-history-meta">
                    <span>{formatWorkflowStatusLabel(entry.type)}</span>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    <span>{entry.actor?.name || entry.actor?.email || 'User'}</span>
                  </div>
                  {entry.message && <div className="workflow-summary-history-message">{entry.message}</div>}
                </div>
              ))}
              {canSendWorkflowMessages && !showWorkflowMessageComposer && (
                <div className="workflow-summary-message-actions">
                  <button
                    type="button"
                    className="action-button workflow-summary-message-trigger"
                    onClick={() => setShowWorkflowMessageComposer(true)}
                    disabled={workflowMessageSaving || loading}
                  >
                    Send Another Note
                  </button>
                </div>
              )}
              {canSendWorkflowMessages && showWorkflowMessageComposer && (
                <div className="workflow-summary-message-composer">
                  <textarea
                    className="workflow-summary-message-input"
                    value={workflowMessageDraft}
                    onChange={(event) => setWorkflowMessageDraft(event.target.value)}
                    placeholder="Add a message here"
                    disabled={workflowMessageSaving || loading}
                    rows={4}
                  />
                  <div className="workflow-summary-message-actions">
                    <button
                      type="button"
                      className="action-button"
                      onClick={() => {
                        setWorkflowMessageDraft('');
                        setShowWorkflowMessageComposer(false);
                      }}
                      disabled={workflowMessageSaving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="action-button primary workflow-summary-message-button"
                      onClick={() => {
                        void handleSendWorkflowMessage();
                      }}
                      disabled={!workflowMessageDraft.trim() || workflowMessageSaving || loading}
                    >
                      {workflowMessageSaving ? 'Sending...' : 'Send Message'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div ref={proposalRef} className="proposal-summary-page">
        <h1 className="page-title">Proposal Summary</h1>
        {viewModels.map((vm, index) => renderVersionSection(vm, index))}
      </div>
      {showVersionNameModal && (
        <div className="modal-overlay" onClick={() => setShowVersionNameModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">New Version</p>
                <h2>
                  Name the alternate version for '{proposal?.customerInfo.customerName || 'Proposal'}'
                </h2>
              </div>
              <button className="modal-close" onClick={() => setShowVersionNameModal(false)} aria-label="Close version naming dialog">
                x
              </button>
            </div>
            <div className="modal-body-scroll">
              <label className="version-name-label">
                Version Name
                <input
                  type="text"
                  value={newVersionName}
                  onChange={(e) => setNewVersionName(e.target.value)}
                  className="version-name-input"
                  autoFocus
                />
              </label>
              <div className="version-name-actions">
                <button className="action-button" onClick={() => setShowVersionNameModal(false)}>Cancel</button>
                <button className="action-button primary" onClick={handleConfirmCreateVersion}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <SubmitProposalModal
        isOpen={showSubmitModal}
        versionName={proposal?.versionName || 'Current Version'}
        note={submitNote}
        isSubmitting={loading}
        onNoteChange={setSubmitNote}
        onCancel={() => setShowSubmitModal(false)}
        onConfirm={() => {
          void handleConfirmSubmit();
        }}
      />
      {contractVersionId && contractModalView && (
        <div className="modal-overlay contract-printable" onClick={() => setContractVersionId(null)}>
          <div className="modal-content contract-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header contract-modal-header">
              <div>
                <p className="modal-eyebrow">Contract</p>
                <h2>
                  Contract Preview - {contractModalView.proposal.customerInfo.customerName || 'Customer'}
                </h2>
              </div>
              <div className="contract-header-actions">
                <div className="export-control" ref={contractExportControlRef}>
                  <button
                    className={`action-button export-button ${contractExportOpen ? 'open' : ''}`}
                    type="button"
                    onClick={handleContractExportToggle}
                    disabled={contractExporting || contractSaving}
                    aria-expanded={contractExportOpen}
                    aria-haspopup="listbox"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 3h10v10H3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      <path d="M5 7h6M5 9h6M5 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    Export
                  </button>
                  {contractExportOpen && (
                    <div className="export-dropdown" role="listbox">
                      <button
                        type="button"
                        className="export-option"
                        role="option"
                        onClick={handleContractPrint}
                        disabled={contractExporting || contractSaving}
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        className="export-option"
                        role="option"
                        onClick={handleContractPdf}
                        disabled={contractExporting || contractSaving}
                      >
                        PDF
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className="action-button primary"
                  type="button"
                  onClick={handleContractSaveClick}
                  disabled={!canEditProposal || !contractDirty || contractSaving}
                  title={!canEditProposal ? editDisabledReason : undefined}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 2h8l2 2v10H3V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M5 2v4h6V2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M6 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  {contractSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button className="modal-close" onClick={() => setContractVersionId(null)} aria-label="Close contract">
                  x
                </button>
              </div>
            </div>
            <div className="modal-body-scroll">
              <ContractView
                ref={contractViewRef}
                proposal={contractModalView.proposal}
                overrides={contractModalView.proposal.contractOverrides || {}}
                onSave={(next) => handleSaveContractOverrides(contractModalView.proposal.versionId || 'original', next)}
                readOnly={!canEditProposal}
                onDirtyChange={setContractDirty}
                onExportingChange={setContractExporting}
                onSavingChange={setContractSaving}
              />
            </div>
          </div>
        </div>
      )}
      {offContractVersionId && offContractModalView && (
        <div className="modal-overlay" onClick={() => setOffContractVersionId(null)}>
          <div className="modal-content wide off-contract-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Off Contract Items</p>
                <h2>Retail-Only Off Contract Breakdown</h2>
              </div>
              <button className="modal-close" onClick={() => setOffContractVersionId(null)} aria-label="Close off contract items">
                x
              </button>
            </div>
            <div className="modal-body-scroll">
              <OffContractItemsView
                customerName={offContractModalView.proposal.customerInfo.customerName}
                franchiseId={offContractModalView.proposal.franchiseId}
                groups={offContractModalView.offContractItemGroups}
              />
            </div>
          </div>
        </div>
      )}
      {customerBreakdownVersionId && customerModalView && (
        <>
          <div className="modal-overlay" onClick={() => setCustomerBreakdownVersionId(null)}>
            <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <p className="modal-eyebrow">Customer Cost and Warranty Breakdown</p>
                  <h2>Job Cost Summary &amp; Warranty</h2>
                </div>
                <div className="breakdown-header-actions">
                  <div className="export-control" ref={breakdownExportControlRef}>
                    <button
                      className={`action-button export-button ${breakdownExportOpen ? 'open' : ''}`}
                      type="button"
                      onClick={handleBreakdownExportToggle}
                      disabled={breakdownExporting}
                      aria-expanded={breakdownExportOpen}
                      aria-haspopup="listbox"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 3h10v10H3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        <path d="M5 7h6M5 9h6M5 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      Export
                    </button>
                    {breakdownExportOpen && (
                      <div className="export-dropdown" role="listbox">
                        <button
                          type="button"
                          className="export-option"
                          role="option"
                          onClick={handleBreakdownPrint}
                          disabled={breakdownExporting}
                        >
                          Print
                        </button>
                        <button
                          type="button"
                          className="export-option"
                          role="option"
                          onClick={handleBreakdownPdf}
                          disabled={breakdownExporting}
                        >
                          PDF
                        </button>
                      </div>
                    )}
                  </div>
                  <button className="modal-close" onClick={() => setCustomerBreakdownVersionId(null)} aria-label="Close customer cost and warranty breakdown">
                    x
                  </button>
                </div>
              </div>
              <div className="modal-body-scroll">
                <CostBreakdownView
                  costBreakdown={customerModalView.costBreakdownForDisplay}
                  customerName={customerModalView.proposal.customerInfo.customerName}
                  proposal={customerModalView.proposal}
                  pricing={customerModalView.pricing}
                  allowRetailAdjustments={canEditProposal}
                  editableWarranty={canEditProposal}
                  onRetailAdjustmentsChange={
                    canEditProposal
                      ? (adjustments) =>
                          handleRetailAdjustmentsChange(
                            customerModalView.proposal.versionId || 'original',
                            adjustments
                          )
                      : undefined
                  }
                  onWarrantySectionsChange={
                    canEditProposal
                      ? (sections) =>
                          handleWarrantySectionsChange(
                            customerModalView.proposal.versionId || 'original',
                            sections
                          )
                      : undefined
                  }
                  showWarranty
                  showZoomControl={false}
                />
              </div>
            </div>
          </div>
          {shouldRenderBreakdownExport && (
            <div
              className={`export-print-area ${breakdownExportActive ? 'print-mode' : ''}`}
              ref={breakdownExportAreaRef}
              aria-hidden="true"
            >
              <div className="export-breakdown-page export-breakdown-page--cost">
                <BreakdownCostExportPage
                  costBreakdown={customerModalView.costBreakdownForDisplay}
                  customerName={customerModalView.proposal.customerInfo.customerName}
                  proposal={customerModalView.proposal}
                  pricing={customerModalView.pricing}
                />
              </div>
              <BreakdownWarrantyExportPages proposal={customerModalView.proposal} />
            </div>
          )}
        </>
      )}
      {canViewCogsBreakdown && cogsBreakdownVersionId && cogsModalView && (
        <div className="modal-overlay" onClick={() => setCogsBreakdownVersionId(null)}>
          <div className="modal-content cogs-breakdown-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-button" onClick={() => setCogsBreakdownVersionId(null)} aria-label="Close COGS breakdown">
              ×
            </button>

            <div className="cogs-header-info">
              <div className="cogs-header-content">
                <div>
                  <p className="cogs-header-eyebrow">COGS Cost Breakdown</p>
                  <h2 className="cogs-header-title">Estimated Cost of Goods Sold</h2>
                  <div className="cogs-header-details">
                    <div className="cogs-header-detail-item">
                      <span className="cogs-header-detail-label">Customer:</span>
                      <span className="cogs-header-detail-value">{cogsModalView.proposal.customerInfo.customerName}</span>
                    </div>
                    <div className="cogs-header-detail-item">
                      <span className="cogs-header-detail-label">Date:</span>
                      <span className="cogs-header-detail-value">{new Date(cogsModalView.proposal.lastModified || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>
                </div>
                <div className="cogs-header-logo">
                  <FranchiseLogo alt="Franchise Logo" franchiseId={franchiseLogoId} />
                </div>
              </div>
            </div>

            <div className="modal-body-scroll">
              {cogsModalView.costLineItems.length === 0 ? (
                <div className="empty-state">No cost breakdown available for this proposal.</div>
              ) : (
                <div className="cogs-categories-grid">
                  {cogsModalView.costLineItems.map((category) => (
                    <div className={`cogs-category-card ${getCategoryClassName(category.name)}`} key={category.name}>
                      <div className="cogs-category-card-header">
                        <div className="cogs-category-icon">
                          {getCategoryIcon(category.name)}
                        </div>
                        <div className="cogs-category-title-wrapper">
                          <h3 className="cogs-category-title">{category.name}</h3>
                          <div className="cogs-category-total">{formatCurrency(categoryTotal(category.items))}</div>
                        </div>
                      </div>

                      {category.subcategories && category.subcategories.length > 0 ? (
                        <div className="cogs-subcategories">
                          {(() => {
                            const baseItems = category.subcategories?.length
                              ? category.items.filter(item => !hasLineItemSubcategory(item))
                              : category.items;
                            if (category.hideBaseItems || baseItems.length === 0) return null;
                            return (
                              <table className="cogs-category-table">
                                <colgroup>
                                  <col style={{ width: '40%' }} />
                                  <col style={{ width: '10%' }} />
                                  <col style={{ width: '25%' }} />
                                  <col style={{ width: '25%' }} />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th>Description</th>
                                    <th>Qty</th>
                                    <th>Unit Price</th>
                                    <th>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {baseItems.map((item, idx) => (
                                    <tr key={`${category.name}-base-${idx}`}>
                                      <td>{item.description}</td>
                                      <td>{renderQuantity(item)}</td>
                                      <td>{renderUnitPrice(item)}</td>
                                      <td>{renderTotal(item)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            );
                          })()}
                          {category.subcategories.map((subcategory) => (
                            <div key={subcategory.name} className="cogs-subcategory">
                              <div className="cogs-subcategory-header">
                                <span className="cogs-subcategory-name">{subcategory.name}</span>
                                <span className="cogs-subcategory-total">
                                  {formatCurrency(categoryTotal(subcategory.items))}
                                </span>
                              </div>
                              <table className="cogs-category-table">
                                <colgroup>
                                  <col style={{ width: '40%' }} />
                                  <col style={{ width: '10%' }} />
                                  <col style={{ width: '25%' }} />
                                  <col style={{ width: '25%' }} />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th>Description</th>
                                    <th>Qty</th>
                                    <th>Unit Price</th>
                                    <th>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {subcategory.items.map((item, idx) => (
                                    <tr key={`${category.name}-${subcategory.name}-${idx}`}>
                                      <td>{item.description}</td>
                                      <td>{renderQuantity(item)}</td>
                                      <td>{renderUnitPrice(item)}</td>
                                      <td>{renderTotal(item)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <table className="cogs-category-table">
                          <colgroup>
                            <col style={{ width: '40%' }} />
                            <col style={{ width: '10%' }} />
                            <col style={{ width: '25%' }} />
                            <col style={{ width: '25%' }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Description</th>
                              <th>Qty</th>
                              <th>Unit Price</th>
                              <th>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {category.items.map((item, idx) => (
                              <tr key={`${category.name}-${idx}`}>
                                <td>{item.description}</td>
                                <td>{renderQuantity(item)}</td>
                                <td>{renderUnitPrice(item)}</td>
                                <td>{renderTotal(item)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {cogsModalView.costLineItems.length > 0 && (
                <div className="cogs-footer">
                  <div className="cogs-footer-text">Total COGS: {formatCurrency(cogsModalView.totalCOGS)}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {canViewCogsBreakdown && preCogsBreakdownVersionId && preCogsModalView && (
        <div className="modal-overlay" onClick={() => setPreCogsBreakdownVersionId(null)}>
          <div className="modal-content cogs-breakdown-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-button" onClick={() => setPreCogsBreakdownVersionId(null)} aria-label="Close pre-COGS breakdown">
              A-
            </button>

            <div className="cogs-header-info">
              <div className="cogs-header-content">
                <div>
                  <p className="cogs-header-eyebrow">PRE OVERHEAD COGS COST BREAKDOWN</p>
                  <h2 className="cogs-header-title">Estimated Cost of Goods Sold (No 1% Overhead)</h2>
                  <div className="cogs-header-details">
                    <div className="cogs-header-detail-item">
                      <span className="cogs-header-detail-label">Customer:</span>
                      <span className="cogs-header-detail-value">{preCogsModalView.proposal.customerInfo.customerName}</span>
                    </div>
                    <div className="cogs-header-detail-item">
                      <span className="cogs-header-detail-label">Date:</span>
                      <span className="cogs-header-detail-value">{new Date(preCogsModalView.proposal.lastModified || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>
                </div>
                <div className="cogs-header-logo">
                  <FranchiseLogo alt="Franchise Logo" franchiseId={franchiseLogoId} />
                </div>
              </div>
            </div>

            <div className="modal-body-scroll">
              {preCogsModalView.preOverheadCostLineItems.length === 0 ? (
                <div className="empty-state">No cost breakdown available for this proposal.</div>
              ) : (
                <div className="cogs-categories-grid">
                  {preCogsModalView.preOverheadCostLineItems.map((category) => (
                    <div className={`cogs-category-card ${getCategoryClassName(category.name)}`} key={category.name}>
                      <div className="cogs-category-card-header">
                        <div className="cogs-category-icon">
                          {getCategoryIcon(category.name)}
                        </div>
                        <div className="cogs-category-title-wrapper">
                          <h3 className="cogs-category-title">{category.name}</h3>
                          <div className="cogs-category-total">{formatCurrency(categoryTotal(category.items))}</div>
                        </div>
                      </div>

                      {category.subcategories && category.subcategories.length > 0 ? (
                        <div className="cogs-subcategories">
                          {(() => {
                            const baseItems = category.subcategories?.length
                              ? category.items.filter(item => !hasLineItemSubcategory(item))
                              : category.items;
                            if (category.hideBaseItems || baseItems.length === 0) return null;
                            return (
                              <table className="cogs-category-table">
                                <colgroup>
                                  <col style={{ width: '40%' }} />
                                  <col style={{ width: '10%' }} />
                                  <col style={{ width: '25%' }} />
                                  <col style={{ width: '25%' }} />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th>Description</th>
                                    <th>Qty</th>
                                    <th>Unit Price</th>
                                    <th>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {baseItems.map((item, idx) => (
                                    <tr key={`${category.name}-base-${idx}`}>
                                      <td>{item.description}</td>
                                      <td>{renderQuantity(item)}</td>
                                      <td>{renderUnitPrice(item)}</td>
                                      <td>{renderTotal(item)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            );
                          })()}
                          {category.subcategories.map((subcategory) => (
                            <div key={subcategory.name} className="cogs-subcategory">
                              <div className="cogs-subcategory-header">
                                <span className="cogs-subcategory-name">{subcategory.name}</span>
                                <span className="cogs-subcategory-total">
                                  {formatCurrency(categoryTotal(subcategory.items))}
                                </span>
                              </div>
                              <table className="cogs-category-table">
                                <colgroup>
                                  <col style={{ width: '40%' }} />
                                  <col style={{ width: '10%' }} />
                                  <col style={{ width: '25%' }} />
                                  <col style={{ width: '25%' }} />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th>Description</th>
                                    <th>Qty</th>
                                    <th>Unit Price</th>
                                    <th>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {subcategory.items.map((item, idx) => (
                                    <tr key={`${category.name}-${subcategory.name}-${idx}`}>
                                      <td>{item.description}</td>
                                      <td>{renderQuantity(item)}</td>
                                      <td>{renderUnitPrice(item)}</td>
                                  <td>{renderTotal(item)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <table className="cogs-category-table">
                          <colgroup>
                            <col style={{ width: '40%' }} />
                            <col style={{ width: '10%' }} />
                            <col style={{ width: '25%' }} />
                            <col style={{ width: '25%' }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Description</th>
                              <th>Qty</th>
                              <th>Unit Price</th>
                              <th>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {category.items.map((item, idx) => (
                              <tr key={`${category.name}-${idx}`}>
                                <td>{item.description}</td>
                                <td>{renderQuantity(item)}</td>
                                <td>{renderUnitPrice(item)}</td>
                                <td>{renderTotal(item)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {preCogsModalView.preOverheadCostLineItems.length > 0 && (
                <div className="cogs-footer">
                  <div className="cogs-footer-text">TOTAL COGS (No 1% Overhead): {formatCurrency(preCogsModalView.totalCOGSWithoutOverhead)}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default ProposalView;
