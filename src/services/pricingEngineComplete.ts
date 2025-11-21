// ============================================================================
// COMPLETE PRICING ENGINE - Full Excel Formula Implementation
// ============================================================================

import { PoolSpecs, Excavation, TileCopingDecking, Drainage, Equipment, WaterFeatures, InteriorFinish, CostLineItem } from '../types/proposal-new';
import pricingData from './pricingData';

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
// HELPER CALCULATIONS
// ============================================================================

export class PoolCalculations {
  static calculateGallons(poolSpecs: PoolSpecs): number {
    if (poolSpecs.poolType === 'fiberglass') {
      // Fiberglass pools have fixed gallons based on size
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
        const spaAvgDepth = 3; // Excel sheet does not capture depth, assume 3ft working depth
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

  static calculateSpaPerimeter(poolSpecs: PoolSpecs): number {
    if (poolSpecs.spaType === 'none') return 0;

    if (poolSpecs.spaShape === 'round') {
      return Math.ceil(poolSpecs.spaLength * 3.14);
    } else {
      return Math.ceil(poolSpecs.spaLength * 2 + poolSpecs.spaWidth * 2);
    }
  }

  static calculateAdditionalBench(poolSpecs: PoolSpecs): number {
    return poolSpecs.totalStepsAndBench > 20 ? poolSpecs.totalStepsAndBench - 20 : 0;
  }

  static isFiberglassPool(poolSpecs: PoolSpecs): boolean {
    return poolSpecs.poolType === 'fiberglass';
  }

  static hasSpa(poolSpecs: PoolSpecs): boolean {
    return poolSpecs.spaType !== 'none';
  }

  static calculateSurfaceAreaFromDimensions(poolSpecs: PoolSpecs): number {
    // For rectangular pools: length * width
    // For other shapes, this could be more complex
    return poolSpecs.maxLength * poolSpecs.maxWidth;
  }
}

// ============================================================================
// TILE, COPING, DECKING CALCULATIONS
// ============================================================================

export class TileCopingDeckingCalculations {
  static calculateCosts(
    poolSpecs: PoolSpecs,
    tileCopingDecking: TileCopingDecking
  ): { labor: CostLineItem[]; material: CostLineItem[] } {
    const laborItems: CostLineItem[] = [];
    const materialItems: CostLineItem[] = [];
    const prices = pricingData.tileCoping;
    const isFiberglass = PoolCalculations.isFiberglassPool(poolSpecs);
    const perimeterWithExtras = poolSpecs.perimeter + tileCopingDecking.additionalTileLength;
    const spaPerimeter = poolSpecs.spaPerimeter || PoolCalculations.calculateSpaPerimeter(poolSpecs);
    const copingLnft =
      tileCopingDecking.copingLength ||
      Math.ceil(poolSpecs.perimeter * 1.1 + spaPerimeter * 2.15);
    const deckingArea = tileCopingDecking.deckingArea * (tileCopingDecking.deckingType === 'concrete' ? 1 : 1.05);

    // TILE LABOR
    if (!isFiberglass) {
      const tileLevel = tileCopingDecking.tileLevel;

      laborItems.push({
        category: 'Tile Labor',
        description: `Level ${tileLevel} Tile Labor`,
        unitPrice: prices.tile.labor.level1,
        quantity: perimeterWithExtras,
        total: prices.tile.labor.level1 * perimeterWithExtras,
      });

      // Step trim tile
      if (tileCopingDecking.hasTrimTileOnSteps && poolSpecs.totalStepsAndBench > 0) {
        laborItems.push({
          category: 'Tile Labor',
          description: 'Step Trim Tile',
          unitPrice: prices.tile.labor.stepTrim,
          quantity: poolSpecs.totalStepsAndBench,
          total: prices.tile.labor.stepTrim * poolSpecs.totalStepsAndBench,
        });
      }
    }

    // Base tile material (Level 1)
    if (!isFiberglass) {
      materialItems.push({
        category: 'Tile Material',
        description: 'Level 1 Tile',
        unitPrice: prices.tile.material.level1,
        quantity: perimeterWithExtras,
        total: prices.tile.material.level1 * perimeterWithExtras,
      });
    }

    // TILE MATERIAL
    if (!isFiberglass && tileCopingDecking.tileLevel > 1) {
      const upgrade =
        tileCopingDecking.tileLevel === 2
          ? prices.tile.material.level2Upgrade
          : prices.tile.material.level3Upgrade;

      materialItems.push({
        category: 'Tile Material',
        description: `Level ${tileCopingDecking.tileLevel} Tile Upgrade`,
        unitPrice: upgrade,
        quantity: perimeterWithExtras,
        total: upgrade * perimeterWithExtras,
      });
    }

    // COPING LABOR & MATERIAL
    const copingRate = this.getCopingRate(tileCopingDecking.copingType, prices);
    if (copingRate > 0) {
      laborItems.push({
        category: 'Coping Labor',
        description: `${tileCopingDecking.copingType} Coping`,
        unitPrice: copingRate,
        quantity: copingLnft,
        total: copingRate * copingLnft,
      });
      const copingMaterialRate =
        prices.decking.material.coping[
          tileCopingDecking.copingType.replace('-', '') as keyof typeof prices.decking.material.coping
        ] ?? copingRate;
      materialItems.push({
        category: 'Coping Material',
        description: `${tileCopingDecking.copingType} Coping Material`,
        unitPrice: copingMaterialRate,
        quantity: copingLnft,
        total: copingMaterialRate * copingLnft,
      });
    }

    // DECKING LABOR
    const deckingLaborRate = this.getDeckingLaborRate(tileCopingDecking.deckingType, prices);
    if (deckingLaborRate > 0) {
      laborItems.push({
        category: 'Decking Labor',
        description: `${tileCopingDecking.deckingType} Decking Labor`,
        unitPrice: deckingLaborRate,
        quantity: deckingArea,
        total: deckingLaborRate * deckingArea,
      });
    }

    // Concrete steps
    if (tileCopingDecking.concreteStepsLength > 0) {
      laborItems.push({
        category: 'Decking Labor',
        description: 'Concrete Steps',
        unitPrice: prices.decking.labor.concreteSteps,
        quantity: tileCopingDecking.concreteStepsLength,
        total: prices.decking.labor.concreteSteps * tileCopingDecking.concreteStepsLength,
      });
    }

    // DECKING MATERIAL
    const deckingMaterialRate = this.getDeckingMaterialRate(tileCopingDecking.deckingType, prices);
    if (deckingMaterialRate > 0) {
      materialItems.push({
        category: 'Decking Material',
        description: `${tileCopingDecking.deckingType} Decking Material`,
        unitPrice: deckingMaterialRate,
        quantity: deckingArea,
        total: deckingMaterialRate * deckingArea,
      });
    }

    // Concrete steps material
    if (tileCopingDecking.concreteStepsLength > 0) {
      materialItems.push({
        category: 'Decking Material',
        description: 'Concrete Steps Material',
        unitPrice: prices.decking.material.concreteSteps,
        quantity: tileCopingDecking.concreteStepsLength,
        total: prices.decking.material.concreteSteps * tileCopingDecking.concreteStepsLength,
      });
    }

    // Bullnose / Double bullnose
    if (tileCopingDecking.doubleBullnoseLnft && tileCopingDecking.doubleBullnoseLnft > 0) {
      laborItems.push({
        category: 'Coping Labor',
        description: 'Double Bullnose',
        unitPrice: prices.decking.bullnoseLabor ?? prices.coping.doubleBullnoseLabor ?? 0,
        quantity: tileCopingDecking.doubleBullnoseLnft,
        total: (prices.decking.bullnoseLabor ?? prices.coping.doubleBullnoseLabor ?? 0) * tileCopingDecking.doubleBullnoseLnft,
      });
      materialItems.push({
        category: 'Coping Material',
        description: 'Double Bullnose Material',
        unitPrice: prices.decking.material.doubleBullnose ?? 0,
        quantity: tileCopingDecking.doubleBullnoseLnft,
        total: (prices.decking.material.doubleBullnose ?? 0) * tileCopingDecking.doubleBullnoseLnft,
      });
    }

    // Spillway (labor/material)
    if (tileCopingDecking.spillwayLnft && tileCopingDecking.spillwayLnft > 0) {
      laborItems.push({
        category: 'Coping Labor',
        description: 'Spillway Labor',
        unitPrice: prices.decking.spillwayLabor ?? prices.coping.spillwayLabor ?? 0,
        quantity: 1,
        total: prices.decking.spillwayLabor ?? prices.coping.spillwayLabor ?? 0,
      });
      materialItems.push({
        category: 'Coping Material',
        description: 'Spillway Material',
        unitPrice: prices.decking.spillwayMaterial ?? prices.decking.material.spillway ?? 0,
        quantity: 1,
        total: prices.decking.spillwayMaterial ?? prices.decking.material.spillway ?? 0,
      });
    }

    // Stone / Rockwork (panel ledge / stacked stone / tile)
    const rockworkEntries: Array<{ key: keyof typeof prices.decking.rockworkLabor; sqft?: number; label: string }> = [
      { key: 'panelLedge', sqft: tileCopingDecking.rockworkPanelLedgeSqft, label: 'Panel Ledge Rockwork' },
      { key: 'stackedStone', sqft: tileCopingDecking.rockworkStackedStoneSqft, label: 'Stacked Stone Rockwork' },
      { key: 'tile', sqft: tileCopingDecking.rockworkTileSqft, label: 'Tile Rockwork' },
    ];
    rockworkEntries.forEach((entry) => {
      if (!entry.sqft || entry.sqft <= 0) return;
      const laborRate = prices.decking.rockworkLabor[entry.key] ?? 0;
      const materialRate = prices.decking.material.rockwork[entry.key] ?? 0;
      laborItems.push({
        category: 'Stone & Rockwork Labor',
        description: entry.label,
        unitPrice: laborRate,
        quantity: entry.sqft,
        total: laborRate * entry.sqft,
      });
      materialItems.push({
        category: 'Stone & Rockwork Material',
        description: entry.label,
        unitPrice: materialRate,
        quantity: entry.sqft,
        total: materialRate * entry.sqft,
      });
    });

    // Concrete pump (if any concrete work)
    if (tileCopingDecking.deckingType === 'concrete' || tileCopingDecking.concreteStepsLength > 0) {
      laborItems.push({
        category: 'Decking Labor',
        description: 'Concrete Pump',
        unitPrice: 600,
        quantity: 1,
        total: 600,
      });
    }

    // Concrete band for fiberglass pools
    if (PoolCalculations.isFiberglassPool(poolSpecs)) {
      materialItems.push({
        category: 'Decking Material',
        description: 'Concrete Band for Fiberglass',
        unitPrice: prices.decking.material.concrete,
        quantity: poolSpecs.perimeter * 1.25,
        total: prices.decking.material.concrete * poolSpecs.perimeter * 1.25,
      });
    }

    // Material tax
    const materialSubtotal = materialItems.reduce((sum, i) => sum + i.total, 0);
    if (materialSubtotal > 0) {
      materialItems.push({
        category: 'Tile & Decking Tax',
        description: 'Materials Tax',
        unitPrice: prices.materialTaxRate,
        quantity: materialSubtotal,
        total: materialSubtotal * prices.materialTaxRate,
      });
    }

    return { labor: laborItems, material: materialItems };
  }

  private static getCopingRate(copingType: string, prices: any): number {
    const mapping: Record<string, number> = {
      cantilever: prices.coping.cantilever,
      flagstone: prices.coping.flagstone,
      paver: prices.coping.pavers,
      'travertine-level1': prices.coping.travertineLevel1,
      'travertine-level2': prices.coping.travertineLevel2,
      concrete: prices.coping.concrete,
    };
    return mapping[copingType] || 0;
  }

  private static getDeckingLaborRate(deckingType: string, prices: any): number {
    const mapping: Record<string, number> = {
      paver: prices.decking.labor.pavers,
      'travertine-level1': prices.decking.labor.travertine,
      'travertine-level2': prices.decking.labor.travertine,
      concrete: prices.decking.labor.concrete,
    };
    return mapping[deckingType] || 0;
  }

  private static getDeckingMaterialRate(deckingType: string, prices: any): number {
    const mapping: Record<string, number> = {
      paver: prices.decking.material.pavers,
      'travertine-level1': prices.decking.material.travertineLevel1,
      'travertine-level2': prices.decking.material.travertineLevel2,
      concrete: prices.decking.material.concrete,
    };
    return mapping[deckingType] || 0;
  }
}

// ============================================================================
// DRAINAGE CALCULATIONS
// ============================================================================

export class DrainageCalculations {
  static calculateDrainageCost(drainage: Drainage): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.misc.drainage;

    const calculateLine = (label: string, length: number) => {
      if (length <= 0) return;
      const over = Math.max(0, length - prices.includedFt);
      const total = prices.baseCost + over * prices.perFtOver;
      items.push({
        category: 'Drainage',
        description: label,
        unitPrice: prices.baseCost,
        quantity: 1,
        total,
      });
    };

    calculateLine('Downspout Drain', drainage.downspoutTotalLF);
    calculateLine('Deck Drain', drainage.deckDrainTotalLF);
    calculateLine('French Drain', drainage.frenchDrainTotalLF);
    calculateLine('Box Drain', drainage.boxDrainTotalLF);

    return items;
  }
}

// ============================================================================
// EQUIPMENT CALCULATIONS
// ============================================================================

export class EquipmentCalculations {
  private static hasEquipmentSelection(equipment: Equipment): boolean {
    const pricedSelections = [
      equipment.pump?.price,
      equipment.auxiliaryPump?.price,
      equipment.filter?.price,
      equipment.cleaner?.price,
      equipment.heater?.price,
      equipment.automation?.price,
      equipment.saltSystem?.price,
    ];

    const accessoriesSelected =
      equipment.hasBlanketReel ||
      equipment.hasSolarBlanket ||
      equipment.hasAutoFill ||
      equipment.hasHandrail ||
      equipment.hasStartupChemicals;

    return pricedSelections.some(price => (price ?? 0) > 0) ||
      (equipment.automation?.zones ?? 0) > 0 ||
      (equipment.numberOfLights ?? 0) > 0 ||
      !!equipment.hasSpaLight ||
      accessoriesSelected ||
      !!equipment.upgradeToVersaFlo;
  }

  static calculateEquipmentCost(equipment: Equipment, poolSpecs: PoolSpecs): CostLineItem[] {
    const items: CostLineItem[] = [];
    const hasSpa = PoolCalculations.hasSpa(poolSpecs);
    const prices = pricingData.equipment;

    if (!this.hasEquipmentSelection(equipment)) {
      return items;
    }

    // Base white goods (sheet line 113)
    items.push({
      category: 'Equipment',
      description: 'Base White Goods',
      unitPrice: prices.baseWhiteGoods,
      quantity: 1,
      total: prices.baseWhiteGoods,
    });

    // Pump
    items.push({
      category: 'Equipment',
      description: equipment.pump.name,
      unitPrice: equipment.pump.price,
      quantity: 1,
      total: equipment.pump.price,
    });

    // Auxiliary pump
    if (equipment.auxiliaryPump) {
      items.push({
        category: 'Equipment',
        description: equipment.auxiliaryPump.name,
        unitPrice: equipment.auxiliaryPump.price,
        quantity: 1,
        total: equipment.auxiliaryPump.price,
      });
    }

    // Filter
    items.push({
      category: 'Equipment',
      description: equipment.filter.name,
      unitPrice: equipment.filter.price,
      quantity: 1,
      total: equipment.filter.price,
    });

    // Cleaner
    if (equipment.cleaner.price > 0) {
      items.push({
        category: 'Equipment',
        description: equipment.cleaner.name,
        unitPrice: equipment.cleaner.price,
        quantity: 1,
        total: equipment.cleaner.price,
      });
    }

    // Heater
    items.push({
      category: 'Equipment',
      description: equipment.heater.name,
      unitPrice: equipment.heater.price,
      quantity: 1,
      total: equipment.heater.price,
    });

    // VersaFlo upgrade
    if (equipment.upgradeToVersaFlo && !equipment.heater.isVersaFlo) {
      const upgrade = pricingData.equipment.heaters.find((h) => h.name.includes('VersaFlo'));
      if (upgrade) {
        items.push({
          category: 'Equipment',
          description: 'Upgrade to VersaFlo',
          unitPrice: upgrade.price - equipment.heater.price,
          quantity: 1,
          total: upgrade.price - equipment.heater.price,
        });
      }
    }

    // Lights (2 included, charge for additional)
    const lightCount = Math.max(0, equipment.numberOfLights);
    if (lightCount > 0) {
      const price = pricingData.equipment.lights.nicheLightPrice;
      items.push({
        category: 'Equipment',
        description: 'Pool Lights',
        unitPrice: price,
        quantity: lightCount,
        total: price * lightCount,
      });
    }

    // Spa light
    if (equipment.hasSpaLight && hasSpa) {
      items.push({
        category: 'Equipment',
        description: 'Spa Light',
        unitPrice: pricingData.equipment.lights.spaLightAddon,
        quantity: 1,
        total: pricingData.equipment.lights.spaLightAddon,
      });
    }

    // Automation
    items.push({
      category: 'Equipment',
      description: equipment.automation.name,
      unitPrice: equipment.automation.price,
      quantity: 1,
      total: equipment.automation.price,
    });

    // Additional automation zones
    if (equipment.automation.zones > 0) {
      items.push({
        category: 'Equipment',
        description: 'Additional Automation Zones',
        unitPrice: pricingData.equipment.automationZoneAddon,
        quantity: equipment.automation.zones,
        total: pricingData.equipment.automationZoneAddon * equipment.automation.zones,
      });
    }

    // Salt system
    if (equipment.saltSystem && equipment.saltSystem.price > 0) {
      items.push({
        category: 'Equipment',
        description: equipment.saltSystem.name,
        unitPrice: equipment.saltSystem.price,
        quantity: 1,
        total: equipment.saltSystem.price,
      });
    }

    // Accessories
    if (equipment.hasBlanketReel) {
      items.push({
        category: 'Equipment',
        description: 'Blanket Reel',
        unitPrice: pricingData.equipment.blanketReel,
        quantity: 1,
        total: pricingData.equipment.blanketReel,
      });
    }

    if (equipment.hasSolarBlanket) {
      items.push({
        category: 'Equipment',
        description: 'Solar Blanket',
        unitPrice: pricingData.equipment.solarBlanket,
        quantity: 1,
        total: pricingData.equipment.solarBlanket,
      });
    }

    if (equipment.hasAutoFill) {
      items.push({
        category: 'Equipment',
        description: 'Auto Fill',
        unitPrice: pricingData.equipment.autoFill,
        quantity: 1,
        total: pricingData.equipment.autoFill,
      });
    }

    if (equipment.hasHandrail) {
      items.push({
        category: 'Equipment',
        description: 'Handrail',
        unitPrice: pricingData.equipment.handrail,
        quantity: 1,
        total: pricingData.equipment.handrail,
      });
    }

    if (equipment.hasStartupChemicals) {
      items.push({
        category: 'Equipment',
        description: 'Startup Chemicals',
        unitPrice: pricingData.equipment.startupChemicals,
        quantity: 1,
        total: pricingData.equipment.startupChemicals,
      });
    }

    // Equipment tax (7.25% in sheet)
    const subtotal = items.reduce((sum, i) => sum + i.total, 0);
    if (subtotal > 0 && prices.taxRate) {
      items.push({
        category: 'Equipment',
        description: 'Equipment Tax',
        unitPrice: prices.taxRate,
        quantity: subtotal,
        total: subtotal * prices.taxRate,
      });
    }

    return items;
  }

  static calculateEquipmentSetCost(equipment: Equipment, poolSpecs: PoolSpecs): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.misc.equipmentSet;
    const hasSpa = PoolCalculations.hasSpa(poolSpecs);

    if (!this.hasEquipmentSelection(equipment)) {
      return items;
    }

    items.push({
      category: 'Equipment Set',
      description: 'Base Equipment Set',
      unitPrice: prices.base,
      quantity: 1,
      total: prices.base,
    });

    if (hasSpa) {
      items.push({
        category: 'Equipment Set',
        description: 'Spa Equipment Set',
        unitPrice: prices.spa,
        quantity: 1,
        total: prices.spa,
      });
    }

    if (equipment.automation.zones > 0 || equipment.automation.hasChemistry) {
      items.push({
        category: 'Equipment Set',
        description: 'Automation Set',
        unitPrice: prices.automation,
        quantity: 1,
        total: prices.automation,
      });
    }

    if (equipment.heater.name.toLowerCase().includes('heat pump')) {
      items.push({
        category: 'Equipment Set',
        description: 'Heat Pump Set',
        unitPrice: prices.heatPump,
        quantity: 1,
        total: prices.heatPump,
      });
    }

    if (equipment.auxiliaryPump) {
      items.push({
        category: 'Equipment Set',
        description: 'Additional Pump',
        unitPrice: prices.additionalPump,
        quantity: 1,
        total: prices.additionalPump,
      });
    }

    return items;
  }
}

// ============================================================================
// WATER FEATURES CALCULATIONS
// ============================================================================

export class WaterFeaturesCalculations {
  static calculateWaterFeaturesCost(waterFeatures: WaterFeatures): CostLineItem[] {
    const items: CostLineItem[] = [];
    const catalog = pricingData.waterFeatures?.catalog ?? [];
    const lookup = new Map(catalog.map((entry) => [entry.id, entry]));
    const selections = waterFeatures.selections ?? [];

    selections.forEach((selection) => {
      const feature = lookup.get(selection.featureId);
      if (!feature || selection.quantity <= 0) return;

      items.push({
        category: 'Water Features',
        description: feature.name,
        unitPrice: feature.unitPrice,
        quantity: selection.quantity,
        total: feature.unitPrice * selection.quantity,
        notes: feature.note,
      });
    });

    return items;
  }
}

// ============================================================================
// INTERIOR FINISH CALCULATIONS
// ============================================================================

export class InteriorFinishCalculations {
  static calculateInteriorFinishCost(
    poolSpecs: PoolSpecs,
    interiorFinish: InteriorFinish,
    equipment?: Equipment
  ): { labor: CostLineItem[]; material: CostLineItem[]; waterTruck: CostLineItem[] } {
    const laborItems: CostLineItem[] = [];
    const materialItems: CostLineItem[] = [];
    const waterTruckItems: CostLineItem[] = [];
    const prices = pricingData.interiorFinish;
    const isFiberglass = PoolCalculations.isFiberglassPool(poolSpecs);

    if (!hasPoolDefinition(poolSpecs)) {
      return { labor: laborItems, material: materialItems, waterTruck: waterTruckItems };
    }

    if (isFiberglass) {
      return { labor: laborItems, material: materialItems, waterTruck: waterTruckItems };
    }

    // Interior area from sheet: ((shallow+end)/2 * perimeter) + surfaceArea
    const interiorArea =
      ((poolSpecs.shallowDepth + poolSpecs.endDepth) / 2) * poolSpecs.perimeter + poolSpecs.surfaceArea;
    const chargeArea = Math.max(interiorArea, prices.minimumChargeSqft ?? 850);
    const materialRate = this.getMaterialRate(interiorFinish.finishType, prices);
    const baseCost = materialRate * chargeArea;

    // Base finish line
    laborItems.push({
      category: 'Interior Finish',
      description: `${interiorFinish.finishType} Finish`,
      unitPrice: materialRate,
      quantity: chargeArea,
      total: baseCost,
    });

    // Spa finish
    if (interiorFinish.hasSpa) {
      laborItems.push({
        category: 'Interior Finish',
        description: 'Spa Finish',
        unitPrice: prices.material.spaFinish,
        quantity: 1,
        total: prices.material.spaFinish,
      });
    }

    // Pool prep up to 1,200 + overage
    laborItems.push({
      category: 'Interior Finish',
      description: 'Pool Prep',
      unitPrice: prices.extras.poolPrepBase,
      quantity: 1,
      total: prices.extras.poolPrepBase,
    });
    const overPrepSqft = Math.max(0, chargeArea - (prices.extras.poolPrepThreshold ?? 1200));
    if (overPrepSqft > 0) {
      laborItems.push({
        category: 'Interior Finish',
        description: 'Prep Over 1,200 SQFT',
        unitPrice: prices.extras.poolPrepOverRate,
        quantity: overPrepSqft,
        total: prices.extras.poolPrepOverRate * overPrepSqft,
      });
    }

    // Spa prep
    if (interiorFinish.hasSpa) {
      laborItems.push({
        category: 'Interior Finish',
        description: 'Spa Prep',
        unitPrice: prices.extras.spaPrep,
        quantity: 1,
        total: prices.extras.spaPrep,
      });
    }

    // Misc and travel
    laborItems.push({
      category: 'Interior Finish',
      description: 'Miscellaneous',
      unitPrice: prices.extras.misc,
      quantity: 1,
      total: prices.extras.misc,
    });
    if (poolSpecs.travelDistance > 0) {
      laborItems.push({
        category: 'Interior Finish',
        description: 'Travel',
        unitPrice: prices.extras.travelPerMile,
        quantity: poolSpecs.travelDistance,
        total: prices.extras.travelPerMile * poolSpecs.travelDistance,
      });
    }

    // Step detail beyond 20
    if (poolSpecs.totalStepsAndBench > 20) {
      const extraSteps = poolSpecs.totalStepsAndBench - 20;
      laborItems.push({
        category: 'Interior Finish',
        description: 'Step & Bench Detail',
        unitPrice: prices.extras.stepDetailPerLnftOver20,
        quantity: extraSteps,
        total: prices.extras.stepDetailPerLnftOver20 * extraSteps,
      });
    }

    // Fittings (Drains, Vac, Returns, Hydro) as per INT sheet logic
    const mainPumpCount = equipment && equipment.pump && equipment.pump.price > 0 ? 1 : 0;
    const auxPumpCount = equipment && equipment.auxiliaryPump ? 1 : 0;
    const cleanerCount = equipment && equipment.cleaner && equipment.cleaner.price > 0 ? 1 : 0;
    const drains = (mainPumpCount + auxPumpCount) * 2 * 15;
    const vac = cleanerCount * 20;
    const returns = 20;
    const hydro = 60;
    const fittingsTotal = drains + vac + returns + hydro;
    if (fittingsTotal > 0) {
      laborItems.push({
        category: 'Interior Finish',
        description: 'Fittings (Drains/Vac/Returns/Hydro)',
        unitPrice: fittingsTotal,
        quantity: 1,
        total: fittingsTotal,
      });
    }

    // WATER TRUCK
    const gallons = PoolCalculations.calculateGallons(poolSpecs);
    const loadSizeGallons = prices.waterTruck.loadSizeGallons;
    if (gallons > 0) {
      const loads = Math.max(1, Math.ceil(gallons / loadSizeGallons));
      waterTruckItems.push({
        category: 'Water Truck',
        description: 'Water Truck',
        unitPrice: prices.waterTruck.base,
        quantity: loads,
        total: prices.waterTruck.base * loads,
      });
    }

    return { labor: laborItems, material: materialItems, waterTruck: waterTruckItems };
  }

  private static getMaterialRate(finishType: string, prices: any): number {
    const mapping: Record<string, number> = {
      plaster: prices.material.plaster,
      'pebble-tec': prices.material.pebbleTec,
      'pebble-sheen': prices.material.pebbleSheen,
      'pebble-fina': prices.material.pebbleFina,
      'mini-pebble': prices.material.miniPebble,
      beadcrete: prices.material.beadcrete,
      'quartz-scapes': prices.material.quartzScapes,
      hydrazzo: prices.material.hydrazzo,
      tile: prices.material.tile,
      'ivory-quartz': prices.material.ivoryQuartz,
      'pebble-tec-l1': prices.material.pebbleTecL1,
      'pebble-tec-l2': prices.material.pebbleTecL2,
      'pebble-tec-l3': prices.material.pebbleTecL3,
      'pebble-sheen-l1': prices.material.pebbleSheenL1,
      'pebble-sheen-l2': prices.material.pebbleSheenL2,
      'pebble-sheen-l3': prices.material.pebbleSheenL3,
      'pebble-fina-l1': prices.material.pebbleFinaL1,
      'pebble-fina-l2': prices.material.pebbleFinaL2,
      'pebble-brilliance': prices.material.pebbleBrilliance,
      'pebble-breeze': prices.material.pebbleBreeze,
      'pebble-essence': prices.material.pebbleEssence,
    };
    return mapping[finishType] || 0;
  }
}

// ============================================================================
// CLEANUP CALCULATIONS
// ============================================================================

export class CleanupCalculations {
  static calculateCleanupCost(
    poolSpecs: PoolSpecs,
    excavation?: Excavation,
    tileCopingDecking?: TileCopingDecking
  ): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.cleanup;
    const hasSpa = PoolCalculations.hasSpa(poolSpecs);

    if (!hasPoolDefinition(poolSpecs)) {
      return items;
    }

    items.push({
      category: 'Cleanup',
      description: 'Base Pool Cleanup',
      unitPrice: prices.basePool,
      quantity: 1,
      total: prices.basePool,
    });

    if (hasSpa) {
      items.push({
        category: 'Cleanup',
        description: 'Spa Cleanup',
        unitPrice: prices.spa,
        quantity: 1,
        total: prices.spa,
      });
    }

    if (poolSpecs.surfaceArea > 500) {
      const sqftOver = Math.max(0, poolSpecs.surfaceArea - 500);
      items.push({
        category: 'Cleanup',
        description: 'Over 500 SQFT',
        unitPrice: prices.perSqftOver500,
        quantity: sqftOver,
        total: prices.perSqftOver500 * sqftOver,
      });
    }

    if (excavation?.totalRBBSqft) {
      items.push({
        category: 'Cleanup',
        description: 'RBB Cleanup',
        unitPrice: prices.rbbPerSqft,
        quantity: excavation.totalRBBSqft,
        total: prices.rbbPerSqft * excavation.totalRBBSqft,
      });
    }

    if (poolSpecs.travelDistance > 0) {
      items.push({
        category: 'Cleanup',
        description: 'Travel',
        unitPrice: prices.travelPerMile,
        quantity: poolSpecs.travelDistance,
        total: prices.travelPerMile * poolSpecs.travelDistance,
      });
    }

    if (tileCopingDecking?.hasRoughGrading) {
      items.push({
        category: 'Cleanup',
        description: 'Rough Grading',
        unitPrice: prices.roughGrading,
        quantity: 1,
        total: prices.roughGrading,
      });
    }

    return items;
  }
}

// ============================================================================
// FIBERGLASS CALCULATIONS
// ============================================================================

export class FiberglassCalculations {
  static calculateFiberglassCost(poolSpecs: PoolSpecs): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.fiberglass;

    if (poolSpecs.poolType !== 'fiberglass') return items;

    if (!hasPoolDefinition(poolSpecs)) {
      return items;
    }

    // Pool shell
    if (poolSpecs.fiberglassModelPrice && poolSpecs.fiberglassModelName) {
      items.push({
        category: 'Fiberglass Shell',
        description: poolSpecs.fiberglassModelName,
        unitPrice: poolSpecs.fiberglassModelPrice,
        quantity: 1,
        total: poolSpecs.fiberglassModelPrice,
      });
    } else if (poolSpecs.fiberglassSize) {
      const priceKey = poolSpecs.fiberglassSize as keyof typeof prices;
      const price = prices[priceKey] as number;
      items.push({
        category: 'Fiberglass Shell',
        description: `${poolSpecs.fiberglassSize} Fiberglass Pool`,
        unitPrice: price,
        quantity: 1,
        total: price,
      });
    }

    // Fiberglass spa pricing removed - only gunite spas are supported now

    // Spillover
    if (poolSpecs.hasSpillover) {
      items.push({
        category: 'Fiberglass Shell',
        description: 'Spillover',
        unitPrice: prices.spillover,
        quantity: 1,
        total: prices.spillover,
      });
    }

    // Crane (always needed for fiberglass unless "No Crane" is selected)
    items.push({
      category: 'Fiberglass Shell',
      description: 'Crane',
      unitPrice: prices.crane,
      quantity: 1,
      total: prices.crane,
    });

    return items;
  }
}

// ============================================================================
// MASONRY CALCULATIONS
// ============================================================================

export class MasonryCalculations {
  static calculateMasonryCost(poolSpecs: PoolSpecs, excavation: Excavation): {
    labor: CostLineItem[];
    material: CostLineItem[];
  } {
    const labor: CostLineItem[] = [];
    const material: CostLineItem[] = [];
    const prices = pricingData.masonry;
    const retaining = prices.retainingWalls?.find((r: any) => r.name === excavation.retainingWallType);

    const addFacing = (description: string, sqft: number, facingKey: string, raised: boolean = false) => {
      const laborRate = raised
        ? (prices.labor.raisedSpaFacing as any)[facingKey] || 0
        : (prices.labor.rbbFacing as any)[facingKey] || 0;
      const materialRate = raised
        ? (prices.material.raisedSpaFacing as any)[facingKey] || 0
        : (prices.material.rbbFacing as any)[facingKey] || 0;
      labor.push({
        category: 'Masonry Labor',
        description,
        unitPrice: laborRate,
        quantity: sqft,
        total: laborRate * sqft,
      });
      material.push({
        category: 'Masonry Material',
        description,
        unitPrice: materialRate,
        quantity: sqft,
        total: materialRate * sqft,
      });
    };

    // Columns
    if (excavation.columns.count > 0) {
      const totalHeight = excavation.columns.count * excavation.columns.height;
      labor.push({
        category: 'Masonry Labor',
        description: 'Columns',
        unitPrice: prices.columnBase,
        quantity: totalHeight,
        total: prices.columnBase * totalHeight,
      });

      if (excavation.columns.facing !== 'none') {
        const facingKey = excavation.columns.facing.replace('-', '') as keyof typeof prices.rbbFacing;
        const perimeter = 2 * (excavation.columns.width + excavation.columns.depth);
        const totalFacing = excavation.columns.count * perimeter * excavation.columns.height;
        addFacing(`Column ${excavation.columns.facing} Facing`, totalFacing, facingKey);
      }
    }

    // RBB facing
    excavation.rbbLevels.forEach((level) => {
      if (level.length > 0 && level.facing !== 'none') {
        const facingKey = level.facing.replace('-', '') as keyof typeof prices.rbbFacing;
        const sqft = level.length * (level.height / 12);
        addFacing(`${level.height}" RBB ${level.facing} Facing`, sqft, facingKey);
      }
    });

    // Raised spa facing
    if (poolSpecs.isRaisedSpa && poolSpecs.raisedSpaFacing !== 'none') {
      const facingKey = poolSpecs.raisedSpaFacing.replace('-', '') as keyof typeof prices.raisedSpaFacing;
      const spaPerimeter = PoolCalculations.calculateSpaPerimeter(poolSpecs);
      const raisedHeight = 1.5; // 18 inches
      const sqft = spaPerimeter * raisedHeight;
      addFacing(`Raised Spa ${poolSpecs.raisedSpaFacing} Facing`, sqft, facingKey, true);
    }

    // Spillway for raised spa
    if (poolSpecs.isRaisedSpa) {
      labor.push({
        category: 'Masonry Labor',
        description: 'Spillway Labor',
        unitPrice: prices.labor.spillway,
        quantity: 1,
        total: prices.labor.spillway,
      });
      material.push({
        category: 'Masonry Material',
        description: 'Spillway Material',
        unitPrice: prices.material.spillway,
        quantity: 1,
        total: prices.material.spillway,
      });
    }

    // Retaining wall (from MASONRY sheet)
    if (retaining && (excavation.retainingWallLength ?? 0) > 0 && retaining.costPerSqft > 0) {
      const sqft = retaining.heightFt * (excavation.retainingWallLength ?? 0);
      const lnft = excavation.retainingWallLength ?? 0;
      // Cost per sqft is already uplifted in sheet; we separate labor/material evenly
      const total = retaining.costPerSqft * sqft;
      labor.push({
        category: 'Masonry Labor',
        description: `${retaining.name}`,
        unitPrice: total,
        quantity: 1,
        total,
      });
      material.push({
        category: 'Masonry Material',
        description: `${retaining.name} Material`,
        unitPrice: 0,
        quantity: lnft,
        total: 0,
      });
    }

    return { labor, material };
  }
}

// Export all calculation classes together
export const CalculationModules = {
  Pool: PoolCalculations,
  TileCopingDecking: TileCopingDeckingCalculations,
  Drainage: DrainageCalculations,
  Equipment: EquipmentCalculations,
  WaterFeatures: WaterFeaturesCalculations,
  InteriorFinish: InteriorFinishCalculations,
  Cleanup: CleanupCalculations,
  Fiberglass: FiberglassCalculations,
  Masonry: MasonryCalculations,
};
