// ============================================================================
// PRICING ENGINE - Excel Formula Logic Implementation
// ============================================================================

import { Proposal, PoolSpecs, Excavation, Plumbing, Electrical, CostBreakdown, CostLineItem } from '../types/proposal-new';
import pricingData from './pricingData';

/**
 * ROUNDUP function - Excel-style ceiling function
 * Rounds up to the nearest integer
 */
const roundUp = (value: number): number => Math.ceil(value);

const hasPoolDefinition = (poolSpecs: PoolSpecs): boolean => {
  const hasGuniteDimensions =
    poolSpecs.surfaceArea > 0 ||
    poolSpecs.perimeter > 0 ||
    (poolSpecs.maxLength > 0 && poolSpecs.maxWidth > 0);
  const hasFiberglassSelection =
    poolSpecs.poolType === 'fiberglass' &&
    (!!poolSpecs.fiberglassSize || !!poolSpecs.fiberglassModelName || !!poolSpecs.fiberglassModelPrice);
  const hasSpaDefinition =
    (poolSpecs.spaLength > 0 && poolSpecs.spaWidth > 0) || (poolSpecs.spaPerimeter ?? 0) > 0;
  return hasGuniteDimensions || hasFiberglassSelection || hasSpaDefinition;
};

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

    if (!hasPoolDefinition(poolSpecs)) {
      return items;
    }

    // Base excavation (Excel range table)
    const baseRanges = prices.baseRanges ?? [];
    if (!isFiberglass && baseRanges.length) {
      const baseRange = baseRanges.find((r: any) => poolSpecs.surfaceArea <= r.max) ?? baseRanges[baseRanges.length - 1];
      items.push({
        category: 'Excavation',
        description: `Base Excavation (${poolSpecs.surfaceArea > 1000 ? 'Over' : 'Up to'} ${baseRange.max} SQFT)`,
        unitPrice: baseRange.price,
        quantity: 1,
        total: baseRange.price,
      });

      if (poolSpecs.surfaceArea > 1000) {
        const overQty = Math.max(0, poolSpecs.surfaceArea - 1000);
        items.push({
          category: 'Excavation',
          description: 'Over 1,000 SQFT',
          unitPrice: prices.over1000Sqft,
          quantity: overQty,
          total: prices.over1000Sqft * overQty,
        });
      }
    }

    // Additional 6" depth charge when end depth exceeds 8'
    if (!isFiberglass && poolSpecs.endDepth >= 8.05) {
      const additionalDepthQty = roundUp((poolSpecs.endDepth - 8) * 2); // increments of 6"
      items.push({
        category: 'Excavation',
        description: 'Additional 6" Depth',
        unitPrice: prices.additional6InchDepth,
        quantity: additionalDepthQty,
        total: prices.additional6InchDepth * additionalDepthQty,
      });
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

    // Gravel install (price per sqft from EXC sheet)
    if (excavation.hasGravelInstall) {
      items.push({
        category: 'Excavation',
        description: 'Gravel',
        unitPrice: prices.gravelPerSqft,
        quantity: poolSpecs.surfaceArea,
        total: Math.ceil(poolSpecs.surfaceArea * prices.gravelPerSqft),
      });
    }

    // Fiberglass Install (labor and gravel for fiberglass pools)
    if (isFiberglass && hasPoolDefinition(poolSpecs)) {
      const fiberglassInstallPrices = pricingData.fiberglass.fiberglassInstall;

      items.push({
        category: 'Excavation',
        description: 'Fiberglass Install - Labor',
        unitPrice: fiberglassInstallPrices.labor,
        quantity: 1,
        total: fiberglassInstallPrices.labor,
      });

      items.push({
        category: 'Excavation',
        description: 'Fiberglass Install - Gravel',
        unitPrice: fiberglassInstallPrices.gravel,
        quantity: 1,
        total: fiberglassInstallPrices.gravel,
      });
    }

    // Dirt haul
    if (excavation.hasDirtHaul) {
      const overdigArea = poolSpecs.surfaceArea * 1.15; // Excel upsizes for overdig
      const adjustedMinDepth = poolSpecs.shallowDepth + 1.25;
      const adjustedMaxDepth = poolSpecs.endDepth + 1.25;
      const adjustedDepth = (adjustedMinDepth + adjustedMaxDepth) / 2;
      const spaAreaAllowance = hasSpa ? 50 : 0;
      const cubicYards = ((overdigArea * adjustedDepth) / 24) + ((spaAreaAllowance * 2.5) / 24);
      const yardage = Math.ceil(cubicYards);
      items.push({
        category: 'Excavation',
        description: 'Dirt Haul',
        unitPrice: prices.dirtHaulPerYard,
        quantity: yardage,
        total: Math.ceil(prices.dirtHaulPerYard * yardage),
      });
    }

    // Automatic cover box
    if (poolSpecs.hasAutomaticCover) {
      items.push({
        category: 'Excavation',
        description: 'Cover Box',
        unitPrice: prices.coverBox,
        quantity: poolSpecs.maxWidth,
        total: prices.coverBox * poolSpecs.maxWidth,
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

    if (!hasPoolDefinition(poolSpecs)) {
      return items;
    }

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

    // Spa overrun
    if (hasSpa && plumbing.runs.spaRun > prices.spaOverrunThreshold) {
      const overrun = plumbing.runs.spaRun - prices.spaOverrunThreshold;
      items.push({
        category: 'Plumbing',
        description: 'Spa Overrun',
        unitPrice: prices.spaOverrunPerFt,
        quantity: overrun,
        total: prices.spaOverrunPerFt * overrun,
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
    const baseFeatureAllowance = prices.waterFeatureRun.baseAllowanceFt;
    const featureSetup = prices.waterFeatureRun.setup;
    const featureRate = prices.waterFeatureRun.perFt;
    waterFeatureRuns.forEach((run, idx) => {
      if (run > 0) {
        const cappedRun = Math.max(run, baseFeatureAllowance);
        const overage = Math.max(0, cappedRun - baseFeatureAllowance);
       items.push({
          category: 'Plumbing',
          description: `Water Feature ${idx + 1}`,
          unitPrice: featureRate,
          quantity: overage,
          total: featureSetup + overage * featureRate,
        });
      }
    });

    // Add'l water feature run allowance
    const totalWFRun = waterFeatureRuns.filter(r => r > 0).reduce((sum, r) => sum + Math.max(r, baseFeatureAllowance), 0);
    if (totalWFRun > 0) {
      items.push({
        category: 'Plumbing',
        description: 'Additional Water Feature Run',
        unitPrice: prices.additionalWaterFeatureRunPerFt ?? featureRate,
        quantity: totalWFRun,
        total: (prices.additionalWaterFeatureRunPerFt ?? featureRate) * totalWFRun,
      });
    }

    // Infloor plumbing
    const infloorTotal = plumbing.runs.infloorValveToEQ + plumbing.runs.infloorValveToPool;
    if (infloorTotal > 0) {
      items.push({
        category: 'Plumbing',
        description: 'Infloor Plumbing',
        unitPrice: prices.infloorPerFt,
        quantity: Math.ceil(poolSpecs.surfaceArea * 0.5),
        total: prices.infloorPerFt * Math.ceil(poolSpecs.surfaceArea * 0.5),
      });
    }

    // Conduit
    const conduitRuns =
      plumbing.runs.skimmerRun +
      plumbing.runs.mainDrainRun +
      plumbing.runs.cleanerRun +
      plumbing.runs.autoFillRun;
    if (conduitRuns > 0) {
      const conduitQty = Math.ceil((conduitRuns + plumbing.runs.gasRun) * 1.25);
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
        unitPrice: prices.cleanerPerFt,
        quantity: plumbing.runs.cleanerRun,
        total: prices.cleanerPerFt * plumbing.runs.cleanerRun,
      });
    }

    // Auto-fill
    if (plumbing.runs.autoFillRun > 0) {
      items.push({
        category: 'Plumbing',
        description: 'Auto-Fill',
        unitPrice: prices.autoFillPerFt,
        quantity: plumbing.runs.autoFillRun,
        total: prices.autoFillPerFt * plumbing.runs.autoFillRun,
      });
    }

    // Additional skimmers
    if (plumbing.runs.additionalSkimmers > 0) {
      items.push({
        category: 'Plumbing',
        description: 'Additional Skimmers',
        unitPrice: prices.additionalSkimmer,
        quantity: plumbing.runs.additionalSkimmers,
        total: prices.additionalSkimmer * plumbing.runs.additionalSkimmers,
      });
    }

    // Spa plumbing (additional runs) - NOT included in COST-NEW tab per Excel sheet
    // Commenting out to match Excel COST-NEW tab behavior
    // if (hasSpa && plumbing.runs.spaRun > 0) {
    //   items.push({
    //     category: 'Plumbing',
    //     description: 'Spa Plumbing',
    //     unitPrice: prices.spaPlumbing,
    //     quantity: plumbing.runs.spaRun,
    //     total: prices.spaPlumbing * plumbing.runs.spaRun,
    //   });
    // }

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

    if (!hasPoolDefinition(poolSpecs)) {
      return items;
    }

    // Base electrical (includes first 65ft of electric run)
    items.push({
      category: 'Electrical',
      description: 'Base Electrical (includes first 65 ft)',
      unitPrice: prices.baseElectrical,
      quantity: 1,
      total: prices.baseElectrical,
    });

    // Electrical run overrun (if > 65 ft)
    if (electrical.runs.electricalRun > prices.overrunThreshold) {
      const overrun = electrical.runs.electricalRun - prices.overrunThreshold;
      items.push({
        category: 'Electrical',
        description: 'Electrical Run Overrun',
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

    // Light run - every foot counts (1 ft = 1.25 ft billable conduit @ $2.75/ft)
    if (electrical.runs.lightRun > 0) {
      const billableConduit = electrical.runs.lightRun * prices.lightRunConduitMultiplier;
      const totalCost = billableConduit * prices.lightRunPerFt;
      items.push({
        category: 'Electrical',
        description: 'Light Run',
        unitPrice: prices.lightRunPerFt,
        quantity: billableConduit,
        total: totalCost,
      });
    }

    // Heat pump electrical
    if (electrical.runs.heatPumpElectricalRun > 0) {
      items.push({
        category: 'Electrical',
        description: 'Heat Pump Electrical',
        unitPrice: prices.heatPumpElectricalBase ?? prices.heatPumpElectrical,
        quantity: 1,
        total: prices.heatPumpElectricalBase ?? prices.heatPumpElectrical,
      });

      const over = Math.max(0, electrical.runs.heatPumpElectricalRun - (prices.heatPumpOverrunThreshold ?? 40));
      if (over > 0) {
        items.push({
          category: 'Electrical',
          description: 'Heat Pump Electrical Overrun',
          unitPrice: prices.heatPumpPerFtOver ?? prices.heatPumpElectrical,
          quantity: over,
          total: (prices.heatPumpPerFtOver ?? prices.heatPumpElectrical) * over,
        });
      }
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
          unitPrice: prices.gasPerFtOverThreshold,
          quantity: overrun,
          total: prices.gasPerFtOverThreshold * overrun,
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

    // 4-bar beam
    items.push({
      category: 'Steel',
      description: '4-Bar Beam',
      unitPrice: prices.fourBarBeam,
      quantity: 1,
      total: prices.fourBarBeam,
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
      if (poolSpecs.isRaisedSpa) {
        items.push({
          category: 'Steel',
          description: 'Raised Spa',
          unitPrice: prices.raisedSpa ?? 0,
          quantity: 1,
          total: prices.raisedSpa ?? 0,
        });
        items.push({
          category: 'Steel',
          description: 'Spa Double Curtain',
          unitPrice: prices.spaDoubleCurtain,
          quantity: 1,
          total: prices.spaDoubleCurtain,
        });
      }
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

    // Depth over 8'
    if (poolSpecs.endDepth > 8.1) {
      const additionalDepthQty = (poolSpecs.endDepth - 8) * 2;
      items.push({
        category: 'Steel',
        description: 'Additional 6" Depth',
        unitPrice: prices.depthOver8Ft,
        quantity: additionalDepthQty,
        total: prices.depthOver8Ft * additionalDepthQty,
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

    // Pool bonding
    items.push({
      category: 'Steel',
      description: 'Pool Bonding',
      unitPrice: prices.poolBonding,
      quantity: 1,
      total: prices.poolBonding,
    });

    // Muck Out (standard for gunite pools)
    const muckOutQty = prices.muckOutQty || 100;
    items.push({
      category: 'Steel',
      description: 'Muck Out',
      unitPrice: prices.muckOut,
      quantity: muckOutQty,
      total: prices.muckOut * muckOutQty,
    });

    // Travel
    if (poolSpecs.travelDistance > 0) {
      items.push({
        category: 'Steel',
        description: 'Travel',
        unitPrice: prices.travelPerMile,
        quantity: poolSpecs.travelDistance,
        total: prices.travelPerMile * poolSpecs.travelDistance,
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
    _excavation: Excavation
  ): { labor: CostLineItem[]; material: CostLineItem[] } {
    const laborItems: CostLineItem[] = [];
    const materialItems: CostLineItem[] = [];
    const prices = pricingData.shotcrete;
    const hasSpa = PoolCalculations.hasSpa(poolSpecs);
    const isFiberglass = PoolCalculations.isFiberglassPool(poolSpecs);

    if (isFiberglass) return { labor: laborItems, material: materialItems };

    // Yardage approximation with minimum yardage from Excel (32 yards)
    const yardage = Math.max(prices.labor.minimumYards, Math.ceil(poolSpecs.surfaceArea / 16));

    // LABOR
    laborItems.push({
      category: 'Shotcrete Labor',
      description: 'Pool Base',
      unitPrice: prices.labor.poolBase,
      quantity: yardage,
      total: prices.labor.poolBase * yardage,
    });

    if (hasSpa) {
      laborItems.push({
        category: 'Shotcrete Labor',
        description: 'Spa',
        unitPrice: prices.labor.spa,
        quantity: 1,
        total: prices.labor.spa,
      });
    }

    if (poolSpecs.hasAutomaticCover) {
      laborItems.push({
        category: 'Shotcrete Labor',
        description: 'Auto Cover',
        unitPrice: prices.labor.autoCover,
        quantity: 1,
        total: prices.labor.autoCover,
      });
    }

    if (poolSpecs.poolToStreetDistance === 1) {
      laborItems.push({
        category: 'Shotcrete Labor',
        description: 'Distance 251-300',
        unitPrice: prices.labor.distance250to300,
        quantity: 1,
        total: prices.labor.distance250to300,
      });
    } else if (poolSpecs.poolToStreetDistance === 2) {
      laborItems.push({
        category: 'Shotcrete Labor',
        description: 'Distance 301-350',
        unitPrice: prices.labor.distance300to350,
        quantity: 1,
        total: prices.labor.distance300to350,
      });
    }

    if (poolSpecs.travelDistance > 0) {
      laborItems.push({
        category: 'Shotcrete Labor',
        description: 'Travel',
        unitPrice: prices.labor.travelPerMile,
        quantity: poolSpecs.travelDistance,
        total: prices.labor.travelPerMile * poolSpecs.travelDistance,
      });
    }

    // MATERIAL
    const baseMaterial = prices.material.perYard * yardage;
    materialItems.push({
      category: 'Shotcrete Material',
      description: 'Pool Material',
      unitPrice: prices.material.perYard,
      quantity: yardage,
      total: baseMaterial,
    });

    materialItems.push({
      category: 'Shotcrete Material',
      description: 'Clean Out',
      unitPrice: prices.material.cleanOut,
      quantity: 1,
      total: prices.material.cleanOut,
    });

    materialItems.push({
      category: 'Shotcrete Material',
      description: 'Env / Fuel',
      unitPrice: prices.material.envFuelPerYard,
      quantity: yardage,
      total: prices.material.envFuelPerYard * yardage,
    });

    materialItems.push({
      category: 'Shotcrete Material',
      description: 'Miscellaneous',
      unitPrice: prices.material.misc,
      quantity: 1,
      total: prices.material.misc,
    });

    if (poolSpecs.travelDistance > 0) {
      materialItems.push({
        category: 'Shotcrete Material',
        description: 'Travel',
        unitPrice: prices.material.travelPerMile,
        quantity: poolSpecs.travelDistance,
        total: prices.material.travelPerMile * poolSpecs.travelDistance,
      });
    }

    // Tax applied to material subtotal (Excel applies 7.25%)
    const materialSubtotal = materialItems.reduce((sum, i) => sum + i.total, 0);
    materialItems.push({
      category: 'Shotcrete Material',
      description: 'Material Tax',
      unitPrice: prices.material.taxRate,
      quantity: materialSubtotal,
      total: materialSubtotal * prices.material.taxRate,
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
      startupOrientation: 0,
      customFeatures: 0,
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
      startupOrientation: [],
      customFeatures: [],
      totals,
    };
  }

  private static calculatePlansEngineering(poolSpecs: PoolSpecs): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.plans;

    if (!hasPoolDefinition(poolSpecs)) {
      return items;
    }

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

    if (!hasPoolDefinition(poolSpecs)) {
      return items;
    }

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

    if (!hasPoolDefinition(poolSpecs)) {
      return items;
    }

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
