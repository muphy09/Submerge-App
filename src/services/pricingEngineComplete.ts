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

    // TILE LABOR
    if (!isFiberglass) {
      const tileLevel = tileCopingDecking.tileLevel;
      const perimeter = poolSpecs.perimeter + tileCopingDecking.additionalTileLength;

      const laborRate =
        tileLevel === 1
          ? prices.tile.labor.level1
          : tileLevel === 2
          ? prices.tile.labor.level2
          : prices.tile.labor.level3;

      laborItems.push({
        category: 'Tile Labor',
        description: `Level ${tileLevel} Tile Labor`,
        unitPrice: laborRate,
        quantity: perimeter,
        total: laborRate * perimeter,
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

    // TILE MATERIAL
    if (!isFiberglass && tileCopingDecking.tileLevel > 1) {
      const perimeter = poolSpecs.perimeter + tileCopingDecking.additionalTileLength;
      const upgrade =
        tileCopingDecking.tileLevel === 2
          ? prices.tile.material.level2Upgrade
          : prices.tile.material.level3Upgrade;

      materialItems.push({
        category: 'Tile Material',
        description: `Level ${tileCopingDecking.tileLevel} Tile Upgrade`,
        unitPrice: upgrade,
        quantity: perimeter,
        total: upgrade * perimeter,
      });
    }

    // COPING LABOR & MATERIAL
    const copingRate = this.getCopingRate(tileCopingDecking.copingType, prices);
    if (copingRate > 0) {
      laborItems.push({
        category: 'Coping Labor',
        description: `${tileCopingDecking.copingType} Coping`,
        unitPrice: copingRate,
        quantity: tileCopingDecking.copingLength,
        total: copingRate * tileCopingDecking.copingLength,
      });
    }

    // DECKING LABOR
    const deckingLaborRate = this.getDeckingLaborRate(tileCopingDecking.deckingType, prices);
    if (deckingLaborRate > 0) {
      laborItems.push({
        category: 'Decking Labor',
        description: `${tileCopingDecking.deckingType} Decking Labor`,
        unitPrice: deckingLaborRate,
        quantity: tileCopingDecking.deckingArea,
        total: deckingLaborRate * tileCopingDecking.deckingArea,
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
        quantity: tileCopingDecking.deckingArea,
        total: deckingMaterialRate * tileCopingDecking.deckingArea,
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

    if (drainage.downspoutTotalLF > 0) {
      items.push({
        category: 'Drainage',
        description: 'Downspout Drain',
        unitPrice: prices.downspoutPerFt,
        quantity: drainage.downspoutTotalLF,
        total: prices.downspoutPerFt * drainage.downspoutTotalLF,
      });
    }

    if (drainage.deckDrainTotalLF > 0) {
      items.push({
        category: 'Drainage',
        description: 'Deck Drain',
        unitPrice: prices.deckDrainPerFt,
        quantity: drainage.deckDrainTotalLF,
        total: prices.deckDrainPerFt * drainage.deckDrainTotalLF,
      });
    }

    if (drainage.frenchDrainTotalLF > 0) {
      items.push({
        category: 'Drainage',
        description: 'French Drain',
        unitPrice: prices.frenchDrainPerFt,
        quantity: drainage.frenchDrainTotalLF,
        total: prices.frenchDrainPerFt * drainage.frenchDrainTotalLF,
      });
    }

    if (drainage.boxDrainTotalLF > 0) {
      items.push({
        category: 'Drainage',
        description: 'Box Drain',
        unitPrice: prices.boxDrainPerFt,
        quantity: drainage.boxDrainTotalLF,
        total: prices.boxDrainPerFt * drainage.boxDrainTotalLF,
      });
    }

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

    // Base white goods
    if (prices.baseWhiteGoods) {
      items.push({
        category: 'Equipment',
        description: 'Base White Goods',
        unitPrice: prices.baseWhiteGoods,
        quantity: 1,
        total: prices.baseWhiteGoods,
      });
    }

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
    interiorFinish: InteriorFinish
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
      // Fiberglass pools don't need interior finish
      return { labor: laborItems, material: materialItems, waterTruck: waterTruckItems };
    }

    // LABOR
    const laborRates = this.getLaborRates(interiorFinish.finishType, prices);
    laborItems.push({
      category: 'Interior Finish Labor',
      description: `${interiorFinish.finishType} Base`,
      unitPrice: laborRates.base,
      quantity: interiorFinish.surfaceArea,
      total: laborRates.base * interiorFinish.surfaceArea,
    });

    // Over 500 SQFT
    if (interiorFinish.surfaceArea > 500 && laborRates.per100Over500 > 0) {
      const hundredsOver = Math.floor((interiorFinish.surfaceArea - 500) / 100);
      laborItems.push({
        category: 'Interior Finish Labor',
        description: `Over 500 SQFT`,
        unitPrice: laborRates.per100Over500,
        quantity: hundredsOver,
        total: laborRates.per100Over500 * hundredsOver,
      });
    }

    // Spa
    if (interiorFinish.hasSpa) {
      laborItems.push({
        category: 'Interior Finish Labor',
        description: 'Spa Finish',
        unitPrice: prices.labor.spa,
        quantity: 1,
        total: prices.labor.spa,
      });
    }

    // MATERIAL
    const materialRate = this.getMaterialRate(interiorFinish.finishType, prices);
    materialItems.push({
      category: 'Interior Finish Material',
      description: `${interiorFinish.finishType} Material`,
      unitPrice: materialRate,
      quantity: interiorFinish.surfaceArea,
      total: materialRate * interiorFinish.surfaceArea,
    });

    // Spa material
    if (interiorFinish.hasSpa) {
      materialItems.push({
        category: 'Interior Finish Material',
        description: 'Spa Finish Material',
        unitPrice: prices.material.spaFinish,
        quantity: 1,
        total: prices.material.spaFinish,
      });
    }

    // WATER TRUCK
    const gallons = PoolCalculations.calculateGallons(poolSpecs);
    const loadSizeGallons = 7000;
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

  private static getLaborRates(
    finishType: string,
    prices: any
  ): { base: number; per100Over500: number } {
    const mapping: Record<string, { base: number; per100Over500: number }> = {
      plaster: { base: prices.labor.plasterBase, per100Over500: prices.labor.plasterPer100SqftOver500 },
      'pebble-tec': { base: prices.labor.pebbleBase, per100Over500: prices.labor.pebblePer100SqftOver500 },
      'pebble-sheen': { base: prices.labor.pebbleBase, per100Over500: prices.labor.pebblePer100SqftOver500 },
      'pebble-fina': { base: prices.labor.pebbleBase, per100Over500: prices.labor.pebblePer100SqftOver500 },
      'mini-pebble': { base: prices.labor.pebbleBase, per100Over500: prices.labor.pebblePer100SqftOver500 },
      beadcrete: { base: prices.labor.pebbleBase, per100Over500: prices.labor.pebblePer100SqftOver500 },
      'quartz-scapes': { base: prices.labor.quartzBase, per100Over500: prices.labor.quartzPer100SqftOver500 },
      hydrazzo: { base: prices.labor.polishedBase, per100Over500: prices.labor.polishedPer100SqftOver500 },
      tile: { base: prices.labor.tileBase, per100Over500: prices.labor.tilePer100SqftOver500 },
      'ivory-quartz': { base: 0, per100Over500: 0 },
      'pebble-tec-l1': { base: 0, per100Over500: 0 },
      'pebble-tec-l2': { base: 0, per100Over500: 0 },
      'pebble-tec-l3': { base: 0, per100Over500: 0 },
      'pebble-sheen-l1': { base: 0, per100Over500: 0 },
      'pebble-sheen-l2': { base: 0, per100Over500: 0 },
      'pebble-sheen-l3': { base: 0, per100Over500: 0 },
      'pebble-fina-l1': { base: 0, per100Over500: 0 },
      'pebble-fina-l2': { base: 0, per100Over500: 0 },
      'pebble-brilliance': { base: 0, per100Over500: 0 },
      'pebble-breeze': { base: 0, per100Over500: 0 },
      'pebble-essence': { base: 0, per100Over500: 0 },
    };
    return mapping[finishType] || { base: 0, per100Over500: 0 };
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
  static calculateCleanupCost(poolSpecs: PoolSpecs): CostLineItem[] {
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
        unitPrice: prices.per100SqftOver500,
        quantity: sqftOver,
        total: prices.per100SqftOver500 * sqftOver,
      });
    }

    // Dump runs (estimate based on project size)
    const dumpRuns = Math.ceil(poolSpecs.surfaceArea / 200);
    items.push({
      category: 'Cleanup',
      description: 'Dump Runs',
      unitPrice: prices.dumpRuns,
      quantity: dumpRuns,
      total: prices.dumpRuns * dumpRuns,
    });

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
  static calculateMasonryCost(poolSpecs: PoolSpecs, excavation: Excavation): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.masonry;

    // Columns
    if (excavation.columns.count > 0) {
      const totalHeight = excavation.columns.count * excavation.columns.height;
      items.push({
        category: 'Masonry',
        description: 'Columns',
        unitPrice: prices.columnBase,
        quantity: totalHeight,
        total: prices.columnBase * totalHeight,
      });

      // Column facing
      if (excavation.columns.facing !== 'none') {
        const facingKey = excavation.columns.facing.replace('-', '') as keyof typeof prices.rbbFacing;
        const facingPrice = prices.rbbFacing[facingKey] || 0;
        const perimeter = 2 * (excavation.columns.width + excavation.columns.depth);
        const totalFacing = excavation.columns.count * perimeter * excavation.columns.height;
        items.push({
          category: 'Masonry',
          description: `Column ${excavation.columns.facing} Facing`,
          unitPrice: facingPrice,
          quantity: totalFacing,
          total: facingPrice * totalFacing,
        });
      }
    }

    // RBB facing
    excavation.rbbLevels.forEach((level) => {
      if (level.length > 0 && level.facing !== 'none') {
        const facingKey = level.facing.replace('-', '') as keyof typeof prices.rbbFacing;
        const facingPrice = prices.rbbFacing[facingKey] || 0;
        const sqft = level.length * (level.height / 12);
        items.push({
          category: 'Masonry',
          description: `${level.height}" RBB ${level.facing} Facing`,
          unitPrice: facingPrice,
          quantity: sqft,
          total: facingPrice * sqft,
        });
      }
    });

    // Raised spa facing
    if (poolSpecs.isRaisedSpa && poolSpecs.raisedSpaFacing !== 'none') {
      const facingKey = poolSpecs.raisedSpaFacing.replace('-', '') as keyof typeof prices.raisedSpaFacing;
      const facingPrice = prices.raisedSpaFacing[facingKey] || 0;
      const spaPerimeter = PoolCalculations.calculateSpaPerimeter(poolSpecs);
      const raisedHeight = 1.5; // 18 inches = 1.5 ft
      const sqft = spaPerimeter * raisedHeight;
      items.push({
        category: 'Masonry',
        description: `Raised Spa ${poolSpecs.raisedSpaFacing} Facing`,
        unitPrice: facingPrice,
        quantity: sqft,
        total: facingPrice * sqft,
      });
    }

    return items;
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
