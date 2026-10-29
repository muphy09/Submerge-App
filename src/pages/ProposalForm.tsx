import { defaultAddOns, equipmentAllowsAddOns } from '../utils/addOns';
import { useState, useEffect, useRef, type SyntheticEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Proposal,
  WaterFeatures,
  WaterFeatureSelection,
  PAPDiscounts,
  ManualAdjustments,
  PlumbingRuns,
} from '../types/proposal-new';
import {
  getDefaultProposal,
  getDefaultPAPDiscounts,
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
  mergePlumbingRuns,
  mergeRetailAdjustments,
} from '../utils/proposalDefaults';
import { getEquipmentItemCost } from '../utils/equipmentCost';
import MasterPricingEngine from '../services/masterPricingEngine';
import { CalculationModules } from '../services/pricingEngineComplete';
import { validateProposal } from '../utils/validation';
import PoolSpecsSectionNew from '../components/PoolSpecsSectionNew';
import ExcavationSectionNew from '../components/ExcavationSectionNew';
import PlumbingSectionNew from '../components/PlumbingSectionNew';
import ElectricalSectionNew from '../components/ElectricalSectionNew';
import TileCopingDeckingSectionNew from '../components/TileCopingDeckingSectionNew';
import DrainageSectionNew from '../components/DrainageSectionNew';
import EquipmentSectionNew from '../components/EquipmentSectionNew';
import WaterFeaturesSectionNew from '../components/WaterFeaturesSectionNew';
import InteriorFinishSectionNew from '../components/InteriorFinishSectionNew';
import CustomFeaturesSectionNew from '../components/CustomFeaturesSectionNew';
import CostBreakdownView from '../components/CostBreakdownView';
import CostBreakdownPage from '../components/CostBreakdownPage';
import { TooltipAnchor } from '../components/AppTooltip';
import FranchiseLogo from '../components/FranchiseLogo';
import './ProposalForm.css';
import customerProposalIcon from '../../CustomerProposalIcon.png';
import poolSpecsIconImg from '../../docs/img/poolspecifications.png';
import excavationIconImg from '../../docs/img/excavation.png';
import plumbingIconImg from '../../docs/img/plumbing.png';
import electricIconImg from '../../docs/img/Electric.png';
import tileIconImg from '../../docs/img/tile.png';
import drainageIconImg from '../../docs/img/drainage.png';
import waterFeatureIconImg from '../../docs/img/waterfeature.png';
import interiorIconImg from '../../docs/img/interior.png';
import equipmentIconImg from '../../docs/img/equip.png';
import customIconImg from '../../docs/img/custom.png';
import costBreakIconImg from '../../docs/img/costbreak.png';
import { useToast } from '../components/Toast';
import { useProposalNotes } from '../hooks/useProposalNotes';
import { useFranchiseCapability } from '../hooks/useFranchiseCapability';
import { usePriceImpactPreferences } from '../hooks/usePriceImpactPreferences';
import ConfirmDialog from '../components/ConfirmDialog';
import PricingRevisionComparisonModal from '../components/PricingRevisionComparisonModal';
import { normalizeEquipmentLighting } from '../utils/lighting';
import { getTileSelectionId } from '../utils/tileCopingCatalogs';
import {
  getActivePricingModelMeta,
  bindPricingEditor,
  initPricingDataStore,
  getPricingDataSnapshot,
  loadPricingSnapshotForExistingProposal,
  setActivePricingModel,
  setActivePricingTier,
  subscribeToPricingData,
  withTemporaryPricingSnapshot,
} from '../services/pricingDataStore';
import pricingData from '../services/pricingData';
import { isPpasEastFranchiseCode } from '../utils/franchiseScope';
import {
  createFreshEquipmentForPackage,
  getEnabledEquipmentPackageOptions,
  getSelectedEquipmentPackage,
  getPackageWaterFeaturesWithoutExtraPump,
  isCustomEquipmentPackage,
  isFixedEquipmentPackage,
  packageAllowsAdditionalPumps,
  packageAllowsWaterFeatures,
  packageSupportsSpa,
} from '../utils/equipmentPackages';
import { getAdditionalPumpSelections, getBasePumpQuantity } from '../utils/pumpSelections';
import { listAllFranchises, listAllPricingModels } from '../services/masterAdminAdapter';
import { listPricingModels as listPricingModelsRemote } from '../services/pricingModelsAdapter';
import { getProposal as getProposalRemote, saveProposal as saveProposalRemote, isOwnProposal } from '../services/proposalsAdapter';
import { beginWorkingCopy, listChangeRequests, saveWorkingCopy, type CollaborationRequest } from '../services/proposalCollaboration';
import { captureProposalContext, assertProposalContext } from '../services/proposalContext';
import SharedPricingRevisionNotice from '../components/SharedPricingRevisionNotice';
import { needsOffContractSeparation } from '../utils/offContractSeparation';
import CloudConnectionNotice, { type CloudConnectionIssue } from '../components/CloudConnectionNotice';
import {
  getSessionCommissionRates,
  getSessionFranchiseCode,
  getSessionFranchiseId,
  getSessionRole,
  getSessionUserName,
  isMasterActingAsOwnerSession,
  isMasterSession,
  readSession,
} from '../services/session';
import {
  buildPricingRevisionComparison,
  upgradeProposalPricingRevision,
  type PricingRevisionComparison,
} from '../services/pricingRevisionReview';
import { applyActiveVersion, listAllVersions, upsertVersionInContainer } from '../utils/proposalVersions';
import { normalizeCustomFeatures } from '../utils/customFeatures';
import type { PricingData } from '../services/pricingTiers';
import { normalizeWarrantySectionsSetting } from '../utils/warranty';
import {
  normalizePapDiscounts,
  resolveProposalPapDiscounts,
} from '../utils/papDiscounts';
import {
  applyHistoricalPricingProtection,
  buildHistoricalPricingReview,
  type HistoricalPricingReview,
} from '../utils/pricingEngineCompatibility';
import {
  ensureProposalWorkflow,
  hasVersionSubmissionHistory,
  getVersionRecordStatus,
  getSignedVersionId,
  getWorkflowStatus,
  isVersionPermanentlyLocked,
  resetWorkflowAfterVersionEdit,
  submitProposalForWorkflow,
} from '../services/proposalWorkflow';
import { countSelectedWaterFeatureCategories, sanitizeWaterFeatureSelections } from '../utils/waterFeatureCost';
import { sanitizeProposalSelectionState } from '../utils/proposalSelectionSanitizer';
import { EXCAVATION_DAYS_CONTRACT_FIELD } from '../utils/additionalDigging';
import {
  FEENSTRA_MAY_2026_CALCULATION_PROFILE,
  FEENSTRA_PROPOSAL_NUMBER,
} from '../services/legacy/feenstraMay2026Profile';
import {
  BRONZE_PRICING_TIER_ID,
  NORMAL_PRICING_TIER_ID,
  PRICING_TIER_OPTIONS,
  getPricingTierName,
  isBronzePricingTier,
  normalizePricingTierId,
} from '../services/pricingTiers';
import {
  buildLoadedProposalIdentity,
  getExistingProposalSaveBlockReason,
  getUnsafeProposalOverwriteReason,
  type LoadedProposalIdentity,
} from '../utils/proposalPersistenceSafety';
import {
  calculateDrainagePriceImpact,
  calculateElectricalPriceImpact,
  calculateEquipmentPriceImpact,
  calculateExcavationPriceImpact,
  calculateInteriorFinishPriceImpact,
  calculatePlumbingPriceImpact,
  calculateTileCopingDeckingPriceImpact,
  calculateWaterFeaturePriceImpact,
  getDrainagePriceImpactTargetKey,
  getElectricalPriceImpactTargetKey,
  getEquipmentPriceImpactTargetKey,
  getExcavationPriceImpactTargetKey,
  getInteriorFinishPriceImpactTargetKey,
  getPlumbingPriceImpactTargetKey,
  getTileCopingDeckingPriceImpactTargetKey,
  getWaterFeaturePriceImpactTargetKey,
  type DrainagePriceImpactTarget,
  type ElectricalPriceImpactTarget,
  type EquipmentPriceImpactTarget,
  type ExcavationPriceImpactTarget,
  type InteriorFinishPriceImpactTarget,
  type PlumbingPriceImpactTarget,
  type PriceImpactResult,
  type TileCopingDeckingPriceImpactTarget,
  type WaterFeaturePriceImpactTarget,
} from '../services/priceImpact';
import {
  DEFAULT_PRICE_IMPACT_ENABLED,
  PRICE_IMPACT_CAPABILITY,
} from '../services/franchiseConfiguration';

const normalizeWaterFeatureSelections = (selections: any): WaterFeatureSelection[] => {
  return sanitizeWaterFeatureSelections(selections, pricingData.waterFeatures);
};

const normalizeWaterFeatures = (waterFeatures: any): WaterFeatures => {
  const customOptions = Array.isArray((waterFeatures as any)?.customOptions)
    ? (waterFeatures as any).customOptions
    : [];
  if (waterFeatures && Array.isArray((waterFeatures as any).selections)) {
    return {
      selections: normalizeWaterFeatureSelections((waterFeatures as any).selections),
      totalCost: (waterFeatures as any).totalCost ?? 0,
      customOptions,
    };
  }

  return {
    selections: [],
    totalCost: 0,
    customOptions: [],
  };
};

const formatGrossMarginIndicator = (value?: number): string => {
  const safeValue = Number.isFinite(value) ? (value as number) : 0;
  const sign = safeValue < 0 ? '-' : '';
  const fixed = Math.abs(safeValue).toFixed(2);
  const [whole, decimal] = fixed.split('.');
  const paddedWhole = (whole || '0').padStart(2, '0');
  return `${sign}${paddedWhole}.${decimal}`;
};

const buildProposalIndicator = (value?: number): string => `Proposal #26${formatGrossMarginIndicator(value)}`;

const cloneProposalData = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type SectionKey =
  | 'poolSpecs'
  | 'excavation'
  | 'plumbing'
  | 'electrical'
  | 'tileCopingDecking'
  | 'drainage'
  | 'equipment'
  | 'waterFeatures'
  | 'interiorFinish'
  | 'customFeatures';

interface SectionConfig {
  key: SectionKey;
  label: string;
  shortLabel: string;
  includeInProgress?: boolean;
}

const sectionIcons: Record<SectionKey, () => JSX.Element> = {
  poolSpecs: () => (
    <img src={poolSpecsIconImg} alt="Pool Specifications" className="nav-icon-img" />
  ),
  excavation: () => (
    <img src={excavationIconImg} alt="Excavation" className="nav-icon-img" />
  ),
  plumbing: () => (
    <img src={plumbingIconImg} alt="Plumbing" className="nav-icon-img" />
  ),
  electrical: () => (
    <img src={electricIconImg} alt="Gas / Electrical" className="nav-icon-img" />
  ),
  tileCopingDecking: () => (
    <img src={tileIconImg} alt="Tile/Coping/Decking" className="nav-icon-img" />
  ),
  drainage: () => (
    <img src={drainageIconImg} alt="Drainage" className="nav-icon-img" />
  ),
  equipment: () => (
    <img src={equipmentIconImg} alt="Equipment" className="nav-icon-img" />
  ),
  waterFeatures: () => (
    <img src={waterFeatureIconImg} alt="Water Features" className="nav-icon-img" />
  ),
  interiorFinish: () => (
    <img src={interiorIconImg} alt="Interior Finish" className="nav-icon-img" />
  ),
  customFeatures: () => (
    <img src={customIconImg} alt="Custom Features" className="nav-icon-img" />
  ),
};

const sections: SectionConfig[] = [
  { key: 'poolSpecs', label: 'Pool Specifications', shortLabel: 'Pool Specs' },
  { key: 'excavation', label: 'Excavation', shortLabel: 'Excavation' },
  { key: 'plumbing', label: 'Plumbing', shortLabel: 'Plumbing' },
  { key: 'electrical', label: 'Gas / Electrical', shortLabel: 'Gas/Electrical' },
  { key: 'tileCopingDecking', label: 'Tile / Coping /\nDecking', shortLabel: 'Tile/Coping' },
  { key: 'drainage', label: 'Drainage', shortLabel: 'Drainage' },
  { key: 'equipment', label: 'Equipment', shortLabel: 'Equipment' },
  { key: 'waterFeatures', label: 'Water Features', shortLabel: 'Water Features', includeInProgress: false },
  { key: 'interiorFinish', label: 'Interior Finish', shortLabel: 'Interior' },
  { key: 'customFeatures', label: 'Custom Features', shortLabel: 'Custom', includeInProgress: false },
];

const toFiniteNumber = (value: any): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const WATER_FEATURE_RUN_FIELDS: Array<keyof Proposal['plumbing']['runs']> = [
  'waterFeature1Run',
  'waterFeature2Run',
  'waterFeature3Run',
  'waterFeature4Run',
];

const hasPoolDefinition = (poolSpecs?: Proposal['poolSpecs']) => {
  if (!poolSpecs) return false;
  const hasGuniteDimensions =
    (poolSpecs.surfaceArea ?? 0) > 0 ||
    (poolSpecs.perimeter ?? 0) > 0 ||
    ((poolSpecs.maxLength ?? 0) > 0 && (poolSpecs.maxWidth ?? 0) > 0);
  const hasFiberglassSelection =
    poolSpecs.poolType === 'fiberglass' && (!!poolSpecs.fiberglassSize || !!poolSpecs.fiberglassModelName);
  return hasGuniteDimensions || hasFiberglassSelection;
};

const mergeEquipmentDefaults = (
  getDefaultEquipment: typeof import('../utils/proposalDefaults').getDefaultEquipment,
  inputEquipment: Partial<Proposal['equipment']> | undefined,
  poolSpecs: Proposal['poolSpecs']
) => {
  const sourceEquipment = (inputEquipment || {}) as Proposal['equipment'];
  const hasExplicitPackageTouchState = Object.prototype.hasOwnProperty.call(
    sourceEquipment,
    'packageSelectionTouched'
  );

  return normalizeEquipmentLighting(
    {
      ...getDefaultEquipment(),
      ...sourceEquipment,
      packageSelectionTouched: hasExplicitPackageTouchState
        ? sourceEquipment.packageSelectionTouched
        : sourceEquipment.packageSelectionId
          ? true
          : undefined,
    } as Proposal['equipment'],
    { poolSpecs, hasSpa: poolSpecs.spaType !== 'none' }
  );
};

const mergeWithDefaults = (input: Partial<Proposal>): Partial<Proposal> => {
  const base = getDefaultProposal();
  const pricingTierId = normalizePricingTierId(input.pricingTierId || input.pricingTierName);
  const mergedPoolSpecs = { ...getDefaultPoolSpecs(), ...(input.poolSpecs || {}) };
  const mergedEquipment = mergeEquipmentDefaults(getDefaultEquipment, input.equipment, mergedPoolSpecs);
  const defaultPlumbing = getDefaultPlumbing();
  const inputPlumbing = (input.plumbing || {}) as Partial<Proposal['plumbing']>;
  const defaultElectrical = getDefaultElectrical();
  const inputElectrical = (input.electrical || {}) as Partial<Proposal['electrical']>;
  const merged = {
    ...base,
    ...input,
    // Existing versions must retain their original engine metadata. Otherwise
    // new-proposal defaults bypass the historical saved-price review.
    pricingEngineVersion: input.pricingEngineVersion,
    historicalPricingAdjustment: input.historicalPricingAdjustment,
    customerInfo: { ...(base.customerInfo || {}), ...(input.customerInfo || {}) } as Proposal['customerInfo'],
    poolSpecs: mergedPoolSpecs,
    excavation: { ...getDefaultExcavation(), ...(input.excavation || {}) },
    plumbing: {
      ...defaultPlumbing,
      ...inputPlumbing,
      runs: mergePlumbingRuns(inputPlumbing.runs),
    },
    electrical: {
      ...defaultElectrical,
      ...inputElectrical,
      runs: { ...defaultElectrical.runs, ...(inputElectrical.runs || {}) },
    },
    tileCopingDecking: { ...getDefaultTileCopingDecking(), ...(input.tileCopingDecking || {}) },
    drainage: { ...getDefaultDrainage(), ...(input.drainage || {}) },
    equipment: mergedEquipment,
    waterFeatures: { ...getDefaultWaterFeatures(), ...(input.waterFeatures || {}) },
    interiorFinish: { ...getDefaultInteriorFinish(), ...(input.interiorFinish || {}) },
    customFeatures: normalizeCustomFeatures(input.customFeatures),
    manualAdjustments: { ...getDefaultManualAdjustments(), ...(input.manualAdjustments || {}) },
    retailAdjustments: mergeRetailAdjustments(input.retailAdjustments),
    papDiscounts: resolveProposalPapDiscounts(input, base.papDiscounts),
    costBreakdown: input.costBreakdown || base.costBreakdown,
    warrantySections: normalizeWarrantySectionsSetting(input.warrantySections),
    pricingTierId,
    pricingTierName: getPricingTierName(pricingTierId),
  };

  if (isBronzePricingTier(pricingTierId)) {
    merged.excavation = {
      ...(merged.excavation || getDefaultExcavation()),
      hasGravelInstall: isPpasEastFranchiseCode(merged.designerCode || getSessionFranchiseCode()),
    };
    merged.interiorFinish = {
      ...(merged.interiorFinish || getDefaultInteriorFinish()),
      hasWaterproofing: false,
    };
  }

  return sanitizeProposalSelectionState(merged as Proposal);
};

const getDefaultAuxiliaryPumpForCurrentPricing = (): Proposal['equipment']['auxiliaryPump'] | null => {
  const snapshot = getPricingDataSnapshot();
  const equipmentCatalog = (snapshot as any)?.equipment;
  const auxiliaryPumpCatalog =
    equipmentCatalog?.auxiliaryPumps?.length
      ? equipmentCatalog.auxiliaryPumps
      : equipmentCatalog?.pumps || [];
  const isAuxPumpPlaceholder = (name: string) => {
    const lowered = String(name || '').toLowerCase();
    return (
      lowered.includes('no pump') ||
      lowered.includes('no aux') ||
      lowered.includes('no auxiliary') ||
      lowered.includes('no blower')
    );
  };
  const defaultAuxiliaryPump =
    auxiliaryPumpCatalog.find((pump: any) => pump.defaultAuxiliaryPump) ||
    auxiliaryPumpCatalog.find((pump: any) => !isAuxPumpPlaceholder(pump.name)) ||
    auxiliaryPumpCatalog[0];
  if (!defaultAuxiliaryPump) return null;

  const pumpOverhead = equipmentCatalog?.pumpOverheadMultiplier ?? 1;
  return {
    name: defaultAuxiliaryPump.name,
    model: (defaultAuxiliaryPump as any).model,
    basePrice: (defaultAuxiliaryPump as any).basePrice,
    addCost1: (defaultAuxiliaryPump as any).addCost1,
    addCost2: (defaultAuxiliaryPump as any).addCost2,
    price: getEquipmentItemCost(defaultAuxiliaryPump as any, pumpOverhead),
  };
};

const markPersistedPackageSelectionTouched = (input: Partial<Proposal>): Partial<Proposal> => {
  if (!input.equipment?.packageSelectionId) return input;

  return {
    ...input,
    equipment: {
      ...input.equipment,
      packageSelectionTouched: true,
    },
  };
};

type ProposalFormProps = {
  cloudIssue?: CloudConnectionIssue;
  showFeedbackButton?: boolean;
  onOpenFeedback?: () => void;
};

type PricingModelOption = {
  id: string;
  name: string;
  isDefault?: boolean;
  isHiddenFromView?: boolean;
  removed?: boolean;
  franchiseId?: string;
  franchiseName?: string;
};

type ExistingProposalLoadStatus = 'loading' | 'ready' | 'error';

function ProposalForm({ cloudIssue, showFeedbackButton = false, onOpenFeedback }: ProposalFormProps) {
  const navigate = useNavigate();
  const { proposalNumber } = useParams();
  const { showToast } = useToast();
  const location = useLocation();
  const sessionRole = getSessionRole();
  const isMasterUser = isMasterSession();
  const isProposalEditingRestricted = isMasterActingAsOwnerSession();
  const isSharedWorkingCopy = Boolean((location.state as any)?.sharedWorkingCopy);
  const sharedRequestRef = useRef<CollaborationRequest | undefined>((location.state as any)?.sharedRequest);
  const loadedContextRef = useRef(captureProposalContext());
  const [sharedAccess, setSharedAccess] = useState<'view' | 'contribute' | null>(
    (location.state as any)?.sharedPermission || null);
  const [sharedEditing, setSharedEditing] = useState(Boolean((location.state as any)?.sharedStartEditing));
  const [sharedStarting, setSharedStarting] = useState(false);
  const sharedStartingRef = useRef(false);
  const [sharedSubmissionPending, setSharedSubmissionPending] = useState(Boolean((location.state as any)?.sharedSubmissionPending));
  const modelDirectoryLoadKeyRef = useRef<string | null>(null);
  const isExplicitReadOnlyVersionView = Boolean((location.state as any)?.readOnlyVersion);
  const isReadOnlyBuilderView =
    (isProposalEditingRestricted && Boolean(proposalNumber)) || isExplicitReadOnlyVersionView
    || (isSharedWorkingCopy && (!sharedEditing || sharedSubmissionPending))
    || (Boolean(sharedAccess) && (!isSharedWorkingCopy || sharedAccess !== 'contribute' || !sharedEditing || cloudIssue === 'no-internet' || cloudIssue === 'server-issue'));
  const readOnlyBuilderMessage = isExplicitReadOnlyVersionView
    ? (location.state as any)?.readOnlyOffContractCorrection
      ? 'Read-only mode preserves the saved contract total. Apply the Off-Contract correction on the proposal summary before editing this version.'
      : 'Read-only mode for archived proposal versions. Review the builder, but changes are disabled.'
    : 'Read-only mode while acting as franchise owner. Review the proposal builder, but changes are disabled.';
  const isCreationRestricted = isProposalEditingRestricted && !proposalNumber;
  const canViewCostBreakdown =
    sessionRole === 'master' || sessionRole === 'admin' || sessionRole === 'owner' || Boolean(sharedAccess);
  const canOpenCogsBreakdown = canViewCostBreakdown;
  const versionIdFromState = (location.state as any)?.versionId as string | undefined;
  const versionNameFromState = (location.state as any)?.versionName as string | undefined;
  const versionSnapshotFromState = (location.state as any)?.versionSnapshot as Proposal | undefined;
  const blockReadOnlyBuilderInteraction = (event: SyntheticEvent) => {
    if ((event.target as HTMLElement).closest('.price-impact-trigger-wrap')) return;
    event.preventDefault();
    event.stopPropagation();
  };
  useEffect(() => {
    if (!proposalNumber || !sharedAccess) return;
    let cancelled = false;
    void listChangeRequests(proposalNumber).then((requests) => {
      if (cancelled) return;
      const pending = requests.some((request) => request.contributor_id === readSession()?.userId && request.status === 'submitted');
      setSharedSubmissionPending(pending);
      if (pending) setSharedEditing(false);
    }).catch((error) => console.warn('Unable to refresh pending collaboration request.', error));
    return () => { cancelled = true; };
  }, [proposalNumber, sharedAccess]);
  const getViewportWidth = () => (typeof window !== 'undefined' ? window.innerWidth : 1920);
  const getInitialLeftNav = () => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1100;
  };
  const [currentSection, setCurrentSection] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const loadRequestRef = useRef(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showLeftNav, setShowLeftNav] = useState<boolean>(getInitialLeftNav);
  const [navManuallyToggled, setNavManuallyToggled] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(getViewportWidth);
  const [showCostModal, setShowCostModal] = useState(false);
  const [showCostBreakdownPage, setShowCostBreakdownPage] = useState(false);
  const [hasEdits, setHasEdits] = useState(false);
  const [hasUserEdits, setHasUserEdits] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [existingProposalLoadStatus, setExistingProposalLoadStatus] =
    useState<ExistingProposalLoadStatus>(proposalNumber ? 'loading' : 'ready');
  const [existingProposalLoadError, setExistingProposalLoadError] = useState<string | null>(null);
  const [loadRetryNonce, setLoadRetryNonce] = useState(0);
  const loadedProposalNumberRef = useRef<string | null>(null);
  const loadedProposalIdentityRef = useRef<LoadedProposalIdentity | null>(null);
  const loadedProposalBaselineRef = useRef<Proposal | null>(null);
  const proposalPricingSnapshotsRef = useRef(new Map<string, PricingData>());
  const pricingEditorRef = useRef<ReturnType<typeof bindPricingEditor> | null>(null);
  const pricingSelectionRequestRef = useRef(0);
  useEffect(() => () => {
    pricingSelectionRequestRef.current++;
    pricingEditorRef.current?.release(); pricingEditorRef.current = null;
  }, []);
  const bindEditorSnapshot = (snapshot: PricingData) => {
    if (pricingEditorRef.current) pricingEditorRef.current.update(snapshot);
    else pricingEditorRef.current = bindPricingEditor(snapshot);
  };
  const pricingSnapshotKey = (input: Partial<Proposal>) => [
    input.franchiseId || getSessionFranchiseId(),
    input.pricingModelFranchiseId || input.franchiseId || getSessionFranchiseId(),
    input.pricingModelId || '',
    input.pricingModelRevisionId || '',
    normalizePricingTierId(input.pricingTierId || input.pricingTierName),
  ].join('::');
  const getProposalPricingSnapshot = (input: Partial<Proposal>) => {
    const key = pricingSnapshotKey(input);
    const cached = proposalPricingSnapshotsRef.current.get(key);
    if (cached) return cached;
    const active = getActivePricingModelMeta();
    if (
      input.pricingModelId && active.pricingModelId === input.pricingModelId &&
      active.pricingModelFranchiseId === (input.pricingModelFranchiseId || input.franchiseId || getSessionFranchiseId()) &&
      (!input.pricingModelRevisionId || active.pricingModelRevisionId === input.pricingModelRevisionId) &&
      active.pricingTierId === normalizePricingTierId(input.pricingTierId || input.pricingTierName)
    ) {
      const snapshot = getPricingDataSnapshot();
      proposalPricingSnapshotsRef.current.set(key, snapshot);
      return snapshot;
    }
    return null;
  };
  const autosaveTimeoutRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const priceImpactCacheRef = useRef<
    WeakMap<object, Map<string, PriceImpactResult>>
  >(new WeakMap());
  const priceImpactProposalIdentityRef = useRef<{
    proposal: object | null;
    counter: number;
  }>({ proposal: null, counter: 0 });
  const isOffline = cloudIssue === 'no-internet' || cloudIssue === 'server-issue';
  const markUserEdit = () => {
    if (isReadOnlyBuilderView) return;
    setHasEdits(true);
    setHasUserEdits(true);
  };
  const readPapDiscountsFromModel = (): PAPDiscounts => {
    const snapshot = getPricingDataSnapshot();
    return normalizePapDiscounts(snapshot?.papDiscountRates || getDefaultPAPDiscounts());
  };
  const readManualAdjustmentsFromModel = (): ManualAdjustments => {
    const snapshot = getPricingDataSnapshot() as any;
    return snapshot?.manualAdjustments
      ? { ...snapshot.manualAdjustments }
      : getDefaultManualAdjustments();
  };
  const [, setPapDiscounts] = useState<PAPDiscounts>(readPapDiscountsFromModel());
  const [manualAdjustments, setManualAdjustments] = useState<ManualAdjustments>(readManualAdjustmentsFromModel());
  const manualAdjustmentsSourceRef = useRef<'pricingModel' | 'proposal'>('pricingModel');
  const pricingModelManualAdjustmentsRef = useRef<ManualAdjustments>(readManualAdjustmentsFromModel());
  const formHeaderRef = useRef<HTMLElement | null>(null);
  const sectionContentRef = useRef<HTMLDivElement | null>(null);
  const [formHeaderHeight, setFormHeaderHeight] = useState<number>(68);
  const [pricingModels, setPricingModels] = useState<PricingModelOption[]>([]);
  const [defaultPricingModelId, setDefaultPricingModelId] = useState<string | null>(null);
  const [selectedPricingModelId, setSelectedPricingModelId] = useState<string | null>(null);
  const [selectedPricingModelName, setSelectedPricingModelName] = useState<string | null>(null);
  const [declinedPricingComparison, setDeclinedPricingComparison] = useState<PricingRevisionComparison | null>(null);
  const [declinedPricingComparisonLoading, setDeclinedPricingComparisonLoading] = useState(false);
  const [showDeclinedPricingComparison, setShowDeclinedPricingComparison] = useState(false);
  const [showDeclinedModelChooser, setShowDeclinedModelChooser] = useState(false);
  const [pricingRevisionBusy, setPricingRevisionBusy] = useState(false);
  const [pricingRevisionError, setPricingRevisionError] = useState<string | null>(null);
  const [historicalPricingReview, setHistoricalPricingReview] = useState<HistoricalPricingReview | null>(null);
  const [selectedPricingTierId, setSelectedPricingTierId] = useState<string>(NORMAL_PRICING_TIER_ID);
  const [pendingPricingTierId, setPendingPricingTierId] = useState<string | null>(null);
  const [versionList, setVersionList] = useState<Proposal[]>([]);
  const [, setActiveVersionId] = useState<string>('original');
  const [editingVersionId, setEditingVersionId] = useState<string>('original');
  const restrictedRedirectHandledRef = useRef(false);
  const sessionCommissionRates = getSessionCommissionRates();
  const applySessionCommissionRates = (input: Partial<Proposal>): Partial<Proposal> => ({
    ...input,
    pricing: {
      ...(input.pricing || {}),
      digCommissionRate: sharedAccess || input.collaborationEnabled
        ? input.pricing?.digCommissionRate : sessionCommissionRates.digCommissionRate,
      closeoutCommissionRate: sharedAccess || input.collaborationEnabled
        ? input.pricing?.closeoutCommissionRate : sessionCommissionRates.closeoutCommissionRate,
    } as Proposal['pricing'],
  });

  useEffect(() => {
    if (canOpenCogsBreakdown) return;
    setShowCostBreakdownPage(false);
  }, [canOpenCogsBreakdown]);

  const syncPapDiscountsFromModel = () => {
    setPapDiscounts(readPapDiscountsFromModel());
  };

  const mergeDesignerAdjustmentsWithModel = (nextModelAdjustments: ManualAdjustments) => {
    if (manualAdjustmentsSourceRef.current !== 'proposal') {
      return { merged: nextModelAdjustments, carriedDesignerAdjustments: false };
    }

    const previousModelAdjustments = pricingModelManualAdjustmentsRef.current || getDefaultManualAdjustments();
    const currentDesignerAdjustments = manualAdjustments || getDefaultManualAdjustments();
    const merged: ManualAdjustments = { ...nextModelAdjustments };
    let carriedDesignerAdjustments = false;

    const moveOverrides = (keys: (keyof ManualAdjustments)[]) => {
      keys.forEach((key) => {
        const currentValue = currentDesignerAdjustments[key] ?? 0;
        const previousModelValue = previousModelAdjustments[key] ?? 0;
        const hasDesignerOverride = currentValue !== 0 && currentValue !== previousModelValue;
        if (!hasDesignerOverride) return;

        if ((merged[key] ?? 0) === 0) {
          merged[key] = currentValue;
          carriedDesignerAdjustments = true;
          return;
        }

        const openKey = keys.find((candidate) => (merged[candidate] ?? 0) === 0);
        if (openKey) {
          merged[openKey] = currentValue;
          carriedDesignerAdjustments = true;
        }
      });
    };

    moveOverrides(['positive1', 'positive2']);
    moveOverrides(['negative1', 'negative2']);

    return { merged, carriedDesignerAdjustments };
  };

  const applyPricingModelSelection = async (
    modelId: string | null,
    modelName?: string | null,
    isDefault?: boolean,
    skipRemote?: boolean,
    markDirty?: boolean,
    modelFranchiseId?: string | null
  ) => {
    const selectionRequest = ++pricingSelectionRequestRef.current;
    const context = captureProposalContext();
    const activeTierId = normalizePricingTierId(latestProposalRef.current.pricingTierId || selectedPricingTierId);
    let selectedSnapshot: Awaited<ReturnType<typeof loadPricingSnapshotForExistingProposal>> | null = null;
    if (modelId && !skipRemote) {
      await setActivePricingModel(modelId, modelFranchiseId || undefined, activeTierId);
      assertProposalContext(context);
      if (selectionRequest !== pricingSelectionRequestRef.current) return;
      const meta = getActivePricingModelMeta();
      selectedSnapshot = await loadPricingSnapshotForExistingProposal(latestProposalRef.current.franchiseId || getSessionFranchiseId(),
        modelId, modelFranchiseId || meta.pricingModelFranchiseId || undefined, activeTierId, meta.pricingModelRevisionId);
      assertProposalContext(context);
      if (selectionRequest !== pricingSelectionRequestRef.current) return;
      bindEditorSnapshot(selectedSnapshot.pricing);
      proposalPricingSnapshotsRef.current.set(pricingSnapshotKey({ ...latestProposalRef.current,
        pricingModelId: modelId, pricingModelFranchiseId: selectedSnapshot.pricingModelFranchiseId || undefined,
        pricingModelRevisionId: selectedSnapshot.pricingModelRevisionId || undefined }), selectedSnapshot.pricing);
    }
    const activeModelMeta = selectedSnapshot || getActivePricingModelMeta();
    syncPapDiscountsFromModel();

    const nextModelAdjustments = readManualAdjustmentsFromModel();
    pricingModelManualAdjustmentsRef.current = nextModelAdjustments;
    if (manualAdjustmentsSourceRef.current === 'proposal') {
      const { merged, carriedDesignerAdjustments } = mergeDesignerAdjustmentsWithModel(nextModelAdjustments);
      setManualAdjustments(merged);
      setProposal((prev) => ({ ...prev, manualAdjustments: merged }));
      manualAdjustmentsSourceRef.current = carriedDesignerAdjustments ? 'proposal' : 'pricingModel';
    } else {
      setManualAdjustments(nextModelAdjustments);
      manualAdjustmentsSourceRef.current = 'pricingModel';
      setProposal((prev) => ({ ...prev, manualAdjustments: nextModelAdjustments }));
    }

    setSelectedPricingModelId(modelId);
    setSelectedPricingModelName(modelName || null);
    setProposal((prev) => ({
      ...prev,
      pricingModelId: modelId || undefined,
      pricingModelName: modelName || undefined,
      pricingModelFranchiseId:
        modelId ? modelFranchiseId || prev.pricingModelFranchiseId || prev.franchiseId || getSessionFranchiseId() : undefined,
      pricingModelIsDefault: isDefault ?? undefined,
      pricingModelRevisionId:
        modelId && !skipRemote
          ? activeModelMeta.pricingModelRevisionId || undefined
          : prev.pricingModelRevisionId,
      pricingModelRevisionNumber:
        modelId && !skipRemote
          ? activeModelMeta.pricingModelRevisionNumber || undefined
          : prev.pricingModelRevisionNumber,
      pricingRevisionReview: modelId && !skipRemote ? null : prev.pricingRevisionReview,
      pricingTierId: activeTierId,
      pricingTierName: getPricingTierName(activeTierId),
      franchiseId: prev.franchiseId || getSessionFranchiseId(),
    }));
    if (markDirty) {
      markUserEdit();
    }
  };

  const loadPricingModels = async (
    franchiseId: string,
    desiredModelId?: string | null,
    desiredModelFranchiseId?: string | null
  ) => {
    const context = captureProposalContext();
    const directoryKeyAtStart = modelDirectoryLoadKeyRef.current;
    try {
      let models: PricingModelOption[] = [];
      const franchiseNameLookup = new Map<string, string>();

      if (isMasterUser) {
        const [allModels, franchises] = await Promise.all([listAllPricingModels(), listAllFranchises()]);
        (franchises || []).forEach((franchise) => {
          if (!franchise?.id) return;
          franchiseNameLookup.set(franchise.id, franchise.name || franchise.franchiseCode || franchise.id);
        });
        models = (allModels || [])
          .map((model) => ({
            id: model.id,
            name: model.name,
            isDefault: model.isDefault,
            isHiddenFromView: model.isHiddenFromView,
            franchiseId: model.franchiseId,
            franchiseName: franchiseNameLookup.get(model.franchiseId) || model.franchiseId,
          }))
          .sort((a, b) => {
            const aCurrent = (a.franchiseId || franchiseId) === franchiseId ? 0 : 1;
            const bCurrent = (b.franchiseId || franchiseId) === franchiseId ? 0 : 1;
            if (aCurrent !== bCurrent) return aCurrent - bCurrent;
            const aFranchise = (a.franchiseName || a.franchiseId || '').toLowerCase();
            const bFranchise = (b.franchiseName || b.franchiseId || '').toLowerCase();
            if (aFranchise !== bFranchise) return aFranchise.localeCompare(bFranchise);
            return (a.name || '').localeCompare(b.name || '');
          });
      } else {
        const rows = await listPricingModelsRemote(franchiseId);
        models = (rows || []).map((row) => ({
          ...row,
          franchiseId,
        }));
      }

      assertProposalContext(context);
      if (directoryKeyAtStart !== modelDirectoryLoadKeyRef.current) return;
      const visibleModels = models.filter((model) => !model.isHiddenFromView);
      const visibleCurrentFranchiseModels = visibleModels.filter((model) => (model.franchiseId || franchiseId) === franchiseId);
      const defaultModel = visibleCurrentFranchiseModels.find((model) => model.isDefault) || visibleCurrentFranchiseModels[0];
      setDefaultPricingModelId(defaultModel ? defaultModel.id : null);

      const targetModelId = desiredModelId || selectedPricingModelId || defaultModel?.id || null;
      const targetModel =
        models.find(
          (model) =>
            model.id === targetModelId &&
            (!desiredModelFranchiseId || !model.franchiseId || model.franchiseId === desiredModelFranchiseId)
        ) ||
        models.find((model) => model.id === targetModelId) ||
        null;

      const missingModelId = desiredModelId || selectedPricingModelId;
      const missingModelKnown = missingModelId && models.some((model) => model.id === missingModelId);
      if (missingModelId && !missingModelKnown) {
        const placeholderName = proposal.pricingModelName || selectedPricingModelName || 'Unknown Pricing Model';
        const placeholderFranchiseId =
          desiredModelFranchiseId ||
          proposal.pricingModelFranchiseId ||
          pricingModels.find((model) => model.id === missingModelId)?.franchiseId ||
          franchiseId;
        const removedModel = {
          id: missingModelId,
          name: `${placeholderName} (Removed)`,
          isDefault: false,
          isHiddenFromView: false,
          franchiseId: placeholderFranchiseId,
          franchiseName: franchiseNameLookup.get(placeholderFranchiseId) || placeholderFranchiseId,
          removed: true,
        };
        models = [...models, removedModel];
        const selectableModels = [...visibleModels, removedModel];
        setSelectedPricingModelId(missingModelId);
        setSelectedPricingModelName(removedModel.name);
        setProposal((prev) => ({
          ...prev,
          pricingModelId: missingModelId || undefined,
          pricingModelName: placeholderName || undefined,
          pricingModelFranchiseId: placeholderFranchiseId || undefined,
          pricingModelIsDefault: false,
        }));
        setPricingModels(selectableModels);
        return;
      }
      const selectableModels =
        targetModel && targetModel.isHiddenFromView && !visibleModels.some((model) => model.id === targetModel.id)
          ? [...visibleModels, targetModel]
          : visibleModels;
      setPricingModels(selectableModels);

      if (targetModel) {
        if (desiredModelId) {
          // Hydrating the directory for an existing proposal is not a pricing
          // model selection. Preserve its immutable revision and any pending or
          // declined review decision until the user explicitly changes/upgrades.
          setSelectedPricingModelId(targetModel.id);
          setSelectedPricingModelName(targetModel.name);
        } else {
          await applyPricingModelSelection(
            targetModel.id,
            targetModel.name,
            Boolean(targetModel.isDefault),
            Boolean(targetModel.removed),
            false,
            targetModel.franchiseId
          );
        }
      } else if (!desiredModelId && defaultModel) {
        await applyPricingModelSelection(
          defaultModel.id,
          defaultModel.name,
          Boolean(defaultModel.isDefault),
          Boolean(defaultModel.removed),
          false,
          defaultModel.franchiseId
        );
      }
    } catch (error) {
      console.warn('Unable to load pricing models for franchise', franchiseId, error);
    }
  };

  const buildStartingEquipment = (
    poolSpecs?: Proposal['poolSpecs'],
    currentEquipment?: Proposal['equipment']
  ): Proposal['equipment'] => {
    const hasSpa = (poolSpecs?.spaType ?? 'none') !== 'none';
    const hasPool = hasPoolDefinition(poolSpecs);
    const enabledPackageOptions = getEnabledEquipmentPackageOptions();
    const selectedPackage = getSelectedEquipmentPackage(currentEquipment as any);
    const onlyAvailablePackage =
      enabledPackageOptions.length === 1 && !isCustomEquipmentPackage(enabledPackageOptions[0])
        ? enabledPackageOptions[0]
        : null;

    if (selectedPackage && hasPool) {
      const next = createFreshEquipmentForPackage(selectedPackage, { hasPool, hasSpa });
      next.addOns = equipmentAllowsAddOns(next) ? (currentEquipment?.addOns ?? defaultAddOns('equipment')) : [];
      return next;
    }

    if (onlyAvailablePackage && hasPool) {
      const next = createFreshEquipmentForPackage(onlyAvailablePackage, { hasPool, hasSpa });
      next.addOns = equipmentAllowsAddOns(next) ? (currentEquipment?.addOns ?? defaultAddOns('equipment')) : [];
      return next;
    }

    return normalizeEquipmentLighting(
      {
        ...getDefaultEquipment(),
        addOns: currentEquipment?.addOns ?? defaultAddOns('equipment'),
        packageSelectionId: undefined,
        packageSelectionTouched: false,
      } as Proposal['equipment'],
      { poolSpecs, hasPool, hasSpa }
    );
  };

  useEffect(() => {
    // Ensure each section starts at top when navigating
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (sectionContentRef.current) {
      sectionContentRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [currentSection]);

  useEffect(() => {
    const handleResize = () => {
      const width = getViewportWidth();
      setViewportWidth(width);
      const forceHideNav = width < 1024;
      if (forceHideNav && showLeftNav) {
        setShowLeftNav(false);
      } else if (!navManuallyToggled && width > 1200 && !showLeftNav) {
        setShowLeftNav(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [navManuallyToggled, showLeftNav]);

  useEffect(() => {
    const header = formHeaderRef.current;
    if (!header) return;

    const updateHeaderHeight = () => {
      const nextHeight = Math.ceil(header.getBoundingClientRect().height);
      setFormHeaderHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    updateHeaderHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateHeaderHeight());
      observer.observe(header);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateHeaderHeight);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, []);

  const getInitialProposal = (): Partial<Proposal> => {
    const base = getDefaultProposal();
    const franchiseId = getSessionFranchiseId();
    const designerName = getSessionUserName();
    const designerRole = getSessionRole();
    const designerCode = getSessionFranchiseCode();
    const modelMeta = getActivePricingModelMeta();
    const shouldUseActiveDefault = Boolean(modelMeta.isDefault && modelMeta.pricingModelId);
    return {
      ...base,
      ...(designerCode === '5555' || isMasterUser
        ? { westConstructionTimingVersion: 'permit-and-dig-v1' as const }
        : {}),
      poolSpecs: { ...base.poolSpecs!, fiberglassSpecAutofillEnabled: true },
      franchiseId,
      designerName,
      designerAuthUserId: readSession()?.userId,
      designerRole,
      designerCode,
      interiorFinish: base.interiorFinish as Proposal['interiorFinish'],
      pricing: {
        ...(base.pricing || {}),
        digCommissionRate: sessionCommissionRates.digCommissionRate,
        closeoutCommissionRate: sessionCommissionRates.closeoutCommissionRate,
      } as Proposal['pricing'],
      pricingModelId: shouldUseActiveDefault ? modelMeta.pricingModelId || undefined : undefined,
      pricingModelName: shouldUseActiveDefault ? modelMeta.pricingModelName || undefined : undefined,
      pricingModelFranchiseId: shouldUseActiveDefault ? modelMeta.pricingModelFranchiseId || franchiseId : undefined,
      pricingModelIsDefault: shouldUseActiveDefault ? modelMeta.isDefault : undefined,
      pricingModelRevisionId: shouldUseActiveDefault ? modelMeta.pricingModelRevisionId || undefined : undefined,
      pricingModelRevisionNumber: shouldUseActiveDefault
        ? modelMeta.pricingModelRevisionNumber || undefined
        : undefined,
      pricingTierId: NORMAL_PRICING_TIER_ID,
      pricingTierName: getPricingTierName(NORMAL_PRICING_TIER_ID),
      equipment: buildStartingEquipment(base.poolSpecs),
    };
  };

  const [proposal, setProposal] = useState<Partial<Proposal>>(proposalNumber ? {} : getInitialProposal());
  const canChooseProposalRevisions = !isReadOnlyBuilderView &&
    (!proposalNumber || isOwnProposal(proposal as Proposal, readSession()));
  const proposalNotesFranchiseId = proposal.franchiseId || getSessionFranchiseId();
  const { notes: proposalNoteOverrides } = useProposalNotes(proposalNotesFranchiseId);
  const { enabled: franchisePriceImpactEnabled } = useFranchiseCapability(
    PRICE_IMPACT_CAPABILITY,
    proposalNotesFranchiseId,
    DEFAULT_PRICE_IMPACT_ENABLED
  );
  const {
    enabled: userPriceImpactEnabled,
    displayBasis: priceImpactDisplayBasis,
  } = usePriceImpactPreferences();
  const priceImpactEnabled = franchisePriceImpactEnabled && userPriceImpactEnabled;
  const latestProposalRef = useRef<Partial<Proposal>>(proposal);
  const previousSpaTypeRef = useRef<string>(proposal.poolSpecs?.spaType ?? 'none');
  const previousHasPoolRef = useRef<boolean>(hasPoolDefinition(proposal.poolSpecs));

  useEffect(() => {
    latestProposalRef.current = proposal;
  }, [proposal]);

  useEffect(() => {
    let cancelled = false;
    const review = proposal.pricingRevisionReview;
    if (
      isLoading ||
      !canChooseProposalRevisions ||
      !proposalNumber ||
      review?.decision !== 'declined' ||
      !proposal.pricingModelRevisionId ||
      isVersionPermanentlyLocked(proposal as Proposal)
    ) {
      setDeclinedPricingComparison(null);
      setDeclinedPricingComparisonLoading(false);
      setShowDeclinedModelChooser(false);
      return () => {
        cancelled = true;
      };
    }

    setDeclinedPricingComparisonLoading(true);
    setPricingRevisionError(null);
    void buildPricingRevisionComparison(proposal as Proposal)
      .then((comparison) => {
        if (cancelled) return;
        // A later revision may have been published after the user declined.
        // Keep the upgrade path available and compare against the true latest
        // revision instead of hiding the control because the IDs differ.
        setDeclinedPricingComparison(comparison);
        if (!comparison) {
          setPricingRevisionError('The newest pricing revision is not available for comparison.');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('Unable to check declined pricing revision:', error);
          setDeclinedPricingComparison(null);
          setPricingRevisionError('Unable to compare pricing revisions. Check your connection and try again.');
        }
      })
      .finally(() => {
        if (!cancelled) setDeclinedPricingComparisonLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    isLoading,
    canChooseProposalRevisions,
    proposal.pricingModelId,
    proposal.pricingModelRevisionId,
    proposal.pricingRevisionReview,
    proposal.status,
    proposal.workflow?.status,
    proposalNumber,
  ]);

  useEffect(() => {
    if (restrictedRedirectHandledRef.current) return;
    if (!isProposalEditingRestricted) return;
    restrictedRedirectHandledRef.current = true;
    if (isCreationRestricted) {
      showToast({
        type: 'warning',
        message: 'Master accounts acting as owner cannot create proposals.',
      });
      navigate('/', { replace: true });
      return;
    }
    showToast({
      type: 'warning',
      message: 'Master accounts acting as owner can view proposals here, but this builder is read-only.',
    });
  }, [isCreationRestricted, isProposalEditingRestricted, navigate, showToast]);

  useEffect(() => {
    const unsubscribe = subscribeToPricingData((snapshot) => {
      const current = latestProposalRef.current;
      const active = getActivePricingModelMeta();
      // A background pricing load must not replace this proposal's defaults.
      if (current.pricingModelId && (
        active.pricingModelId !== current.pricingModelId ||
        (current.pricingModelRevisionId && active.pricingModelRevisionId !== current.pricingModelRevisionId) ||
        active.pricingTierId !== normalizePricingTierId(current.pricingTierId || current.pricingTierName)
      )) return;
      if (snapshot?.papDiscountRates) {
        setPapDiscounts(normalizePapDiscounts(snapshot.papDiscountRates as PAPDiscounts));
      }
      if (snapshot?.manualAdjustments && manualAdjustmentsSourceRef.current === 'pricingModel') {
        pricingModelManualAdjustmentsRef.current = snapshot.manualAdjustments as ManualAdjustments;
        setManualAdjustments(snapshot.manualAdjustments as any);
        manualAdjustmentsSourceRef.current = 'pricingModel';
        setProposal((prev) => ({ ...prev, manualAdjustments: snapshot.manualAdjustments as any }));
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const currentSpaType = proposal.poolSpecs?.spaType ?? 'none';
    const hasSpa = currentSpaType !== 'none';
    const previousSpaType = previousSpaTypeRef.current ?? 'none';
    const spaJustAdded = previousSpaType === 'none' && currentSpaType !== 'none';
    const spaRemoved = previousSpaType !== 'none' && currentSpaType === 'none';
    const hasSpaLightSelection = (proposal.equipment?.spaLights?.length ?? 0) > 0;
    const auxiliarySelections = proposal.equipment?.auxiliaryPumps?.length
      ? proposal.equipment.auxiliaryPumps
      : proposal.equipment?.auxiliaryPump
      ? [proposal.equipment.auxiliaryPump]
      : [];
    const hasSpaSupportingAuxPump = auxiliarySelections.some(
      (pump) => pump && pump.autoAddedReason !== 'waterFeature'
    );
    const hasAutoAddedAuxPump = auxiliarySelections.some(pump => pump?.autoAddedForSpa);

    const auxiliaryPumpCatalog =
      (pricingData as any).equipment?.auxiliaryPumps?.length
        ? (pricingData as any).equipment.auxiliaryPumps
        : pricingData.equipment.pumps;
    const isAuxPumpPlaceholder = (name: string) => {
      const lowered = name.toLowerCase();
      return lowered.includes('no pump') || lowered.includes('no aux') || lowered.includes('no auxiliary') || lowered.includes('no blower');
    };
    const defaultAuxiliaryPump =
      auxiliaryPumpCatalog.find((pump: any) => pump.defaultAuxiliaryPump) ||
      auxiliaryPumpCatalog.find((pump: any) => !isAuxPumpPlaceholder(pump.name)) ||
      auxiliaryPumpCatalog[0];
    const pumpOverhead = (pricingData as any).equipment?.pumpOverheadMultiplier ?? 1;
    const buildAuxiliaryPumpSelection = (pump: any) =>
      pump
        ? {
            name: pump.name,
            model: (pump as any).model,
            basePrice: (pump as any).basePrice,
            addCost1: (pump as any).addCost1,
            addCost2: (pump as any).addCost2,
            price: getEquipmentItemCost(pump as any, pumpOverhead),
            autoAddedForSpa: true,
            autoAddedReason: 'spa' as const,
          }
        : null;

    const shouldAddSpaLight = spaJustAdded && !hasSpaLightSelection;
    const shouldAddAuxPump = hasSpa && !hasSpaSupportingAuxPump && Boolean(defaultAuxiliaryPump);

    if (shouldAddSpaLight || shouldAddAuxPump) {
      setProposal(prev => {
        const baseEquipment = (prev.equipment || getDefaultEquipment()) as Proposal['equipment'];
        let nextEquipment = baseEquipment;
        let updated = false;

        if (shouldAddSpaLight) {
          const basePoolSpecs = { ...(prev.poolSpecs || {}), spaType: currentSpaType } as Proposal['poolSpecs'];
          const selectedPackage = getSelectedEquipmentPackage(baseEquipment as any);
          const shouldUsePackageSeed = !proposalNumber && selectedPackage && packageSupportsSpa(selectedPackage);
          const packageSeed = shouldUsePackageSeed
            ? createFreshEquipmentForPackage(selectedPackage, {
                hasPool: hasPoolDefinition(basePoolSpecs),
                hasSpa: true,
              })
            : null;

          nextEquipment =
            (packageSeed?.spaLights?.length ?? 0) > 0
              ? {
                  ...nextEquipment,
                  includeSpaLights: packageSeed?.includeSpaLights,
                  spaLights: packageSeed?.spaLights || [],
                  hasSpaLight: true,
                }
              : normalizeEquipmentLighting(
                  {
                    ...nextEquipment,
                    includeSpaLights: true,
                  } as Proposal['equipment'],
                  { poolSpecs: basePoolSpecs, hasSpa: true }
                );
          updated = true;
        }

        if (shouldAddAuxPump) {
          const selection = buildAuxiliaryPumpSelection(defaultAuxiliaryPump);
          if (selection) {
            nextEquipment = {
              ...nextEquipment,
              auxiliaryPumps: [selection],
              auxiliaryPump: selection,
            };
            updated = true;
          }
        }

        return updated
          ? sanitizeProposalSelectionState({ ...prev, equipment: nextEquipment } as Proposal)
          : prev;
      });
      setHasEdits(true);
    } else if (spaRemoved && ((proposal.equipment?.spaLights?.length ?? 0) > 0 || hasAutoAddedAuxPump)) {
      setProposal(prev => {
        const baseEquipment = (prev.equipment || getDefaultEquipment()) as Proposal['equipment'];
        let nextEquipment = { ...baseEquipment };
        let updated = false;

        if ((baseEquipment.spaLights?.length ?? 0) > 0) {
          nextEquipment = {
            ...nextEquipment,
            includeSpaLights: false,
            spaLights: [],
            hasSpaLight: false,
          };
          updated = true;
        }

        const auxSelections = baseEquipment.auxiliaryPumps?.length
          ? baseEquipment.auxiliaryPumps
          : baseEquipment.auxiliaryPump
          ? [baseEquipment.auxiliaryPump]
          : [];
        const filteredAux = auxSelections.filter(pump => !pump?.autoAddedForSpa);

        if (filteredAux.length !== auxSelections.length) {
          nextEquipment = {
            ...nextEquipment,
            auxiliaryPumps: filteredAux,
            auxiliaryPump: filteredAux[0],
          };
          updated = true;
        }

        return updated
          ? sanitizeProposalSelectionState({ ...prev, equipment: nextEquipment } as Proposal)
          : prev;
      });
      setHasEdits(true);
    }

    previousSpaTypeRef.current = currentSpaType;
  }, [
    proposal.poolSpecs?.spaType,
    proposal.equipment?.spaLights?.length,
    proposal.equipment?.auxiliaryPumps?.length,
    proposal.equipment?.auxiliaryPump,
  ]);

  useEffect(() => {
    const hasPool = hasPoolDefinition(proposal.poolSpecs);
    const previousHasPool = previousHasPoolRef.current;
    const poolJustAdded = !previousHasPool && hasPool;
    const poolRemoved = previousHasPool && !hasPool;
    const hasPoolLightSelection = (proposal.equipment?.poolLights?.length ?? 0) > 0;
    const shouldAutoAddPoolLight = proposal.equipment?.includePoolLights !== false;

    if (poolJustAdded && !hasPoolLightSelection && shouldAutoAddPoolLight) {
      setProposal(prev => {
        const baseEquipment = (prev.equipment || getDefaultEquipment()) as Proposal['equipment'];
        const selectedPackage = getSelectedEquipmentPackage(baseEquipment as any);
        const packageSeed = selectedPackage
          ? createFreshEquipmentForPackage(selectedPackage, {
              hasPool: true,
              hasSpa: (prev.poolSpecs?.spaType ?? 'none') !== 'none',
            })
          : null;
        const nextEquipment =
          (packageSeed?.poolLights?.length ?? 0) > 0
            ? {
                ...baseEquipment,
                includePoolLights: packageSeed?.includePoolLights,
                applyCustomPackageDefaultPoolLights: packageSeed?.applyCustomPackageDefaultPoolLights,
                poolLights: packageSeed?.poolLights || [],
                numberOfLights:
                  packageSeed?.numberOfLights ??
                  Math.max((packageSeed?.poolLights?.length ?? 1) - 1, 0),
              }
            : normalizeEquipmentLighting(
                {
                  ...baseEquipment,
                  includePoolLights: true,
                } as Proposal['equipment'],
                {
                  poolSpecs: { ...(prev.poolSpecs || {}) } as any,
                  hasPool: true,
                  hasSpa: (prev.poolSpecs?.spaType ?? 'none') !== 'none',
                }
              );
        return sanitizeProposalSelectionState({ ...prev, equipment: nextEquipment } as Proposal);
      });
      setHasEdits(true);
    } else if (poolRemoved && (proposal.equipment?.poolLights?.length ?? 0) > 0) {
      setProposal(prev =>
        sanitizeProposalSelectionState({
          ...prev,
          equipment: {
            ...(prev.equipment || getDefaultEquipment()),
            includePoolLights: false,
            poolLights: [],
            numberOfLights: 0,
          },
        } as Proposal)
      );
      setHasEdits(true);
    }

    previousHasPoolRef.current = hasPool;
  }, [proposal.poolSpecs, proposal.equipment?.poolLights?.length]);

  useEffect(() => {
    const hasPool = hasPoolDefinition(proposal.poolSpecs);
    if (!hasPool) return;

    const equipment = proposal.equipment || getDefaultEquipment();
    if ((equipment.poolLights?.length ?? 0) > 0) return;
    if (equipment.applyCustomPackageDefaultPoolLights === false) return;

    const selectedPackage = getSelectedEquipmentPackage(equipment as any);
    if (!selectedPackage || !isCustomEquipmentPackage(selectedPackage)) return;

    const packageSeed = createFreshEquipmentForPackage(selectedPackage, {
      hasPool: true,
      hasSpa: (proposal.poolSpecs?.spaType ?? 'none') !== 'none',
    });
    if ((packageSeed.poolLights?.length ?? 0) === 0) return;

    setProposal((prev) => {
      const baseEquipment = (prev.equipment || getDefaultEquipment()) as Proposal['equipment'];
      if ((baseEquipment.poolLights?.length ?? 0) > 0) return prev;
      if (baseEquipment.applyCustomPackageDefaultPoolLights === false) return prev;

      return sanitizeProposalSelectionState({
        ...prev,
        equipment: {
          ...baseEquipment,
          includePoolLights: packageSeed.includePoolLights,
          applyCustomPackageDefaultPoolLights: packageSeed.applyCustomPackageDefaultPoolLights,
          poolLights: packageSeed.poolLights || [],
          numberOfLights:
            packageSeed.numberOfLights ?? Math.max((packageSeed.poolLights?.length ?? 1) - 1, 0),
        },
      } as Proposal);
    });
    setHasEdits(true);
  }, [
    proposal.poolSpecs,
    proposal.equipment?.packageSelectionId,
    proposal.equipment?.poolLights?.length,
    proposal.equipment?.applyCustomPackageDefaultPoolLights,
    proposal.pricingModelId,
    proposal.pricingModelFranchiseId,
  ]);

  useEffect(() => {
    const selectedPackage = getSelectedEquipmentPackage(proposal.equipment as any);
    if (!selectedPackage || !isFixedEquipmentPackage(selectedPackage) || packageAllowsAdditionalPumps(selectedPackage)) {
      return;
    }

    const equipment = proposal.equipment || getDefaultEquipment();
    const auxiliarySelections = equipment.auxiliaryPumps?.length
      ? equipment.auxiliaryPumps
      : equipment.auxiliaryPump
      ? [equipment.auxiliaryPump]
      : [];
    const includedPumpQuantity = Math.max(selectedPackage.includedPumpQuantity ?? 0, 0);
    const shouldResetPumpQuantity = getBasePumpQuantity(equipment) !== includedPumpQuantity;
    const additionalPrimaryPumps = getAdditionalPumpSelections(equipment);

    if (!auxiliarySelections.length && !additionalPrimaryPumps.length && !shouldResetPumpQuantity) {
      return;
    }

    setProposal((prev) => {
      const baseEquipment = (prev.equipment || getDefaultEquipment()) as Proposal['equipment'];
      const activePackage = getSelectedEquipmentPackage(baseEquipment as any);
      if (!activePackage || !isFixedEquipmentPackage(activePackage) || packageAllowsAdditionalPumps(activePackage)) {
        return prev;
      }

      const normalizedPumpQuantity = Math.max(activePackage.includedPumpQuantity ?? 0, 0);
      return sanitizeProposalSelectionState({
        ...prev,
        equipment: {
          ...baseEquipment,
          pumpQuantity: normalizedPumpQuantity,
          additionalPumps: [],
          auxiliaryPumps: [],
          auxiliaryPump: undefined,
        } as Proposal['equipment'],
      } as Proposal);
    });
    setHasEdits(true);
  }, [proposal.equipment]);

  useEffect(() => {
    const selectedPackage = getSelectedEquipmentPackage(proposal.equipment as any);
    const isAuxPumpPlaceholder = (name: string) => {
      const lowered = name.toLowerCase();
      return lowered.includes('no pump') || lowered.includes('no aux') || lowered.includes('no auxiliary') || lowered.includes('no blower');
    };
    const pumpOverhead = (pricingData as any).equipment?.pumpOverheadMultiplier ?? 1;
    const activePumpOptions = pricingData.equipment.pumps.filter(
      (pump) => !isAuxPumpPlaceholder(String(pump?.name || ''))
    );
    const findActivePumpOption = (name?: string | null) => {
      const target = String(name || '').trim().toLowerCase();
      if (!target) return undefined;
      return activePumpOptions.find((pump) => String(pump?.name || '').trim().toLowerCase() === target);
    };
    const buildWaterFeaturePump = (pump: any) =>
      pump
        ? {
            name: pump.name,
            model: (pump as any).model,
            basePrice: (pump as any).basePrice,
            addCost1: (pump as any).addCost1,
            addCost2: (pump as any).addCost2,
            price: getEquipmentItemCost(pump as any, pumpOverhead),
            autoAddedReason: 'waterFeature' as const,
          }
        : null;
    const selectedWaterFeatureCategoryCount = countSelectedWaterFeatureCategories(
      proposal.waterFeatures?.selections || [],
      pricingData.waterFeatures
    );

    const equipment = proposal.equipment || getDefaultEquipment();
    const additionalPrimaryPumps = getAdditionalPumpSelections(equipment);
    const hasManualAdditionalPump = additionalPrimaryPumps.some((pump) => pump?.autoAddedReason !== 'waterFeature');
    const explicitAdditionalPumps = Array.isArray(equipment.additionalPumps) ? equipment.additionalPumps.filter(Boolean) : [];
    const waterFeatureAutoPumps = explicitAdditionalPumps.filter((pump) => pump?.autoAddedReason === 'waterFeature');

    if (!selectedPackage || !isFixedEquipmentPackage(selectedPackage) || !packageAllowsWaterFeatures(selectedPackage)) {
      if (waterFeatureAutoPumps.length > 0) {
        setProposal((prev) => {
          const baseEquipment = (prev.equipment || getDefaultEquipment()) as Proposal['equipment'];
          const nextAdditionalSelections = getAdditionalPumpSelections(baseEquipment).filter(
            (pump) => pump?.autoAddedReason !== 'waterFeature'
          );
          return sanitizeProposalSelectionState({
            ...prev,
            equipment: {
              ...baseEquipment,
              additionalPumps: nextAdditionalSelections,
            } as Proposal['equipment'],
          } as Proposal);
        });
        setHasEdits(true);
      }
      return;
    }

    const allowance = getPackageWaterFeaturesWithoutExtraPump(selectedPackage);
    const needsAdditionalPump = selectedWaterFeatureCategoryCount > allowance;

    if (needsAdditionalPump && !hasManualAdditionalPump && waterFeatureAutoPumps.length === 0 && !equipment.waterFeatureAutoPumpDismissed) {
      const selection = buildWaterFeaturePump(
        findActivePumpOption(equipment.pump?.name) || activePumpOptions[0]
      );
      if (!selection) return;
      setProposal((prev) => {
        const baseEquipment = (prev.equipment || getDefaultEquipment()) as Proposal['equipment'];
        const currentAdditionalSelections = getAdditionalPumpSelections(baseEquipment);
        const nextAdditionalSelections = [...currentAdditionalSelections, selection];
        return sanitizeProposalSelectionState({
          ...prev,
          equipment: {
            ...baseEquipment,
            additionalPumps: nextAdditionalSelections,
          } as Proposal['equipment'],
        } as Proposal);
      });
      setHasEdits(true);
      return;
    }

    if (!needsAdditionalPump && (waterFeatureAutoPumps.length > 0 || equipment.waterFeatureAutoPumpDismissed)) {
      setProposal((prev) => {
        const baseEquipment = (prev.equipment || getDefaultEquipment()) as Proposal['equipment'];
        const currentAdditionalSelections = getAdditionalPumpSelections(baseEquipment);
        const nextAdditionalSelections = currentAdditionalSelections.filter((pump) => pump?.autoAddedReason !== 'waterFeature');
        return sanitizeProposalSelectionState({
          ...prev,
          equipment: {
            ...baseEquipment,
            additionalPumps: nextAdditionalSelections,
            waterFeatureAutoPumpDismissed: false,
          } as Proposal['equipment'],
        } as Proposal);
      });
      setHasEdits(true);
    }
  }, [
    proposal.equipment,
    proposal.waterFeatures?.selections,
  ]);

  useEffect(() => {
    const requestId = ++loadRequestRef.current;
    if (isCreationRestricted) {
      setExistingProposalLoadStatus('ready');
      setExistingProposalLoadError(null);
      setIsLoading(false);
      return;
    }
    if (proposalNumber) {
      loadedProposalNumberRef.current = null;
      loadedProposalIdentityRef.current = null;
      loadedProposalBaselineRef.current = null;
      setExistingProposalLoadStatus('loading');
      setExistingProposalLoadError(null);
      setIsLoading(true);
      void loadProposal(proposalNumber, requestId);
    } else {
      loadedProposalNumberRef.current = null;
      loadedProposalIdentityRef.current = null;
      loadedProposalBaselineRef.current = null;
      setExistingProposalLoadStatus('ready');
      setExistingProposalLoadError(null);
      setIsLoading(true);
      const initializeNewProposal = async () => {
        try {
          const franchiseId = getSessionFranchiseId();
          await initPricingDataStore(franchiseId);
          await loadPricingModels(franchiseId);
        } catch (error) {
          console.warn('Unable to initialize pricing for new proposal', error);
        } finally {
          if (loadRequestRef.current !== requestId) return;
          const freshProposal = getInitialProposal();
          previousSpaTypeRef.current = freshProposal.poolSpecs?.spaType ?? 'none';
          previousHasPoolRef.current = hasPoolDefinition(freshProposal.poolSpecs);
          setProposal(freshProposal);
          setVersionList([freshProposal as Proposal]);
          setActiveVersionId((freshProposal as Proposal).activeVersionId || (freshProposal as Proposal).versionId || 'original');
          setEditingVersionId((freshProposal as Proposal).versionId || 'original');
          setSelectedPricingModelId(freshProposal.pricingModelId || null);
          setSelectedPricingModelName(freshProposal.pricingModelName || null);
          setSelectedPricingTierId(normalizePricingTierId(freshProposal.pricingTierId));
          setCurrentSection(0);
          setIsLoading(false);
          setHasEdits(false);
          setHasUserEdits(false);
        }
      };
      void initializeNewProposal();
    }
    return () => {
      // A route change (including opening a contract from the summary) must
      // cancel this builder's pending load before it changes shared pricing.
      if (loadRequestRef.current === requestId) loadRequestRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreationRestricted, proposalNumber, loadRetryNonce]);

  useEffect(() => {
    if (isCreationRestricted || !proposalNumber || existingProposalLoadStatus !== 'ready' || isLoading) return;
    const franchiseId = proposal.franchiseId || getSessionFranchiseId();
    const desiredModelId = proposal.pricingModelId || null;
    const desiredModelFranchiseId = proposal.pricingModelFranchiseId || null;
    const directoryKey = `${proposalNumber}:${franchiseId}:${desiredModelFranchiseId || ''}:${desiredModelId || ''}`;
    if (modelDirectoryLoadKeyRef.current === directoryKey) return;
    modelDirectoryLoadKeyRef.current = directoryKey;
    void loadPricingModels(franchiseId, desiredModelId, desiredModelFranchiseId);
  }, [
    existingProposalLoadStatus,
    isProposalEditingRestricted,
    proposal.franchiseId,
    proposal.pricingModelId,
    proposal.pricingModelFranchiseId,
    proposalNumber,
    isLoading,
  ]);

  useEffect(() => {
    if (!isReadOnlyBuilderView || !hasEdits) return;
    setHasEdits(false);
    setHasUserEdits(false);
  }, [hasEdits, isReadOnlyBuilderView]);

  const loadProposal = async (num: string, requestId: number) => {
    const context = captureProposalContext();
    try {
      const data = await getProposalRemote(num);
      assertProposalContext(context);
      if (!data) {
        showToast({
          type: 'error',
          message: 'Proposal not found or access denied.',
        });
        navigate('/', { replace: true });
        return;
      }
      const sourceProposal = JSON.parse(JSON.stringify(data)) as Proposal;
      setSharedAccess(sourceProposal.sharedPermission || null);
      const pricingCache = new Map<string, Awaited<ReturnType<typeof loadPricingSnapshotForExistingProposal>>>();
      const mergeWithPricingSnapshot = async (input: Partial<Proposal>): Promise<Partial<Proposal>> => {
        const resolvedFranchiseId = input.franchiseId || sourceProposal.franchiseId || getSessionFranchiseId();
        const pricingModelId = input.pricingModelId || undefined;
        const pricingModelFranchiseId = input.pricingModelFranchiseId || undefined;
        const pricingModelRevisionId = input.pricingModelRevisionId || undefined;
        const pricingTierId = normalizePricingTierId(input.pricingTierId || input.pricingTierName);
        const pricingCacheKey = `${resolvedFranchiseId}::${pricingModelFranchiseId || resolvedFranchiseId}::${pricingModelId || 'default'}::${pricingModelRevisionId || 'current'}::${pricingTierId}`;
        let pricingSnapshot = pricingCache.get(pricingCacheKey);
        if (!pricingSnapshot) {
          pricingSnapshot = await loadPricingSnapshotForExistingProposal(
            resolvedFranchiseId,
            pricingModelId,
            pricingModelFranchiseId,
            pricingTierId,
            pricingModelRevisionId
          );
          pricingCache.set(pricingCacheKey, pricingSnapshot);
        }
        const merged = withTemporaryPricingSnapshot(pricingSnapshot.pricing, () => mergeWithDefaults(input));
        proposalPricingSnapshotsRef.current.set(pricingSnapshotKey({
          ...input,
          pricingModelId: input.pricingModelId || pricingSnapshot.pricingModelId || undefined,
          pricingModelFranchiseId: input.pricingModelFranchiseId || pricingSnapshot.pricingModelFranchiseId || undefined,
          pricingModelRevisionId: input.pricingModelRevisionId || pricingSnapshot.pricingModelRevisionId || undefined,
        }), pricingSnapshot.pricing);
        return {
          ...merged,
          pricingModelId: input.pricingModelId || pricingSnapshot.pricingModelId || undefined,
          pricingModelName: input.pricingModelName || pricingSnapshot.pricingModelName || undefined,
          pricingModelFranchiseId:
            input.pricingModelFranchiseId || pricingSnapshot.pricingModelFranchiseId || undefined,
          pricingModelRevisionId: input.pricingModelRevisionId || pricingSnapshot.pricingModelRevisionId || undefined,
          pricingModelRevisionNumber:
            input.pricingModelRevisionNumber || pricingSnapshot.pricingModelRevisionNumber || undefined,
        };
      };

      const freshData = markPersistedPackageSelectionTouched(await mergeWithPricingSnapshot(sourceProposal));

      // Normalize water features to the new catalog-driven shape
      freshData.waterFeatures = normalizeWaterFeatures(freshData.waterFeatures);

      // Ensure franchise + pricing model metadata are present
      freshData.franchiseId = freshData.franchiseId || getSessionFranchiseId();
      if (freshData.pricingModelId && !freshData.pricingModelFranchiseId) {
        freshData.pricingModelFranchiseId = freshData.franchiseId;
      }
      freshData.designerName = freshData.designerName || getSessionUserName();
      freshData.designerRole = freshData.designerRole || getSessionRole();
      freshData.designerCode = freshData.designerCode || getSessionFranchiseCode();
      freshData.proposalNumber = freshData.proposalNumber || num;
      freshData.createdDate = freshData.createdDate || new Date().toISOString();
      freshData.lastModified = freshData.lastModified || new Date().toISOString();
      const freshPricingTierId = normalizePricingTierId(freshData.pricingTierId || freshData.pricingTierName);
      freshData.pricingTierId = freshPricingTierId;
      freshData.pricingTierName = getPricingTierName(freshPricingTierId);

      const versioned = ensureProposalWorkflow(applyActiveVersion(freshData as Proposal));
      const allVersions = listAllVersions(ensureProposalWorkflow(freshData as Proposal));
      const allVersionsWithDefaults = (
        await Promise.all(
          allVersions.map(async (v) => ({
            ...(markPersistedPackageSelectionTouched(await mergeWithPricingSnapshot(v)) as Proposal),
            waterFeatures: normalizeWaterFeatures((v as Proposal).waterFeatures),
            versionId: v.versionId || 'original',
            versionName: v.versionName || (v.isOriginalVersion ? 'Original Version' : 'Version'),
            isOriginalVersion: v.isOriginalVersion,
            activeVersionId: v.activeVersionId,
            versions: [],
          }))
        )
      ) as Proposal[];
      const desiredVersionId =
        versionIdFromState || versioned.activeVersionId || versioned.versionId || 'original';
      let effectiveStateSnapshot = versionSnapshotFromState;
      if (sourceProposal.sharedPermission === 'contribute' && isSharedWorkingCopy && sharedRequestRef.current) {
        const resumed = await beginWorkingCopy(num, desiredVersionId, Number(sourceProposal.contentRevision));
        assertProposalContext(context);
        sharedRequestRef.current = resumed;
        effectiveStateSnapshot = resumed.working_version_json;
      }
      const stateVersionSnapshot = effectiveStateSnapshot
        ? ({
            ...(markPersistedPackageSelectionTouched(effectiveStateSnapshot as Proposal) as Proposal),
            waterFeatures: normalizeWaterFeatures((effectiveStateSnapshot as Proposal).waterFeatures),
            versionId: effectiveStateSnapshot.versionId || 'original',
            versionName:
              effectiveStateSnapshot.versionName ||
              (effectiveStateSnapshot.isOriginalVersion ? 'Original Version' : 'Version'),
            versions: [],
            workflow: sourceProposal.workflow,
          } as Proposal)
        : null;
      const fetchedRequestedVersion =
        allVersionsWithDefaults.find((v) => v.versionId === desiredVersionId) || null;
      const shouldPreferStateSnapshot =
        Boolean(stateVersionSnapshot) &&
        (stateVersionSnapshot?.versionId || 'original') === desiredVersionId &&
        (isSharedWorkingCopy || !fetchedRequestedVersion ||
          (isVersionPermanentlyLocked(fetchedRequestedVersion) &&
            !isVersionPermanentlyLocked(stateVersionSnapshot)));
      const hydratedVersions = shouldPreferStateSnapshot
        ? fetchedRequestedVersion
          ? allVersionsWithDefaults.map((v) =>
              v.versionId === desiredVersionId
                ? ({ ...stateVersionSnapshot, workflow: sourceProposal.workflow, versions: [] } as Proposal)
                : v
            )
          : [...allVersionsWithDefaults, { ...stateVersionSnapshot, workflow: sourceProposal.workflow, versions: [] } as Proposal]
        : allVersionsWithDefaults;
      const targetVersion =
        (shouldPreferStateSnapshot ? stateVersionSnapshot : fetchedRequestedVersion) ||
        hydratedVersions.find((v) => v.versionId === versioned.versionId) ||
        hydratedVersions[0] ||
        ((await mergeWithPricingSnapshot(versioned)) as Proposal);
      let sanitizedTarget: Proposal = {
        ...cloneProposalData(targetVersion as Proposal),
        versions: [],
        workflow: sourceProposal.workflow,
        sharedPermission: sourceProposal.sharedPermission,
        ownerAuthUserId: sourceProposal.ownerAuthUserId,
        contentRevision: sourceProposal.contentRevision,
        collaborationEnabled: sourceProposal.collaborationEnabled,
      };
      const nextActiveId = sanitizedTarget.versionId || desiredVersionId || 'original';

      const targetVersionStatus = getVersionRecordStatus(sanitizedTarget);
      if (!isReadOnlyBuilderView && (isVersionPermanentlyLocked(sanitizedTarget) || getWorkflowStatus(versioned) === 'completed')) {
        showToast({
          type: 'warning',
          message:
            targetVersionStatus === 'signed'
              ? 'This signed version is locked from editing. Create a proposal addendum from the proposal summary to make changes.'
              : 'Completed proposals are locked from editing.',
        });
        navigate(`/proposal/view/${num}`, {
          replace: true,
          state: versionIdFromState ? { versionId: versionIdFromState } : undefined,
        });
        return;
      }
      if (!isReadOnlyBuilderView && needsOffContractSeparation(sanitizedTarget)) {
        showToast({
          type: 'warning',
          message: 'Review the Off-Contract contract-total correction on the proposal summary before editing this version.',
        });
        navigate(`/proposal/view/${num}`, {
          replace: true,
          state: { versionId: nextActiveId },
        });
        return;
      }

      const targetTierId = normalizePricingTierId(
        sanitizedTarget.pricingTierId || sanitizedTarget.pricingTierName
      );
      // Do not render or save an existing proposal until its own immutable
      // pricing-model revision is the active calculation source. Previously,
      // this happened in a later effect and briefly exposed whichever model was
      // last loaded on that computer.
      if (loadRequestRef.current !== requestId) return;
      await initPricingDataStore(
        sanitizedTarget.franchiseId || sourceProposal.franchiseId || getSessionFranchiseId(),
        sanitizedTarget.pricingModelId || undefined,
        sanitizedTarget.pricingModelFranchiseId || undefined,
        targetTierId,
        sanitizedTarget.pricingModelRevisionId || undefined
      );
      if (loadRequestRef.current !== requestId) return;
      const targetSnapshot = await loadPricingSnapshotForExistingProposal(sanitizedTarget.franchiseId,
        sanitizedTarget.pricingModelId, sanitizedTarget.pricingModelFranchiseId, targetTierId, sanitizedTarget.pricingModelRevisionId);
      if (loadRequestRef.current !== requestId) return;
      assertProposalContext(context);
      bindEditorSnapshot(targetSnapshot.pricing);
      proposalPricingSnapshotsRef.current.set(pricingSnapshotKey(sanitizedTarget), targetSnapshot.pricing);
      const loadedPricingMeta = targetSnapshot;
      if (
        sanitizedTarget.pricingModelId &&
        (loadedPricingMeta.pricingModelId !== sanitizedTarget.pricingModelId ||
          (sanitizedTarget.pricingModelRevisionId &&
            loadedPricingMeta.pricingModelRevisionId !== sanitizedTarget.pricingModelRevisionId))
      ) {
        throw new Error(
          'This proposal\'s selected pricing revision could not be loaded exactly. Reconnect and try again.'
        );
      }

      const unprotectedTarget: Proposal = {
        ...sanitizedTarget,
        historicalPricingAdjustment: 0,
      };
      const currentCalculation = withTemporaryPricingSnapshot(targetSnapshot.pricing, () => MasterPricingEngine.calculateCompleteProposal(
        unprotectedTarget,
        normalizePapDiscounts(targetSnapshot.pricing.papDiscountRates)
      ));
      const nextHistoricalPricingReview = buildHistoricalPricingReview(
        unprotectedTarget,
        currentCalculation
      );
      sanitizedTarget = applyHistoricalPricingProtection(
        sanitizedTarget,
        nextHistoricalPricingReview
      ) as Proposal;

      if (loadRequestRef.current === requestId) {
        assertProposalContext(context);
        loadedContextRef.current = context;
        loadedProposalNumberRef.current = num;
        loadedProposalIdentityRef.current = buildLoadedProposalIdentity(sanitizedTarget);
        loadedProposalBaselineRef.current = cloneProposalData(sourceProposal);
        previousSpaTypeRef.current = sanitizedTarget.poolSpecs?.spaType ?? 'none';
        previousHasPoolRef.current = hasPoolDefinition(sanitizedTarget.poolSpecs);
        setProposal(cloneProposalData(sanitizedTarget));
        setVersionList(hydratedVersions.map((entry) => cloneProposalData(entry)));
        setActiveVersionId(nextActiveId);
        setEditingVersionId(sanitizedTarget.versionId || 'original');
        setSelectedPricingModelId(sanitizedTarget.pricingModelId || null);
        setSelectedPricingModelName(sanitizedTarget.pricingModelName || null);
        setSelectedPricingTierId(targetTierId);
        setHistoricalPricingReview(nextHistoricalPricingReview);
        setCurrentSection(0);
        setPapDiscounts(readPapDiscountsFromModel());
        if (sanitizedTarget.manualAdjustments) {
          setManualAdjustments(sanitizedTarget.manualAdjustments);
          manualAdjustmentsSourceRef.current = 'proposal';
        } else {
          manualAdjustmentsSourceRef.current = 'pricingModel';
          setManualAdjustments(readManualAdjustmentsFromModel());
        }
        pricingModelManualAdjustmentsRef.current = readManualAdjustmentsFromModel();
        // Mark proposal-owned adjustments before the pricing tier snapshot can
        // notify subscribers. Otherwise a fast snapshot load can replace a
        // copied version's adjustments with the model defaults.
        void setActivePricingTier(targetTierId);
        setHasEdits(false);
        setHasUserEdits(false);
        setExistingProposalLoadStatus('ready');
        setExistingProposalLoadError(null);
      }
    } catch (error) {
      if (loadRequestRef.current !== requestId || context !== captureProposalContext()) return;
      console.error('Failed to load proposal:', error);
      if (loadRequestRef.current === requestId) {
        loadedProposalNumberRef.current = null;
        loadedProposalIdentityRef.current = null;
        loadedProposalBaselineRef.current = null;
        setExistingProposalLoadStatus('error');
        setExistingProposalLoadError(
          'This proposal did not finish loading. No changes were saved. Check the connection and try again.'
        );
        showToast({
          type: 'error',
          message: 'Failed to load proposal. No changes were saved.',
        });
      }
    } finally {
      if (loadRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  };

  const sanitizeCurrentProposalState = (input: Proposal): Proposal => {
    const selectedPackage = getSelectedEquipmentPackage(input.equipment as any);
    const allowDependencyAuxiliaryPump =
      !selectedPackage ||
      !isFixedEquipmentPackage(selectedPackage) ||
      packageAllowsAdditionalPumps(selectedPackage);

    return sanitizeProposalSelectionState(input, {
      defaultAuxiliaryPump: allowDependencyAuxiliaryPump
        ? getDefaultAuxiliaryPumpForCurrentPricing() || undefined
        : undefined,
    });
  };

  const updateProposal = (section: string, data: any) => {
    setProposal(prev => {
      const nextProposal = {
        ...prev,
        [section]: data,
        lastModified: new Date().toISOString(),
      } as Proposal;

      if (section === 'excavation' && (
        data.hasAdditionalDigging !== prev.excavation?.hasAdditionalDigging ||
        data.additionalDiggingDays !== prev.excavation?.additionalDiggingDays
      )) {
        nextProposal.contractOverrides = { ...prev.contractOverrides };
        delete nextProposal.contractOverrides[EXCAVATION_DAYS_CONTRACT_FIELD];
      }

      if (
        section === 'poolSpecs' &&
        (prev.poolSpecs?.spaType ?? 'none') !== 'none' &&
        (data?.spaType ?? 'none') === 'none'
      ) {
        nextProposal.plumbing = {
          ...(prev.plumbing || getDefaultPlumbing()),
          runs: {
            ...((prev.plumbing || getDefaultPlumbing()).runs || {}),
            spaRun: 0,
          },
        };
      }

      if (section === 'waterFeatures') {
        const activeFeatureIds = (selections: Proposal['waterFeatures']['selections'] = []) =>
          [...new Set(selections
            .filter((selection) => selection && (selection.quantity ?? 0) > 0)
            .map((selection) => selection.featureId))].sort().join('|');
        if (activeFeatureIds(prev.waterFeatures?.selections) !== activeFeatureIds(data?.selections)) {
          nextProposal.equipment = {
            ...(prev.equipment || getDefaultEquipment()),
            waterFeatureAutoPumpDismissed: false,
          };
        }
      }

      return sanitizeCurrentProposalState(nextProposal);
    });
    if (!isReadOnlyBuilderView) {
      markUserEdit();
    }
  };

  const updatePlumbingRuns = (runUpdates: Partial<PlumbingRuns>) => {
    setProposal((prev) => {
      const defaultPlumbing = getDefaultPlumbing();
      const existingPlumbing = prev.plumbing || defaultPlumbing;
      return sanitizeCurrentProposalState({
        ...prev,
        plumbing: {
          ...existingPlumbing,
          runs: mergePlumbingRuns({
            ...(existingPlumbing.runs || {}),
            ...runUpdates,
          }),
        },
        lastModified: new Date().toISOString(),
      } as Proposal);
    });
    if (!isReadOnlyBuilderView) {
      markUserEdit();
    }
  };

  const applyPricingTierSelection = async (tierValue: string, markDirty = true) => {
    if (isReadOnlyBuilderView) return;
    // Model and tier selections share one sequence: neither may restore a
    // snapshot captured before a newer selection or navigation.
    const selectionRequest = ++pricingSelectionRequestRef.current;
    const loadToken = loadRequestRef.current;
    const pricingTierId = normalizePricingTierId(tierValue);
    const context = captureProposalContext();
    const current = latestProposalRef.current;
    const tierSnapshot = await loadPricingSnapshotForExistingProposal(current.franchiseId, current.pricingModelId,
      current.pricingModelFranchiseId, pricingTierId, current.pricingModelRevisionId);
    assertProposalContext(context);
    if (selectionRequest !== pricingSelectionRequestRef.current || loadToken !== loadRequestRef.current) return;
    bindEditorSnapshot(tierSnapshot.pricing);
    proposalPricingSnapshotsRef.current.set(pricingSnapshotKey({ ...current, pricingTierId }), tierSnapshot.pricing);
    setSelectedPricingTierId(pricingTierId);
    setProposal((prev) => {
      const nextProposal: Partial<Proposal> = {
        ...prev,
        pricingTierId,
        pricingTierName: getPricingTierName(pricingTierId),
        lastModified: new Date().toISOString(),
      };

      if (isBronzePricingTier(pricingTierId)) {
        nextProposal.excavation = {
          ...(prev.excavation || getDefaultExcavation()),
          hasGravelInstall: isPpasEastFranchiseCode(prev.designerCode || getSessionFranchiseCode()),
        };
        nextProposal.interiorFinish = {
          ...(prev.interiorFinish || getDefaultInteriorFinish()),
          hasWaterproofing: false,
        };
      } else {
        const supportsMicroglass = !isPpasEastFranchiseCode(prev.designerCode || getSessionFranchiseCode());
        nextProposal.excavation = {
          ...(prev.excavation || getDefaultExcavation()),
          hasGravelInstall: true,
        };
        nextProposal.interiorFinish = {
          ...(prev.interiorFinish || getDefaultInteriorFinish()),
          hasWaterproofing: supportsMicroglass,
        };
      }

      return sanitizeCurrentProposalState(nextProposal as Proposal);
    });
    if (markDirty) {
      markUserEdit();
    }
  };

  const handleSelectEquipmentPackage = (packageId: string) => {
    const nextPackage = getEnabledEquipmentPackageOptions().find((option) => option.id === packageId);
    if (!nextPackage) return;

    setProposal((prev) => {
      const basePoolSpecs = prev.poolSpecs || getDefaultPoolSpecs();
      const hasPool = hasPoolDefinition(basePoolSpecs);
      const hasSpa = (basePoolSpecs.spaType ?? 'none') !== 'none';
      if (!hasPool) {
        return prev;
      }
      if (hasSpa && !packageSupportsSpa(nextPackage)) {
        return prev;
      }

      let nextEquipment = createFreshEquipmentForPackage(nextPackage, {
        hasPool,
        hasSpa,
      });
      nextEquipment.addOns = equipmentAllowsAddOns(nextEquipment) ? (prev.equipment?.addOns || []) : [];
      if (!proposalNumber && hasSpa && packageSupportsSpa(nextPackage) && (nextEquipment.spaLights?.length ?? 0) === 0) {
        nextEquipment = normalizeEquipmentLighting(
          {
            ...nextEquipment,
            includeSpaLights: true,
          } as Proposal['equipment'],
          {
            poolSpecs: basePoolSpecs,
            hasPool,
            hasSpa: true,
          }
        );
      }
      const existingPlumbing = prev.plumbing || getDefaultPlumbing();
      const existingElectrical = prev.electrical || getDefaultElectrical();
      const nextRuns = {
        ...existingPlumbing.runs,
        cleanerRun: 0,
        autoFillRun: 0,
        autoFillElectricRun: 0,
      };
      WATER_FEATURE_RUN_FIELDS.forEach((field) => {
        nextRuns[field] = 0;
      });

      return sanitizeCurrentProposalState({
        ...prev,
        equipment: {
          ...nextEquipment,
          packageSelectionTouched: true,
        },
        waterFeatures: getDefaultWaterFeatures(),
        plumbing: {
          ...existingPlumbing,
          runs: nextRuns,
        },
        electrical: {
          ...existingElectrical,
          runs: {
            ...existingElectrical.runs,
            heatPumpElectricalRun: 0,
          },
        },
        lastModified: new Date().toISOString(),
      } as Proposal);
    });
    markUserEdit();
  };

  useEffect(() => {
    if (!proposal.poolSpecs || !proposal.tileCopingDecking) return;

    const hasSpaDimensions =
      proposal.poolSpecs.spaType === 'gunite' &&
      (proposal.poolSpecs.spaLength ?? 0) > 0 &&
      (proposal.poolSpecs.spaWidth ?? 0) > 0;
    const currentDoubleBullnose = proposal.tileCopingDecking.doubleBullnoseLnft ?? 0;

    if (!hasSpaDimensions) {
      if (currentDoubleBullnose !== 0) {
        updateProposal('tileCopingDecking', { ...proposal.tileCopingDecking, doubleBullnoseLnft: 0 });
      }
      return;
    }

    const spaPerimeter = CalculationModules.Pool.calculateSpaPerimeter(proposal.poolSpecs);
    if (currentDoubleBullnose > 0 && currentDoubleBullnose !== spaPerimeter) {
      updateProposal('tileCopingDecking', { ...proposal.tileCopingDecking, doubleBullnoseLnft: spaPerimeter });
    }
  }, [
    proposal.poolSpecs?.spaType,
    proposal.poolSpecs?.spaLength,
    proposal.poolSpecs?.spaWidth,
    proposal.poolSpecs?.spaShape,
    proposal.tileCopingDecking?.doubleBullnoseLnft,
  ]);

  useEffect(() => {
    if (proposal.poolSpecs?.poolType !== 'fiberglass' || !proposal.tileCopingDecking) {
      return;
    }

    const currentTile = proposal.tileCopingDecking;
    const hasTileSelection = Boolean(getTileSelectionId(currentTile));
    const hasTileSpecificValues =
      hasTileSelection ||
      (currentTile.additionalTileLength ?? 0) > 0 ||
      Boolean(currentTile.trimTileOptionId) ||
      Boolean(currentTile.hasTrimTileOnSteps);

    if (!hasTileSpecificValues) {
      return;
    }

    updateProposal('tileCopingDecking', {
      ...currentTile,
      tileLevel: 0,
      tileOptionId: undefined,
      additionalTileLength: 0,
      trimTileOptionId: undefined,
      hasTrimTileOnSteps: false,
    });
  }, [
    proposal.poolSpecs?.poolType,
    proposal.tileCopingDecking?.tileLevel,
    proposal.tileCopingDecking?.tileOptionId,
    proposal.tileCopingDecking?.additionalTileLength,
    proposal.tileCopingDecking?.trimTileOptionId,
    proposal.tileCopingDecking?.hasTrimTileOnSteps,
  ]);

  const calculateTotals = (input: Partial<Proposal> = proposal): Proposal => {
    const normalized = mergeWithDefaults(applySessionCommissionRates(input));
    // A pinned save may temporarily replace pricingData while the global store
    // still describes another version's model. Persist the rates used by the engine.
    const modelPapDiscounts = normalizePapDiscounts(pricingData.papDiscountRates);
    const result = MasterPricingEngine.calculateCompleteProposal(normalized, modelPapDiscounts);
    const versionId = input.versionId || editingVersionId || 'original';
    const versionName =
      input.versionName ||
      (input.isOriginalVersion === false || versionId !== 'original' ? 'Version' : 'Original Version');
    const pricingTierId = normalizePricingTierId(normalized.pricingTierId || normalized.pricingTierName);

    return {
      ...normalized,
      versionId,
      versionName,
      activeVersionId: versionId,
      isOriginalVersion: input.isOriginalVersion ?? versionId === 'original',
      versions: [],
      franchiseId: normalized.franchiseId || getSessionFranchiseId(),
      designerName: normalized.designerName || getSessionUserName(),
      designerRole: normalized.designerRole || getSessionRole(),
      designerCode: normalized.designerCode || getSessionFranchiseCode(),
      pricingModelFranchiseId:
        normalized.pricingModelId
          ? normalized.pricingModelFranchiseId || normalized.franchiseId || getSessionFranchiseId()
          : undefined,
      pricingTierId,
      pricingTierName: getPricingTierName(pricingTierId),
      papDiscounts: modelPapDiscounts,
      costBreakdown: result.costBreakdown,
      pricing: result.pricing,
      subtotal: result.subtotal,
      taxRate: result.taxRate,
      taxAmount: result.taxAmount,
      totalCost: result.totalCost,
    } as Proposal;
  };

  const handleNext = () => {
    if (currentSection < sections.length - 1) {
      setCurrentSection(currentSection + 1);
    }
  };

  const handlePrevious = () => {
    if (currentSection > 0) {
      setCurrentSection(currentSection - 1);
    }
  };

  const handleSave = async (
    mode: 'draft' | 'submit',
    options?: {
      navigateToSummary?: boolean;
      forceDraftStatus?: boolean;
      submissionRequest?: { manualReviewRequested: boolean; note: string };
      stayOnPage?: boolean;
      silent?: boolean;
    }
  ): Promise<Proposal | null> => {
    if (isProposalEditingRestricted) return null;
    if (isReadOnlyBuilderView) return null;
    if (saveInFlightRef.current) return null;
    if (proposalNumber && needsOffContractSeparation(proposal)) {
      showToast({
        type: 'warning',
        message: 'Review the Off-Contract contract-total correction on the proposal summary before saving.',
      });
      return null;
    }

    if (proposalNumber) {
      const loadBlockReason = getExistingProposalSaveBlockReason({
        routeProposalNumber: proposalNumber,
        hydratedProposalNumber: loadedProposalNumberRef.current,
        proposal,
        baseline: loadedProposalIdentityRef.current,
      });
      if (isLoading || existingProposalLoadStatus !== 'ready' || loadBlockReason) {
        showToast({
          type: 'error',
          message:
            loadBlockReason ||
            'This proposal has not finished loading safely. Reopen it or retry loading before saving.',
        });
        return null;
      }
    }

    const currentVersionId = proposal.versionId || editingVersionId || 'original';
    const isVersionEdit = !(proposal.isOriginalVersion ?? currentVersionId === 'original');
    const effectiveMode = mode;
    const isSilentDraftAutosave = effectiveMode === 'draft' && Boolean(options?.stayOnPage && options?.silent);
    const proposalSnapshotAtSaveStart = JSON.stringify(proposal);

    saveInFlightRef.current = true;
    if (isSilentDraftAutosave) {
      setIsAutosaving(true);
    } else {
      setIsSaving(true);
    }
    try {
      let proposalToSave: Partial<Proposal> = { ...proposal };

      if (!proposalToSave.pricingModelId && defaultPricingModelId) {
        const def = pricingModels.find((m) => m.id === defaultPricingModelId);
        await applyPricingModelSelection(defaultPricingModelId, def?.name, def?.isDefault);
        const activeModelMeta = getActivePricingModelMeta();
        proposalToSave = {
          ...proposalToSave,
          pricingModelId: activeModelMeta.pricingModelId || def?.id || undefined,
          pricingModelName: activeModelMeta.pricingModelName || def?.name || undefined,
          pricingModelFranchiseId:
            activeModelMeta.pricingModelId
              ? activeModelMeta.pricingModelFranchiseId ||
                proposalToSave.pricingModelFranchiseId ||
                proposalToSave.franchiseId ||
                getSessionFranchiseId()
              : proposalToSave.pricingModelFranchiseId,
          pricingModelIsDefault:
            activeModelMeta.pricingModelId ? activeModelMeta.isDefault : proposalToSave.pricingModelIsDefault,
          pricingModelRevisionId:
            activeModelMeta.pricingModelId
              ? activeModelMeta.pricingModelRevisionId || undefined
              : proposalToSave.pricingModelRevisionId,
          pricingModelRevisionNumber:
            activeModelMeta.pricingModelId
              ? activeModelMeta.pricingModelRevisionNumber || undefined
              : proposalToSave.pricingModelRevisionNumber,
        };
      }

      // Every saved proposal must be pinned to an immutable pricing revision.
      // New proposals normally receive this during initialization/selection;
      // this guard closes any first-load race before persistence.
      if (proposalToSave.pricingModelId && !proposalToSave.pricingModelRevisionId) {
        await setActivePricingModel(
          proposalToSave.pricingModelId,
          proposalToSave.pricingModelFranchiseId || proposalToSave.franchiseId || getSessionFranchiseId(),
          normalizePricingTierId(proposalToSave.pricingTierId || proposalToSave.pricingTierName)
        );
        const activeModelMeta = getActivePricingModelMeta();
        if (
          activeModelMeta.pricingModelId !== proposalToSave.pricingModelId ||
          !activeModelMeta.pricingModelRevisionId
        ) {
          throw new Error('Unable to pin this proposal to a pricing revision. Reconnect and try saving again.');
        }
        proposalToSave = {
          ...proposalToSave,
          pricingModelName: proposalToSave.pricingModelName || activeModelMeta.pricingModelName || undefined,
          pricingModelFranchiseId:
            proposalToSave.pricingModelFranchiseId ||
            activeModelMeta.pricingModelFranchiseId ||
            proposalToSave.franchiseId ||
            getSessionFranchiseId(),
          pricingModelRevisionId: activeModelMeta.pricingModelRevisionId,
          pricingModelRevisionNumber: activeModelMeta.pricingModelRevisionNumber || undefined,
        };
      }

      // Resolve before normalizing selections as well as calculating totals.
      // Selection defaults also depend on the proposal's own pricing catalog.
      const savePricingSnapshot = await loadPricingSnapshotForExistingProposal(
        proposalToSave.franchiseId || getSessionFranchiseId(),
        proposalToSave.pricingModelId,
        proposalToSave.pricingModelFranchiseId,
        normalizePricingTierId(proposalToSave.pricingTierId || proposalToSave.pricingTierName),
        proposalToSave.pricingModelRevisionId
      );
      assertProposalContext(loadedContextRef.current);
      proposalToSave = withTemporaryPricingSnapshot(savePricingSnapshot.pricing, () => {
        const normalized = sanitizeCurrentProposalState(proposalToSave as Proposal);
        return !proposalNumber && !normalized.equipment?.hasBeenEdited
          ? { ...normalized, equipment: buildStartingEquipment(normalized.poolSpecs, normalized.equipment) }
          : normalized;
      });
      // Validate if submitting
      if (effectiveMode === 'submit') {
        const errors = validateProposal(proposalToSave);
        if (errors.length > 0) {
          showToast({
            type: 'error',
            message: `Validation errors: ${errors.map(e => e.message).join(', ')}`,
          });
          return null;
        }
      }

      const totals = withTemporaryPricingSnapshot(savePricingSnapshot.pricing, () => calculateTotals(proposalToSave));
      const now = new Date().toISOString();
      const versionName =
        totals.versionName ||
        versionNameFromState ||
        (currentVersionId === 'original' ? 'Original Version' : `Version ${versionList.length}`);
      const finalProposal: Proposal = {
        ...totals,
        proposalNumber: proposal.proposalNumber || proposalNumber || `PROP-${Date.now()}`,
        status: effectiveMode === 'submit' ? 'submitted' : 'draft',
        versionId: currentVersionId,
        versionName,
        isOriginalVersion: totals.isOriginalVersion ?? currentVersionId === 'original',
        activeVersionId: currentVersionId,
        versions: [],
        lastModified: now,
        createdDate: totals.createdDate || now,
        franchiseId: totals.franchiseId || getSessionFranchiseId(),
        designerName: totals.designerName || getSessionUserName(),
        designerRole: totals.designerRole || getSessionRole(),
        designerCode: totals.designerCode || getSessionFranchiseCode(),
        subtotal: toFiniteNumber(totals.subtotal),
        taxRate: toFiniteNumber(totals.taxRate),
        taxAmount: toFiniteNumber(totals.taxAmount),
        totalCost: toFiniteNumber(totals.totalCost),
      };

      const cleanExistingVersions = versionList.length
        ? versionList.map((v) => ({ ...v, versions: [] }))
        : [{ ...finalProposal }];
      const withoutTarget = cleanExistingVersions.filter(
        (v) => (v.versionId || 'original') !== (finalProposal.versionId || currentVersionId)
      );
      const containerToSave = upsertVersionInContainer(
        {
          ...ensureProposalWorkflow(proposal as Proposal),
          ...finalProposal,
          versions: withoutTarget,
          activeVersionId: currentVersionId,
          status: options?.forceDraftStatus ? 'draft' : getWorkflowStatus(proposal as Proposal),
        } as Proposal,
        finalProposal as Proposal,
        currentVersionId
      );
      const existingVersion =
        listAllVersions(ensureProposalWorkflow(proposal as Proposal)).find(
          (entry) => (entry.versionId || 'original') === currentVersionId
        ) || null;
      const existingVersionStatus = getVersionRecordStatus(existingVersion);
      const versionRequiresResubmission =
        effectiveMode !== 'submit' &&
        hasEdits &&
        (existingVersionStatus === 'submitted' ||
          existingVersionStatus === 'needs_approval' ||
          existingVersionStatus === 'approved' ||
          hasVersionSubmissionHistory(proposal as Proposal, currentVersionId));
      const normalizedContainerToSave = versionRequiresResubmission
        ? resetWorkflowAfterVersionEdit(containerToSave as Proposal, currentVersionId)
        : ensureProposalWorkflow(containerToSave as Proposal);

      const workflowReady =
        effectiveMode === 'submit'
          ? submitProposalForWorkflow(
              normalizedContainerToSave,
              currentVersionId,
              {
                manualReviewRequested: options?.submissionRequest?.manualReviewRequested,
                message: options?.submissionRequest?.note,
              }
            )
          : normalizedContainerToSave;

      if (sharedAccess === 'contribute' && isSharedWorkingCopy) {
        assertProposalContext(loadedContextRef.current);
        await saveWorkingCopy(finalProposal.proposalNumber, currentVersionId, finalProposal, false, '', sharedRequestRef.current);
        setHasEdits(false);
        setHasUserEdits(false);
        if (!options?.silent) showToast({ type: 'success', message: 'Working copy saved. The owner draft has not changed.' });
        navigate(`/proposal/view/${finalProposal.proposalNumber}`, { state: { versionId: currentVersionId } });
        return finalProposal;
      }

      if (proposalNumber) {
        const unsafeOverwriteReason = getUnsafeProposalOverwriteReason(
          workflowReady,
          loadedProposalBaselineRef.current
        );
        if (unsafeOverwriteReason) {
          showToast({
            type: 'error',
            message: `${unsafeOverwriteReason} Reopen the proposal before trying again.`,
          });
          return null;
        }
      }

      assertProposalContext(loadedContextRef.current);
      const saved = await saveProposalRemote(
        {
          ...workflowReady,
          ownerAuthUserId: loadedProposalBaselineRef.current?.ownerAuthUserId || workflowReady.ownerAuthUserId,
          contentRevision: loadedProposalBaselineRef.current?.contentRevision ?? workflowReady.contentRevision,
          collaborationEnabled: loadedProposalBaselineRef.current?.collaborationEnabled ?? workflowReady.collaborationEnabled,
          sharedPermission: loadedProposalBaselineRef.current?.sharedPermission || workflowReady.sharedPermission,
        },
        effectiveMode === 'submit'
          ? { ledgerAction: 'proposal_submitted', requireOnline: true }
          : isSilentDraftAutosave && isOffline
          ? { localOnly: true }
          : undefined
      );

      assertProposalContext(loadedContextRef.current);
      const savedActive = ensureProposalWorkflow(applyActiveVersion(saved as Proposal));
      const savedVersions = listAllVersions(saved as Proposal).map((entry) => cloneProposalData(entry));
      const savedRequestedVersion =
        savedVersions.find((entry) => (entry.versionId || 'original') === currentVersionId) || savedActive;
      loadedProposalNumberRef.current = saved.proposalNumber;
      loadedProposalIdentityRef.current = buildLoadedProposalIdentity(savedRequestedVersion as Proposal);
      loadedProposalBaselineRef.current = cloneProposalData(saved as Proposal);
      const isPending = (saved as any).syncStatus === 'pending';
      const hasNewerLocalChanges =
        isSilentDraftAutosave && JSON.stringify(latestProposalRef.current) !== proposalSnapshotAtSaveStart;
      if (hasNewerLocalChanges) {
        setProposal((prev) => ({
          ...prev,
          proposalNumber: prev.proposalNumber || saved.proposalNumber,
          createdDate:
            prev.createdDate ||
            (savedRequestedVersion as Proposal).createdDate ||
            (saved as Proposal).createdDate,
          workflow: (saved as Proposal).workflow,
        }));
      } else {
        setProposal({
          ...cloneProposalData(savedRequestedVersion as Proposal),
          versions: [],
          workflow: (saved as Proposal).workflow,
        });
      }
      setVersionList(savedVersions);
      setActiveVersionId(currentVersionId);
      setEditingVersionId(currentVersionId);
      if (!hasNewerLocalChanges) {
        setHasEdits(false);
        setHasUserEdits(false);
      }
      const savedWorkflowStatus = getWorkflowStatus(saved as Proposal);
      const isSignedAddendumSubmission = Boolean(getSignedVersionId(containerToSave as Proposal));
      const nonSubmitSuccessMessage =
        isPending
          ? 'Saved locally. Will sync when back online.'
          : options?.forceDraftStatus || savedWorkflowStatus === 'draft'
          ? versionRequiresResubmission
            ? 'Proposal changes saved. Resubmit when ready.'
            : 'Proposal saved as draft.'
          : savedWorkflowStatus === 'needs_approval' || savedWorkflowStatus === 'submitted'
          ? 'Proposal changes saved. Proposal remains submitted for approval.'
          : savedWorkflowStatus === 'approved'
          ? 'Proposal changes saved. Proposal remains approved.'
          : savedWorkflowStatus === 'changes_requested'
          ? 'Proposal changes saved. Resubmit when ready.'
          : savedWorkflowStatus === 'signed'
          ? 'Proposal addendum changes saved.'
          : 'Proposal saved successfully!';
      if (!options?.silent) {
        showToast({
          type: isPending ? 'warning' : 'success',
          message:
            effectiveMode === 'submit'
              ? savedWorkflowStatus === 'needs_approval'
                ? isSignedAddendumSubmission
                  ? 'Proposal addendum submitted for approval.'
                  : 'Proposal submitted for approval.'
                : savedWorkflowStatus === 'approved'
                ? isSignedAddendumSubmission
                  ? 'Proposal addendum submitted. Mark it as signed when ready.'
                  : 'Proposal submitted. Mark it as signed when ready.'
                : 'Proposal submitted successfully.'
              : nonSubmitSuccessMessage,
        });
      }

      const shouldNavigateToSummary =
        !options?.stayOnPage && (options?.navigateToSummary || effectiveMode === 'submit' || isVersionEdit);
      if (shouldNavigateToSummary) {
        navigate(`/proposal/view/${saved.proposalNumber}`, {
          state: { versionId: finalProposal.versionId || currentVersionId },
        });
      } else if (!options?.stayOnPage) {
        navigate('/');
      }
      return saved as Proposal;
    } catch (error) {
      console.error('Failed to save proposal:', error);
      const errMsg =
        (error as any)?.message ||
        (error as any)?.error_description ||
        (error as any)?.hint ||
        'Failed to save proposal. Please try again.';
      if (!options?.silent) {
        showToast({
          type: 'error',
          message: `Failed to save proposal: ${errMsg}`,
        });
      }
      return null;
    } finally {
      saveInFlightRef.current = false;
      if (isSilentDraftAutosave) {
        setIsAutosaving(false);
      } else {
        setIsSaving(false);
      }
    }
  };

  useEffect(() => {
    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
    if (
      !isOffline ||
      Boolean(sharedAccess) ||
      isCreationRestricted ||
      isReadOnlyBuilderView ||
      isLoading ||
      isSaving ||
      isAutosaving ||
      !hasEdits ||
      !hasUserEdits ||
      (proposalNumber && existingProposalLoadStatus !== 'ready')
    ) {
      return;
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      autosaveTimeoutRef.current = null;
      void handleSave('draft', {
        forceDraftStatus: true,
        stayOnPage: true,
        silent: true,
      });
    }, 1200);

    return () => {
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [
    existingProposalLoadStatus,
    hasEdits,
    hasUserEdits,
    isAutosaving,
    isCreationRestricted,
    isLoading,
    isOffline,
    isReadOnlyBuilderView,
    isSaving,
    proposal,
    proposalNumber,
  ]);

  const handleHome = () => {
    if (isReadOnlyBuilderView) {
      navigate('/');
      return;
    }
    if (hasEdits) {
      setShowCancelConfirm(true);
      return;
    }
    navigate('/');
  };

  const handleSelectPricingModel = async (id: string) => {
    if (!canChooseProposalRevisions) return;
    const model = pricingModels.find((entry) => entry.id === id);
    await applyPricingModelSelection(
      id,
      model?.name,
      model?.isDefault,
      Boolean(model?.removed),
      true,
      model?.franchiseId
    );
    setDeclinedPricingComparison(null);
    setShowDeclinedModelChooser(false);
  };

  const handleOpenDeclinedPricingComparison = async () => {
    if (!canChooseProposalRevisions) return;
    setShowDeclinedPricingComparison(true);
    setDeclinedPricingComparisonLoading(true);
    setPricingRevisionError(null);
    try {
      const currentComparison = await buildPricingRevisionComparison(proposal as Proposal);
      setDeclinedPricingComparison(currentComparison);
      if (!currentComparison) {
        setPricingRevisionError('The newest pricing revision is not available for comparison.');
      }
    } catch (error) {
      setDeclinedPricingComparison(null);
      setPricingRevisionError(
        error instanceof Error
          ? error.message
          : 'Unable to compare pricing revisions. Check your connection and try again.'
      );
    } finally {
      setDeclinedPricingComparisonLoading(false);
    }
  };

  const handleUpgradeDeclinedPricing = async () => {
    if (!declinedPricingComparison || pricingRevisionBusy || !canChooseProposalRevisions) return;
    setPricingRevisionBusy(true);
    setPricingRevisionError(null);
    try {
      const currentComparison = await buildPricingRevisionComparison(proposal as Proposal);
      if (!currentComparison) {
        throw new Error('The newest pricing revision is not available. Refresh and try again.');
      }
      setDeclinedPricingComparison(currentComparison);
      const session = readSession();
      const upgraded = await upgradeProposalPricingRevision(proposal as Proposal, currentComparison, {
        userId: session?.userId,
        name: session?.userName || null,
        email: session?.userEmail || null,
        role: session?.role,
      });
      await setActivePricingModel(
        upgraded.pricingModelId || currentComparison.pricingModelId,
        upgraded.pricingModelFranchiseId || upgraded.franchiseId,
        normalizePricingTierId(upgraded.pricingTierId || selectedPricingTierId),
        upgraded.pricingModelRevisionId
      );
      assertProposalContext(loadedContextRef.current);
      const snapshot = await loadPricingSnapshotForExistingProposal(upgraded.franchiseId, upgraded.pricingModelId,
        upgraded.pricingModelFranchiseId, upgraded.pricingTierId, upgraded.pricingModelRevisionId);
      assertProposalContext(loadedContextRef.current);
      bindEditorSnapshot(snapshot.pricing);
      proposalPricingSnapshotsRef.current.set(pricingSnapshotKey(upgraded), snapshot.pricing);
      setProposal(upgraded);
      setSelectedPricingModelId(upgraded.pricingModelId || null);
      setSelectedPricingModelName(upgraded.pricingModelName || null);
      markUserEdit();
      setDeclinedPricingComparison(null);
      setShowDeclinedPricingComparison(false);
      setShowDeclinedModelChooser(false);
      showToast({
        type: 'success',
        message: 'Pricing model upgraded. Save the proposal to keep this revision.',
      });
    } catch (error) {
      setPricingRevisionError(error instanceof Error ? error.message : 'Unable to upgrade the pricing model.');
    } finally {
      setPricingRevisionBusy(false);
    }
  };

  const handleSelectPricingTier = (tierValue: string) => {
    if (!canChooseProposalRevisions) return;
    const pricingTierId = normalizePricingTierId(tierValue);
    if (pricingTierId === selectedPricingTierId) return;
    if (isBronzePricingTier(pricingTierId)) {
      setPendingPricingTierId(pricingTierId);
      return;
    }
    void applyPricingTierSelection(pricingTierId);
  };

  const handleConfirmBronzePricingTier = () => {
    if (!canChooseProposalRevisions) return;
    const pricingTierId = normalizePricingTierId(pendingPricingTierId);
    setPendingPricingTierId(null);
    void applyPricingTierSelection(pricingTierId);
  };

  const renderSection = () => {
    // Ensure we have valid proposal data before rendering
    if (!proposal.poolSpecs || !proposal.customerInfo) {
      return (
        <div className="section-form">
          <p>Loading proposal data...</p>
        </div>
      );
    }

    const currentSectionKey = sections[currentSection]?.key;
    const hasSpa = proposal.poolSpecs?.spaType !== 'none';
    const isFiberglass = proposal.poolSpecs?.poolType === 'fiberglass';
    const allowSpaRunInput = hasSpa || isFiberglass;
    const hasPool = hasPoolDefinition(proposal.poolSpecs);
    const selectedPackage = getSelectedEquipmentPackage(proposal.equipment as any);
    const disableSpaSelections = Boolean(selectedPackage && !packageSupportsSpa(selectedPackage));
    const disabledSpaMessage = disableSpaSelections
      ? 'The chosen equipment package cannot support a Spa'
      : undefined;
    const waterFeatureAllowance = getPackageWaterFeaturesWithoutExtraPump(selectedPackage);
    const waterFeatureDisabledReason =
      selectedPackage && !packageAllowsWaterFeatures(selectedPackage)
        ? 'This equipment package cannot support water features.'
        : undefined;
    const additionalPumpSelections = getAdditionalPumpSelections(proposal.equipment);
    const packageWaterFeatureWarningMessage = additionalPumpSelections.some(
      (pump) => pump?.autoAddedReason === 'waterFeature'
    )
      ? waterFeatureAllowance > 0
        ? `This equipment package supports ${waterFeatureAllowance} water feature categor${waterFeatureAllowance === 1 ? 'y' : 'ies'} before another pump is required. An additional pump has been added automatically.`
        : 'An additional pump has been added automatically for the selected water features.'
      : undefined;

    try {
      switch (currentSectionKey) {
        case 'poolSpecs':
          return (
            <PoolSpecsSectionNew
              data={proposal.poolSpecs}
              customerInfo={proposal.customerInfo!}
              onChangeCustomerInfo={(info) => updateProposal('customerInfo', info)}
              onChange={(data) => updateProposal('poolSpecs', data)}
              tileCopingDecking={proposal.tileCopingDecking}
              onChangeTileCopingDecking={(data) => updateProposal('tileCopingDecking', data)}
              disableSpaSelections={disableSpaSelections}
              disabledSpaMessage={disabledSpaMessage}
              noteOverrides={proposalNoteOverrides}
            />
          );
        case 'excavation':
          return (
            <ExcavationSectionNew
              data={proposal.excavation!}
              onChange={(data) => updateProposal('excavation', data)}
              pricingTierId={normalizePricingTierId(proposal.pricingTierId || selectedPricingTierId)}
              isPpasEast={isPpasEastFranchiseCode(proposal.designerCode || getSessionFranchiseCode())}
              noteOverrides={proposalNoteOverrides}
              priceImpactRequestKey={priceImpactRequestKey}
              getExcavationPriceImpact={
                priceImpactEnabled ? getExcavationPriceImpact : undefined
              }
            />
          );
        case 'plumbing':
          return (
            <PlumbingSectionNew
              data={proposal.plumbing!}
              onChange={(data) => updateProposal('plumbing', data)}
              allowSpaRunInput={allowSpaRunInput}
              hasSpa={hasSpa}
              additionalPumpCount={additionalPumpSelections.length}
              noteOverrides={proposalNoteOverrides}
              priceImpactRequestKey={priceImpactRequestKey}
              getPlumbingPriceImpact={priceImpactEnabled ? getPlumbingPriceImpact : undefined}
            />
          );
        case 'electrical':
          return (
            <ElectricalSectionNew
              data={proposal.electrical!}
              onChange={(data) => updateProposal('electrical', data)}
              plumbingRuns={proposal.plumbing!.runs}
              waterFeatures={proposal.waterFeatures!}
              onChangePlumbingRuns={updatePlumbingRuns}
              hasSpa={hasSpa}
              noteOverrides={proposalNoteOverrides}
              priceImpactRequestKey={priceImpactRequestKey}
              getElectricalPriceImpact={priceImpactEnabled ? getElectricalPriceImpact : undefined}
            />
          );
        case 'tileCopingDecking':
          return (
            <TileCopingDeckingSectionNew
              data={proposal.tileCopingDecking!}
              onChange={(data) => updateProposal('tileCopingDecking', data)}
              isFiberglass={isFiberglass}
              poolDeckingArea={proposal.poolSpecs.deckingArea || 0}
              noteOverrides={proposalNoteOverrides}
              priceImpactRequestKey={priceImpactRequestKey}
              getTileCopingDeckingPriceImpact={
                priceImpactEnabled ? getTileCopingDeckingPriceImpact : undefined
              }
            />
          );
        case 'drainage':
          return (
            <DrainageSectionNew
              data={proposal.drainage!}
              onChange={(data) => updateProposal('drainage', data)}
              noteOverrides={proposalNoteOverrides}
              priceImpactRequestKey={priceImpactRequestKey}
              getDrainagePriceImpact={
                priceImpactEnabled ? getDrainagePriceImpact : undefined
              }
            />
          );
        case 'equipment':
          return (
            <EquipmentSectionNew
              data={proposal.equipment!}
              onChange={(data) => updateProposal('equipment', data)}
              onSelectPackage={handleSelectEquipmentPackage}
              plumbingRuns={proposal.plumbing!.runs}
              onChangePlumbingRuns={updatePlumbingRuns}
              hasSpa={hasSpa}
              hasPool={hasPool}
              isPpasEast={isPpasEastFranchiseCode(proposal.designerCode || getSessionFranchiseCode())}
              noteOverrides={proposalNoteOverrides}
              priceImpactRequestKey={priceImpactRequestKey}
              getEquipmentPriceImpact={priceImpactEnabled ? getEquipmentPriceImpact : undefined}
            />
          );
        case 'waterFeatures':
          return (
            <WaterFeaturesSectionNew
              data={proposal.waterFeatures!}
              onChange={(data) => updateProposal('waterFeatures', data)}
              plumbingRuns={proposal.plumbing!.runs}
              onChangePlumbingRuns={updatePlumbingRuns}
              disabledReason={waterFeatureDisabledReason}
              packageWarningMessage={packageWaterFeatureWarningMessage}
              noteOverrides={proposalNoteOverrides}
              priceImpactRequestKey={priceImpactRequestKey}
              getWaterFeaturePriceImpact={
                priceImpactEnabled ? getWaterFeaturePriceImpact : undefined
              }
            />
          );
        case 'interiorFinish':
          return (
            <InteriorFinishSectionNew
              data={proposal.interiorFinish!}
              onChange={(data) => updateProposal('interiorFinish', data)}
              hasSpa={hasSpa}
              isFiberglass={isFiberglass}
              supportsMicroglass={!isPpasEastFranchiseCode(proposal.designerCode || getSessionFranchiseCode())}
              colorFieldLabel={
                isPpasEastFranchiseCode(proposal.designerCode || getSessionFranchiseCode())
                  ? 'Color'
                  : 'Color / Style'
              }
              includeAssignLaterColor={isPpasEastFranchiseCode(
                proposal.designerCode || getSessionFranchiseCode()
              )}
              pricingTierId={normalizePricingTierId(proposal.pricingTierId || selectedPricingTierId)}
              noteOverrides={proposalNoteOverrides}
              priceImpactRequestKey={priceImpactRequestKey}
              getInteriorFinishPriceImpact={
                priceImpactEnabled ? getInteriorFinishPriceImpact : undefined
              }
            />
          );
        case 'customFeatures':
          return (
            <CustomFeaturesSectionNew
              data={proposal.customFeatures!}
              onChange={(data) => updateProposal('customFeatures', data)}
              retailPrice={retailPrice}
              additionalOptions={(pricingData as any).customFeatures?.groupedSubcategories || []}
              groupedOptions={(pricingData as any).customFeatures?.groupedOptions || []}
              noteOverrides={proposalNoteOverrides}
            />
          );
        default:
          return null;
      }
    } catch (error) {
      console.error('Error rendering section:', error);
      return (
        <div className="section-form">
          <div style={{
            padding: '2rem',
            backgroundColor: '#fee2e2',
            borderRadius: '8px',
            border: '1px solid #dc2626'
          }}>
            <h3 style={{ color: '#991b1b', marginBottom: '0.5rem' }}>Error Loading Section</h3>
            <p style={{ color: '#7f1d1d' }}>
              There was an error loading this section. This may be due to incompatible data from an older version.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/')}
              style={{ marginTop: '1rem' }}
            >
              Return to Home
            </button>
          </div>
        </div>
      );
    }
  };

  const retryExistingProposalLoad = () => {
    if (!proposalNumber) return;
    setExistingProposalLoadStatus('loading');
    setExistingProposalLoadError(null);
    setIsLoading(true);
    setLoadRetryNonce((value) => value + 1);
  };

  if (isLoading || (proposalNumber && existingProposalLoadStatus === 'loading')) {
    return (
      <div className="proposal-form">
        <div className="form-container loading-state">
          <p>Loading proposal...</p>
        </div>
      </div>
    );
  }

  if (proposalNumber && existingProposalLoadStatus === 'error') {
    return (
      <div className="proposal-form">
        <div
          className="form-container loading-state"
          data-testid="proposal-load-safety-error"
          role="alert"
        >
          <h2>Proposal could not be opened safely</h2>
          <p>
            {existingProposalLoadError ||
              'This proposal did not finish loading. No changes were saved.'}
          </p>
          <p>The editor is locked, so this proposal cannot be replaced with blank or partial data.</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={retryExistingProposalLoad}>
              Retry Loading
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentPricingSnapshot = getProposalPricingSnapshot(proposal) ||
    (!proposalNumber && !proposal.pricingModelId ? getPricingDataSnapshot() : null);
  if (!currentPricingSnapshot) {
    return <div className="proposal-form"><p>This proposal's selected pricing revision is unavailable. Reopen the proposal before editing or saving.</p></div>;
  }
  const currentPricingProposal = withTemporaryPricingSnapshot(currentPricingSnapshot, () => mergeWithDefaults(
    applySessionCommissionRates(proposal)
  )) as Proposal;
  const currentModelPapDiscounts = normalizePapDiscounts(currentPricingSnapshot.papDiscountRates);
  const currentCostBreakdown = withTemporaryPricingSnapshot(currentPricingSnapshot, () => MasterPricingEngine.calculateCompleteProposal(
    currentPricingProposal,
    currentModelPapDiscounts
  ));
  if (priceImpactProposalIdentityRef.current.proposal !== proposal) {
    priceImpactProposalIdentityRef.current = {
      proposal: proposal as object,
      counter: priceImpactProposalIdentityRef.current.counter + 1,
    };
  }
  const priceImpactRequestKey = [
    priceImpactProposalIdentityRef.current.counter,
    proposal.lastModified || '',
    proposal.versionId || editingVersionId || 'original',
    proposal.pricingModelRevisionId || 'current',
    proposal.pricingTierId || selectedPricingTierId,
    priceImpactDisplayBasis,
  ].join('::');
  const getEquipmentPriceImpact = (
    target: EquipmentPriceImpactTarget
  ): PriceImpactResult => {
    const proposalCacheKey = proposal as object;
    let proposalCache = priceImpactCacheRef.current.get(proposalCacheKey);
    if (!proposalCache) {
      proposalCache = new Map();
      priceImpactCacheRef.current.set(proposalCacheKey, proposalCache);
    }
    const cacheKey = `equipment:${priceImpactDisplayBasis}:${getEquipmentPriceImpactTargetKey(target)}`;
    const cached = proposalCache.get(cacheKey);
    if (cached) return cached;

    const result = calculateEquipmentPriceImpact({
      proposal: currentPricingProposal,
      target,
      displayBasis: priceImpactDisplayBasis,
      currentCalculation: currentCostBreakdown,
      pricingSnapshot: currentPricingSnapshot,
      calculateProposal: (input) =>
        MasterPricingEngine.calculateCompleteProposal(input, currentModelPapDiscounts),
    });
    proposalCache.set(cacheKey, result);
    return result;
  };
  const getExcavationPriceImpact = (
    target: ExcavationPriceImpactTarget
  ): PriceImpactResult => {
    const proposalCacheKey = proposal as object;
    let proposalCache = priceImpactCacheRef.current.get(proposalCacheKey);
    if (!proposalCache) {
      proposalCache = new Map();
      priceImpactCacheRef.current.set(proposalCacheKey, proposalCache);
    }
    const cacheKey = `excavation:${priceImpactDisplayBasis}:${getExcavationPriceImpactTargetKey(target)}`;
    const cached = proposalCache.get(cacheKey);
    if (cached) return cached;

    const result = calculateExcavationPriceImpact({
      proposal: currentPricingProposal,
      target,
      displayBasis: priceImpactDisplayBasis,
      currentCalculation: currentCostBreakdown,
      pricingSnapshot: currentPricingSnapshot,
      calculateProposal: (input) =>
        MasterPricingEngine.calculateCompleteProposal(input, currentModelPapDiscounts),
    });
    proposalCache.set(cacheKey, result);
    return result;
  };
  const getPlumbingPriceImpact = (
    target: PlumbingPriceImpactTarget
  ): PriceImpactResult => {
    const proposalCacheKey = proposal as object;
    let proposalCache = priceImpactCacheRef.current.get(proposalCacheKey);
    if (!proposalCache) {
      proposalCache = new Map();
      priceImpactCacheRef.current.set(proposalCacheKey, proposalCache);
    }
    const cacheKey = `plumbing:${priceImpactDisplayBasis}:${getPlumbingPriceImpactTargetKey(target)}`;
    const cached = proposalCache.get(cacheKey);
    if (cached) return cached;

    const result = calculatePlumbingPriceImpact({
      proposal: currentPricingProposal,
      target,
      displayBasis: priceImpactDisplayBasis,
      currentCalculation: currentCostBreakdown,
      pricingSnapshot: currentPricingSnapshot,
      calculateProposal: (input) =>
        MasterPricingEngine.calculateCompleteProposal(input, currentModelPapDiscounts),
    });
    proposalCache.set(cacheKey, result);
    return result;
  };
  const getElectricalPriceImpact = (
    target: ElectricalPriceImpactTarget
  ): PriceImpactResult => {
    const proposalCacheKey = proposal as object;
    let proposalCache = priceImpactCacheRef.current.get(proposalCacheKey);
    if (!proposalCache) {
      proposalCache = new Map();
      priceImpactCacheRef.current.set(proposalCacheKey, proposalCache);
    }
    const cacheKey = `electrical:${priceImpactDisplayBasis}:${getElectricalPriceImpactTargetKey(target)}`;
    const cached = proposalCache.get(cacheKey);
    if (cached) return cached;

    const result = calculateElectricalPriceImpact({
      proposal: currentPricingProposal,
      target,
      displayBasis: priceImpactDisplayBasis,
      currentCalculation: currentCostBreakdown,
      pricingSnapshot: currentPricingSnapshot,
      calculateProposal: (input) =>
        MasterPricingEngine.calculateCompleteProposal(input, currentModelPapDiscounts),
    });
    proposalCache.set(cacheKey, result);
    return result;
  };
  const getTileCopingDeckingPriceImpact = (
    target: TileCopingDeckingPriceImpactTarget
  ): PriceImpactResult => {
    const proposalCacheKey = proposal as object;
    let proposalCache = priceImpactCacheRef.current.get(proposalCacheKey);
    if (!proposalCache) {
      proposalCache = new Map();
      priceImpactCacheRef.current.set(proposalCacheKey, proposalCache);
    }
    const cacheKey = `tileCopingDecking:${priceImpactDisplayBasis}:${getTileCopingDeckingPriceImpactTargetKey(target)}`;
    const cached = proposalCache.get(cacheKey);
    if (cached) return cached;

    const result = calculateTileCopingDeckingPriceImpact({
      proposal: currentPricingProposal,
      target,
      displayBasis: priceImpactDisplayBasis,
      currentCalculation: currentCostBreakdown,
      pricingSnapshot: currentPricingSnapshot,
      calculateProposal: (input) =>
        MasterPricingEngine.calculateCompleteProposal(input, currentModelPapDiscounts),
    });
    proposalCache.set(cacheKey, result);
    return result;
  };
  const getDrainagePriceImpact = (
    target: DrainagePriceImpactTarget
  ): PriceImpactResult => {
    const proposalCacheKey = proposal as object;
    let proposalCache = priceImpactCacheRef.current.get(proposalCacheKey);
    if (!proposalCache) {
      proposalCache = new Map();
      priceImpactCacheRef.current.set(proposalCacheKey, proposalCache);
    }
    const cacheKey = `drainage:${priceImpactDisplayBasis}:${getDrainagePriceImpactTargetKey(target)}`;
    const cached = proposalCache.get(cacheKey);
    if (cached) return cached;

    const result = calculateDrainagePriceImpact({
      proposal: currentPricingProposal,
      target,
      displayBasis: priceImpactDisplayBasis,
      currentCalculation: currentCostBreakdown,
      pricingSnapshot: currentPricingSnapshot,
      calculateProposal: (input) =>
        MasterPricingEngine.calculateCompleteProposal(input, currentModelPapDiscounts),
    });
    proposalCache.set(cacheKey, result);
    return result;
  };
  const getWaterFeaturePriceImpact = (
    target: WaterFeaturePriceImpactTarget
  ): PriceImpactResult => {
    const proposalCacheKey = proposal as object;
    let proposalCache = priceImpactCacheRef.current.get(proposalCacheKey);
    if (!proposalCache) {
      proposalCache = new Map();
      priceImpactCacheRef.current.set(proposalCacheKey, proposalCache);
    }
    const cacheKey = `waterFeatures:${priceImpactDisplayBasis}:${getWaterFeaturePriceImpactTargetKey(target)}`;
    const cached = proposalCache.get(cacheKey);
    if (cached) return cached;

    const result = calculateWaterFeaturePriceImpact({
      proposal: currentPricingProposal,
      target,
      displayBasis: priceImpactDisplayBasis,
      currentCalculation: currentCostBreakdown,
      pricingSnapshot: currentPricingSnapshot,
      calculateProposal: (input) =>
        MasterPricingEngine.calculateCompleteProposal(input, currentModelPapDiscounts),
    });
    proposalCache.set(cacheKey, result);
    return result;
  };
  const getInteriorFinishPriceImpact = (
    target: InteriorFinishPriceImpactTarget
  ): PriceImpactResult => {
    const proposalCacheKey = proposal as object;
    let proposalCache = priceImpactCacheRef.current.get(proposalCacheKey);
    if (!proposalCache) {
      proposalCache = new Map();
      priceImpactCacheRef.current.set(proposalCacheKey, proposalCache);
    }
    const cacheKey = `interiorFinish:${priceImpactDisplayBasis}:${getInteriorFinishPriceImpactTargetKey(target)}`;
    const cached = proposalCache.get(cacheKey);
    if (cached) return cached;

    const result = calculateInteriorFinishPriceImpact({
      proposal: currentPricingProposal,
      target,
      displayBasis: priceImpactDisplayBasis,
      currentCalculation: currentCostBreakdown,
      pricingSnapshot: currentPricingSnapshot,
      calculateProposal: (input) =>
        MasterPricingEngine.calculateCompleteProposal(input, currentModelPapDiscounts),
    });
    proposalCache.set(cacheKey, result);
    return result;
  };
  const proposalSummaryTooltip = !isReadOnlyBuilderView && isOffline
    ? 'Offline: opening the summary will save locally and sync later.'
    : undefined;
  const isCompactLayout = viewportWidth < 1300;
  const isMobileLayout = viewportWidth < 1024;
  const customerTitle = (proposal.customerInfo?.customerName || '').trim();
  const headerTitle = customerTitle ? `Proposal Builder - ${customerTitle}` : 'Proposal Builder';
  const franchiseLogoId = proposal.franchiseId || getSessionFranchiseId();
  const retailPrice = toFiniteNumber(
    currentCostBreakdown.pricing.retailPrice ??
      currentCostBreakdown.totalCost ??
      proposal.totalCost ??
      0
  );
  const proposalIndicator = buildProposalIndicator(currentCostBreakdown.pricing?.grossProfitMargin);
  const showCostSidebar = false;
  const selectedPricingModel =
    pricingModels.find(
      (model) =>
        model.id === selectedPricingModelId &&
        (!proposal.pricingModelFranchiseId || !model.franchiseId || model.franchiseId === proposal.pricingModelFranchiseId)
    ) ||
    pricingModels.find((model) => model.id === selectedPricingModelId) ||
    null;
  const selectedPricingModelFranchiseId =
    selectedPricingModel?.franchiseId || proposal.pricingModelFranchiseId || proposal.franchiseId || getSessionFranchiseId();
  const isSelectedPricingModelFromCurrentFranchise = selectedPricingModelFranchiseId === (proposal.franchiseId || getSessionFranchiseId());
  const buildPricingModelLabel = (
    name: string,
    franchiseId?: string | null,
    franchiseName?: string | null,
    removed?: boolean,
    hidden?: boolean
  ) => {
    const franchiseLabel = isMasterUser ? (franchiseName || franchiseId || '').trim() : '';
    const normalizedName = (name || '').trim();
    if (!normalizedName && !franchiseLabel) {
      return '';
    }
    const baseLabel = [normalizedName || 'Unknown Pricing Model', franchiseLabel].filter(Boolean).join(' - ');
    if (removed && !baseLabel.toLowerCase().includes('(removed)')) {
      return `${baseLabel} (Removed)`;
    }
    if (hidden && !baseLabel.toLowerCase().includes('(hidden)')) {
      return `${baseLabel} (Hidden)`;
    }
    return baseLabel;
  };
  const showRemovedPricingModelIndicator = Boolean(selectedPricingModelId && selectedPricingModel?.removed);
  const showStalePricingModelIndicator =
    Boolean(selectedPricingModelId) &&
    Boolean(defaultPricingModelId) &&
    isSelectedPricingModelFromCurrentFranchise &&
    selectedPricingModelId !== defaultPricingModelId &&
    !showRemovedPricingModelIndicator;
  const isActivePricingModel =
    Boolean(selectedPricingModelId) &&
    isSelectedPricingModelFromCurrentFranchise &&
    selectedPricingModelId === defaultPricingModelId &&
    !showRemovedPricingModelIndicator;
  const normalizedSelectedPricingModelName = selectedPricingModelName || selectedPricingModel?.name || '';
  const normalizedSelectedPricingModelLabel = buildPricingModelLabel(
    normalizedSelectedPricingModelName,
    selectedPricingModelFranchiseId,
    selectedPricingModel?.franchiseName,
    showRemovedPricingModelIndicator,
    Boolean(selectedPricingModel?.isHiddenFromView) && !showRemovedPricingModelIndicator
  );
  const pricingModelDisplayName = showRemovedPricingModelIndicator
    ? normalizedSelectedPricingModelLabel || 'Unknown Pricing Model (Removed)'
    : normalizedSelectedPricingModelLabel || 'Select Pricing Model';
  const pricingModelStatusLabel = showRemovedPricingModelIndicator
    ? 'Removed'
    : selectedPricingModelId && !isSelectedPricingModelFromCurrentFranchise
    ? 'Selected'
    : showStalePricingModelIndicator
    ? 'Inactive'
    : isActivePricingModel
    ? 'Active'
    : selectedPricingModelId
    ? 'Selected'
    : pricingModels.length === 0
    ? 'No Models'
    : 'Select';
  const isFeenstraMay2026Pricing =
    proposal.calculationProfile === FEENSTRA_MAY_2026_CALCULATION_PROFILE &&
    proposal.proposalNumber === FEENSTRA_PROPOSAL_NUMBER;
  const pricingModelHeaderStateClass = isFeenstraMay2026Pricing
    ? 'form-header-pricing--legacy'
    : showRemovedPricingModelIndicator
    ? 'form-header-pricing--removed'
    : showStalePricingModelIndicator
    ? 'form-header-pricing--inactive'
    : selectedPricingModelId
    ? 'form-header-pricing--active'
    : 'form-header-pricing--empty';
  const proposalFormStyle = { ['--form-header-height' as any]: `${formHeaderHeight}px` };
  const pricingModelSelect = (
    <label
      className={`form-header-pricing ${pricingModelHeaderStateClass}`}
      data-tooltip={
        isFeenstraMay2026Pricing
          ? 'This proposal is locked to the May 11, 2026 calculation engine and pricing revision.'
          : isReadOnlyBuilderView && !sharedAccess
          ? readOnlyBuilderMessage
          : !canChooseProposalRevisions
          ? 'Pricing selections are controlled by the proposal owner.'
          : 'Click to change from the Active Price Model'
      }
      aria-label={
        isFeenstraMay2026Pricing
          ? `Current pricing model: ${pricingModelDisplayName}. Locked to May 11, 2026 pricing.`
          : isReadOnlyBuilderView && !sharedAccess
          ? `Current pricing model: ${pricingModelDisplayName}. ${readOnlyBuilderMessage}`
          : !canChooseProposalRevisions
          ? `Current pricing model: ${pricingModelDisplayName}. Pricing selections are controlled by the proposal owner.`
          : `Current pricing model: ${pricingModelDisplayName}. Click to change from the Active Price Model`
      }
    >
      <select
        value={selectedPricingModelId || ''}
        onChange={(e) => void handleSelectPricingModel(e.target.value)}
        className="form-header-pricing-select"
        disabled={
          pricingModels.length === 0 ||
          isSaving ||
          !canChooseProposalRevisions ||
          isFeenstraMay2026Pricing
        }
        aria-label={`Pricing Model. Current selection: ${pricingModelDisplayName}`}
      >
        <option value="" disabled>
          {pricingModels.length === 0 ? 'No pricing models available' : 'Select pricing model'}
        </option>
        {pricingModels.map((model) => {
          const baseLabel = buildPricingModelLabel(
            model.name,
            model.franchiseId,
            model.franchiseName,
            Boolean(model.removed),
            Boolean(model.isHiddenFromView)
          );
          return (
            <option key={model.id} value={model.id}>
              {baseLabel}
            </option>
          );
        })}
      </select>
      <span className="form-header-pricing-body">
        <span className="form-header-pricing-name">{pricingModelDisplayName}</span>
        {pricingModelStatusLabel !== 'Select' && pricingModelStatusLabel !== 'No Models' && (
          <span className="form-header-pricing-pill">
            {isFeenstraMay2026Pricing ? 'May 11 Math' : pricingModelStatusLabel}
          </span>
        )}
        <span className="form-header-pricing-arrow" aria-hidden="true" />
      </span>
    </label>
  );
  const hasDeclinedPricingUpgrade =
    canChooseProposalRevisions &&
    proposal.pricingRevisionReview?.decision === 'declined' &&
    Boolean(proposal.pricingModelId) &&
    Boolean(proposal.pricingModelRevisionId) &&
    !isVersionPermanentlyLocked(proposal as Proposal);
  const pricingModelControl = hasDeclinedPricingUpgrade && !isReadOnlyBuilderView ? (
    <div className="form-header-pricing-upgrade">
      <div className="form-header-pricing-upgrade-current">
        <span>{pricingModelDisplayName}</span>
        <small>Revision {proposal.pricingModelRevisionNumber || declinedPricingComparison?.pinnedRevisionNumber || 'Current'}</small>
      </div>
      <div className="form-header-pricing-upgrade-actions">
        <button
          type="button"
          className="form-header-pricing-upgrade-button"
          onClick={() => void handleOpenDeclinedPricingComparison()}
          disabled={declinedPricingComparisonLoading}
        >
          {declinedPricingComparisonLoading ? 'Checking newest version...' : 'Upgrade to newest version'}
        </button>
        <button
          type="button"
          className="form-header-pricing-change-button"
          onClick={() => setShowDeclinedModelChooser((current) => !current)}
        >
          Change model
        </button>
      </div>
      {showDeclinedModelChooser && <div className="form-header-pricing-chooser">{pricingModelSelect}</div>}
    </div>
  ) : pricingModelSelect;
  const normalizedSelectedPricingTierId = normalizePricingTierId(proposal.pricingTierId || selectedPricingTierId);
  const pricingTierDisplayName = getPricingTierName(normalizedSelectedPricingTierId);
  const pricingTierControl = (
    <label
      className={`form-header-pricing form-header-pricing--tier ${
        isBronzePricingTier(normalizedSelectedPricingTierId)
          ? 'form-header-pricing--bronze'
          : 'form-header-pricing--active'
      }`}
      data-tooltip={
        isFeenstraMay2026Pricing
          ? 'The pricing tier is locked for the May 11, 2026 calculation profile.'
          : isReadOnlyBuilderView && !sharedAccess
          ? readOnlyBuilderMessage
          : !canChooseProposalRevisions
          ? 'Pricing selections are controlled by the proposal owner.'
          : 'Select the pricing tier for this proposal'
      }
      aria-label={
        isFeenstraMay2026Pricing
          ? `Current pricing tier: ${pricingTierDisplayName}. Locked to May 11, 2026 pricing.`
          : isReadOnlyBuilderView && !sharedAccess
          ? `Current pricing tier: ${pricingTierDisplayName}. ${readOnlyBuilderMessage}`
          : !canChooseProposalRevisions
          ? `Current pricing tier: ${pricingTierDisplayName}. Pricing selections are controlled by the proposal owner.`
          : `Current pricing tier: ${pricingTierDisplayName}. Select the pricing tier for this proposal`
      }
    >
      <select
        value={normalizedSelectedPricingTierId}
        onChange={(e) => handleSelectPricingTier(e.target.value)}
        className="form-header-pricing-select"
        disabled={isSaving || !canChooseProposalRevisions || isFeenstraMay2026Pricing}
        aria-label={`Pricing Tier. Current selection: ${pricingTierDisplayName}`}
      >
        {PRICING_TIER_OPTIONS.map((tier) => (
          <option key={tier.id} value={tier.id}>
            {tier.name}
          </option>
        ))}
      </select>
      <span className="form-header-pricing-body">
        <span className="form-header-pricing-name">{pricingTierDisplayName}</span>
        <span className="form-header-pricing-pill">Tier</span>
        <span className="form-header-pricing-arrow" aria-hidden="true" />
      </span>
    </label>
  );

  const handleProposalSummaryClick = () => {
    if (isSaving) return;
    if ((isReadOnlyBuilderView || (sharedAccess && !hasUserEdits)) && proposalNumber) {
      navigate(`/proposal/view/${proposalNumber}`, {
        state: { versionId: proposal.versionId || editingVersionId || versionIdFromState || 'original' },
      });
      return;
    }
    void handleSave('draft', { navigateToSummary: true });
  };

  return (
    <div className="proposal-form" style={proposalFormStyle}>
      <header className="form-header" ref={formHeaderRef}>
        {isOffline && <CloudConnectionNotice reason={cloudIssue} placement="header" />}
        <div className="form-header-row">
          <div className="form-header-title">
            <FranchiseLogo className="form-logo" alt="Franchise Logo" franchiseId={franchiseLogoId} />
            <h1>{headerTitle}</h1>
          </div>
        </div>
      </header>
      {sharedAccess && <div className="shared-proposal-builder-banner" role="status">
        {sharedEditing && !isReadOnlyBuilderView
          ? `Shared Proposal · Editing ${proposal?.versionName || versionNameFromState || 'Original Version'} Copy`
          : 'Shared Proposal · View Only'}
      </div>}
      {sharedAccess && <SharedPricingRevisionNotice proposal={proposal} />}

      <div
        className={`form-layout ${isCompactLayout ? 'is-compact' : ''} ${isMobileLayout ? 'is-mobile' : ''} ${!showCostSidebar ? 'no-cost' : ''} ${!showLeftNav ? 'no-nav' : ''}`}
      >
        {showLeftNav && (
          <nav className={`section-nav ${showLeftNav ? 'open' : ''}`}>
            <div
              className="nav-header"
              onClick={() => {
                setNavManuallyToggled(true);
                setShowLeftNav(false);
              }}
            >
              <h3>Navigation</h3>
            </div>
            <button
              className="sidebar-toggle left-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setNavManuallyToggled(true);
                setShowLeftNav(false);
              }}
              aria-label="Hide navigation"
            >
              {'<'}
            </button>
            <div className="nav-action-space" aria-hidden="true">
              <span className="nav-divider" />
              <div className="nav-action-buttons">
                {canOpenCogsBreakdown && (
                  <button
                    className="cost-modal-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCostBreakdownPage(true);
                    }}
                  >
                    <img src={costBreakIconImg} alt="Cost Breakdown" className="button-icon cost-break-icon" />
                    <span className="cost-modal-label">Cost Breakdown</span>
                  </button>
                )}
                <button
                  type="button"
                  className="cost-modal-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCostModal(true);
                  }}
                  aria-label="View Customer Cost and Warranty Breakdown"
                >
                  <img src={customerProposalIcon} alt="Customer Proposal" className="button-icon" />
                  <span className="cost-modal-label">Customer Proposal</span>
                </button>
              </div>
              <span className="nav-divider" />
            </div>
            <div className="section-nav-grid">
              {sections.map((section, index) => {
                const isActive = index === currentSection;
                return (
                  <button
                    key={section.key}
                    className={`nav-item ${section.key === 'poolSpecs' ? 'pool-specs-item' : ''} ${section.key === 'excavation' ? 'excavation-item' : ''} ${section.key === 'plumbing' ? 'plumbing-item' : ''} ${section.key === 'electrical' ? 'electrical-item' : ''} ${section.key === 'tileCopingDecking' ? 'tile-item' : ''} ${section.key === 'drainage' ? 'drainage-item' : ''} ${section.key === 'waterFeatures' ? 'water-item' : ''} ${section.key === 'interiorFinish' ? 'interior-item' : ''} ${section.key === 'equipment' ? 'equipment-item' : ''} ${section.key === 'customFeatures' ? 'custom-item' : ''} ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setCurrentSection(index);
                      if (isMobileLayout) setShowLeftNav(false);
                    }}
                  >
                    <span className="nav-icon-wrapper" aria-hidden="true">
                      {sectionIcons[section.key]()}
                    </span>
                    <span className="nav-label">{section.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}

        {!showLeftNav && (
          <button
            className="sidebar-show-button left-show"
            type="button"
            aria-label="Show proposal navigation"
            onClick={() => {
              setNavManuallyToggled(true);
              setShowLeftNav(true);
            }}
          >
            &gt;
          </button>
        )}

          <div className={`form-container ${!showLeftNav ? 'no-left-nav' : ''} ${!showCostSidebar ? 'no-right-cost' : ''}`}>
          <div className="section-content" ref={sectionContentRef}>
            <div className={`section-title-row${hasDeclinedPricingUpgrade ? ' has-pricing-upgrade' : ''}`}>
              <div className="section-title-controls-row">
                <div className="section-title-pricing">
                  {pricingModelControl}
                  {pricingTierControl}
                </div>
                <div className="section-title-actions">
                  {sharedAccess === 'contribute' && isSharedWorkingCopy && !sharedEditing && !sharedSubmissionPending
                    && !isExplicitReadOnlyVersionView && getVersionRecordStatus(proposal) === 'draft'
                    && !proposal.versionLocked && !isOffline &&
                    <button className="btn btn-primary" onClick={() => void (async () => {
                      if (sharedStartingRef.current) return;
                      sharedStartingRef.current = true;
                      setSharedStarting(true);
                      const loadToken = loadRequestRef.current;
                      try {
                        assertProposalContext(loadedContextRef.current);
                        const request = await beginWorkingCopy(proposalNumber!, editingVersionId || 'original', Number(proposal.contentRevision));
                        const work = request.working_version_json;
                        const snapshot = await loadPricingSnapshotForExistingProposal(work.franchiseId, work.pricingModelId,
                          work.pricingModelFranchiseId, work.pricingTierId, work.pricingModelRevisionId);
                        assertProposalContext(loadedContextRef.current);
                        if (loadToken !== loadRequestRef.current) return;
                        bindEditorSnapshot(snapshot.pricing);
                        proposalPricingSnapshotsRef.current.set(pricingSnapshotKey(work), snapshot.pricing);
                        sharedRequestRef.current = request;
                        previousSpaTypeRef.current = work.poolSpecs?.spaType ?? 'none';
                        previousHasPoolRef.current = hasPoolDefinition(work.poolSpecs);
                        setSelectedPricingModelId(work.pricingModelId || null);
                        setSelectedPricingModelName(work.pricingModelName || null);
                        setSelectedPricingTierId(normalizePricingTierId(work.pricingTierId));
                        setManualAdjustments(work.manualAdjustments || getDefaultManualAdjustments());
                        manualAdjustmentsSourceRef.current = 'proposal';
                        setProposal({ ...work, sharedPermission: 'contribute',
                          contentRevision: proposal.contentRevision, ownerAuthUserId: proposal.ownerAuthUserId,
                          collaborationEnabled: true });
                        setSharedEditing(true);
                      } catch (error) { showToast({ type: 'error', message: (error as Error).message }); }
                      finally { sharedStartingRef.current = false; setSharedStarting(false); }
                    })()} disabled={isSaving || sharedStarting}>{sharedStarting ? 'Preparing editing copy…' : 'Propose Changes'}</button>}
                  <TooltipAnchor tooltip={proposalSummaryTooltip}>
                    <button
                      className="btn btn-success"
                      onClick={handleProposalSummaryClick}
                      disabled={isSaving}
                    >
                      Proposal Summary
                    </button>
                  </TooltipAnchor>
                </div>
              </div>
              <h2 className="section-title">{sections[currentSection]?.label}</h2>
            </div>
            {isReadOnlyBuilderView && !sharedAccess && (
              <div className="proposal-builder-readonly-note" role="status">
                {readOnlyBuilderMessage}
              </div>
            )}
            {isReadOnlyBuilderView ? (
              <TooltipAnchor as="div" followTarget tooltip={sharedAccess === 'contribute'
                ? sharedSubmissionPending
                  ? 'VIEW ONLY. Withdraw Changes before proposing more changes'
                  : 'VIEW ONLY. To modify, click Propose Changes at the top'
                : sharedAccess ? 'VIEW ONLY. The proposal owner has granted viewing access.' : undefined}>
                <fieldset className="proposal-builder-readonly-shell" disabled={!sharedAccess} aria-label="Read-only proposal builder"
                  onMouseDownCapture={blockReadOnlyBuilderInteraction}
                  onClickCapture={blockReadOnlyBuilderInteraction}
                  onKeyDownCapture={blockReadOnlyBuilderInteraction}
                  onBeforeInputCapture={blockReadOnlyBuilderInteraction}
                  onChangeCapture={blockReadOnlyBuilderInteraction}>
                  {renderSection()}
                </fieldset>
              </TooltipAnchor>
            ) : (
              renderSection()
            )}
          </div>

          <div className="form-actions">
            <div className="left-actions">
              <button className="btn btn-secondary" onClick={handleHome} disabled={isSaving}>
                Home
              </button>
              {showFeedbackButton && onOpenFeedback && (
                <button className="btn btn-secondary" onClick={onOpenFeedback} disabled={isSaving}>
                  Feedback
                </button>
              )}
            </div>
            <div className="middle-actions">
              <span className="proposal-gp-indicator">{proposalIndicator}</span>
            </div>
            <div className="right-actions">
              {currentSection > 0 && (
                <button className="btn btn-secondary" onClick={handlePrevious} disabled={isSaving}>
                  Previous
                </button>
              )}
              {currentSection < sections.length - 1 && (
                <button className="btn btn-primary" onClick={handleNext} disabled={isSaving}>
                  Next
                </button>
              )}
            </div>
          </div>
        </div>

      </div>

      {showCostModal && (
        <div className="cost-modal-overlay" data-scroll-lock="true" onClick={() => setShowCostModal(false)}>
          <div className="cost-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="cost-modal-close" onClick={() => setShowCostModal(false)}>
              X
            </button>
            <CostBreakdownView
              costBreakdown={currentCostBreakdown.costBreakdown}
              customerName={proposal.customerInfo?.customerName || ''}
              proposal={proposal}
              pricing={currentCostBreakdown.pricing}
              showWarranty
              showZoomControl={false}
              initialZoomScale={0.9}
              allowRetailAdjustments={!isReadOnlyBuilderView}
              editableWarranty={!isReadOnlyBuilderView}
              onRetailAdjustmentsChange={
                isReadOnlyBuilderView ? undefined : (adjustments) => updateProposal('retailAdjustments', adjustments)
              }
              onWarrantySectionsChange={
                isReadOnlyBuilderView ? undefined : (sections) => updateProposal('warrantySections', sections)
              }
            />
          </div>
        </div>
      )}

      {showCostBreakdownPage && canOpenCogsBreakdown && (
        <CostBreakdownPage
          proposal={applySessionCommissionRates({
            ...proposal,
            papDiscounts: readPapDiscountsFromModel(),
            manualAdjustments: proposal.manualAdjustments,
          }) as Proposal}
          onClose={() => setShowCostBreakdownPage(false)}
          onAdjustmentsChange={
            isReadOnlyBuilderView
              ? undefined
              : (adjustments) => {
                  manualAdjustmentsSourceRef.current = 'proposal';
                  setManualAdjustments(adjustments);
                  updateProposal('manualAdjustments', adjustments);
                }
          }
        />
      )}

      <ConfirmDialog
        open={Boolean(historicalPricingReview)}
        title="Older proposal pricing review"
        message={
          historicalPricingReview
            ? `Current calculation rules would change this older version from ${historicalPricingReview.storedRetailPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} to ${historicalPricingReview.currentCalculatedPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}. Submerge will protect the saved retail price while pricing new edits normally.`
            : ''
        }
        confirmLabel="Apply protected pricing"
        cancelLabel="Not now"
        onConfirm={() => {
          setHistoricalPricingReview(null);
          markUserEdit();
          showToast({
            type: 'success',
            message: 'Protected pricing is ready. Save the proposal to keep it.',
          });
        }}
        onCancel={() => setHistoricalPricingReview(null)}
      />
      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel changes?"
        message="Unsaved changes will be lost."
        confirmLabel="Save to Drafts"
        cancelLabel="Discard"
        onConfirm={async () => {
          setShowCancelConfirm(false);
          await handleSave('draft', { forceDraftStatus: true });
        }}
        onCancel={() => {
          setShowCancelConfirm(false);
          setHasEdits(false);
          setHasUserEdits(false);
          navigate('/');
        }}
      />
      <ConfirmDialog
        open={pendingPricingTierId === BRONZE_PRICING_TIER_ID}
        title="Change Pricing Tier?"
        message="Changing to the Bronze Pricing Tier will incur restrictions and cost differences, are you sure you would like to proceed?"
        confirmLabel="Continue"
        cancelLabel="No"
        onConfirm={handleConfirmBronzePricingTier}
        onCancel={() => setPendingPricingTierId(null)}
      />
      <PricingRevisionComparisonModal
        isOpen={showDeclinedPricingComparison}
        comparison={declinedPricingComparison}
        loading={pricingRevisionBusy || declinedPricingComparisonLoading}
        error={pricingRevisionError}
        showDecline={false}
        onConfirm={() => void handleUpgradeDeclinedPricing()}
        onClose={() => {
          if (pricingRevisionBusy) return;
          setShowDeclinedPricingComparison(false);
          setPricingRevisionError(null);
        }}
      />
    </div>
  );
}

export default ProposalForm;
