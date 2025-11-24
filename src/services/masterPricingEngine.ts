// ============================================================================
// MASTER PRICING ENGINE - Complete Integration
// ============================================================================

import { Proposal, CostBreakdown, CostLineItem, PAPDiscounts } from '../types/proposal-new';
import pricingData from './pricingData';
import { CalculationModules } from './pricingEngineComplete';

const hasPoolDefinition = (poolSpecs: any): boolean => {
  if (!poolSpecs) return false;
  const hasGuniteDimensions =
    (poolSpecs.surfaceArea ?? 0) > 0 ||
    (poolSpecs.perimeter ?? 0) > 0 ||
    ((poolSpecs.maxLength ?? 0) > 0 && (poolSpecs.maxWidth ?? 0) > 0);
  const hasFiberglassSelection =
    poolSpecs.poolType === 'fiberglass' &&
    (!!poolSpecs.fiberglassSize || !!poolSpecs.fiberglassModelName || !!poolSpecs.fiberglassModelPrice);
  const hasSpaDefinition =
    ((poolSpecs.spaLength ?? 0) > 0 && (poolSpecs.spaWidth ?? 0) > 0) ||
    (poolSpecs.spaPerimeter ?? 0) > 0;
  return hasGuniteDimensions || hasFiberglassSelection || hasSpaDefinition;
};

// Import calculation classes from pricingEngine.ts
import {
  ExcavationCalculations,
  PlumbingCalculations,
  ElectricalCalculations,
  SteelCalculations,
  ShotcreteCalculations,
} from './pricingEngine';

export class MasterPricingEngine {
  /**
   * Main entry point - calculates complete proposal with full cost breakdown
   */
  static calculateCompleteProposal(proposal: Partial<Proposal>, papDiscounts?: PAPDiscounts): {
    costBreakdown: CostBreakdown;
    pricing: import('../types/proposal-new').PricingCalculations;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    totalCost: number;
  } {
    const tileCopingDecking = proposal.tileCopingDecking!;
    const derivedWaterfallCount = (tileCopingDecking?.doubleBullnoseLnft ?? 0) > 0 ? 1 : 0;
    const explicitWaterfalls = proposal.poolSpecs?.waterfallCount ?? 0;
    const waterfallCount = explicitWaterfalls > 0 ? explicitWaterfalls : derivedWaterfallCount;
    const poolSpecs = {
      ...proposal.poolSpecs!,
      waterfallCount,
    };
    const excavation = proposal.excavation!;
    const plumbing = proposal.plumbing!;
    const electrical = proposal.electrical!;
    const drainage = proposal.drainage!;
    const equipment = proposal.equipment!;
    const waterFeatures = proposal.waterFeatures ?? { selections: [], totalCost: 0 };
    const customFeatures = proposal.customFeatures!;
    const interiorFinish = proposal.interiorFinish!;
    const county = proposal.customerInfo?.county;
    const isFiberglass = CalculationModules.Pool.isFiberglassPool(poolSpecs);

    // Calculate all sections
    const plansItems = this.calculatePlansEngineering(poolSpecs, excavation, waterFeatures);
    const layoutItems = this.calculateLayout(poolSpecs);
    const permitItems = this.calculatePermit(poolSpecs);
    let excavationItems = ExcavationCalculations.calculateExcavationCost(poolSpecs, excavation);
    const plumbingWithElectrical = {
      ...plumbing,
      runs: {
        ...plumbing.runs,
        electricalRun: electrical?.runs?.electricalRun ?? 0,
        lightRun: electrical?.runs?.lightRun ?? 0,
      },
    };
    let plumbingItems = PlumbingCalculations.calculatePlumbingCost(poolSpecs, plumbingWithElectrical);
    const gasItems = ElectricalCalculations.calculateGasCost(plumbing);
    let steelItems = SteelCalculations.calculateSteelCost(poolSpecs, excavation);
    let electricalItems = ElectricalCalculations.calculateElectricalCost(poolSpecs, electrical, equipment);
    const shotcrete = ShotcreteCalculations.calculateShotcreteCost(poolSpecs, excavation, county, tileCopingDecking);
    const tileCoping = CalculationModules.TileCopingDecking.calculateCosts(poolSpecs, tileCopingDecking);
    const tileLaborOnly = tileCoping.labor.filter(i => i.category.toLowerCase().includes('tile'));
    const tileMaterialOnly = tileCoping.material.filter(i => i.category.toLowerCase().includes('tile'));
    const drainageItems = CalculationModules.Drainage.calculateDrainageCost(drainage);
    let equipmentItems = CalculationModules.Equipment.calculateEquipmentCost(equipment, poolSpecs);
    const equipmentSetItems = CalculationModules.Equipment.calculateEquipmentSetCost(equipment, poolSpecs);
    const waterFeaturesItems = CalculationModules.WaterFeatures.calculateWaterFeaturesCost(waterFeatures);
    const interior = CalculationModules.InteriorFinish.calculateInteriorFinishCost(poolSpecs, interiorFinish, equipment);
    const cleanupItems = CalculationModules.Cleanup.calculateCleanupCost(poolSpecs, excavation, tileCopingDecking);
    const fiberglassItems = CalculationModules.Fiberglass.calculateFiberglassCost(poolSpecs);
    const fiberglassInstallItems = CalculationModules.Fiberglass.calculateFiberglassInstallCost(poolSpecs);
    const masonryCalc = CalculationModules.Masonry.calculateMasonryCost(poolSpecs, excavation);
    const rockworkLabor = masonryCalc.labor.concat(tileCoping.labor.filter(i => i.category.includes('Rockwork')));
    const rockworkMaterial = masonryCalc.material.concat(tileCoping.material.filter(i => i.category.includes('Rockwork')));
    const masonryMaterialSubtotal = masonryCalc.material.reduce((sum, i) => sum + i.total, 0);
    if (masonryMaterialSubtotal > 0) {
      rockworkMaterial.push({
        category: 'Stone & Rockwork Material',
        description: 'Stone & Rockwork Material Tax (Masonry)',
        unitPrice: pricingData.tileCoping.materialTaxRate,
        quantity: masonryMaterialSubtotal,
        total: masonryMaterialSubtotal * pricingData.tileCoping.materialTaxRate,
      });
    }

    // Startup & Orientation
    let startupItems = this.calculateStartupOrientation(poolSpecs, equipment);

    // Apply PAP Discounts if provided
    if (papDiscounts) {
      // Excavation (NOT for fiberglass)
      if (!isFiberglass && papDiscounts.excavation > 0) {
        const subtotal = excavationItems.reduce((sum, item) => sum + item.total, 0);
        excavationItems.push({
          category: 'Excavation',
          description: 'PAP Discount',
          unitPrice: -(subtotal * papDiscounts.excavation),
          quantity: 1,
          total: -(subtotal * papDiscounts.excavation),
        });
      }

      // Plumbing
      if (papDiscounts.plumbing > 0) {
        const subtotal = plumbingItems.reduce((sum, item) => sum + item.total, 0);
        plumbingItems.push({
          category: 'Plumbing',
          description: 'PAP Discount',
          unitPrice: -(subtotal * papDiscounts.plumbing),
          quantity: 1,
          total: -(subtotal * papDiscounts.plumbing),
        });
      }

      // Steel
      if (papDiscounts.steel > 0) {
        const subtotal = steelItems.reduce((sum, item) => sum + item.total, 0);
        steelItems.push({
          category: 'Steel',
          description: 'PAP Discount',
          unitPrice: -(subtotal * papDiscounts.steel),
          quantity: 1,
          total: -(subtotal * papDiscounts.steel),
        });
      }

      // Electrical
      if (papDiscounts.electrical > 0) {
        const subtotal = electricalItems.reduce((sum, item) => sum + item.total, 0);
        electricalItems.push({
          category: 'Electrical',
          description: 'PAP Discount',
          unitPrice: -(subtotal * papDiscounts.electrical),
          quantity: 1,
          total: -(subtotal * papDiscounts.electrical),
        });
      }

      // Shotcrete (combined labor + material)
      if (papDiscounts.shotcrete > 0) {
        const laborSubtotal = shotcrete.labor.reduce((sum, i) => sum + i.total, 0);
        const materialSubtotal = shotcrete.material.reduce((sum, i) => sum + i.total, 0);
        const combinedSubtotal = laborSubtotal + materialSubtotal;
        shotcrete.labor.push({
          category: 'Shotcrete Labor',
          description: 'PAP Discount',
          unitPrice: -(combinedSubtotal * papDiscounts.shotcrete),
          quantity: 1,
          total: -(combinedSubtotal * papDiscounts.shotcrete),
        });
      }

      // Tile/Coping Labor
      if (papDiscounts.tileCopingLabor > 0) {
        const laborSubtotal = tileCoping.labor.reduce((sum, item) => sum + item.total, 0);
        tileCoping.labor.push({
          category: 'Tile & Coping Labor',
          description: 'PAP Discount',
          unitPrice: -(laborSubtotal * papDiscounts.tileCopingLabor),
          quantity: 1,
          total: -(laborSubtotal * papDiscounts.tileCopingLabor),
        });
      }

      // Tile/Coping Material (ONLY on flagstone)
      if (papDiscounts.tileCopingMaterial > 0) {
        let flagstoneMaterialTotal = 0;
        tileCoping.material.forEach((item) => {
          if (item.description.toLowerCase().includes('flagstone') ||
              (tileCopingDecking.copingType === 'flagstone' && item.category === 'Coping Material')) {
            flagstoneMaterialTotal += item.total;
          }
        });
        if (flagstoneMaterialTotal > 0) {
          tileCoping.material.push({
            category: 'Tile & Coping Material',
            description: 'PAP Discount',
            unitPrice: -(flagstoneMaterialTotal * papDiscounts.tileCopingMaterial),
            quantity: 1,
            total: -(flagstoneMaterialTotal * papDiscounts.tileCopingMaterial),
          });
        }
      }

      // Equipment
      if (papDiscounts.equipment > 0) {
        const subtotalBeforeTax = equipmentItems
          .filter(item => !item.description.includes('Tax'))
          .reduce((sum, i) => sum + i.total, 0);
        if (subtotalBeforeTax > 0) {
          const discountAmount = subtotalBeforeTax * papDiscounts.equipment;
          // Insert before tax
          const taxIndex = equipmentItems.findIndex(item => item.description.includes('Tax'));
          const discountItem: CostLineItem = {
            category: 'Equipment',
            description: 'PAP Discount',
            unitPrice: -discountAmount,
            quantity: 1,
            total: -discountAmount,
          };
          if (taxIndex >= 0) {
            equipmentItems.splice(taxIndex, 0, discountItem);
            const taxRate = pricingData.equipment.taxRate ?? 0;
            const taxableBase = subtotalBeforeTax - discountAmount;
            equipmentItems[taxIndex + 1] = {
              ...equipmentItems[taxIndex + 1],
              unitPrice: taxRate,
              quantity: taxableBase,
              total: taxableBase * taxRate,
            };
          } else {
            equipmentItems.push(discountItem);
            const taxRate = pricingData.equipment.taxRate ?? 0;
            equipmentItems.push({
              category: 'Equipment',
              description: 'Equipment Tax',
              unitPrice: taxRate,
              quantity: subtotalBeforeTax - discountAmount,
              total: (subtotalBeforeTax - discountAmount) * taxRate,
            });
          }
        }
      }

      // Interior Finish
      if (papDiscounts.interiorFinish > 0) {
        const laborSubtotal = interior.labor.reduce((sum, item) => sum + item.total, 0);
        interior.labor.push({
          category: 'Interior Finish',
          description: 'PAP Discount',
          unitPrice: -(laborSubtotal * papDiscounts.interiorFinish),
          quantity: 1,
          total: -(laborSubtotal * papDiscounts.interiorFinish),
        });
      }

      // Startup
      if (papDiscounts.startup > 0) {
        const subtotal = startupItems.reduce((sum, item) => sum + item.total, 0);
        startupItems.push({
          category: 'Start-Up / Orientation',
          description: 'PAP Discount',
          unitPrice: -(subtotal * papDiscounts.startup),
          quantity: 1,
          total: -(subtotal * papDiscounts.startup),
        });
      }
    }

    // Custom Features (convert to line items)
    const customFeaturesItems: CostLineItem[] = customFeatures?.features.map(f => ({
      category: 'Custom Features',
      description: f.name,
      unitPrice: f.totalCost,
      quantity: 1,
      total: f.totalCost,
      notes: f.description
    })) || [];

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
      tileLabor: this.sumItems(tileLaborOnly),
      tileMaterial: this.sumItems(tileMaterialOnly),
      copingDeckingLabor: this.sumItems(tileCoping.labor.filter(i => i.category.includes('Coping') || i.category.includes('Decking'))),
      copingDeckingMaterial: this.sumItems(tileCoping.material.filter(i => i.category.includes('Coping') || i.category.includes('Decking') || i.category.includes('Tax'))),
      stoneRockworkLabor: this.sumItems(rockworkLabor),
      stoneRockworkMaterial: this.sumItems(rockworkMaterial),
      drainage: this.sumItems(drainageItems),
      equipmentOrdered: this.sumItems(equipmentItems),
      equipmentSet: this.sumItems(equipmentSetItems),
      waterFeatures: this.sumItems(waterFeaturesItems),
      cleanup: this.sumItems(cleanupItems),
      interiorFinish: this.sumItems([...interior.labor, ...interior.material]),
      waterTruck: this.sumItems(interior.waterTruck),
      fiberglassShell: this.sumItems(fiberglassItems),
      fiberglassInstall: this.sumItems(fiberglassInstallItems),
      startupOrientation: this.sumItems(startupItems),
      customFeatures: this.sumItems(customFeaturesItems),
      grandTotal: 0,
    };

    // Calculate grand total
    totals.grandTotal = Object.values(totals).reduce((sum, val) => sum + val, 0);

    const costBreakdown: CostBreakdown = {
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
      tileLabor: tileLaborOnly,
      tileMaterial: tileMaterialOnly,
      copingDeckingLabor: tileCoping.labor.filter(i => i.category.includes('Coping') || i.category.includes('Decking')),
      copingDeckingMaterial: tileCoping.material.filter(i => i.category.includes('Coping') || i.category.includes('Decking') || i.category.includes('Tax')),
      stoneRockworkLabor: rockworkLabor,
      stoneRockworkMaterial: rockworkMaterial,
      drainage: drainageItems,
      equipmentOrdered: equipmentItems,
      equipmentSet: equipmentSetItems,
      waterFeatures: waterFeaturesItems,
      cleanup: cleanupItems,
      interiorFinish: [...interior.labor, ...interior.material],
      waterTruck: interior.waterTruck,
      fiberglassShell: fiberglassItems,
      fiberglassInstall: fiberglassInstallItems,
      startupOrientation: startupItems,
      customFeatures: customFeaturesItems,
      totals,
    };

    // ============================================================================
    // PRICING CALCULATIONS (Matching Excel)
    // ============================================================================

    // Get configuration values (these should come from proposal or defaults)
    const overheadMultiplier = proposal.pricing?.overheadMultiplier ?? 1.01; // 1% overhead
    const targetMargin = proposal.pricing?.targetMargin ?? 0.733; // Excel target margin (COGS ≈ 73.3% of retail)
    const discountAmount = proposal.pricing?.discountAmount ?? 0; // Manual discount
    const digCommissionRate = proposal.pricing?.digCommissionRate ?? 0.0275; // 2.75%
    const adminFeeRate = proposal.pricing?.adminFeeRate ?? 0.029; // 2.9%
    const closeoutCommissionRate = proposal.pricing?.closeoutCommissionRate ?? 0.0275; // 2.75%

    // Determine G3 upgrade cost
    const hasG3Upgrade = interiorFinish?.finishType?.toLowerCase().includes('crystite') ?? false;
    const g3UpgradeCost = hasG3Upgrade ? 1250 : 0;

    // Step 1: Total costs before overhead
    const totalCostsBeforeOverhead = totals.grandTotal;

    // Step 2: Apply overhead multiplier
    const totalCOGS = totalCostsBeforeOverhead * overheadMultiplier;

    // Step 3: Calculate base retail price (divide by target margin and round up to nearest $50 to match Excel)
    const baseRetailPrice = Math.ceil((totalCOGS / targetMargin) / 50) * 50;

    // Step 4: Add G3 upgrade and discount
    const retailPrice = baseRetailPrice + g3UpgradeCost + discountAmount;

    // Step 5: Calculate commissions and fees
    const digCommission = retailPrice * digCommissionRate;
    const adminFee = retailPrice * adminFeeRate;
    const closeoutCommission = retailPrice * closeoutCommissionRate;

    // Step 6: Calculate gross profit
    const grossProfit = retailPrice - totalCOGS - digCommission - adminFee - closeoutCommission;
    const grossProfitMargin = retailPrice > 0 ? (grossProfit / retailPrice) * 100 : 0;

    const pricing: import('../types/proposal-new').PricingCalculations = {
      totalCostsBeforeOverhead,
      overheadMultiplier,
      totalCOGS,
      targetMargin,
      baseRetailPrice,
      g3UpgradeCost,
      discountAmount,
      retailPrice,
      digCommissionRate,
      digCommission,
      adminFeeRate,
      adminFee,
      closeoutCommissionRate,
      closeoutCommission,
      grossProfit,
      grossProfitMargin,
    };

    return {
      costBreakdown,
      pricing,
      subtotal: totals.grandTotal,
      taxRate: 0,
      taxAmount: 0,
      totalCost: retailPrice, // Return retail price, not just costs
    };
  }

  private static calculatePlansEngineering(poolSpecs: any, excavation: any, waterFeatures: any): CostLineItem[] {
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

    if (CalculationModules.Pool.hasSpa(poolSpecs)) {
      items.push({
        category: 'Plans & Engineering',
        description: 'Spa',
        unitPrice: prices.spa,
        quantity: 1,
        total: prices.spa,
      });
    }

    // Waterfall cost from water features or explicit count
    const explicitWaterfalls =
      (poolSpecs as any).waterfallCount ?? (waterFeatures as any)?.waterfallCount ?? 0;
    const waterfallCount = explicitWaterfalls > 0 ? explicitWaterfalls : (waterFeatures?.selections || [])
      .filter((sel: any) => {
        const catalog = pricingData.waterFeatures?.catalog ?? [];
        const feature = catalog.find((f: any) => f.id === sel.featureId);
        return feature?.name?.toLowerCase().includes('waterfall');
      })
      .reduce((sum: number, sel: any) => sum + (sel.quantity || 0), 0);

    if (waterfallCount > 0) {
      items.push({
        category: 'Plans & Engineering',
        description: 'Waterfall',
        unitPrice: prices.waterfall,
        quantity: waterfallCount,
        total: prices.waterfall * waterfallCount,
      });
    }

    if (excavation?.needsSoilSampleEngineer) {
      items.push({
        category: 'Plans & Engineering',
        description: 'Soil Sample / Engineer',
        unitPrice: prices.soilSampleEngineer,
        quantity: 1,
        total: prices.soilSampleEngineer,
      });
    }

    return items;
  }

  private static calculateLayout(poolSpecs: any): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.misc.layout;

    if (!hasPoolDefinition(poolSpecs)) {
      return items;
    }

    items.push({
      category: 'Layout',
      description: 'Pool Only',
      unitPrice: prices.poolOnly,
      quantity: 1,
      total: prices.poolOnly,
    });

    if (CalculationModules.Pool.hasSpa(poolSpecs)) {
      items.push({
        category: 'Layout',
        description: 'Spa',
        unitPrice: prices.spa,
        quantity: 1,
        total: prices.spa,
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

  private static calculatePermit(poolSpecs: any): CostLineItem[] {
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

    if (CalculationModules.Pool.hasSpa(poolSpecs)) {
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

  private static calculateStartupOrientation(poolSpecs: any, equipment: any): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.misc.startup;

    if (!hasPoolDefinition(poolSpecs)) {
      return items;
    }

    // Base startup & 30-day service
    items.push({
      category: 'Start-Up / Orientation',
      description: 'Start-Up & 30 Days',
      unitPrice: prices.base,
      quantity: 1,
      total: prices.base,
    });

    // Add automation fee if automation is present
    const hasSpa = CalculationModules.Pool.hasSpa(poolSpecs);
    if (hasSpa && equipment?.automation) {
      items.push({
        category: 'Start-Up / Orientation',
        description: 'Add Automation',
        unitPrice: prices.automationAdd,
        quantity: 1,
        total: prices.automationAdd,
      });
    }

    return items;
  }

  private static sumItems(items: CostLineItem[]): number {
    return items.reduce((sum, item) => sum + item.total, 0);
  }

  /**
   * Auto-calculate pool specifications based on dimensions
   */
  static autoCalculatePoolSpecs(poolSpecs: any): any {
    const computedSurfaceArea =
      (poolSpecs.surfaceArea && poolSpecs.surfaceArea > 0)
        ? poolSpecs.surfaceArea
        : CalculationModules.Pool.calculateSurfaceAreaFromDimensions(poolSpecs);
    const computedPerimeter =
      (poolSpecs.perimeter && poolSpecs.perimeter > 0)
        ? poolSpecs.perimeter
        : (poolSpecs.maxLength && poolSpecs.maxWidth ? Math.ceil((poolSpecs.maxLength + poolSpecs.maxWidth) * 2) : 0);
    return {
      ...poolSpecs,
      surfaceArea: computedSurfaceArea,
      perimeter: computedPerimeter,
      approximateGallons: CalculationModules.Pool.calculateGallons(poolSpecs),
      spaPerimeter: CalculationModules.Pool.calculateSpaPerimeter(poolSpecs),
    };
  }

  /**
   * Auto-calculate excavation totals
   */
  static autoCalculateExcavation(excavation: any, poolSpecs: any): any {
    return {
      ...excavation,
      totalRBBSqft: ExcavationCalculations.calculateTotalRBBSqft(excavation),
      additionalBench: CalculationModules.Pool.calculateAdditionalBench(poolSpecs),
    };
  }
}

export default MasterPricingEngine;
