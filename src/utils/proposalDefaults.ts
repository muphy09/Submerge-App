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
  const defaultPump =
    pricingData.equipment.pumps.find(p => p.price === 0) || pricingData.equipment.pumps[0];
  const defaultFilter =
    pricingData.equipment.filters.find(f => f.price === 0) || pricingData.equipment.filters[0];
  const defaultCleaner =
    pricingData.equipment.cleaners.find(c => c.price === 0) || pricingData.equipment.cleaners[0];
  const defaultHeater =
    pricingData.equipment.heaters.find(h => h.price === 0) || pricingData.equipment.heaters[0];
  const defaultAutomation =
    pricingData.equipment.automation.find(a => a.price === 0) || pricingData.equipment.automation[0];

  return {
    pump: {
      name: defaultPump.name,
      model: defaultPump.model,
      price: defaultPump.price,
    },
    auxiliaryPumps: [],
    filter: {
      name: defaultFilter.name,
      sqft: defaultFilter.sqft,
      price: defaultFilter.price,
    },
    filterQuantity: 0,
    cleaner: {
      name: defaultCleaner.name,
      price: defaultCleaner.price,
    },
    cleanerQuantity: 0,
    heater: {
      name: defaultHeater.name,
      btu: defaultHeater.btu,
      price: defaultHeater.price,
      isVersaFlo: defaultHeater.isVersaFlo,
    },
    heaterQuantity: 1,
    upgradeToVersaFlo: false,
    numberOfLights: 0,
    hasSpaLight: false,
    automation: {
      name: defaultAutomation.name,
      price: defaultAutomation.price,
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
  return {
    finishType: 'pebble-tec-l1',
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
