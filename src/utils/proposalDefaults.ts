// ============================================================================
// PROPOSAL DEFAULTS - Initial values for new proposals
// ============================================================================

import {
  Proposal,
  PoolSpecs,
  Excavation,
  Plumbing,
  Electrical,
  TileCopingDecking,
  Drainage,
  Equipment,
  WaterFeatures,
  CustomFeatures,
  Masonry,
  InteriorFinish,
  CostBreakdown,
  PAPDiscounts,
  ManualAdjustments,
} from '../types/proposal-new';
import pricingData from '../services/pricingData';
import { getEquipmentItemCost } from './equipmentCost';

export function getDefaultPoolSpecs(): PoolSpecs {
  return {
    poolType: 'gunite',
    perimeter: 0,
    surfaceArea: 0,
    shallowDepth: 0,
    endDepth: 0,
    fiberglassSize: undefined,
    fiberglassModelName: undefined,
    fiberglassModelPrice: undefined,
    fiberglassPerimeter: undefined,
    fiberglassCraneOption: 'no-crane',
    maxWidth: 0,
    maxLength: 0,
    totalStepsAndBench: 0,
    hasTanningShelf: false,
    spaType: 'none',
    spaLength: 0,
    spaWidth: 0,
    spaShape: 'round',
    spaPerimeter: 0,
    spaFiberglassModelName: undefined,
    spaFiberglassModelPrice: undefined,
    isRaisedSpa: false,
    raisedSpaFacing: 'none',
    hasSpillover: false,
    deckingArea: 0,
    travelDistance: 0,
    poolToStreetDistance: 0,
    hasSiltFence: true,
    hasAutomaticCover: false,
    waterfallCount: 0,
    approximateGallons: 0,
  };
}

export function getDefaultExcavation(): Excavation {
  return {
    rbbLevels: [],
    totalRBBSqft: 0,
    columns: {
      count: 0,
      width: 0,
      depth: 0,
      height: 0,
      facing: 'none',
    },
    additionalSitePrepHours: 0,
    hasGravelInstall: true,
    hasDirtHaul: true,
    additionalBench: 0,
    doubleCurtainLength: 0,
    needsSoilSampleEngineer: false,
    retainingWallType: 'None',
    retainingWallLength: 0,
    cost: 0,
  };
}

export function getDefaultPlumbing(): Plumbing {
  return {
    runs: {
      skimmerRun: 0,
      additionalSkimmers: 0,
      mainDrainRun: 0,
      cleanerRun: 0,
      autoFillRun: 0,
      waterFeature1Run: 0,
      waterFeature2Run: 0,
      waterFeature3Run: 0,
      waterFeature4Run: 0,
      infloorValveToEQ: 0,
      infloorValveToPool: 0,
      gasRun: 0,
      spaRun: 0,
    },
    cost: 0,
  };
}

export function getDefaultElectrical(): Electrical {
  return {
    runs: {
      electricalRun: 0,
      lightRun: 0,
      heatPumpElectricalRun: 0,
    },
    cost: 0,
  };
}

export function getDefaultTileCopingDecking(): TileCopingDecking {
  return {
    tileLevel: 1,
    additionalTileLength: 0,
    hasTrimTileOnSteps: false,
    copingType: 'travertine-level1',
    copingLength: 0,
    deckingType: 'travertine-level1',
    deckingArea: 0,
    concreteStepsLength: 0,
    bullnoseLnft: 0,
    doubleBullnoseLnft: 0,
    spillwayLnft: 0,
    rockworkPanelLedgeSqft: 0,
    rockworkPanelLedgeMaterialSqft: 0,
    rockworkStackedStoneSqft: 0,
    rockworkTileSqft: 0,
    hasRoughGrading: true,
    cost: 0,
  };
}

export function getDefaultDrainage(): Drainage {
  return {
    downspoutTotalLF: 0,
    deckDrainTotalLF: 0,
    frenchDrainTotalLF: 0,
    boxDrainTotalLF: 0,
    cost: 0,
  };
}

export function getDefaultEquipment(): Equipment {
  const pumpOverhead = (pricingData as any).equipment?.pumpOverheadMultiplier ?? 1;
  const pickDefault = <T extends { name: string }>(list: T[], multiplier: number = 1) =>
    list.find(item => getEquipmentItemCost(item as any, multiplier) === 0) || list[0];

  const defaultPump = pickDefault(pricingData.equipment.pumps, pumpOverhead);
  const defaultFilter = pickDefault(pricingData.equipment.filters, 1);
  const defaultCleaner = pickDefault(pricingData.equipment.cleaners, 1);
  const defaultHeater = pickDefault(pricingData.equipment.heaters, 1);
  const defaultAutomation = pickDefault(pricingData.equipment.automation, 1);
  const otherOverhead = 1;

  return {
    pump: {
      name: defaultPump.name,
      model: (defaultPump as any).model,
      basePrice: (defaultPump as any).basePrice,
      addCost1: (defaultPump as any).addCost1,
      addCost2: (defaultPump as any).addCost2,
      price: getEquipmentItemCost(defaultPump as any, pumpOverhead),
    },
    auxiliaryPumps: [],
    filter: {
      name: defaultFilter.name,
      sqft: (defaultFilter as any).sqft,
      basePrice: (defaultFilter as any).basePrice,
      addCost1: (defaultFilter as any).addCost1,
      addCost2: (defaultFilter as any).addCost2,
      price: getEquipmentItemCost(defaultFilter as any, otherOverhead),
    },
    filterQuantity: 0,
    cleaner: {
      name: defaultCleaner.name,
      basePrice: (defaultCleaner as any).basePrice,
      addCost1: (defaultCleaner as any).addCost1,
      addCost2: (defaultCleaner as any).addCost2,
      price: getEquipmentItemCost(defaultCleaner as any, otherOverhead),
    },
    cleanerQuantity: 0,
    heater: {
      name: defaultHeater.name,
      btu: (defaultHeater as any).btu,
      basePrice: (defaultHeater as any).basePrice,
      addCost1: (defaultHeater as any).addCost1,
      addCost2: (defaultHeater as any).addCost2,
      price: getEquipmentItemCost(defaultHeater as any, otherOverhead),
      isVersaFlo: defaultHeater.isVersaFlo,
    },
    heaterQuantity: 1,
    upgradeToVersaFlo: false,
    includePoolLights: true,
    includeSpaLights: false,
    poolLights: [],
    spaLights: [],
    numberOfLights: 0,
    hasSpaLight: false,
    automation: {
      name: defaultAutomation.name,
      basePrice: (defaultAutomation as any).basePrice,
      addCost1: (defaultAutomation as any).addCost1,
      addCost2: (defaultAutomation as any).addCost2,
      price: getEquipmentItemCost(defaultAutomation as any, otherOverhead),
      zones: 0,
      hasChemistry: defaultAutomation.hasChemistry,
    },
    automationQuantity: 0,
    saltSystem: undefined,
    hasBlanketReel: false,
    hasSolarBlanket: false,
    hasAutoFill: false,
    hasHandrail: false,
    hasStartupChemicals: false,
    totalCost: 0,
    hasBeenEdited: false,
  };
}

export function getDefaultWaterFeatures(): WaterFeatures {
  return {
    selections: [],
    totalCost: 0,
  };
}

export function getDefaultCustomFeatures(): CustomFeatures {
  return {
    features: [],
    totalCost: 0,
  };
}

export function getDefaultMasonry(): Masonry {
  return {
    columnCost: 0,
    rbbFacingCost: 0,
    raisedSpaFacingCost: 0,
    totalCost: 0,
  };
}

export function getDefaultInteriorFinish(): InteriorFinish {
  const defaultFinishId = pricingData.interiorFinish.finishes?.[0]?.id || 'pebble-tec-l1';
  return {
    finishType: defaultFinishId,
    color: '',
    surfaceArea: 0,
    hasSpa: false,
    hasWaterproofing: true,
    cost: 0,
  };
}

export function getDefaultCostBreakdown(): CostBreakdown {
  return {
    plansAndEngineering: [],
    layout: [],
    permit: [],
    excavation: [],
    plumbing: [],
    gas: [],
    steel: [],
    electrical: [],
    shotcreteLabor: [],
    shotcreteMaterial: [],
    tileLabor: [],
    tileMaterial: [],
    copingDeckingLabor: [],
    copingDeckingMaterial: [],
    stoneRockworkLabor: [],
    stoneRockworkMaterial: [],
    drainage: [],
    equipmentOrdered: [],
    equipmentSet: [],
    waterFeatures: [],
    cleanup: [],
    interiorFinish: [],
    waterTruck: [],
    fiberglassShell: [],
    fiberglassInstall: [],
    startupOrientation: [],
    customFeatures: [],
    totals: {
      plansAndEngineering: 0,
      layout: 0,
      permit: 0,
      excavation: 0,
      plumbing: 0,
      gas: 0,
      steel: 0,
      electrical: 0,
      shotcreteLabor: 0,
      shotcreteMaterial: 0,
      tileLabor: 0,
      tileMaterial: 0,
      copingDeckingLabor: 0,
      copingDeckingMaterial: 0,
      stoneRockworkLabor: 0,
      stoneRockworkMaterial: 0,
      drainage: 0,
      equipmentOrdered: 0,
      equipmentSet: 0,
      waterFeatures: 0,
      cleanup: 0,
      interiorFinish: 0,
      waterTruck: 0,
      fiberglassShell: 0,
      fiberglassInstall: 0,
      startupOrientation: 0,
      customFeatures: 0,
      grandTotal: 0,
    },
  };
}

export function getDefaultPAPDiscounts(): PAPDiscounts {
  return {
    excavation: 0,
    plumbing: 0,
    steel: 0,
    electrical: 0,
    shotcrete: 0,
    tileCopingLabor: 0,
    tileCopingMaterial: 0,
    equipment: 0,
    interiorFinish: 0,
    startup: 0,
  };
}

export function getDefaultManualAdjustments(): ManualAdjustments {
  const defaults = (pricingData as any).manualAdjustments || {};
  return {
    positive1: defaults.positive1 ?? 0,
    positive2: defaults.positive2 ?? 0,
    negative1: defaults.negative1 ?? 0,
    negative2: defaults.negative2 ?? 0,
  };
}

export function getDefaultProposal(): Partial<Proposal> {
  return {
    proposalNumber: `PROP-${Date.now()}`,
    createdDate: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    status: 'draft',
    customerInfo: {
      customerName: '',
      city: '',
    },
    poolSpecs: getDefaultPoolSpecs(),
    excavation: getDefaultExcavation(),
    plumbing: getDefaultPlumbing(),
    electrical: getDefaultElectrical(),
    tileCopingDecking: getDefaultTileCopingDecking(),
    drainage: getDefaultDrainage(),
    equipment: getDefaultEquipment(),
    waterFeatures: getDefaultWaterFeatures(),
    customFeatures: getDefaultCustomFeatures(),
    masonry: getDefaultMasonry(),
    interiorFinish: getDefaultInteriorFinish(),
    manualAdjustments: getDefaultManualAdjustments(),
    papDiscounts: { ...(pricingData.papDiscountRates || getDefaultPAPDiscounts()) },
    costBreakdown: getDefaultCostBreakdown(),
    subtotal: 0,
    taxRate: 0,
    taxAmount: 0,
    totalCost: 0,
  };
}
