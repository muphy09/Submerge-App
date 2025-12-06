// ============================================================================
// PRICING ENGINE - Excel Formula Logic Implementation
// ============================================================================

import { Proposal, PoolSpecs, Excavation, Plumbing, Electrical, CostBreakdown, CostLineItem } from '../types/proposal-new';
import pricingData from './pricingData';
import { getLightCounts, normalizeEquipmentLighting } from '../utils/lighting';

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
  return hasGuniteDimensions || hasFiberglassSelection;
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
    if (poolSpecs.spaType === 'none' || poolSpecs.spaType === 'fiberglass') return 0;

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
    const isGuniteSpa = poolSpecs.spaType === 'gunite';

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
    if (isGuniteSpa && !isFiberglass) {
      // Base spa excavation is always charged
      items.push({
        category: 'Excavation',
        description: 'Base Spa',
        unitPrice: prices.baseSpa,
        quantity: 1,
        total: prices.baseSpa,
      });

      if (poolSpecs.isRaisedSpa) {
        items.push({
          category: 'Excavation',
          description: 'Raised Spa',
          unitPrice: prices.raisedSpa,
          quantity: 1,
          total: prices.raisedSpa,
        });
      }
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
        total: poolSpecs.surfaceArea * prices.gravelPerSqft,
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
      const spaAreaAllowance = hasSpa ? 75 : 0; // EXC!G9 -> 75 when spa is present
      const cubicYards = ((overdigArea * adjustedDepth) / 24) + ((spaAreaAllowance * 2.5) / 24);
      const yardage = Math.max(0, cubicYards); // Excel keeps decimals
      const yardageDisplay = Math.round(yardage * 100) / 100;
      const dirtHaulTotal = Math.ceil(prices.dirtHaulPerYard * yardage);
      items.push({
        category: 'Excavation',
        description: 'Dirt Haul',
        unitPrice: prices.dirtHaulPerYard,
        quantity: yardageDisplay,
        total: dirtHaulTotal,
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
    const isGuniteSpa = poolSpecs.spaType === 'gunite';
    const skimmerRun = plumbing.runs.skimmerRun || 0;
    const mainDrainRun = plumbing.runs.mainDrainRun || 0;
    const cleanerRun = plumbing.runs.cleanerRun || 0;
    const infloorValveToEQ = plumbing.runs.infloorValveToEQ || 0;
    const infloorValveToPool = plumbing.runs.infloorValveToPool || 0;
    const infloorCalc = infloorValveToEQ + (infloorValveToPool * 6 * 1.15);

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
    if (hasSpa && isGuniteSpa) {
      items.push({
        category: 'Plumbing',
        description: 'Spa Base',
        unitPrice: prices.spaBase,
        quantity: 1,
        total: prices.spaBase,
      });
    }

    // Pool overrun (if skimmer run > 33 ft)
    if (skimmerRun > prices.poolOverrunThreshold) {
      const overrun = skimmerRun - prices.poolOverrunThreshold;
      items.push({
        category: 'Plumbing',
        description: 'Pool Overrun',
        unitPrice: prices.poolOverrunPerFt,
        quantity: overrun,
        total: prices.poolOverrunPerFt * overrun,
      });
    }

    // Spa overrun
    if (hasSpa && isGuniteSpa && plumbing.runs.spaRun > prices.spaOverrunThreshold) {
      const overrun = plumbing.runs.spaRun - prices.spaOverrunThreshold;
      items.push({
        category: 'Plumbing',
        description: 'Spa Overrun',
        unitPrice: prices.spaOverrunPerFt,
        quantity: overrun,
        total: prices.spaOverrunPerFt * overrun,
      });
    }

    // Core plumbing pipe - 2" (PLUM!K14)
    const twoInchBaseRun =
      poolSpecs.perimeter +
      skimmerRun +
      cleanerRun +
      infloorCalc;
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

    // Main drain + spa loop - 2.5" (PLUM!K15)
    const spaPerimeter = isGuniteSpa ? (poolSpecs.spaPerimeter || PoolCalculations.calculateSpaPerimeter(poolSpecs)) : 0;
    const twoPointFiveRun = mainDrainRun + spaPerimeter;
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

    // Conduit - Excel PLUM!Row26: ROUNDUP(electricalRun + (lightRun * 1.25), 0)
    // Note: electricRun lives on electrical module; grab it from either plumbing or pool specs for flexibility
    const electricalRun = plumbing.runs?.electricalRun ?? (plumbing as any).electricalRun ?? (poolSpecs as any).electricalRun ?? 0;
    const lightRun = plumbing.runs?.lightRun ?? (plumbing as any).lightRun ?? (poolSpecs as any).lightRun ?? 0;
    const conduitQty = Math.ceil(electricalRun + (lightRun * 1.25));
    if (conduitQty > 0) {
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
    electrical: Electrical,
    equipment?: any
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

    // Homerun overrun (if > 65 ft) - Excel ELEC!Row5
    if (electrical.runs.electricalRun > prices.overrunThreshold) {
      const overrun = electrical.runs.electricalRun - prices.overrunThreshold;
      items.push({
        category: 'Electrical',
        description: 'Homerun',
        unitPrice: prices.overrunPerFt,
        quantity: overrun,
        total: prices.overrunPerFt * overrun,
      });
    }

    const normalizedEquipment = equipment
      ? normalizeEquipmentLighting(equipment as any, { hasPool: hasPoolDefinition(poolSpecs), hasSpa, poolSpecs })
      : equipment;

    // Lights - $100 per additional light beyond the first (ELEC!Row6)
    const lightCounts = getLightCounts(normalizedEquipment as any);
    const additionalLights = Math.max(0, lightCounts.total - 1);
    if (additionalLights > 0) {
      items.push({
        category: 'Electrical',
        description: 'Lights',
        unitPrice: prices.lightAdditionalPerLight,
        quantity: additionalLights,
        total: prices.lightAdditionalPerLight * additionalLights,
      });
    }

    // Spa electrical (heater)
    if (hasSpa) {
      items.push({
        category: 'Electrical',
        description: 'Heater (Spa)',
        unitPrice: prices.spaElectrical,
        quantity: 1,
        total: prices.spaElectrical,
      });
    }

    // Automation - Excel ELEC!Row8: $250 × hasAutomation
    const automationSelection = (normalizedEquipment as any)?.automation;
    const hasAutomation = !!automationSelection && (
      (automationSelection.price ?? 0) > 0 ||
      (automationSelection.name && !automationSelection.name.toLowerCase().includes('no automation')) ||
      (automationSelection.zones ?? 0) > 0 ||
      automationSelection.hasChemistry
    );
    if (hasAutomation) {
      items.push({
        category: 'Electrical',
        description: 'Automation',
        unitPrice: prices.automation,
        quantity: 1,
        total: prices.automation,
      });
    }

    // Bonding - Excel ELEC!Row9: $300 × 1
    items.push({
      category: 'Electrical',
      description: 'Bonding',
      unitPrice: prices.bonding,
      quantity: 1,
      total: prices.bonding,
    });

    // Outlet - Excel ELEC!Row10: $85 × 1
    items.push({
      category: 'Electrical',
      description: 'Outlet',
      unitPrice: prices.outlet,
      quantity: 1,
      total: prices.outlet,
    });

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
    const isGuniteSpa = poolSpecs.spaType === 'gunite';
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
    if (isGuniteSpa && hasSpa) {
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
    excavation: Excavation,
    county?: string,
    tileCopingDecking?: any,
  ): { labor: CostLineItem[]; material: CostLineItem[] } {
    const laborItems: CostLineItem[] = [];
    const materialItems: CostLineItem[] = [];
    const prices = pricingData.shotcrete;
    const hasSpa = PoolCalculations.hasSpa(poolSpecs);
    const isGuniteSpa = poolSpecs.spaType === 'gunite';
    const isFiberglass = PoolCalculations.isFiberglassPool(poolSpecs);

    if (isFiberglass) return { labor: laborItems, material: materialItems };

    // Yardage approximation (SHOT sheet):
    // ROUNDUP((((perimeter + (interiorArea * 0.67) + rbbSqft) / 24)
    //        + ((spaPerimeter + spaPerimeter*3 + 40) / 25)
    //        + (doubleBullnoseLnft / 10)) * 1.1, 0)
    //        + (doubleCurtainLnft / 20) + (isRaisedSpa ? 2 : 0)
    const perimeter = poolSpecs.perimeter || 0;
    const surfaceArea = poolSpecs.surfaceArea || 0;
    const shallowDepth = poolSpecs.shallowDepth || 0;
    const endDepth = poolSpecs.endDepth || 0;
    const interiorArea = ((shallowDepth + endDepth) / 2) * perimeter + surfaceArea;
    const rbbSqft = excavation ? ExcavationCalculations.calculateTotalRBBSqft(excavation) : 0;
    const spaPerimeter = poolSpecs.spaPerimeter || PoolCalculations.calculateSpaPerimeter(poolSpecs);
    const doubleBullnoseLnft = tileCopingDecking?.doubleBullnoseLnft ?? 0;
    const doubleCurtainLnft = excavation?.doubleCurtainLength ?? 0;

    const baseYardage =
      ((perimeter + (interiorArea * 0.67) + rbbSqft) / 24) +
      ((spaPerimeter + (spaPerimeter * 3) + 40) / 25) +
      (doubleBullnoseLnft / 10);

    let yardage = Math.ceil(baseYardage * 1.1);
    yardage += (doubleCurtainLnft / 20);
    yardage += isGuniteSpa && poolSpecs.isRaisedSpa ? 2 : 0;

    // Ensure yardage stays numeric
    yardage = Math.max(0, yardage);

    // LABOR - Two-tier pricing per Excel SHOT sheet
    // Minimum Labor: Always charge for 32 yards at $90/yard
    laborItems.push({
      category: 'Shotcrete Labor',
      description: 'Minimum Labor',
      unitPrice: prices.labor.poolBase,
      quantity: prices.labor.minimumYards,
      total: prices.labor.poolBase * prices.labor.minimumYards,
    });

    // Additional Labor: If > 32 yards, charge for additional at same rate
    if (yardage > prices.labor.minimumYards) {
      const additionalYards = yardage - prices.labor.minimumYards;
      laborItems.push({
        category: 'Shotcrete Labor',
        description: 'Add\'l Labor',
        unitPrice: prices.labor.poolBase,
        quantity: additionalYards,
        total: prices.labor.poolBase * additionalYards,
      });
    }

    if (isGuniteSpa && hasSpa) {
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

    // Tax breakdown (Excel SHOT sheet)
    // NC State Tax: 4.75% (0.0475)
    // MECK County Tax: 2.5% (0.025)
    // Combined for MECK County NC: 7.25% (4.75% + 2.5%)
    const materialSubtotal = materialItems.reduce((sum, i) => sum + i.total, 0);

    if (county === 'MECK') {
      // MECK County NC: Show state + county tax separately
      const stateTax = materialSubtotal * 0.0475;
      const countyTax = materialSubtotal * 0.025;

      materialItems.push({
        category: 'Shotcrete Material',
        description: 'NC State Tax (4.75%)',
        unitPrice: 0.0475,
        quantity: materialSubtotal,
        total: stateTax,
      });

      materialItems.push({
        category: 'Shotcrete Material',
        description: 'MECK County Tax (2.5%)',
        unitPrice: 0.025,
        quantity: materialSubtotal,
        total: countyTax,
      });
    } else if (county === 'NC') {
      // Other NC counties: Only state tax
      materialItems.push({
        category: 'Shotcrete Material',
        description: 'NC State Tax (4.75%)',
        unitPrice: 0.0475,
        quantity: materialSubtotal,
        total: materialSubtotal * 0.0475,
      });
    } else {
      // Default: Combined tax (for other states or unspecified)
      materialItems.push({
        category: 'Shotcrete Material',
        description: 'Material Tax (7.25%)',
        unitPrice: prices.material.taxRate,
        quantity: materialSubtotal,
        total: materialSubtotal * prices.material.taxRate,
      });
    }

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
      fiberglassInstall: 0, // TODO
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
      fiberglassInstall: [],
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
