// ============================================================================
// PRICING ENGINE - Excel Formula Logic Implementation
// ============================================================================

import { Proposal, PoolSpecs, Excavation, Plumbing, Electrical, CostBreakdown, CostLineItem } from '../types/proposal-new';
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
    if (poolSpecs.poolType === 'fiberglass') {
      const fiberglassGallons: Record<string, number> = {
        small: 8000,
        medium: 12000,
        large: 16000,
        crystite: 10000,
      };
      return poolSpecs.fiberglassSize ? fiberglassGallons[poolSpecs.fiberglassSize] : 0;
    }

    const avgDepth = (poolSpecs.shallowDepth + poolSpecs.endDepth) / 2;
    const baseGallons = poolSpecs.surfaceArea * avgDepth * 7.6;
    const tanningShelfDeduction = poolSpecs.hasTanningShelf ? 850 : 0;

    let spaGallons = 0;
    if (this.hasSpa(poolSpecs)) {
      if (poolSpecs.spaType === 'gunite') {
        const spaAvgDepth = 3;
        spaGallons = poolSpecs.spaLength * poolSpecs.spaWidth * spaAvgDepth * 7.6;
      } else {
        const mapping: Record<string, number> = {
          'fiberglass-small': 1000,
          'fiberglass-medium': 1200,
          'fiberglass-large': 1500,
          crystite: 1200,
        };
        spaGallons = mapping[poolSpecs.spaType] || 1000;
      }
    }

    const gallons = Math.ceil((baseGallons + spaGallons) / 10) * 10 - tanningShelfDeduction;
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

    // Base excavation (flat price derived from Excel sizing table)
    if (!isFiberglass) {
      const baseExcavation = poolSpecs.surfaceArea > 1000
        ? prices.over1000Sqft
        : prices.basePricePerSqft;

      items.push({
        category: 'Excavation',
        description: poolSpecs.surfaceArea > 1000 ? 'Base Excavation (Over 1,000 SQFT)' : 'Base Excavation',
        unitPrice: baseExcavation,
        quantity: 1,
        total: baseExcavation,
      });

      // Additional 6" depth charge when the average depth exceeds ~6ft
      const avgDepth = (poolSpecs.shallowDepth + poolSpecs.endDepth) / 2;
      if (avgDepth > 6) {
        items.push({
          category: 'Excavation',
          description: 'Additional 6" Depth',
          unitPrice: prices.additional6InchDepth,
          quantity: 1,
          total: prices.additional6InchDepth,
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
      items.push({
        category: 'Excavation',
        description: 'Gravel',
        unitPrice: prices.gravelPerTon,
        quantity: poolSpecs.surfaceArea,
        total: Math.ceil(poolSpecs.surfaceArea * prices.gravelPerTon),
      });
    }

    // Dirt haul
    if (excavation.hasDirtHaul) {
      const overdigArea = poolSpecs.surfaceArea * 1.15; // Excel bumps surface area for overdig
      const adjustedDepth = ((poolSpecs.shallowDepth + 1.25) + (poolSpecs.endDepth + 1.25)) / 2;
      const cubicYards = (overdigArea * adjustedDepth) / 27;
      const yardage = Math.ceil(cubicYards * 1.128 * 10) / 10; // match sheet uplift and keep one decimal
      items.push({
        category: 'Excavation',
        description: 'Dirt Haul',
        unitPrice: prices.dirtHaulPerLoad,
        quantity: yardage,
        total: Math.ceil(prices.dirtHaulPerLoad * yardage),
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

    // Core plumbing pipe - 2"
    const twoInchBaseRun =
      poolSpecs.perimeter +
      plumbing.runs.mainDrainRun +
      plumbing.runs.cleanerRun +
      plumbing.runs.infloorValveToEQ +
      (plumbing.runs.infloorValveToPool * 6 * 1.15);
    const twoInchQty = Math.ceil(twoInchBaseRun * 1.25);
    if (twoInchQty > 0) {
      items.push({
        category: 'Plumbing',
        description: '2.0" Plumbing',
        unitPrice: prices.twoInchPipe,
        quantity: twoInchQty,
        total: prices.twoInchPipe * twoInchQty,
      });
    }

    // Skimmer + spa loop - 2.5"
    const twoPointFiveRun = plumbing.runs.skimmerRun + (poolSpecs.spaPerimeter || 0);
    const twoPointFiveQty = Math.ceil(twoPointFiveRun);
    if (twoPointFiveQty > 0) {
      items.push({
        category: 'Plumbing',
        description: '2.5" Plumbing',
        unitPrice: prices.twoPointFiveInchPipe,
        quantity: twoPointFiveQty,
        total: prices.twoPointFiveInchPipe * twoPointFiveQty,
      });
    }

    // 3.0" header if needed (only when long gas run)
    if (plumbing.runs.gasRun > 0) {
      const threeInchQty = Math.max(0, Math.ceil(plumbing.runs.gasRun - 100));
      if (threeInchQty > 0) {
        items.push({
          category: 'Plumbing',
          description: '3.0" Plumbing',
          unitPrice: prices.threeInchPipe,
          quantity: threeInchQty,
          total: prices.threeInchPipe * threeInchQty,
        });
      }
    }

    // Water features base runs (pricing matches Excel: base 30ft + 200 setup)
    const waterFeatureRuns = [
      plumbing.runs.waterFeature1Run,
      plumbing.runs.waterFeature2Run,
      plumbing.runs.waterFeature3Run,
      plumbing.runs.waterFeature4Run,
    ];
    const baseFeatureAllowance = 30;
    const featureSetup = 200;
    waterFeatureRuns.forEach((run, idx) => {
      if (run > 0) {
        const cappedRun = Math.max(run, baseFeatureAllowance);
        const overage = Math.max(0, cappedRun - baseFeatureAllowance);
        items.push({
          category: 'Plumbing',
          description: `Water Feature ${idx + 1}`,
          unitPrice: prices[`waterFeature${idx + 1}` as keyof typeof prices],
          quantity: overage,
          total: featureSetup + overage * (prices[`waterFeature${idx + 1}` as keyof typeof prices] as number),
        });
      }
    });

    // Add'l water feature run allowance
    const totalWFRun = waterFeatureRuns.filter(r => r > 0).reduce((sum, r) => sum + Math.max(r, baseFeatureAllowance), 0);
    if (totalWFRun > 0) {
      items.push({
        category: 'Plumbing',
        description: 'Additional Water Feature Run',
        unitPrice: prices.deckJet1,
        quantity: totalWFRun,
        total: prices.deckJet1 * totalWFRun,
      });
    }

    // Infloor plumbing
    const infloorTotal = plumbing.runs.infloorValveToEQ + plumbing.runs.infloorValveToPool;
    if (infloorTotal > 0) {
      items.push({
        category: 'Plumbing',
        description: 'Infloor Plumbing',
        unitPrice: prices.infloorPerFt,
        quantity: infloorTotal,
        total: prices.infloorPerFt * infloorTotal,
      });
    }

    // Conduit
    const conduitRuns =
      poolSpecs.perimeter +
      plumbing.runs.skimmerRun +
      plumbing.runs.mainDrainRun +
      plumbing.runs.cleanerRun +
      plumbing.runs.autoFillRun +
      plumbing.runs.waterFeature1Run +
      plumbing.runs.waterFeature2Run +
      plumbing.runs.waterFeature3Run +
      plumbing.runs.waterFeature4Run +
      plumbing.runs.gasRun;
    if (conduitRuns > 0) {
      const conduitQty = Math.ceil(conduitRuns * 1.2);
      items.push({
        category: 'Plumbing',
        description: 'Conduit',
        unitPrice: prices.conduitPerFt,
        quantity: conduitQty,
        total: prices.conduitPerFt * conduitQty,
      });
    }

    // Manifold (always one per pad)
    items.push({
      category: 'Plumbing',
      description: 'Manifold',
      unitPrice: prices.manifold,
      quantity: 1,
      total: prices.manifold,
    });

    // Strip forms for pad
    items.push({
      category: 'Plumbing',
      description: 'Strip Forms',
      unitPrice: prices.stripForms,
      quantity: 1,
      total: prices.stripForms,
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
      items.push({
        category: 'Gas',
        description: 'Base Gas Set',
        unitPrice: prices.baseGas,
        quantity: 1,
        total: prices.baseGas,
      });

      const overrun = Math.max(0, plumbing.runs.gasRun - pricingData.plumbing.gasOverrunThreshold);
      if (overrun > 0) {
        items.push({
          category: 'Gas',
          description: 'Gas Overrun',
          unitPrice: prices.gasPer10Ft,
          quantity: overrun,
          total: prices.gasPer10Ft * overrun,
        });
      }
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
      quantity: poolSpecs.perimeter,
      total: prices.poolBase * poolSpecs.perimeter,
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
    // Base yardage approximates Excel row (surface area / 16)
    const baseYards = Math.ceil(poolSpecs.surfaceArea / 16);
    laborItems.push({
      category: 'Shotcrete Labor',
      description: 'Pool Base',
      unitPrice: prices.labor.poolBase,
      quantity: baseYards,
      total: prices.labor.poolBase * baseYards,
    });

    // Over 500 SQFT surcharge (Excel shows ~4 units for 12 sqft over)
    let overageUnits = 0;
    if (poolSpecs.surfaceArea > 500) {
      overageUnits = Math.ceil((poolSpecs.surfaceArea - 500) / 3);
      laborItems.push({
        category: 'Shotcrete Labor',
        description: 'Over 500 SQFT',
        unitPrice: prices.labor.per100SqftOver500,
        quantity: overageUnits,
        total: prices.labor.per100SqftOver500 * overageUnits,
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
    // Pool material (match yardage pattern from Excel)
    const materialQty = baseYards + overageUnits;
    materialItems.push({
      category: 'Shotcrete Material',
      description: 'Pool Material',
      unitPrice: prices.material.poolPerSqft,
      quantity: materialQty,
      total: prices.material.poolPerSqft * materialQty,
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
      waterFeatures: 0, // TODO
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
      waterFeatures: [],
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
