// ============================================================================
// PRICING ENGINE - Excel Formula Logic Implementation
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
  InteriorFinish,
  CostBreakdown,
  CostLineItem,
} from '../types/proposal-new';
import pricingData from './pricingData';

// ============================================================================
// POOL CALCULATIONS
// ============================================================================

export class PoolCalculations {
  /**
   * Calculate approximate gallons
   * Formula: CEILING.MATH(((SurfaceArea * ((ShallowDepth + EndDepth) / 2)) * 7.6), 10) - (TanningShelf * 850)
   */
  static calculateGallons(poolSpecs: PoolSpecs): number {
    const avgDepth = (poolSpecs.shallowDepth + poolSpecs.endDepth) / 2;
    const baseGallons = poolSpecs.surfaceArea * avgDepth * 7.6;
    const tanningShelfDeduction = poolSpecs.hasTanningShelf ? 850 : 0;
    const gallons = Math.ceil(baseGallons / 10) * 10 - tanningShelfDeduction;
    return Math.max(0, gallons);
  }

  /**
   * Calculate spa perimeter
   * Formula: ROUNDUP(IF(Shape=Round, (Length * 3.14), (Length * 2 + Width * 2)), 0)
   */
  static calculateSpaPerimeter(poolSpecs: PoolSpecs): number {
    if (poolSpecs.spaType === 'none') return 0;

    if (poolSpecs.spaShape === 'round') {
      return Math.ceil(poolSpecs.spaLength * 3.14);
    } else {
      return Math.ceil(poolSpecs.spaLength * 2 + poolSpecs.spaWidth * 2);
    }
  }

  /**
   * Calculate additional bench cost
   * If total steps & bench > 20, charge for extra
   */
  static calculateAdditionalBench(poolSpecs: PoolSpecs): number {
    if (poolSpecs.totalStepsAndBench > 20) {
      return poolSpecs.totalStepsAndBench - 20;
    }
    return 0;
  }

  /**
   * Check if fiberglass pool
   */
  static isFiberglassPool(poolSpecs: PoolSpecs): boolean {
    return poolSpecs.poolType === 'fiberglass';
  }

  /**
   * Check if spa exists
   */
  static hasSpa(poolSpecs: PoolSpecs): boolean {
    return poolSpecs.spaType !== 'none';
  }
}

// ============================================================================
// EXCAVATION CALCULATIONS
// ============================================================================

export class ExcavationCalculations {
  /**
   * Calculate total RBB square footage
   */
  static calculateTotalRBBSqft(excavation: Excavation): number {
    return excavation.rbbLevels.reduce((total, level) => {
      const heightInFeet = level.height / 12;
      return total + level.length * heightInFeet;
    }, 0);
  }

  /**
   * Calculate excavation costs
   */
  static calculateExcavationCost(
    poolSpecs: PoolSpecs,
    excavation: Excavation
  ): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.excavation;
    const isFiberglass = PoolCalculations.isFiberglassPool(poolSpecs);
    const hasSpa = PoolCalculations.hasSpa(poolSpecs);

    // Base excavation (for gunite pools)
    if (!isFiberglass) {
      items.push({
        category: 'Excavation',
        description: 'Base Excavation',
        unitPrice: prices.basePricePerSqft,
        quantity: poolSpecs.surfaceArea,
        total: prices.basePricePerSqft, // This is actually a flat rate in the Excel
      });

      // Over 1,000 SQFT
      if (poolSpecs.surfaceArea > 1000) {
        items.push({
          category: 'Excavation',
          description: 'Over 1,000 SQFT',
          unitPrice: prices.over1000Sqft,
          quantity: 1,
          total: prices.over1000Sqft,
        });
      }
    }

    // RBB levels
    excavation.rbbLevels.forEach((level) => {
      if (level.length > 0) {
        const priceKey = `rbb${level.height}` as keyof typeof prices;
        const unitPrice = prices[priceKey] as number;
        items.push({
          category: 'Excavation',
          description: `${level.height}" RBB`,
          unitPrice,
          quantity: level.length,
          total: unitPrice * level.length,
        });
      }
    });

    // Spa excavation
    if (hasSpa && !isFiberglass) {
      items.push({
        category: 'Excavation',
        description: poolSpecs.isRaisedSpa ? 'Raised Spa' : 'Base Spa',
        unitPrice: poolSpecs.isRaisedSpa ? prices.raisedSpa : prices.baseSpa,
        quantity: 1,
        total: poolSpecs.isRaisedSpa ? prices.raisedSpa : prices.baseSpa,
      });
    }

    // Site prep
    if (excavation.additionalSitePrepHours > 0) {
      items.push({
        category: 'Excavation',
        description: 'Site Prep',
        unitPrice: prices.sitePrep,
        quantity: excavation.additionalSitePrepHours,
        total: prices.sitePrep * excavation.additionalSitePrepHours,
      });
    }

    // Backfill (always included for gunite)
    if (!isFiberglass) {
      items.push({
        category: 'Excavation',
        description: 'Backfill',
        unitPrice: prices.backfill,
        quantity: 1,
        total: prices.backfill,
      });
    }

    // Gravel install
    if (excavation.hasGravelInstall) {
      // Calculate tons needed (from Excel: uses surface area calculation)
      const tons = Math.ceil((poolSpecs.surfaceArea * 0.75) / 12); // Approximation
      const cost = tons * 512; // From Excel calculation
      items.push({
        category: 'Excavation',
        description: 'Gravel',
        unitPrice: prices.gravelPerTon,
        quantity: tons,
        total: cost,
      });
    }

    // Dirt haul
    if (excavation.hasDirtHaul) {
      // Calculate loads (from Excel: based on excavation volume)
      const cubicYards = (poolSpecs.surfaceArea * ((poolSpecs.shallowDepth + poolSpecs.endDepth) / 2)) / 27;
      const loads = Math.ceil(cubicYards / 10); // ~10 cubic yards per load
      items.push({
        category: 'Excavation',
        description: 'Dirt Haul',
        unitPrice: prices.dirtHaulPerLoad,
        quantity: loads,
        total: Math.ceil(prices.dirtHaulPerLoad * loads),
      });
    }

    // Automatic cover box
    if (poolSpecs.hasAutomaticCover) {
      items.push({
        category: 'Excavation',
        description: 'Cover Box',
        unitPrice: prices.coverBox,
        quantity: 1,
        total: prices.coverBox,
      });
    }

    // Travel
    if (poolSpecs.travelDistance > 0) {
      items.push({
        category: 'Excavation',
        description: 'Travel',
        unitPrice: prices.travelPerMile,
        quantity: poolSpecs.travelDistance,
        total: prices.travelPerMile * poolSpecs.travelDistance,
      });
    }

    // Misc (always included for gunite)
    if (!isFiberglass) {
      items.push({
        category: 'Excavation',
        description: 'Misc',
        unitPrice: prices.misc,
        quantity: 1,
        total: prices.misc,
      });
    }

    // PAP Package discount (10% off excavation for fiberglass)
    if (isFiberglass) {
      const subtotal = items.reduce((sum, item) => sum + item.total, 0);
      const discount = subtotal * 0.1;
      items.push({
        category: 'Excavation',
        description: 'PAP Discount',
        unitPrice: -discount,
        quantity: 1,
        total: -discount,
      });
    }

    return items;
  }
}

// ============================================================================
// PLUMBING CALCULATIONS
// ============================================================================

export class PlumbingCalculations {
  static calculatePlumbingCost(
    poolSpecs: PoolSpecs,
    plumbing: Plumbing
  ): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.plumbing;
    const hasSpa = PoolCalculations.hasSpa(poolSpecs);

    // Short stub (base plumbing)
    items.push({
      category: 'Plumbing',
      description: 'Short Stub',
      unitPrice: prices.shortStub,
      quantity: 1,
      total: prices.shortStub,
    });

    // Spa base plumbing
    if (hasSpa) {
      items.push({
        category: 'Plumbing',
        description: 'Spa Base',
        unitPrice: prices.spaBase,
        quantity: 1,
        total: prices.spaBase,
      });
    }

    // Pool overrun (if skimmer run > 33 ft)
    if (plumbing.runs.skimmerRun > prices.poolOverrunThreshold) {
      const overrun = plumbing.runs.skimmerRun - prices.poolOverrunThreshold;
      items.push({
        category: 'Plumbing',
        description: 'Pool Overrun',
        unitPrice: prices.poolOverrunPerFt,
        quantity: overrun,
        total: prices.poolOverrunPerFt * overrun,
      });
    }

    // Gas overrun (if gas run > 30 ft)
    if (plumbing.runs.gasRun > prices.gasOverrunThreshold) {
      const overrun = plumbing.runs.gasRun - prices.gasOverrunThreshold;
      items.push({
        category: 'Plumbing',
        description: 'Gas Overrun',
        unitPrice: prices.gasOverrunPerFt,
        quantity: overrun,
        total: prices.gasOverrunPerFt * overrun,
      });
    }

    // Water features (calculate based on runs)
    const waterFeatureRuns = [
      plumbing.runs.waterFeature1Run,
      plumbing.runs.waterFeature2Run,
      plumbing.runs.waterFeature3Run,
      plumbing.runs.waterFeature4Run,
    ];

    waterFeatureRuns.forEach((run, index) => {
      if (run > 0) {
        const priceKey = `waterFeature${index + 1}` as keyof typeof prices;
        const unitPrice = prices[priceKey] as number;
        items.push({
          category: 'Plumbing',
          description: `Water Feature ${index + 1}`,
          unitPrice,
          quantity: run,
          total: unitPrice * run,
        });
      }
    });

    // Cleaner run
    if (plumbing.runs.cleanerRun > 0) {
      items.push({
        category: 'Plumbing',
        description: 'Cleaner Line',
        unitPrice: 3.25, // From Excel
        quantity: plumbing.runs.cleanerRun,
        total: 3.25 * plumbing.runs.cleanerRun,
      });
    }

    // Auto-fill
    if (plumbing.runs.autoFillRun > 0) {
      items.push({
        category: 'Plumbing',
        description: 'Auto-Fill',
        unitPrice: 3.5, // From Excel
        quantity: plumbing.runs.autoFillRun,
        total: 3.5 * plumbing.runs.autoFillRun,
      });
    }

    // Additional skimmers
    if (plumbing.runs.additionalSkimmers > 0) {
      items.push({
        category: 'Plumbing',
        description: 'Additional Skimmers',
        unitPrice: 275, // From Excel
        quantity: plumbing.runs.additionalSkimmers,
        total: 275 * plumbing.runs.additionalSkimmers,
      });
    }

    // Spa plumbing (additional runs)
    if (hasSpa && plumbing.runs.spaRun > 0) {
      items.push({
        category: 'Plumbing',
        description: 'Spa Plumbing',
        unitPrice: prices.spaPlumbing,
        quantity: plumbing.runs.spaRun,
        total: prices.spaPlumbing * plumbing.runs.spaRun,
      });
    }

    return items;
  }
}

// ============================================================================
// ELECTRICAL CALCULATIONS
// ============================================================================

export class ElectricalCalculations {
  static calculateElectricalCost(
    poolSpecs: PoolSpecs,
    electrical: Electrical
  ): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.electrical;
    const hasSpa = PoolCalculations.hasSpa(poolSpecs);

    // Base electrical
    items.push({
      category: 'Electrical',
      description: 'Base Electrical',
      unitPrice: prices.baseElectrical,
      quantity: 1,
      total: prices.baseElectrical,
    });

    // Electrical run overrun (if > 100 ft)
    if (electrical.runs.electricalRun > prices.overrunThreshold) {
      const overrun = electrical.runs.electricalRun - prices.overrunThreshold;
      items.push({
        category: 'Electrical',
        description: 'Electrical Overrun',
        unitPrice: prices.overrunPerFt,
        quantity: overrun,
        total: prices.overrunPerFt * overrun,
      });
    }

    // Spa electrical
    if (hasSpa) {
      items.push({
        category: 'Electrical',
        description: 'Spa Electrical',
        unitPrice: prices.spaElectrical,
        quantity: 1,
        total: prices.spaElectrical,
      });
    }

    // Light run
    if (electrical.runs.lightRun > 0) {
      items.push({
        category: 'Electrical',
        description: 'Light Run Base',
        unitPrice: prices.lightRunBase,
        quantity: 1,
        total: prices.lightRunBase,
      });

      // Light run overrun (if > 150 ft)
      if (electrical.runs.lightRun > prices.lightRunThreshold) {
        const overrun = electrical.runs.lightRun - prices.lightRunThreshold;
        items.push({
          category: 'Electrical',
          description: 'Light Run Overrun',
          unitPrice: prices.lightRunOverrunPerFt,
          quantity: overrun,
          total: prices.lightRunOverrunPerFt * overrun,
        });
      }
    }

    // Heat pump electrical
    if (electrical.runs.heatPumpElectricalRun > 0) {
      const runs = Math.ceil(electrical.runs.heatPumpElectricalRun / 10);
      items.push({
        category: 'Electrical',
        description: 'Heat Pump Electrical',
        unitPrice: prices.heatPumpElectrical,
        quantity: runs,
        total: prices.heatPumpElectrical * runs,
      });
    }

    return items;
  }

  static calculateGasCost(plumbing: Plumbing): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.electrical;

    if (plumbing.runs.gasRun > 0) {
      const runs = Math.ceil(plumbing.runs.gasRun / 10);
      items.push({
        category: 'Gas',
        description: 'Gas Line',
        unitPrice: prices.gasPer10Ft,
        quantity: runs,
        total: prices.gasPer10Ft * runs,
      });
    }

    return items;
  }
}

// ============================================================================
// STEEL CALCULATIONS
// ============================================================================

export class SteelCalculations {
  static calculateSteelCost(
    poolSpecs: PoolSpecs,
    excavation: Excavation
  ): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.steel;
    const hasSpa = PoolCalculations.hasSpa(poolSpecs);
    const isFiberglass = PoolCalculations.isFiberglassPool(poolSpecs);

    if (isFiberglass) return items; // No steel for fiberglass

    // Pool base
    items.push({
      category: 'Steel',
      description: 'Pool Base',
      unitPrice: prices.poolBase,
      quantity: poolSpecs.surfaceArea,
      total: prices.poolBase * poolSpecs.surfaceArea,
    });

    // Spa base
    if (hasSpa) {
      items.push({
        category: 'Steel',
        description: 'Spa Base',
        unitPrice: prices.spaBase,
        quantity: 1,
        total: prices.spaBase,
      });
    }

    // Steps
    if (poolSpecs.totalStepsAndBench > 0) {
      items.push({
        category: 'Steel',
        description: 'Steps & Bench',
        unitPrice: prices.stepsPerLnft,
        quantity: poolSpecs.totalStepsAndBench,
        total: prices.stepsPerLnft * poolSpecs.totalStepsAndBench,
      });
    }

    // Tanning shelf
    if (poolSpecs.hasTanningShelf) {
      items.push({
        category: 'Steel',
        description: 'Tanning Shelf',
        unitPrice: prices.tanningShelf,
        quantity: 1,
        total: prices.tanningShelf,
      });
    }

    // Over 700 SQFT
    if (poolSpecs.surfaceArea > 700) {
      items.push({
        category: 'Steel',
        description: 'Over 700 SQFT',
        unitPrice: prices.over700Sqft,
        quantity: 1,
        total: prices.over700Sqft,
      });
    }

    // RBB steel
    excavation.rbbLevels.forEach((level) => {
      if (level.length > 0) {
        const priceKey = `rbb${level.height}PerLnft` as keyof typeof prices;
        const unitPrice = prices[priceKey] as number;
        items.push({
          category: 'Steel',
          description: `${level.height}" RBB Steel`,
          unitPrice,
          quantity: level.length,
          total: unitPrice * level.length,
        });
      }
    });

    // Double curtain
    if (excavation.doubleCurtainLength > 0) {
      items.push({
        category: 'Steel',
        description: 'Double Curtain',
        unitPrice: prices.doubleCurtainPerLnft,
        quantity: excavation.doubleCurtainLength,
        total: prices.doubleCurtainPerLnft * excavation.doubleCurtainLength,
      });
    }

    // Automatic cover
    if (poolSpecs.hasAutomaticCover) {
      items.push({
        category: 'Steel',
        description: 'Automatic Cover',
        unitPrice: prices.automaticCover,
        quantity: poolSpecs.perimeter,
        total: prices.automaticCover * poolSpecs.perimeter,
      });
    }

    return items;
  }
}

// ============================================================================
// SHOTCRETE CALCULATIONS
// ============================================================================

export class ShotcreteCalculations {
  static calculateShotcreteCost(
    poolSpecs: PoolSpecs,
    excavation: Excavation
  ): { labor: CostLineItem[]; material: CostLineItem[] } {
    const laborItems: CostLineItem[] = [];
    const materialItems: CostLineItem[] = [];
    const prices = pricingData.shotcrete;
    const hasSpa = PoolCalculations.hasSpa(poolSpecs);
    const isFiberglass = PoolCalculations.isFiberglassPool(poolSpecs);

    if (isFiberglass) return { labor: laborItems, material: materialItems };

    // LABOR
    // Pool base
    laborItems.push({
      category: 'Shotcrete Labor',
      description: 'Pool Base',
      unitPrice: prices.labor.poolBase,
      quantity: poolSpecs.surfaceArea,
      total: prices.labor.poolBase * poolSpecs.surfaceArea,
    });

    // Over 500 SQFT
    if (poolSpecs.surfaceArea > 500) {
      const hundredsOver = Math.floor((poolSpecs.surfaceArea - 500) / 100);
      laborItems.push({
        category: 'Shotcrete Labor',
        description: 'Over 500 SQFT',
        unitPrice: prices.labor.per100SqftOver500,
        quantity: hundredsOver,
        total: prices.labor.per100SqftOver500 * hundredsOver,
      });
    }

    // Tanning shelf
    if (poolSpecs.hasTanningShelf) {
      laborItems.push({
        category: 'Shotcrete Labor',
        description: 'Tanning Shelf',
        unitPrice: prices.labor.tanningShelf,
        quantity: 1,
        total: prices.labor.tanningShelf,
      });
    }

    // Steps
    if (poolSpecs.totalStepsAndBench > 0) {
      laborItems.push({
        category: 'Shotcrete Labor',
        description: 'Steps & Bench',
        unitPrice: prices.labor.stepsPerLnft,
        quantity: poolSpecs.totalStepsAndBench,
        total: prices.labor.stepsPerLnft * poolSpecs.totalStepsAndBench,
      });
    }

    // Spa
    if (hasSpa) {
      laborItems.push({
        category: 'Shotcrete Labor',
        description: poolSpecs.isRaisedSpa ? 'Raised Spa' : 'Spa Base',
        unitPrice: poolSpecs.isRaisedSpa ? prices.labor.raisedSpa : prices.labor.spaBase,
        quantity: 1,
        total: poolSpecs.isRaisedSpa ? prices.labor.raisedSpa : prices.labor.spaBase,
      });
    }

    // MATERIAL
    // Pool material
    materialItems.push({
      category: 'Shotcrete Material',
      description: 'Pool Material',
      unitPrice: prices.material.poolPerSqft,
      quantity: poolSpecs.surfaceArea,
      total: prices.material.poolPerSqft * poolSpecs.surfaceArea,
    });

    // Tanning shelf material
    if (poolSpecs.hasTanningShelf) {
      const shelfArea = 150; // Approximation
      materialItems.push({
        category: 'Shotcrete Material',
        description: 'Tanning Shelf Material',
        unitPrice: prices.material.tanningShelfPerSqft,
        quantity: shelfArea,
        total: prices.material.tanningShelfPerSqft * shelfArea,
      });
    }

    // Steps material
    if (poolSpecs.totalStepsAndBench > 0) {
      materialItems.push({
        category: 'Shotcrete Material',
        description: 'Steps Material',
        unitPrice: prices.material.stepsPerLnft,
        quantity: poolSpecs.totalStepsAndBench,
        total: prices.material.stepsPerLnft * poolSpecs.totalStepsAndBench,
      });
    }

    // RBB material
    excavation.rbbLevels.forEach((level) => {
      if (level.length > 0) {
        const priceKey = `rbb${level.height}PerLnft` as keyof typeof prices.material;
        const unitPrice = prices.material[priceKey] as number;
        materialItems.push({
          category: 'Shotcrete Material',
          description: `${level.height}" RBB Material`,
          unitPrice,
          quantity: level.length,
          total: unitPrice * level.length,
        });
      }
    });

    return { labor: laborItems, material: materialItems };
  }
}

// ============================================================================
// MAIN PRICING ENGINE
// ============================================================================

export class PricingEngine {
  /**
   * Calculate all costs for a proposal
   */
  static calculateProposal(proposal: Partial<Proposal>): CostBreakdown {
    const poolSpecs = proposal.poolSpecs!;
    const excavation = proposal.excavation!;
    const plumbing = proposal.plumbing!;
    const electrical = proposal.electrical!;

    // Plans & Engineering
    const plansItems = this.calculatePlansEngineering(poolSpecs);

    // Layout
    const layoutItems = this.calculateLayout(poolSpecs);

    // Permit
    const permitItems = this.calculatePermit(poolSpecs);

    // Excavation
    const excavationItems = ExcavationCalculations.calculateExcavationCost(poolSpecs, excavation);

    // Plumbing
    const plumbingItems = PlumbingCalculations.calculatePlumbingCost(poolSpecs, plumbing);

    // Gas
    const gasItems = ElectricalCalculations.calculateGasCost(plumbing);

    // Steel
    const steelItems = SteelCalculations.calculateSteelCost(poolSpecs, excavation);

    // Electrical
    const electricalItems = ElectricalCalculations.calculateElectricalCost(poolSpecs, electrical);

    // Shotcrete
    const shotcrete = ShotcreteCalculations.calculateShotcreteCost(poolSpecs, excavation);

    // Calculate totals
    const totals = {
      plansAndEngineering: this.sumItems(plansItems),
      layout: this.sumItems(layoutItems),
      permit: this.sumItems(permitItems),
      excavation: this.sumItems(excavationItems),
      plumbing: this.sumItems(plumbingItems),
      gas: this.sumItems(gasItems),
      steel: this.sumItems(steelItems),
      electrical: this.sumItems(electricalItems),
      shotcreteLabor: this.sumItems(shotcrete.labor),
      shotcreteMaterial: this.sumItems(shotcrete.material),
      tileLabor: 0, // TODO
      tileMaterial: 0, // TODO
      copingDeckingLabor: 0, // TODO
      copingDeckingMaterial: 0, // TODO
      stoneRockworkLabor: 0, // TODO
      stoneRockworkMaterial: 0, // TODO
      drainage: 0, // TODO
      equipmentOrdered: 0, // TODO
      equipmentSet: 0, // TODO
      cleanup: 0, // TODO
      interiorFinish: 0, // TODO
      waterTruck: 0, // TODO
      fiberglassShell: 0, // TODO
      grandTotal: 0,
    };

    totals.grandTotal = Object.values(totals).reduce((sum, val) => sum + val, 0) - totals.grandTotal;

    return {
      plansAndEngineering: plansItems,
      layout: layoutItems,
      permit: permitItems,
      excavation: excavationItems,
      plumbing: plumbingItems,
      gas: gasItems,
      steel: steelItems,
      electrical: electricalItems,
      shotcreteLabor: shotcrete.labor,
      shotcreteMaterial: shotcrete.material,
      tileLabor: [],
      tileMaterial: [],
      copingDeckingLabor: [],
      copingDeckingMaterial: [],
      stoneRockworkLabor: [],
      stoneRockworkMaterial: [],
      drainage: [],
      equipmentOrdered: [],
      equipmentSet: [],
      cleanup: [],
      interiorFinish: [],
      waterTruck: [],
      fiberglassShell: [],
      totals,
    };
  }

  private static calculatePlansEngineering(poolSpecs: PoolSpecs): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.plans;

    items.push({
      category: 'Plans & Engineering',
      description: 'Pool Only',
      unitPrice: prices.poolOnly,
      quantity: 1,
      total: prices.poolOnly,
    });

    if (PoolCalculations.hasSpa(poolSpecs)) {
      items.push({
        category: 'Plans & Engineering',
        description: 'Spa',
        unitPrice: prices.spa,
        quantity: 1,
        total: prices.spa,
      });
    }

    return items;
  }

  private static calculateLayout(poolSpecs: PoolSpecs): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.misc.layout;

    items.push({
      category: 'Layout',
      description: 'Pool Only',
      unitPrice: 50,
      quantity: 1,
      total: 50,
    });

    if (PoolCalculations.hasSpa(poolSpecs)) {
      items.push({
        category: 'Layout',
        description: 'Spa',
        unitPrice: 15,
        quantity: 1,
        total: 15,
      });
    }

    if (poolSpecs.hasSiltFence) {
      items.push({
        category: 'Layout',
        description: 'Silt Fencing',
        unitPrice: prices.siltFencing,
        quantity: 1,
        total: prices.siltFencing,
      });
    }

    return items;
  }

  private static calculatePermit(poolSpecs: PoolSpecs): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.misc.permit;

    items.push({
      category: 'Permit',
      description: 'Pool Only',
      unitPrice: prices.poolOnly,
      quantity: 1,
      total: prices.poolOnly,
    });

    if (PoolCalculations.hasSpa(poolSpecs)) {
      items.push({
        category: 'Permit',
        description: 'Spa',
        unitPrice: prices.spa,
        quantity: 1,
        total: prices.spa,
      });
    }

    items.push({
      category: 'Permit',
      description: 'Permit Runner',
      unitPrice: prices.permitRunner,
      quantity: 1,
      total: prices.permitRunner,
    });

    return items;
  }

  private static sumItems(items: CostLineItem[]): number {
    return items.reduce((sum, item) => sum + item.total, 0);
  }
}
