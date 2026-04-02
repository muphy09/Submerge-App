import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Proposal, WaterFeatures, WaterFeatureSelection, PAPDiscounts, ManualAdjustments } from '../types/proposal-new';
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
import ConfirmDialog from '../components/ConfirmDialog';
import { normalizeEquipmentLighting } from '../utils/lighting';
import {
  getActivePricingModelMeta,
  initPricingDataStore,
  getPricingDataSnapshot,
  loadPricingSnapshotForFranchise,
  setActivePricingModel,
  subscribeToPricingData,
  withTemporaryPricingSnapshot,
} from '../services/pricingDataStore';
import pricingData from '../services/pricingData';
import {
  CUSTOM_PACKAGE_ID,
  createFreshEquipmentForPackage,
  getEnabledEquipmentPackageOptions,
  getSelectedEquipmentPackage,
  getPackageWaterFeaturesWithoutExtraPump,
  isFixedEquipmentPackage,
  packageAllowsAdditionalPumps,
  packageAllowsWaterFeatures,
  packageSupportsSpa,
} from '../utils/equipmentPackages';
import { getAdditionalPumpSelections, getBasePumpQuantity } from '../utils/pumpSelections';
import { listAllFranchises, listAllPricingModels } from '../services/masterAdminAdapter';
import { listPricingModels as listPricingModelsRemote } from '../services/pricingModelsAdapter';
import { getProposal as getProposalRemote, saveProposal as saveProposalRemote } from '../services/proposalsAdapter';
import { hasSupabaseConnection } from '../services/supabaseClient';
import type { CloudConnectionIssue } from '../components/CloudConnectionNotice';
import {
  getSessionCommissionRates,
  getSessionFranchiseCode,
  getSessionFranchiseId,
  getSessionRole,
  getSessionUserName,
  isMasterActingAsOwnerSession,
  isMasterSession,
} from '../services/session';
import { applyActiveVersion, listAllVersions, upsertVersionInContainer } from '../utils/proposalVersions';
import { normalizeCustomFeatures } from '../utils/customFeatures';
import { useAdminCogsView } from '../hooks/useAdminCogsView';
import { normalizeWarrantySectionsSetting } from '../utils/warranty';
import {
  ensureProposalWorkflow,
  getWorkflowStatus,
  isSubmittedVersionLocked,
  submitProposalForWorkflow,
} from '../services/proposalWorkflow';

const normalizeWaterFeatureSelections = (selections: any): WaterFeatureSelection[] => {
  if (!Array.isArray(selections)) return [];

  return selections
    .filter((selection) => typeof selection?.featureId === 'string' && selection.featureId.trim().length > 0)
    .map((selection) => ({
      featureId: selection.featureId,
      quantity: Number.isFinite(Number(selection?.quantity)) ? Number(selection.quantity) : 0,
      includeValveActuator: selection?.includeValveActuator !== false,
    }));
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
    poolSpecs.poolType === 'fiberglass' &&
    (!!poolSpecs.fiberglassSize || !!poolSpecs.fiberglassModelName || !!poolSpecs.fiberglassModelPrice);
  return hasGuniteDimensions || hasFiberglassSelection;
};

const mergeWithDefaults = (input: Partial<Proposal>): Partial<Proposal> => {
  const base = getDefaultProposal();
  const mergedPoolSpecs = { ...getDefaultPoolSpecs(), ...(input.poolSpecs || {}) };
  const mergedEquipment = normalizeEquipmentLighting(
    { ...getDefaultEquipment(), ...(input.equipment || {}) } as Proposal['equipment'],
    { poolSpecs: mergedPoolSpecs, hasSpa: mergedPoolSpecs.spaType !== 'none' }
  );
  return {
    ...base,
    ...input,
    customerInfo: { ...(base.customerInfo || {}), ...(input.customerInfo || {}) } as Proposal['customerInfo'],
    poolSpecs: mergedPoolSpecs,
    excavation: { ...getDefaultExcavation(), ...(input.excavation || {}) },
    plumbing: { ...getDefaultPlumbing(), ...(input.plumbing || {}) },
    electrical: { ...getDefaultElectrical(), ...(input.electrical || {}) },
    tileCopingDecking: { ...getDefaultTileCopingDecking(), ...(input.tileCopingDecking || {}) },
    drainage: { ...getDefaultDrainage(), ...(input.drainage || {}) },
    equipment: mergedEquipment,
    waterFeatures: { ...getDefaultWaterFeatures(), ...(input.waterFeatures || {}) },
    interiorFinish: { ...getDefaultInteriorFinish(), ...(input.interiorFinish || {}) },
    customFeatures: normalizeCustomFeatures(input.customFeatures),
    manualAdjustments: { ...getDefaultManualAdjustments(), ...(input.manualAdjustments || {}) },
    retailAdjustments: mergeRetailAdjustments(input.retailAdjustments),
    papDiscounts: input.papDiscounts || base.papDiscounts,
    costBreakdown: input.costBreakdown || base.costBreakdown,
    warrantySections: normalizeWarrantySectionsSetting(input.warrantySections),
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

function ProposalForm({ cloudIssue, showFeedbackButton = false, onOpenFeedback }: ProposalFormProps) {
  const navigate = useNavigate();
  const { proposalNumber } = useParams();
  const { showToast } = useToast();
  const location = useLocation();
  const sessionRole = getSessionRole();
  const isMasterUser = isMasterSession();
  const isProposalEditingRestricted = isMasterActingAsOwnerSession();
  const canViewCostBreakdown =
    sessionRole === 'master' || sessionRole === 'admin' || sessionRole === 'owner';
  const { hideCogsFromProposalBuilder } = useAdminCogsView();
  const canOpenCogsBreakdown = canViewCostBreakdown && !hideCogsFromProposalBuilder;
  const versionIdFromState = (location.state as any)?.versionId as string | undefined;
  const versionNameFromState = (location.state as any)?.versionName as string | undefined;
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
  const [isSaving, setIsSaving] = useState(false);
  const isOffline = cloudIssue === 'no-internet' || cloudIssue === 'server-issue';
  const readPapDiscountsFromModel = (): PAPDiscounts => {
    const snapshot = getPricingDataSnapshot();
    return snapshot?.papDiscountRates ? { ...snapshot.papDiscountRates } : getDefaultPAPDiscounts();
  };
  const readManualAdjustmentsFromModel = (): ManualAdjustments => {
    const snapshot = getPricingDataSnapshot() as any;
    return snapshot?.manualAdjustments
      ? { ...snapshot.manualAdjustments }
      : getDefaultManualAdjustments();
  };
  const [papDiscounts, setPapDiscounts] = useState<PAPDiscounts>(readPapDiscountsFromModel());
  const papDiscountSourceRef = useRef<'pricingModel' | 'proposal'>('pricingModel');
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
  const [versionList, setVersionList] = useState<Proposal[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string>('original');
  const [editingVersionId, setEditingVersionId] = useState<string>('original');
  const restrictedRedirectHandledRef = useRef(false);
  const sessionCommissionRates = getSessionCommissionRates();
  const applySessionCommissionRates = (input: Partial<Proposal>): Partial<Proposal> => ({
    ...input,
    pricing: {
      ...(input.pricing || {}),
      digCommissionRate: sessionCommissionRates.digCommissionRate,
      closeoutCommissionRate: sessionCommissionRates.closeoutCommissionRate,
    } as Proposal['pricing'],
  });

  useEffect(() => {
    if (canOpenCogsBreakdown) return;
    setShowCostBreakdownPage(false);
  }, [canOpenCogsBreakdown]);

  const syncPapDiscountsFromModel = () => {
    const snapshot = getPricingDataSnapshot();
    const nextDiscounts = snapshot?.papDiscountRates ? { ...snapshot.papDiscountRates } : getDefaultPAPDiscounts();
    setPapDiscounts(nextDiscounts);
    papDiscountSourceRef.current = 'pricingModel';
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
    if (modelId && !skipRemote) {
      await setActivePricingModel(modelId, modelFranchiseId || undefined);
    }
    if (papDiscountSourceRef.current !== 'proposal' || markDirty) {
      syncPapDiscountsFromModel();
    }

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
      franchiseId: prev.franchiseId || getSessionFranchiseId(),
    }));
    if (markDirty) {
      setHasEdits(true);
    }
  };

  const loadPricingModels = async (
    franchiseId: string,
    desiredModelId?: string | null,
    desiredModelFranchiseId?: string | null
  ) => {
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
        await applyPricingModelSelection(
          targetModel.id,
          targetModel.name,
          Boolean(targetModel.isDefault),
          Boolean(targetModel.removed),
          false,
          targetModel.franchiseId
        );
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
    const selectedPackage = getSelectedEquipmentPackage(currentEquipment as any);
    const defaultCustomPackage =
      getEnabledEquipmentPackageOptions().find((option) => option.id === CUSTOM_PACKAGE_ID) ||
      getEnabledEquipmentPackageOptions().find((option) => option.mode === 'custom');

    if (selectedPackage && isFixedEquipmentPackage(selectedPackage)) {
      return createFreshEquipmentForPackage(selectedPackage, { hasPool, hasSpa });
    }

    return normalizeEquipmentLighting(
      {
        ...getDefaultEquipment(),
        packageSelectionId: selectedPackage?.id || currentEquipment?.packageSelectionId || defaultCustomPackage?.id || CUSTOM_PACKAGE_ID,
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
      const forceHideNav = width < 960;
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
      franchiseId,
      designerName,
      designerRole,
      designerCode,
      pricing: {
        ...(base.pricing || {}),
        digCommissionRate: sessionCommissionRates.digCommissionRate,
        closeoutCommissionRate: sessionCommissionRates.closeoutCommissionRate,
      } as Proposal['pricing'],
      pricingModelId: shouldUseActiveDefault ? modelMeta.pricingModelId || undefined : undefined,
      pricingModelName: shouldUseActiveDefault ? modelMeta.pricingModelName || undefined : undefined,
      pricingModelFranchiseId: shouldUseActiveDefault ? modelMeta.pricingModelFranchiseId || franchiseId : undefined,
      pricingModelIsDefault: shouldUseActiveDefault ? modelMeta.isDefault : undefined,
      equipment: buildStartingEquipment(base.poolSpecs),
    };
  };

  const [proposal, setProposal] = useState<Partial<Proposal>>(proposalNumber ? {} : getInitialProposal());
  const previousSpaTypeRef = useRef<string>(proposal.poolSpecs?.spaType ?? 'none');
  const previousHasPoolRef = useRef<boolean>(hasPoolDefinition(proposal.poolSpecs));

  useEffect(() => {
    if (!isProposalEditingRestricted || restrictedRedirectHandledRef.current) return;
    restrictedRedirectHandledRef.current = true;
    showToast({
      type: 'warning',
      message: proposalNumber
        ? 'Master accounts acting as owner can view proposals but cannot edit them.'
        : 'Master accounts acting as owner cannot create proposals.',
    });
    navigate(proposalNumber ? `/proposal/view/${proposalNumber}` : '/', { replace: true });
  }, [isProposalEditingRestricted, navigate, proposalNumber, showToast]);

  useEffect(() => {
    const unsubscribe = subscribeToPricingData((snapshot) => {
      if (snapshot?.papDiscountRates && papDiscountSourceRef.current === 'pricingModel') {
        setPapDiscounts(snapshot.papDiscountRates as PAPDiscounts);
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
      return lowered.includes('no pump') || lowered.includes('no aux') || lowered.includes('no auxiliary');
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
          nextEquipment = normalizeEquipmentLighting(
            {
              ...nextEquipment,
              includeSpaLights: true,
            } as Proposal['equipment'],
            { poolSpecs: { ...(prev.poolSpecs || {}), spaType: currentSpaType } as any, hasSpa: true }
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

        return updated ? { ...prev, equipment: nextEquipment } : prev;
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

        return updated ? { ...prev, equipment: nextEquipment } : prev;
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

    if (poolJustAdded && !hasPoolLightSelection) {
      setProposal(prev => {
        const nextEquipment = normalizeEquipmentLighting(
          {
            ...(prev.equipment || getDefaultEquipment()),
            includePoolLights: true,
          } as Proposal['equipment'],
          {
            poolSpecs: { ...(prev.poolSpecs || {}) } as any,
            hasPool: true,
            hasSpa: (prev.poolSpecs?.spaType ?? 'none') !== 'none',
          }
        );
        return { ...prev, equipment: nextEquipment };
      });
      setHasEdits(true);
    } else if (poolRemoved && (proposal.equipment?.poolLights?.length ?? 0) > 0) {
      setProposal(prev => ({
        ...prev,
        equipment: {
          ...(prev.equipment || getDefaultEquipment()),
          includePoolLights: false,
          poolLights: [],
          numberOfLights: 0,
        },
      }));
      setHasEdits(true);
    }

    previousHasPoolRef.current = hasPool;
  }, [proposal.poolSpecs, proposal.equipment?.poolLights?.length]);

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
      return {
        ...prev,
        equipment: {
          ...baseEquipment,
          pumpQuantity: normalizedPumpQuantity > 0 ? normalizedPumpQuantity : baseEquipment.pumpQuantity,
          additionalPumps: [],
          auxiliaryPumps: [],
          auxiliaryPump: undefined,
        } as Proposal['equipment'],
      };
    });
    setHasEdits(true);
  }, [proposal.equipment]);

  useEffect(() => {
    const selectedPackage = getSelectedEquipmentPackage(proposal.equipment as any);
    const auxiliaryPumpCatalog =
      (pricingData as any).equipment?.auxiliaryPumps?.length
        ? (pricingData as any).equipment.auxiliaryPumps
        : pricingData.equipment.pumps;
    const isAuxPumpPlaceholder = (name: string) => {
      const lowered = name.toLowerCase();
      return lowered.includes('no pump') || lowered.includes('no aux') || lowered.includes('no auxiliary');
    };
    const defaultAuxiliaryPump =
      auxiliaryPumpCatalog.find((pump: any) => pump.defaultAuxiliaryPump) ||
      auxiliaryPumpCatalog.find((pump: any) => !isAuxPumpPlaceholder(pump.name)) ||
      auxiliaryPumpCatalog[0];
    const pumpOverhead = (pricingData as any).equipment?.pumpOverheadMultiplier ?? 1;
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
    const selectedWaterFeatureCount = (proposal.waterFeatures?.selections || []).filter(
      (selection) => Math.max(selection?.quantity ?? 0, 0) > 0
    ).length;

    const equipment = proposal.equipment || getDefaultEquipment();
    const auxSelections = equipment.auxiliaryPumps?.length
      ? equipment.auxiliaryPumps
      : equipment.auxiliaryPump
      ? [equipment.auxiliaryPump]
      : [];
    const additionalPrimaryPumps = getAdditionalPumpSelections(equipment);
    const manualAuxSelections = auxSelections.filter((pump) => pump?.autoAddedReason !== 'waterFeature');
    const waterFeatureAutoPumps = auxSelections.filter((pump) => pump?.autoAddedReason === 'waterFeature');

    if (!selectedPackage || !isFixedEquipmentPackage(selectedPackage) || !packageAllowsWaterFeatures(selectedPackage)) {
      if (waterFeatureAutoPumps.length > 0) {
        setProposal((prev) => {
          const baseEquipment = (prev.equipment || getDefaultEquipment()) as Proposal['equipment'];
          const nextAuxSelections = (baseEquipment.auxiliaryPumps?.length
            ? baseEquipment.auxiliaryPumps
            : baseEquipment.auxiliaryPump
            ? [baseEquipment.auxiliaryPump]
            : []
          ).filter((pump) => pump?.autoAddedReason !== 'waterFeature');
          return {
            ...prev,
            equipment: {
              ...baseEquipment,
              auxiliaryPumps: nextAuxSelections,
              auxiliaryPump: nextAuxSelections[0],
            } as Proposal['equipment'],
          };
        });
        setHasEdits(true);
      }
      return;
    }

    const hasManualAdditionalPump = additionalPrimaryPumps.length > 0 || manualAuxSelections.length > 0;
    const allowance = getPackageWaterFeaturesWithoutExtraPump(selectedPackage);
    const needsAdditionalPump = selectedWaterFeatureCount > allowance;

    if (needsAdditionalPump && !hasManualAdditionalPump && waterFeatureAutoPumps.length === 0) {
      const selection = buildWaterFeaturePump(defaultAuxiliaryPump);
      if (!selection) return;
      setProposal((prev) => {
        const baseEquipment = (prev.equipment || getDefaultEquipment()) as Proposal['equipment'];
        const currentAuxSelections = baseEquipment.auxiliaryPumps?.length
          ? baseEquipment.auxiliaryPumps
          : baseEquipment.auxiliaryPump
          ? [baseEquipment.auxiliaryPump]
          : [];
        const nextAuxSelections = [...currentAuxSelections, selection];
        return {
          ...prev,
          equipment: {
            ...baseEquipment,
            auxiliaryPumps: nextAuxSelections,
            auxiliaryPump: nextAuxSelections[0],
          } as Proposal['equipment'],
        };
      });
      setHasEdits(true);
      return;
    }

    if (!needsAdditionalPump && waterFeatureAutoPumps.length > 0) {
      setProposal((prev) => {
        const baseEquipment = (prev.equipment || getDefaultEquipment()) as Proposal['equipment'];
        const currentAuxSelections = baseEquipment.auxiliaryPumps?.length
          ? baseEquipment.auxiliaryPumps
          : baseEquipment.auxiliaryPump
          ? [baseEquipment.auxiliaryPump]
          : [];
        const nextAuxSelections = currentAuxSelections.filter((pump) => pump?.autoAddedReason !== 'waterFeature');
        return {
          ...prev,
          equipment: {
            ...baseEquipment,
            auxiliaryPumps: nextAuxSelections,
            auxiliaryPump: nextAuxSelections[0],
          } as Proposal['equipment'],
        };
      });
      setHasEdits(true);
    }
  }, [
    proposal.equipment,
    proposal.waterFeatures?.selections,
  ]);

  useEffect(() => {
    const requestId = ++loadRequestRef.current;
    if (isProposalEditingRestricted) {
      setIsLoading(false);
      return;
    }
    if (proposalNumber) {
      setIsLoading(true);
      loadProposal(proposalNumber, requestId);
    } else {
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
          setCurrentSection(0);
          setIsLoading(false);
          setHasEdits(false);
        }
      };
      void initializeNewProposal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProposalEditingRestricted, proposalNumber]);

  useEffect(() => {
    if (isProposalEditingRestricted) return;
    if (proposalNumber && isLoading) return;
    const franchiseId = proposal.franchiseId || getSessionFranchiseId();
    const desiredModelId = proposal.pricingModelId || null;
    const desiredModelFranchiseId = proposal.pricingModelFranchiseId || null;
    void initPricingDataStore(franchiseId, desiredModelId || undefined, desiredModelFranchiseId || undefined);
    void loadPricingModels(franchiseId, desiredModelId, desiredModelFranchiseId);
  }, [
    isProposalEditingRestricted,
    proposal.franchiseId,
    proposal.pricingModelId,
    proposal.pricingModelFranchiseId,
    proposalNumber,
    isLoading,
  ]);

  const loadProposal = async (num: string, requestId: number) => {
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
      const sourceProposal = JSON.parse(JSON.stringify(data)) as Proposal;
      const pricingCache = new Map<string, Awaited<ReturnType<typeof loadPricingSnapshotForFranchise>>>();
      const mergeWithPricingSnapshot = async (input: Partial<Proposal>): Promise<Partial<Proposal>> => {
        const resolvedFranchiseId = input.franchiseId || sourceProposal.franchiseId || getSessionFranchiseId();
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
        return withTemporaryPricingSnapshot(pricingSnapshot.pricing, () => mergeWithDefaults(input));
      };

      const freshData = await mergeWithPricingSnapshot(sourceProposal);

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

      const versioned = ensureProposalWorkflow(applyActiveVersion(freshData as Proposal));
      const allVersions = listAllVersions(ensureProposalWorkflow(freshData as Proposal));
      const allVersionsWithDefaults = (
        await Promise.all(
          allVersions.map(async (v) => ({
            ...((await mergeWithPricingSnapshot(v)) as Proposal),
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
      const targetVersion =
        allVersionsWithDefaults.find((v) => v.versionId === desiredVersionId) ||
        allVersionsWithDefaults.find((v) => v.versionId === versioned.versionId) ||
        allVersionsWithDefaults[0] ||
        ((await mergeWithPricingSnapshot(versioned)) as Proposal);
      const sanitizedTarget: Proposal = ensureProposalWorkflow({ ...(targetVersion as Proposal), versions: [] });
      const nextActiveId = versioned.activeVersionId || sanitizedTarget.versionId || 'original';

      if (isSubmittedVersionLocked(sanitizedTarget) || getWorkflowStatus(versioned) === 'completed') {
        showToast({
          type: 'warning',
          message:
            'This version is locked from editing. Create a new version from the proposal summary to make changes.',
        });
        navigate(`/proposal/view/${num}`, { replace: true });
        return;
      }

      if (loadRequestRef.current === requestId) {
        previousSpaTypeRef.current = sanitizedTarget.poolSpecs?.spaType ?? 'none';
        setProposal(sanitizedTarget);
        setVersionList(allVersionsWithDefaults);
        setActiveVersionId(nextActiveId);
        setEditingVersionId(sanitizedTarget.versionId || 'original');
        setSelectedPricingModelId(sanitizedTarget.pricingModelId || null);
        setSelectedPricingModelName(sanitizedTarget.pricingModelName || null);
        setCurrentSection(0);
        // Load PAP discounts if they exist
        if (sanitizedTarget.papDiscounts) {
          setPapDiscounts(sanitizedTarget.papDiscounts);
          papDiscountSourceRef.current = 'proposal';
        } else {
          papDiscountSourceRef.current = 'pricingModel';
          setPapDiscounts(readPapDiscountsFromModel());
        }
        if (sanitizedTarget.manualAdjustments) {
          setManualAdjustments(sanitizedTarget.manualAdjustments);
          manualAdjustmentsSourceRef.current = 'proposal';
        } else {
          manualAdjustmentsSourceRef.current = 'pricingModel';
          setManualAdjustments(readManualAdjustmentsFromModel());
        }
        pricingModelManualAdjustmentsRef.current = readManualAdjustmentsFromModel();
        setHasEdits(false);
      }
    } catch (error) {
      console.error('Failed to load proposal:', error);
      showToast({
        type: 'error',
        message: 'Failed to load proposal. Please try again.',
      });
    } finally {
      if (loadRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  };

  const updateProposal = (section: string, data: any) => {
    setProposal(prev => ({
      ...prev,
      [section]: data,
      lastModified: new Date().toISOString(),
    }));
    setHasEdits(true);
  };

  const handleSelectEquipmentPackage = (packageId: string) => {
    const nextPackage = getEnabledEquipmentPackageOptions().find((option) => option.id === packageId);
    if (!nextPackage) return;

    setProposal((prev) => {
      const basePoolSpecs = prev.poolSpecs || getDefaultPoolSpecs();
      const hasSpa = (basePoolSpecs.spaType ?? 'none') !== 'none';
      if (hasSpa && !packageSupportsSpa(nextPackage)) {
        return prev;
      }

      const nextEquipment = createFreshEquipmentForPackage(nextPackage, {
        hasPool: hasPoolDefinition(basePoolSpecs),
        hasSpa,
      });
      const existingPlumbing = prev.plumbing || getDefaultPlumbing();
      const existingElectrical = prev.electrical || getDefaultElectrical();
      const nextRuns = {
        ...existingPlumbing.runs,
        cleanerRun: 0,
        autoFillRun: 0,
        gasRun: 0,
      };
      WATER_FEATURE_RUN_FIELDS.forEach((field) => {
        nextRuns[field] = 0;
      });

      return {
        ...prev,
        equipment: nextEquipment,
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
      };
    });
    setHasEdits(true);
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

  const calculateTotals = (input: Partial<Proposal> = proposal): Proposal => {
    const normalized = mergeWithDefaults(applySessionCommissionRates(input));
    const result = MasterPricingEngine.calculateCompleteProposal(normalized, papDiscounts);
    const versionId = input.versionId || editingVersionId || 'original';
    const versionName =
      input.versionName ||
      (input.isOriginalVersion === false || versionId !== 'original' ? 'Version' : 'Original Version');

    return {
      ...normalized,
      versionId,
      versionName,
      activeVersionId: activeVersionId || versionId,
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
      papDiscounts,
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
    }
  ): Promise<boolean> => {
    if (isProposalEditingRestricted) return false;
    if (isSaving) return false;

    const currentVersionId = proposal.versionId || editingVersionId || 'original';
    const isVersionEdit = !(proposal.isOriginalVersion ?? currentVersionId === 'original');
    const effectiveMode = mode;
    const supabaseConnected = await hasSupabaseConnection(true);
    if (!supabaseConnected) {
      showToast({
        type: 'error',
        message: 'No internet connection. Connect to save this proposal.',
      });
      return false;
    }

    setIsSaving(true);
    try {
      let proposalToSave: Partial<Proposal> = proposal;

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
        };
      }

      if (!proposalNumber && !proposalToSave.equipment?.hasBeenEdited) {
        proposalToSave = {
          ...proposalToSave,
          equipment: buildStartingEquipment(proposalToSave.poolSpecs, proposalToSave.equipment),
        };
      }
      // Validate if submitting
      if (effectiveMode === 'submit') {
        const errors = validateProposal(proposalToSave);
        if (errors.length > 0) {
          showToast({
            type: 'error',
            message: `Validation errors: ${errors.map(e => e.message).join(', ')}`,
          });
          return false;
        }
      }

      const totals = calculateTotals(proposalToSave);
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
        activeVersionId: activeVersionId || currentVersionId,
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
          activeVersionId: activeVersionId || finalProposal.versionId || currentVersionId,
          status: options?.forceDraftStatus ? 'draft' : getWorkflowStatus(proposal as Proposal),
        } as Proposal,
        finalProposal as Proposal,
        activeVersionId || finalProposal.versionId || currentVersionId
      );

      const workflowReady =
        effectiveMode === 'submit'
          ? submitProposalForWorkflow(
              ensureProposalWorkflow(containerToSave as Proposal),
              currentVersionId,
              {
                manualReviewRequested: options?.submissionRequest?.manualReviewRequested,
                message: options?.submissionRequest?.note,
              }
            )
          : ensureProposalWorkflow(containerToSave as Proposal);

      const saved = await saveProposalRemote(
        workflowReady,
        effectiveMode === 'submit' ? { ledgerAction: 'proposal_submitted' } : undefined
      );

      const savedActive = ensureProposalWorkflow(applyActiveVersion(saved as Proposal));
      setProposal({ ...(savedActive as Proposal) });
      setVersionList(listAllVersions(saved as Proposal));
      setActiveVersionId(savedActive.activeVersionId || currentVersionId);
      setEditingVersionId(savedActive.versionId || currentVersionId);
      setHasEdits(false);
      const savedWorkflowStatus = getWorkflowStatus(saved as Proposal);
      showToast({
        type: 'success',
        message:
          effectiveMode === 'submit'
            ? savedWorkflowStatus === 'needs_approval'
              ? 'Proposal submitted for approval.'
              : 'Proposal submitted successfully.'
            : options?.forceDraftStatus
            ? 'Proposal saved as draft.'
            : 'Proposal saved successfully!',
      });

      const shouldNavigateToSummary =
        options?.navigateToSummary || effectiveMode === 'submit' || isVersionEdit;
      if (shouldNavigateToSummary) {
        navigate(`/proposal/view/${saved.proposalNumber}`);
      } else {
        navigate('/');
      }
      return true;
    } catch (error) {
      console.error('Failed to save proposal:', error);
      const errMsg =
        (error as any)?.message ||
        (error as any)?.error_description ||
        (error as any)?.hint ||
        'Failed to save proposal. Please try again.';
      showToast({
        type: 'error',
        message: `Failed to save proposal: ${errMsg}`,
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleHome = () => {
    if (hasEdits) {
      setShowCancelConfirm(true);
      return;
    }
    navigate('/');
  };

  const handleSelectPricingModel = async (id: string) => {
    const model = pricingModels.find((entry) => entry.id === id);
    await applyPricingModelSelection(
      id,
      model?.name,
      model?.isDefault,
      Boolean(model?.removed),
      true,
      model?.franchiseId
    );
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
    const auxiliarySelections = proposal.equipment?.auxiliaryPumps?.length
      ? proposal.equipment.auxiliaryPumps
      : proposal.equipment?.auxiliaryPump
      ? [proposal.equipment.auxiliaryPump]
      : [];
    const packageWaterFeatureWarningMessage = auxiliarySelections.some(
      (pump) => pump?.autoAddedReason === 'waterFeature'
    )
      ? waterFeatureAllowance > 0
        ? `This equipment package supports ${waterFeatureAllowance} water feature${waterFeatureAllowance === 1 ? '' : 's'} before another pump is required. An additional pump has been added automatically.`
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
            />
          );
        case 'excavation':
          return (
            <ExcavationSectionNew
              data={proposal.excavation!}
              onChange={(data) => updateProposal('excavation', data)}
            />
          );
        case 'plumbing':
          return (
            <PlumbingSectionNew
              data={proposal.plumbing!}
              onChange={(data) => updateProposal('plumbing', data)}
              hasSpa={hasSpa}
            />
          );
        case 'electrical':
          return (
            <ElectricalSectionNew
              data={proposal.electrical!}
              onChange={(data) => updateProposal('electrical', data)}
              plumbingRuns={proposal.plumbing!.runs}
              waterFeatures={proposal.waterFeatures!}
              onChangePlumbingRuns={(runs) =>
                updateProposal('plumbing', { ...(proposal.plumbing || { cost: 0, runs }), runs })
              }
              hasSpa={hasSpa}
            />
          );
        case 'tileCopingDecking':
          return (
            <TileCopingDeckingSectionNew
              data={proposal.tileCopingDecking!}
              onChange={(data) => updateProposal('tileCopingDecking', data)}
              isFiberglass={isFiberglass}
              poolDeckingArea={proposal.poolSpecs.deckingArea || 0}
            />
          );
        case 'drainage':
          return (
            <DrainageSectionNew
              data={proposal.drainage!}
              onChange={(data) => updateProposal('drainage', data)}
            />
          );
        case 'equipment':
          return (
            <EquipmentSectionNew
              data={proposal.equipment!}
              onChange={(data) => updateProposal('equipment', data)}
              onSelectPackage={handleSelectEquipmentPackage}
              plumbingRuns={proposal.plumbing!.runs}
              onChangePlumbingRuns={(runs) =>
                updateProposal('plumbing', { ...(proposal.plumbing || { cost: 0, runs }), runs })
              }
              hasSpa={hasSpa}
              hasPool={hasPool}
            />
          );
        case 'waterFeatures':
          return (
            <WaterFeaturesSectionNew
              data={proposal.waterFeatures!}
              onChange={(data) => updateProposal('waterFeatures', data)}
              plumbingRuns={proposal.plumbing!.runs}
              onChangePlumbingRuns={(runs) =>
                updateProposal('plumbing', { ...(proposal.plumbing || { cost: 0, runs }), runs })
              }
              disabledReason={waterFeatureDisabledReason}
              packageWarningMessage={packageWaterFeatureWarningMessage}
            />
          );
        case 'interiorFinish':
          return (
            <InteriorFinishSectionNew
              data={proposal.interiorFinish!}
              onChange={(data) => updateProposal('interiorFinish', data)}
              hasSpa={hasSpa}
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

  if (isLoading) {
    return (
      <div className="proposal-form">
        <div className="form-container loading-state">
          <p>Loading proposal...</p>
        </div>
      </div>
    );
  }

  if (isProposalEditingRestricted) {
    return null;
  }

  const currentCostBreakdown = MasterPricingEngine.calculateCompleteProposal(
    mergeWithDefaults(applySessionCommissionRates(proposal)),
    papDiscounts
  );
  const proposalSummaryTooltip = isOffline
    ? 'No internet connection. Connect to save.'
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
  const pricingModelHeaderStateClass = showRemovedPricingModelIndicator
    ? 'form-header-pricing--removed'
    : showStalePricingModelIndicator
    ? 'form-header-pricing--inactive'
    : selectedPricingModelId
    ? 'form-header-pricing--active'
    : 'form-header-pricing--empty';
  const proposalFormStyle = { ['--form-header-height' as any]: `${formHeaderHeight}px` };
  const pricingModelControl = (
    <label
      className={`form-header-pricing ${pricingModelHeaderStateClass}`}
      data-tooltip="Click to change from the Active Price Model"
      aria-label={`Current pricing model: ${pricingModelDisplayName}. Click to change from the Active Price Model`}
    >
      <select
        value={selectedPricingModelId || ''}
        onChange={(e) => void handleSelectPricingModel(e.target.value)}
        className="form-header-pricing-select"
        disabled={pricingModels.length === 0 || isSaving}
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
          <span className="form-header-pricing-pill">{pricingModelStatusLabel}</span>
        )}
        <span className="form-header-pricing-arrow" aria-hidden="true" />
      </span>
    </label>
  );

  const handleProposalSummaryClick = () => {
    if (isSaving || isOffline) return;
    void handleSave('draft', { navigateToSummary: true, forceDraftStatus: true });
  };

  return (
    <div className="proposal-form" style={proposalFormStyle}>
      {isOffline && (
        <div className="offline-save-banner" role="alert">
          {cloudIssue === 'server-issue'
            ? 'CLOUD UNAVAILABLE - CONNECT TO SAVE PROPOSAL'
            : 'NO INTERNET - CONNECT TO SAVE PROPOSAL'}
        </div>
      )}
      <header className="form-header" ref={formHeaderRef}>
        <div className="form-header-row">
          <div className="form-header-title">
            <FranchiseLogo className="form-logo" alt="Franchise Logo" franchiseId={franchiseLogoId} />
            <h1>{headerTitle}</h1>
          </div>
        </div>
      </header>

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
              title="Hide navigation"
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
              title="Hide navigation"
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
                    title="View Cost Breakdown"
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
                  title="View Customer Proposal"
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
                    onClick={() => setCurrentSection(index)}
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
            onClick={() => {
              setNavManuallyToggled(true);
              setShowLeftNav(true);
            }}
            title="Show navigation"
            data-tooltip="Click to reveal Navigation"
          >
            &gt;
          </button>
        )}

        <div className={`form-container ${!showLeftNav ? 'no-left-nav' : ''} ${!showCostSidebar ? 'no-right-cost' : ''}`}>
          <div className="section-content" ref={sectionContentRef}>
            <div className="section-title-row">
              <div className="section-title-pricing">{pricingModelControl}</div>
              <h2 className="section-title">{sections[currentSection]?.label}</h2>
              <div className="section-title-actions">
                <button
                  className="btn btn-success"
                  onClick={handleProposalSummaryClick}
                  disabled={isSaving || isOffline}
                  title={proposalSummaryTooltip}
                >
                  Proposal Summary
                </button>
              </div>
            </div>
            {renderSection()}
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
        <div className="cost-modal-overlay" onClick={() => setShowCostModal(false)}>
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
              allowRetailAdjustments
              editableWarranty
              onRetailAdjustmentsChange={(adjustments) => updateProposal('retailAdjustments', adjustments)}
              onWarrantySectionsChange={(sections) => updateProposal('warrantySections', sections)}
            />
          </div>
        </div>
      )}

      {showCostBreakdownPage && canOpenCogsBreakdown && (
        <CostBreakdownPage
          proposal={applySessionCommissionRates({
            ...proposal,
            papDiscounts,
            manualAdjustments: proposal.manualAdjustments,
          }) as Proposal}
          onClose={() => setShowCostBreakdownPage(false)}
          onAdjustmentsChange={(adjustments) => {
            manualAdjustmentsSourceRef.current = 'proposal';
            setManualAdjustments(adjustments);
            updateProposal('manualAdjustments', adjustments);
          }}
        />
      )}

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
          navigate('/');
        }}
      />
    </div>
  );
}

export default ProposalForm;
