// ============================================================================
// MASTER PRICING ENGINE - Complete Integration
// ============================================================================

import { Proposal, CostBreakdown, CostLineItem } from '../types/proposal-new';
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
  static calculateCompleteProposal(proposal: Partial<Proposal>): {
    costBreakdown: CostBreakdown;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    totalCost: number;
  } {
    const poolSpecs = proposal.poolSpecs!;
    const excavation = proposal.excavation!;
    const plumbing = proposal.plumbing!;
    const electrical = proposal.electrical!;
    const tileCopingDecking = proposal.tileCopingDecking!;
    const drainage = proposal.drainage!;
    const equipment = proposal.equipment!;
    const waterFeatures = proposal.waterFeatures ?? { selections: [], totalCost: 0 };
    const customFeatures = proposal.customFeatures!;
    const interiorFinish = proposal.interiorFinish!;

    // Calculate all sections
    const plansItems = this.calculatePlansEngineering(poolSpecs, excavation);
    const layoutItems = this.calculateLayout(poolSpecs);
    const permitItems = this.calculatePermit(poolSpecs);
    const excavationItems = ExcavationCalculations.calculateExcavationCost(poolSpecs, excavation);
    const plumbingItems = PlumbingCalculations.calculatePlumbingCost(poolSpecs, plumbing);
    const gasItems = ElectricalCalculations.calculateGasCost(plumbing);
    const steelItems = SteelCalculations.calculateSteelCost(poolSpecs, excavation);
    const electricalItems = ElectricalCalculations.calculateElectricalCost(poolSpecs, electrical);
    const shotcrete = ShotcreteCalculations.calculateShotcreteCost(poolSpecs, excavation);
    const tileCoping = CalculationModules.TileCopingDecking.calculateCosts(poolSpecs, tileCopingDecking);
    const drainageItems = CalculationModules.Drainage.calculateDrainageCost(drainage);
    const equipmentItems = CalculationModules.Equipment.calculateEquipmentCost(equipment, poolSpecs);
    const equipmentSetItems = CalculationModules.Equipment.calculateEquipmentSetCost(equipment, poolSpecs);
    const waterFeaturesItems = CalculationModules.WaterFeatures.calculateWaterFeaturesCost(waterFeatures);
    const interior = CalculationModules.InteriorFinish.calculateInteriorFinishCost(poolSpecs, interiorFinish);
    const cleanupItems = CalculationModules.Cleanup.calculateCleanupCost(poolSpecs);
    const fiberglassItems = CalculationModules.Fiberglass.calculateFiberglassCost(poolSpecs);
    const masonryItems = CalculationModules.Masonry.calculateMasonryCost(poolSpecs, excavation);

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
      tileLabor: this.sumItems(tileCoping.labor),
      tileMaterial: this.sumItems(tileCoping.material),
      copingDeckingLabor: this.sumItems(tileCoping.labor.filter(i => i.category.includes('Coping') || i.category.includes('Decking'))),
      copingDeckingMaterial: this.sumItems(tileCoping.material.filter(i => i.category.includes('Decking'))),
      stoneRockworkLabor: this.sumItems(masonryItems),
      stoneRockworkMaterial: 0, // Included in masonry
      drainage: this.sumItems(drainageItems),
      equipmentOrdered: this.sumItems(equipmentItems),
      equipmentSet: this.sumItems(equipmentSetItems),
      waterFeatures: this.sumItems(waterFeaturesItems),
      cleanup: this.sumItems(cleanupItems),
      interiorFinish: this.sumItems([...interior.labor, ...interior.material]),
      waterTruck: this.sumItems(interior.waterTruck),
      fiberglassShell: this.sumItems(fiberglassItems),
      grandTotal: 0,
    };

    // Add custom features
    const customFeaturesTotal = customFeatures?.features.reduce((sum, f) => sum + f.totalCost, 0) || 0;

    // Calculate grand total
    totals.grandTotal = Object.values(totals).reduce((sum, val) => sum + val, 0) + customFeaturesTotal;

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
      tileLabor: tileCoping.labor,
      tileMaterial: tileCoping.material,
      copingDeckingLabor: tileCoping.labor.filter(i => i.category.includes('Coping') || i.category.includes('Decking')),
      copingDeckingMaterial: tileCoping.material.filter(i => i.category.includes('Decking')),
      stoneRockworkLabor: masonryItems,
      stoneRockworkMaterial: [],
      drainage: drainageItems,
      equipmentOrdered: equipmentItems,
      equipmentSet: equipmentSetItems,
      waterFeatures: waterFeaturesItems,
      cleanup: cleanupItems,
      interiorFinish: [...interior.labor, ...interior.material],
      waterTruck: interior.waterTruck,
      fiberglassShell: fiberglassItems,
      totals,
    };

    return {
      costBreakdown,
      subtotal: totals.grandTotal,
      taxRate: 0,
      taxAmount: 0,
      totalCost: totals.grandTotal,
    };
  }

  private static calculatePlansEngineering(poolSpecs: any, excavation: any): CostLineItem[] {
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

  private static sumItems(items: CostLineItem[]): number {
    return items.reduce((sum, item) => sum + item.total, 0);
  }

  /**
   * Auto-calculate pool specifications based on dimensions
   */
  static autoCalculatePoolSpecs(poolSpecs: any): any {
    return {
      ...poolSpecs,
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
