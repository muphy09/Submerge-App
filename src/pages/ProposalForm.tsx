import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Proposal, WaterFeatures, PAPDiscounts, ManualAdjustments } from '../types/proposal-new';
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
  getDefaultCustomFeatures,
  getDefaultInteriorFinish,
  getDefaultManualAdjustments,
} from '../utils/proposalDefaults';
import { getEquipmentItemCost } from '../utils/equipmentCost';
import MasterPricingEngine from '../services/masterPricingEngine';
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
import LiveCostBreakdown from '../components/LiveCostBreakdown';
import CostBreakdownPage from '../components/CostBreakdownPage';
import './ProposalForm.css';
import submergeLogo from '../../Submerge Logo.png';
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
import { getLightCounts, normalizeEquipmentLighting } from '../utils/lighting';
import {
  getActivePricingModelMeta,
  initPricingDataStore,
  getPricingDataSnapshot,
  setActivePricingModel,
  subscribeToPricingData,
} from '../services/pricingDataStore';
import pricingData from '../services/pricingData';
import { listPricingModels as listPricingModelsRemote } from '../services/pricingModelsAdapter';
import { getProposal as getProposalRemote, saveProposal as saveProposalRemote } from '../services/proposalsAdapter';
import { hasSupabaseConnection } from '../services/supabaseClient';
import {
  getSessionFranchiseCode,
  getSessionFranchiseId,
  getSessionRole,
  getSessionUserName,
} from '../services/session';
import { applyActiveVersion, listAllVersions, upsertVersionInContainer } from '../utils/proposalVersions';

const normalizeWaterFeatures = (waterFeatures: any): WaterFeatures => {
  if (waterFeatures && Array.isArray((waterFeatures as any).selections)) {
    return {
      selections: (waterFeatures as any).selections,
      totalCost: (waterFeatures as any).totalCost ?? 0,
    };
  }

  return {
    selections: [],
    totalCost: 0,
  };
};

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
    customerInfo: { ...(base.customerInfo || {}), ...(input.customerInfo || {}) },
    poolSpecs: mergedPoolSpecs,
    excavation: { ...getDefaultExcavation(), ...(input.excavation || {}) },
    plumbing: { ...getDefaultPlumbing(), ...(input.plumbing || {}) },
    electrical: { ...getDefaultElectrical(), ...(input.electrical || {}) },
    tileCopingDecking: { ...getDefaultTileCopingDecking(), ...(input.tileCopingDecking || {}) },
    drainage: { ...getDefaultDrainage(), ...(input.drainage || {}) },
    equipment: mergedEquipment,
    waterFeatures: { ...getDefaultWaterFeatures(), ...(input.waterFeatures || {}) },
    interiorFinish: { ...getDefaultInteriorFinish(), ...(input.interiorFinish || {}) },
    customFeatures: { ...getDefaultCustomFeatures(), ...(input.customFeatures || {}) },
    manualAdjustments: { ...getDefaultManualAdjustments(), ...(input.manualAdjustments || {}) },
    papDiscounts: input.papDiscounts || base.papDiscounts,
    costBreakdown: input.costBreakdown || base.costBreakdown,
  };
};

function ProposalForm() {
  const navigate = useNavigate();
  const { proposalNumber } = useParams();
  const { showToast } = useToast();
  const location = useLocation();
  const versionIdFromState = (location.state as any)?.versionId as string | undefined;
  const versionNameFromState = (location.state as any)?.versionName as string | undefined;
  const getViewportWidth = () => (typeof window !== 'undefined' ? window.innerWidth : 1920);
  const getInitialLeftNav = () => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1100;
  };
  const getInitialRightCost = () => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1250;
  };
  const [currentSection, setCurrentSection] = useState(0);
  const [isLoading, setIsLoading] = useState(!!proposalNumber);
  const loadRequestRef = useRef(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showLeftNav, setShowLeftNav] = useState<boolean>(getInitialLeftNav);
  const [showRightCost, setShowRightCost] = useState<boolean>(getInitialRightCost);
  const [navManuallyToggled, setNavManuallyToggled] = useState(false);
  const [costManuallyToggled, setCostManuallyToggled] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(getViewportWidth);
  const [showCostModal, setShowCostModal] = useState(false);
  const [showCostBreakdownPage, setShowCostBreakdownPage] = useState(false);
  const [hasEdits, setHasEdits] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showOfflineConfirm, setShowOfflineConfirm] = useState(false);
  const [pendingSaveMode, setPendingSaveMode] = useState<'draft' | 'submit' | null>(null);
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
  const sectionContentRef = useRef<HTMLDivElement | null>(null);
  const createCompletionMap = () =>
    sections.reduce((acc, section) => {
      acc[section.key] = false;
      return acc;
    }, {} as Record<SectionKey, boolean>);
  const [completedByAdvance, setCompletedByAdvance] = useState<Record<SectionKey, boolean>>(createCompletionMap());
  const [pricingModels, setPricingModels] = useState<{ id: string; name: string; isDefault?: boolean; removed?: boolean }[]>([]);
  const [defaultPricingModelId, setDefaultPricingModelId] = useState<string | null>(null);
  const [selectedPricingModelId, setSelectedPricingModelId] = useState<string | null>(null);
  const [selectedPricingModelName, setSelectedPricingModelName] = useState<string | null>(null);
  const [versionList, setVersionList] = useState<Proposal[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string>('original');
  const [editingVersionId, setEditingVersionId] = useState<string>('original');

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
    markDirty?: boolean
  ) => {
    if (modelId && !skipRemote) {
      await setActivePricingModel(modelId);
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
    } else if (manualAdjustmentsSourceRef.current !== 'proposal' || markDirty) {
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
      pricingModelIsDefault: isDefault ?? undefined,
      franchiseId: prev.franchiseId || getSessionFranchiseId(),
    }));
    if (markDirty) {
      setHasEdits(true);
    }
  };

  const loadPricingModels = async (franchiseId: string, desiredModelId?: string | null) => {
    try {
      const rows = await listPricingModelsRemote(franchiseId);
      let models = rows || [];
      const defaultModel = rows?.find((m: any) => m.isDefault) || rows?.[0];
      setDefaultPricingModelId(defaultModel ? defaultModel.id : null);

      const targetModelId = desiredModelId || selectedPricingModelId || defaultModel?.id || null;
      const targetModel = rows?.find((m: any) => m.id === targetModelId) || null;

      const missingModelId = desiredModelId || selectedPricingModelId;
      const missingModelKnown = missingModelId && rows?.some((m: any) => m.id === missingModelId);
      if (missingModelId && !missingModelKnown) {
        const placeholderName = proposal.pricingModelName || selectedPricingModelName || 'Unknown Pricing Model';
        const removedModel = { id: missingModelId, name: `${placeholderName} (Removed)`, isDefault: false, removed: true };
        models = [...models, removedModel];
        setSelectedPricingModelId(missingModelId);
        setSelectedPricingModelName(removedModel.name);
        setProposal((prev) => ({
          ...prev,
          pricingModelId: missingModelId || undefined,
          pricingModelName: placeholderName || undefined,
          pricingModelIsDefault: false,
        }));
        setPricingModels(models);
        return;
      }
      setPricingModels(models);

      if (targetModel) {
        await applyPricingModelSelection(targetModel.id, targetModel.name, Boolean(targetModel.isDefault));
      } else if (!desiredModelId && defaultModel) {
        await applyPricingModelSelection(defaultModel.id, defaultModel.name, Boolean(defaultModel.isDefault));
      }
    } catch (error) {
      console.warn('Unable to load pricing models for franchise', franchiseId, error);
    }
  };

  const computeHasEquipmentData = (equipment?: Proposal['equipment']) => {
    const hasPositive = (value?: number) => typeof value === 'number' && value > 0;
    const pumpOverhead = (pricingData as any).equipment?.pumpOverheadMultiplier ?? 1;
    if (!equipment) return false;
    const lightCounts = getLightCounts(equipment as any);
    return (
      hasPositive(equipment.totalCost) ||
      lightCounts.total > 0 ||
      equipment.upgradeToVersaFlo ||
      hasPositive(equipment.cleanerQuantity) ||
      hasPositive(equipment.filterQuantity) ||
      hasPositive(equipment.heaterQuantity) ||
      hasPositive(equipment.automationQuantity) ||
      (equipment.auxiliaryPumps && equipment.auxiliaryPumps.length > 0) ||
      !!equipment.auxiliaryPump ||
      hasPositive(getEquipmentItemCost(equipment.pump, pumpOverhead)) ||
      hasPositive(getEquipmentItemCost(equipment.filter as any, 1)) ||
      hasPositive(getEquipmentItemCost(equipment.cleaner as any, 1)) ||
      hasPositive(getEquipmentItemCost(equipment.heater as any, 1)) ||
      hasPositive(getEquipmentItemCost(equipment.automation as any, 1)) ||
      hasPositive(getEquipmentItemCost(equipment.saltSystem as any, 1)) ||
      equipment.hasBlanketReel ||
      equipment.hasSolarBlanket ||
      equipment.hasAutoFill ||
      equipment.hasHandrail ||
      equipment.hasStartupChemicals
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
      const forceHideCost = width < 1150;
      if (forceHideNav && showLeftNav) {
        setShowLeftNav(false);
      } else if (!navManuallyToggled && width > 1200 && !showLeftNav) {
        setShowLeftNav(true);
      }
      if (forceHideCost && showRightCost) {
        setShowRightCost(false);
      } else if (!costManuallyToggled && width > 1280 && !showRightCost) {
        setShowRightCost(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [costManuallyToggled, navManuallyToggled, showLeftNav, showRightCost]);

  const getInitialProposal = (): Partial<Proposal> => {
    const base = getDefaultProposal();
    const franchiseId = getSessionFranchiseId();
    const designerName = getSessionUserName();
    const designerRole = getSessionRole();
    const designerCode = getSessionFranchiseCode();
    const modelMeta = getActivePricingModelMeta();
    return {
      ...base,
      franchiseId,
      designerName,
      designerRole,
      designerCode,
      pricingModelId: modelMeta.pricingModelId || undefined,
      pricingModelName: modelMeta.pricingModelName || undefined,
      pricingModelIsDefault: modelMeta.isDefault,
    };
  };

  const [proposal, setProposal] = useState<Partial<Proposal>>(proposalNumber ? {} : getInitialProposal());
  const previousSpaTypeRef = useRef<string>(proposal.poolSpecs?.spaType ?? 'none');

  useEffect(() => {
    const hasContent =
      (proposal.equipment?.hasBeenEdited ?? false) && computeHasEquipmentData(proposal.equipment as any);
    if (!hasContent && completedByAdvance.equipment) {
      setCompletedByAdvance(prev => ({ ...prev, equipment: false }));
    }
  }, [proposal.equipment, completedByAdvance.equipment]);

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
    const previousSpaType = previousSpaTypeRef.current ?? 'none';
    const spaJustAdded = previousSpaType === 'none' && currentSpaType !== 'none';
    const spaRemoved = previousSpaType !== 'none' && currentSpaType === 'none';
    const hasSpaLightSelection = (proposal.equipment?.spaLights?.length ?? 0) > 0;

    if (spaJustAdded && !hasSpaLightSelection) {
      setProposal(prev => {
        const nextEquipment = normalizeEquipmentLighting(
          {
            ...(prev.equipment || getDefaultEquipment()),
            includeSpaLights: true,
          } as Proposal['equipment'],
          { poolSpecs: { ...(prev.poolSpecs || {}), spaType: currentSpaType } as any, hasSpa: true }
        );
        return { ...prev, equipment: nextEquipment };
      });
      setHasEdits(true);
    } else if (spaRemoved && (proposal.equipment?.spaLights?.length ?? 0) > 0) {
      setProposal(prev => ({
        ...prev,
        equipment: {
          ...(prev.equipment || getDefaultEquipment()),
          includeSpaLights: false,
          spaLights: [],
          hasSpaLight: false,
        },
      }));
      setHasEdits(true);
    }

    previousSpaTypeRef.current = currentSpaType;
  }, [proposal.poolSpecs?.spaType, proposal.equipment?.spaLights?.length]);

  useEffect(() => {
    const requestId = ++loadRequestRef.current;
    if (proposalNumber) {
      setIsLoading(true);
      loadProposal(proposalNumber, requestId);
    } else {
      const freshProposal = getInitialProposal();
      previousSpaTypeRef.current = freshProposal.poolSpecs?.spaType ?? 'none';
      setProposal(freshProposal);
      setVersionList([freshProposal as Proposal]);
      setActiveVersionId((freshProposal as Proposal).activeVersionId || (freshProposal as Proposal).versionId || 'original');
      setEditingVersionId((freshProposal as Proposal).versionId || 'original');
      setSelectedPricingModelId(freshProposal.pricingModelId || null);
      setSelectedPricingModelName(freshProposal.pricingModelName || null);
      setCurrentSection(0);
      setIsLoading(false);
      setCompletedByAdvance(createCompletionMap());
      setHasEdits(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalNumber]);

  useEffect(() => {
    if (proposalNumber && isLoading) return;
    const franchiseId = proposal.franchiseId || getSessionFranchiseId();
    const desiredModelId = proposal.pricingModelId || null;
    void initPricingDataStore(franchiseId, desiredModelId || undefined);
    void loadPricingModels(franchiseId, desiredModelId);
  }, [proposal.franchiseId, proposal.pricingModelId, proposalNumber, isLoading]);

  const loadProposal = async (num: string, requestId: number) => {
    try {
      const data = await getProposalRemote(num);
      if (data) {
        // Deep clone to ensure fresh object references
        const freshData = mergeWithDefaults(JSON.parse(JSON.stringify(data)));

        // Normalize water features to the new catalog-driven shape
        freshData.waterFeatures = normalizeWaterFeatures(freshData.waterFeatures);

        // Ensure franchise + pricing model metadata are present
        freshData.franchiseId = freshData.franchiseId || getSessionFranchiseId();
        freshData.designerName = freshData.designerName || getSessionUserName();
        freshData.designerRole = freshData.designerRole || getSessionRole();
        freshData.designerCode = freshData.designerCode || getSessionFranchiseCode();
        freshData.proposalNumber = freshData.proposalNumber || num;
        freshData.createdDate = freshData.createdDate || new Date().toISOString();
        freshData.lastModified = freshData.lastModified || new Date().toISOString();

        const versioned = applyActiveVersion(freshData as Proposal);
        const allVersions = listAllVersions(freshData as Proposal);
        const allVersionsWithDefaults = allVersions.map((v) => ({
          ...(mergeWithDefaults(v) as Proposal),
          versionId: v.versionId || 'original',
          versionName: v.versionName || (v.isOriginalVersion ? 'Original Version' : 'Version'),
          isOriginalVersion: v.isOriginalVersion,
          activeVersionId: v.activeVersionId,
          versions: [],
        })) as Proposal[];
        const desiredVersionId =
          versionIdFromState || versioned.activeVersionId || versioned.versionId || 'original';
        const targetVersion =
          allVersionsWithDefaults.find((v) => v.versionId === desiredVersionId) ||
          allVersionsWithDefaults.find((v) => v.versionId === versioned.versionId) ||
          allVersionsWithDefaults[0] ||
          (mergeWithDefaults(versioned) as Proposal);
        const sanitizedTarget: Proposal = { ...(targetVersion as Proposal), versions: [] };
        const nextActiveId = versioned.activeVersionId || sanitizedTarget.versionId || 'original';

        if (loadRequestRef.current === requestId) {
          previousSpaTypeRef.current = sanitizedTarget.poolSpecs?.spaType ?? 'none';
          setProposal(sanitizedTarget);
          setVersionList(allVersionsWithDefaults);
          setActiveVersionId(nextActiveId);
          setEditingVersionId(sanitizedTarget.versionId || 'original');
          setSelectedPricingModelId(sanitizedTarget.pricingModelId || null);
          setSelectedPricingModelName(sanitizedTarget.pricingModelName || null);
          setCurrentSection(0);
          setCompletedByAdvance(createCompletionMap());
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
    if (section === 'poolSpecs') {
      setCompletedByAdvance(prev => ({ ...prev, poolSpecs: true }));
    }
  };

  const calculateTotals = (): Proposal => {
    const normalized = mergeWithDefaults(proposal);
    const result = MasterPricingEngine.calculateCompleteProposal(normalized, papDiscounts);
    const versionId = proposal.versionId || editingVersionId || 'original';
    const versionName =
      proposal.versionName ||
      (proposal.isOriginalVersion === false || versionId !== 'original' ? 'Version' : 'Original Version');

    return {
      ...normalized,
      versionId,
      versionName,
      activeVersionId: activeVersionId || versionId,
      isOriginalVersion: proposal.isOriginalVersion ?? versionId === 'original',
      versions: [],
      franchiseId: normalized.franchiseId || getSessionFranchiseId(),
      designerName: normalized.designerName || getSessionUserName(),
      designerRole: normalized.designerRole || getSessionRole(),
      designerCode: normalized.designerCode || getSessionFranchiseCode(),
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
      const currentKey = sections[currentSection]?.key;
      if (currentKey) {
        setCompletedByAdvance(prev => ({ ...prev, [currentKey]: true }));
      }
      setCurrentSection(currentSection + 1);
    }
  };

  const handlePrevious = () => {
    if (currentSection > 0) {
      setCurrentSection(currentSection - 1);
    }
  };

  const handleSave = async (mode: 'draft' | 'submit', options?: { forceLocal?: boolean }): Promise<boolean> => {
    if (isSaving) return false;

    const currentVersionId = proposal.versionId || editingVersionId || 'original';
    const isVersionEdit = !(proposal.isOriginalVersion ?? currentVersionId === 'original');
    const effectiveMode = isVersionEdit ? 'draft' : mode;
    const supabaseConnected = options?.forceLocal ? false : await hasSupabaseConnection();
    if (!supabaseConnected && !options?.forceLocal) {
      setPendingSaveMode(mode);
      setShowOfflineConfirm(true);
      return false;
    }

    setIsSaving(true);
    try {
      if (!proposal.pricingModelId && defaultPricingModelId) {
        const def = pricingModels.find((m) => m.id === defaultPricingModelId);
        await applyPricingModelSelection(defaultPricingModelId, def?.name, def?.isDefault);
      }
      // Validate if submitting
      if (effectiveMode === 'submit') {
        const errors = validateProposal(proposal);
        if (errors.length > 0) {
          showToast({
            type: 'error',
            message: `Validation errors: ${errors.map(e => e.message).join(', ')}`,
          });
          return false;
        }
      }

      const totals = calculateTotals();
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

      const saveOptions = supabaseConnected && !options?.forceLocal ? {} : { forceLocal: true };

      const cleanExistingVersions = versionList.length
        ? versionList.map((v) => ({ ...v, versions: [] }))
        : [{ ...finalProposal }];
      const withoutTarget = cleanExistingVersions.filter(
        (v) => (v.versionId || 'original') !== (finalProposal.versionId || currentVersionId)
      );
      const containerToSave = upsertVersionInContainer(
        {
          ...finalProposal,
          versions: withoutTarget,
          activeVersionId: activeVersionId || finalProposal.versionId || currentVersionId,
        } as Proposal,
        finalProposal as Proposal,
        activeVersionId || finalProposal.versionId || currentVersionId
      );

      const saved = await saveProposalRemote(containerToSave, saveOptions);

      const savedActive = applyActiveVersion(saved as Proposal);
      setProposal({ ...(savedActive as Proposal) });
      setVersionList(listAllVersions(saved as Proposal));
      setActiveVersionId(savedActive.activeVersionId || currentVersionId);
      setEditingVersionId(savedActive.versionId || currentVersionId);
      setHasEdits(false);
      const isPending = (saved as any).syncStatus === 'pending';
      showToast({
        type: isPending ? 'warning' : 'success',
        message:
          effectiveMode === 'submit'
            ? isPending
              ? 'Saved locally. Will submit when cloud connection returns.'
              : 'Proposal submitted successfully!'
            : isPending
            ? 'Saved locally. Will sync to cloud when back online.'
            : 'Proposal saved successfully!',
      });

      if (effectiveMode === 'submit') {
        navigate(`/proposal/view/${saved.proposalNumber}`);
      } else if (isVersionEdit) {
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
      setPendingSaveMode(null);
    }
  };

  const handleHome = () => {
    if (hasEdits) {
      setShowCancelConfirm(true);
      return;
    }
    navigate('/');
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

    try {
      switch (currentSectionKey) {
        case 'poolSpecs':
          return (
            <PoolSpecsSectionNew
              data={proposal.poolSpecs}
              customerInfo={proposal.customerInfo!}
              onChangeCustomerInfo={(info) => updateProposal('customerInfo', info)}
              onChange={(data) => updateProposal('poolSpecs', data)}
              pricingModels={pricingModels}
              selectedPricingModelId={selectedPricingModelId}
              selectedPricingModelName={selectedPricingModelName}
              defaultPricingModelId={defaultPricingModelId}
              onSelectPricingModel={async (id) => {
                const model = pricingModels.find((m) => m.id === id);
                await applyPricingModelSelection(id, model?.name, model?.isDefault, Boolean(model?.removed), true);
              }}
              showStaleIndicator={
                Boolean(selectedPricingModelId) &&
                Boolean(defaultPricingModelId) &&
                selectedPricingModelId !== defaultPricingModelId &&
                !pricingModels.some((m) => m.id === selectedPricingModelId && m.removed)
              }
              showRemovedIndicator={
                Boolean(selectedPricingModelId) && pricingModels.some((m) => m.id === selectedPricingModelId && m.removed)
              }
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
              poolPerimeter={proposal.poolSpecs.perimeter || 0}
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
            />
          );
        case 'interiorFinish':
          return (
            <InteriorFinishSectionNew
              data={proposal.interiorFinish!}
              onChange={(data) => updateProposal('interiorFinish', data)}
              poolSurfaceArea={proposal.poolSpecs.surfaceArea || 0}
              hasSpa={hasSpa}
            />
          );
        case 'customFeatures':
          return (
            <CustomFeaturesSectionNew
              data={proposal.customFeatures!}
              onChange={(data) => updateProposal('customFeatures', data)}
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

  const sectionCompletion = useMemo<Record<SectionKey, boolean>>(() => {
    const hasPositive = (value?: number) => typeof value === 'number' && value > 0;
    const hasAnyPositive = (...values: Array<number | undefined>) => values.some(v => hasPositive(v));

    const poolSpecs = proposal.poolSpecs;
    const hasPoolSpecsData =
      !!poolSpecs &&
      !!proposal.customerInfo?.customerName?.trim() &&
      !!proposal.customerInfo?.city?.trim() &&
      (poolSpecs.poolType !== 'gunite' ||
        hasAnyPositive(
          poolSpecs.perimeter,
          poolSpecs.surfaceArea,
          poolSpecs.shallowDepth,
          poolSpecs.endDepth,
          poolSpecs.maxLength,
          poolSpecs.maxWidth,
          poolSpecs.totalStepsAndBench,
          poolSpecs.deckingArea,
          poolSpecs.travelDistance,
          poolSpecs.poolToStreetDistance,
          poolSpecs.waterfallCount,
        ) ||
        poolSpecs.spaType !== 'none' ||
        hasAnyPositive(poolSpecs.spaLength, poolSpecs.spaWidth, poolSpecs.spaPerimeter) ||
        poolSpecs.hasTanningShelf ||
        poolSpecs.hasAutomaticCover ||
        !!poolSpecs.fiberglassModelName ||
        poolSpecs.isRaisedSpa ||
        poolSpecs.hasSpillover);

    const excavation = proposal.excavation;
    const hasExcavationData =
      !!excavation &&
      ((excavation.rbbLevels?.length ?? 0) > 0 ||
        hasPositive(excavation.totalRBBSqft) ||
        hasAnyPositive(
          excavation.columns?.count,
          excavation.columns?.width,
          excavation.columns?.depth,
          excavation.columns?.height,
        ) ||
        (excavation.columns?.facing && excavation.columns.facing !== 'none') ||
        hasPositive(excavation.additionalSitePrepHours) ||
        excavation.hasGravelInstall === false ||
        excavation.hasDirtHaul === false ||
        hasPositive(excavation.additionalBench) ||
        hasPositive(excavation.doubleCurtainLength) ||
        excavation.needsSoilSampleEngineer ||
        (excavation.retainingWallType &&
          excavation.retainingWallType !== 'None' &&
          excavation.retainingWallType !== 'none') ||
        hasPositive(excavation.retainingWallLength) ||
        hasPositive(excavation.cost));

    const plumbingRuns = proposal.plumbing?.runs;
    const hasPlumbingData =
      !!proposal.plumbing &&
      (hasAnyPositive(
        plumbingRuns?.skimmerRun,
        plumbingRuns?.additionalSkimmers,
        plumbingRuns?.mainDrainRun,
        plumbingRuns?.cleanerRun,
        plumbingRuns?.autoFillRun,
        plumbingRuns?.infloorValveToEQ,
        plumbingRuns?.infloorValveToPool,
        plumbingRuns?.spaRun,
      ) ||
        hasPositive(proposal.plumbing.cost));

    const electricalRuns = proposal.electrical?.runs;
    const hasElectricalData =
      !!proposal.electrical &&
      (hasAnyPositive(
        electricalRuns?.electricalRun,
        electricalRuns?.lightRun,
        electricalRuns?.heatPumpElectricalRun,
        plumbingRuns?.gasRun,
      ) ||
        hasPositive(proposal.electrical.cost));

    const tile = proposal.tileCopingDecking;
    const hasTileData =
      !!tile &&
      (tile.tileLevel !== 1 ||
        tile.copingType !== 'travertine-level1' ||
        tile.deckingType !== 'travertine-level1' ||
        tile.hasTrimTileOnSteps ||
        tile.hasRoughGrading === false ||
        hasAnyPositive(
          tile.additionalTileLength,
          tile.copingLength,
          tile.deckingArea,
          tile.concreteStepsLength,
          tile.bullnoseLnft,
          tile.doubleBullnoseLnft,
          tile.spillwayLnft,
          tile.rockworkPanelLedgeSqft,
          tile.rockworkPanelLedgeMaterialSqft,
          tile.rockworkStackedStoneSqft,
          tile.rockworkTileSqft,
        ) ||
        hasPositive(tile.cost));

    const drainage = proposal.drainage;
    const hasDrainageData =
      !!drainage &&
      (hasAnyPositive(
        drainage.downspoutTotalLF,
        drainage.deckDrainTotalLF,
        drainage.frenchDrainTotalLF,
        drainage.boxDrainTotalLF,
      ) ||
        hasPositive(drainage.cost));

    const hasEquipmentData =
      !!proposal.equipment?.hasBeenEdited && computeHasEquipmentData(proposal.equipment as any);

    const waterFeatures = proposal.waterFeatures;
    const hasWaterFeaturesData =
      !!waterFeatures &&
      (((waterFeatures.selections || []).filter(selection => (selection?.quantity ?? 0) > 0).length > 0) ||
        hasAnyPositive(
          plumbingRuns?.waterFeature1Run,
          plumbingRuns?.waterFeature2Run,
          plumbingRuns?.waterFeature3Run,
          plumbingRuns?.waterFeature4Run,
        ) ||
        hasPositive(waterFeatures.totalCost));

    const interiorFinish = proposal.interiorFinish;
    const defaultFinishId = pricingData.interiorFinish.finishes?.[0]?.id || 'pebble-tec-l1';
    const hasInteriorData =
      !!interiorFinish &&
      (interiorFinish.finishType !== defaultFinishId ||
        !!interiorFinish.color?.trim() ||
        interiorFinish.hasSpa ||
        hasPositive(interiorFinish.cost));

    const customFeatures = proposal.customFeatures;
    const hasCustomFeatures =
      !!customFeatures &&
      (((customFeatures.features || []).filter(feature => feature?.name?.trim() || feature?.description?.trim()).length >
        0) ||
        hasPositive(customFeatures.totalCost));

    return {
      customerInfo: true,
      poolSpecs: hasPoolSpecsData || completedByAdvance.poolSpecs,
      excavation: hasExcavationData || completedByAdvance.excavation,
      plumbing: hasPlumbingData || completedByAdvance.plumbing,
      electrical: hasElectricalData || completedByAdvance.electrical,
      tileCopingDecking: hasTileData || completedByAdvance.tileCopingDecking,
      drainage: hasDrainageData || completedByAdvance.drainage,
      equipment: hasEquipmentData || completedByAdvance.equipment,
      waterFeatures: hasWaterFeaturesData || completedByAdvance.waterFeatures,
      interiorFinish: hasInteriorData || completedByAdvance.interiorFinish,
      customFeatures: hasCustomFeatures || completedByAdvance.customFeatures,
    };
  }, [proposal, completedByAdvance]);

  const progressSections = sections.filter(section => section.includeInProgress !== false);
  if (isLoading) {
    return (
      <div className="proposal-form">
        <div className="form-container loading-state">
          <p>Loading proposal...</p>
        </div>
      </div>
    );
  }

  const currentCostBreakdown = MasterPricingEngine.calculateCompleteProposal(mergeWithDefaults(proposal), papDiscounts);
  const canSubmit = Boolean(proposal.customerInfo?.customerName?.trim());
  const submitTooltip = !canSubmit ? 'Must include Customer Name' : undefined;
  const isCompactLayout = viewportWidth < 1300;
  const isMobileLayout = viewportWidth < 1024;
  const customerTitle = (proposal.customerInfo?.customerName || '').trim();
  const headerTitle = customerTitle ? `Proposal Builder - ${customerTitle}` : 'Proposal Builder';
  const editingVersionKey = proposal.versionId || editingVersionId || 'original';
  const isVersionEdit = !(proposal.isOriginalVersion ?? editingVersionKey === 'original');

  const handleSubmitClick = () => {
    if (!canSubmit || isSaving) return;
    if (isVersionEdit) {
      void handleSave('draft');
      return;
    }
    setShowSubmitConfirm(true);
  };

  return (
    <div className="proposal-form">
      <header className="form-header">
        <div className="form-header-title">
          <img src={submergeLogo} alt="Submerge Logo" className="form-logo" />
          <h1>{headerTitle}</h1>
        </div>
      </header>

      <div
        className={`form-layout ${isCompactLayout ? 'is-compact' : ''} ${isMobileLayout ? 'is-mobile' : ''} ${!showRightCost ? 'no-cost' : ''} ${!showLeftNav ? 'no-nav' : ''}`}
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
                <button
                  className="cost-modal-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCostModal(true);
                  }}
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
                const isCompleted = sectionCompletion[section.key];
                return (
                  <button
                    key={section.key}
                    className={`nav-item ${section.key === 'poolSpecs' ? 'pool-specs-item' : ''} ${section.key === 'excavation' ? 'excavation-item' : ''} ${section.key === 'plumbing' ? 'plumbing-item' : ''} ${section.key === 'electrical' ? 'electrical-item' : ''} ${section.key === 'tileCopingDecking' ? 'tile-item' : ''} ${section.key === 'drainage' ? 'drainage-item' : ''} ${section.key === 'waterFeatures' ? 'water-item' : ''} ${section.key === 'interiorFinish' ? 'interior-item' : ''} ${section.key === 'equipment' ? 'equipment-item' : ''} ${section.key === 'customFeatures' ? 'custom-item' : ''} ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
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

        <div className={`form-container ${!showLeftNav ? 'no-left-nav' : ''} ${!showRightCost ? 'no-right-cost' : ''}`}>
          <div className="section-content" ref={sectionContentRef}>
            <div className="section-title-row">
              <h2 className="section-title">{sections[currentSection]?.label}</h2>
              <div className="section-title-actions" title={submitTooltip}>
                <button
                  className="btn btn-success"
                  onClick={handleSubmitClick}
                  disabled={!canSubmit || isSaving}
                  title={submitTooltip}
                >
                  {isVersionEdit ? 'Save Version' : 'Submit Proposal'}
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
              {!isVersionEdit && (
                <button
                  className="btn btn-secondary"
                  onClick={() => { void handleSave('draft'); }}
                  disabled={isSaving}
                >
                  Save Draft
                </button>
              )}
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

        {showRightCost && (
          <aside className="cost-sidebar">
            <LiveCostBreakdown
              costBreakdown={currentCostBreakdown.costBreakdown}
              totalCOGS={currentCostBreakdown.pricing.totalCOGS}
              onToggle={() => {
                setCostManuallyToggled(true);
                setShowRightCost(false);
              }}
            />
          </aside>
        )}

        {!showRightCost && (
          <button
            className="sidebar-show-button right-show"
            onClick={() => {
              setCostManuallyToggled(true);
              setShowRightCost(true);
            }}
            title="Show cost breakdown"
            data-tooltip="Click to reveal Cost Breakdown"
          >
            &lt;
          </button>
        )}
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
            />
          </div>
        </div>
      )}

      {showCostBreakdownPage && (
        <CostBreakdownPage
          proposal={{ ...proposal, papDiscounts, manualAdjustments: proposal.manualAdjustments }}
          onClose={() => setShowCostBreakdownPage(false)}
          onAdjustmentsChange={(adjustments) => {
            manualAdjustmentsSourceRef.current = 'proposal';
            setManualAdjustments(adjustments);
            updateProposal('manualAdjustments', adjustments);
          }}
        />
      )}

      <ConfirmDialog
        open={showOfflineConfirm}
        title="Offline Save"
        message="Warning: You are not connected to the cloud. Save locally instead? (Proposal will be uploaded when connection is restored)"
        confirmLabel="Save locally"
        cancelLabel="Go Back"
        onConfirm={async () => {
          setShowOfflineConfirm(false);
          if (pendingSaveMode) {
            await handleSave(pendingSaveMode, { forceLocal: true });
          }
          setPendingSaveMode(null);
        }}
        onCancel={() => {
          setShowOfflineConfirm(false);
          setPendingSaveMode(null);
        }}
      />

      <ConfirmDialog
        open={showSubmitConfirm}
        title="Ready to Submit?"
        message="You can still make changes later."
        confirmLabel="Submit"
        cancelLabel="Keep Editing"
        onConfirm={async () => {
          setShowSubmitConfirm(false);
          await handleSave('submit');
        }}
        onCancel={() => setShowSubmitConfirm(false)}
      />

      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel changes?"
        message="Unsaved changes will be lost."
        confirmLabel="Save to Drafts"
        cancelLabel="Discard"
        onConfirm={async () => {
          setShowCancelConfirm(false);
          await handleSave('draft');
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
