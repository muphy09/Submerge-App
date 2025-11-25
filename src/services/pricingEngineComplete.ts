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
    if (poolSpecs.spaType === 'none' || poolSpecs.spaType === 'fiberglass') return 0;

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

      // Spa tile labor
      if (spaPerimeter > 0) {
        laborItems.push({
          category: 'Tile Labor',
          description: 'Spa Tile Labor',
          unitPrice: prices.tile.labor.level1,
          quantity: spaPerimeter,
          total: prices.tile.labor.level1 * spaPerimeter,
        });
      }

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
      if (spaPerimeter > 0) {
        materialItems.push({
          category: 'Tile Material',
          description: 'Level 1 Tile - Spa',
          unitPrice: prices.tile.material.level1,
          quantity: spaPerimeter,
          total: prices.tile.material.level1 * spaPerimeter,
        });
      }
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

      // Apply flagstone quantity multiplier (1.1) for material calculations
      const copingMaterialQty = tileCopingDecking.copingType === 'flagstone'
        ? copingLnft * prices.flagstoneQuantityMultiplier
        : copingLnft;

      materialItems.push({
        category: 'Coping Material',
        description: `${tileCopingDecking.copingType} Coping Material`,
        unitPrice: copingMaterialRate,
        quantity: copingMaterialQty,
        total: copingMaterialRate * copingMaterialQty,
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

    // Bullnose (single + double bullnose share the same Excel rate/lines)
    const bullnoseLnft = (tileCopingDecking.bullnoseLnft ?? 0) + (tileCopingDecking.doubleBullnoseLnft ?? 0);
    if (bullnoseLnft > 0) {
      laborItems.push({
        category: 'Stone & Rockwork Labor',
        description: 'Bullnose',
        unitPrice: prices.coping.bullnoseLabor ?? 8,
        quantity: bullnoseLnft,
        total: (prices.coping.bullnoseLabor ?? 8) * bullnoseLnft,
      });
      materialItems.push({
        category: 'Stone & Rockwork Material',
        description: 'Bullnose Material',
        unitPrice: prices.decking.material.bullnose ?? 0,
        quantity: bullnoseLnft,
        total: (prices.decking.material.bullnose ?? 0) * bullnoseLnft,
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
    const rockworkEntries: Array<{
      key: keyof typeof prices.decking.rockworkLabor;
      laborSqft?: number;
      materialSqft?: number;
      materialMultiplier?: number;
      label: string;
    }> = [
      {
        key: 'panelLedge',
        laborSqft: tileCopingDecking.rockworkPanelLedgeSqft,
        materialSqft: tileCopingDecking.rockworkPanelLedgeMaterialSqft,
        materialMultiplier: pricingData.tileCoping.rockworkMaterialWaste?.panelLedge ?? 1.15,
        label: 'Panel Ledge Rockwork'
      },
      { key: 'stackedStone', laborSqft: tileCopingDecking.rockworkStackedStoneSqft, materialSqft: tileCopingDecking.rockworkStackedStoneSqft, label: 'Stacked Stone Rockwork' },
      { key: 'tile', laborSqft: tileCopingDecking.rockworkTileSqft, materialSqft: tileCopingDecking.rockworkTileSqft, label: 'Tile Rockwork' },
    ];
    rockworkEntries.forEach((entry) => {
      const laborQty = entry.laborSqft ?? 0;
      const baseMaterialQty = entry.materialSqft ?? entry.laborSqft ?? 0;
      const materialQty = baseMaterialQty > 0
        ? (entry.materialSqft !== undefined
          ? baseMaterialQty
          : Math.round(baseMaterialQty * (entry.materialMultiplier ?? 1) * 100) / 100)
        : 0;
      if (!laborQty && !materialQty) return;
      const laborRate = prices.decking.rockworkLabor[entry.key] ?? 0;
      const materialRate = prices.decking.material.rockwork[entry.key] ?? 0;
      if (laborQty > 0) {
        laborItems.push({
          category: 'Stone & Rockwork Labor',
          description: entry.label,
          unitPrice: laborRate,
          quantity: laborQty,
          total: laborRate * laborQty,
        });
      }
      if (materialQty > 0) {
        materialItems.push({
          category: 'Stone & Rockwork Material',
          description: entry.label,
          unitPrice: materialRate,
          quantity: materialQty,
          total: materialRate * materialQty,
        });
      }
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

    // Material tax (split between tile, coping/decking, and rockwork materials)
    const tileMaterialSubtotal = materialItems
      .filter(i => i.category.toLowerCase().includes('tile material'))
      .reduce((sum, i) => sum + i.total, 0);
    const rockworkMaterialSubtotal = materialItems
      .filter(i => {
        const cat = i.category.toLowerCase();
        return cat.includes('rockwork material') || cat.includes('masonry material');
      })
      .reduce((sum, i) => sum + i.total, 0);
    const totalMaterialSubtotal = materialItems.reduce((sum, i) => sum + i.total, 0);
    const copingDeckMaterialSubtotal = totalMaterialSubtotal - tileMaterialSubtotal - rockworkMaterialSubtotal;

    const tileTaxRate = prices.tileMaterialTaxRate ?? prices.materialTaxRate;
    const materialTaxRate = prices.materialTaxRate;

    if (tileMaterialSubtotal > 0) {
      materialItems.push({
        category: 'Tile Material',
        description: 'Tile Materials Tax',
        unitPrice: tileTaxRate,
        quantity: tileMaterialSubtotal,
        total: tileMaterialSubtotal * tileTaxRate,
      });
    }

    if (copingDeckMaterialSubtotal > 0) {
      materialItems.push({
        category: 'Coping Material',
        description: 'Coping/Decking Material Tax',
        unitPrice: materialTaxRate,
        quantity: copingDeckMaterialSubtotal,
        total: copingDeckMaterialSubtotal * materialTaxRate,
      });
    }

    if (rockworkMaterialSubtotal > 0) {
      materialItems.push({
        category: 'Stone & Rockwork Material',
        description: 'Stone & Rockwork Material Tax',
        unitPrice: materialTaxRate,
        quantity: rockworkMaterialSubtotal,
        total: rockworkMaterialSubtotal * materialTaxRate,
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
    const auxiliaryPrices = (equipment.auxiliaryPumps && equipment.auxiliaryPumps.length > 0
      ? equipment.auxiliaryPumps
      : equipment.auxiliaryPump
        ? [equipment.auxiliaryPump]
        : []
    ).map(p => p?.price ?? 0);
    const filterQty = Math.max(equipment.filterQuantity ?? 0, 0);
    const heaterQty = Math.max(equipment.heaterQuantity ?? 0, 0);
    const automationQty = Math.max(equipment.automationQuantity ?? 0, 0);
    const cleanerQty = Math.max(equipment.cleanerQuantity ?? 0, 0);

    const pricedSelections = [
      equipment.pump?.price,
      ...auxiliaryPrices,
      filterQty > 0 ? equipment.filter?.price : 0,
      cleanerQty > 0 ? equipment.cleaner?.price : 0,
      heaterQty > 0 ? equipment.heater?.price : 0,
      automationQty > 0 ? equipment.automation?.price : 0,
      equipment.saltSystem?.price,
    ];

    const accessoriesSelected =
      equipment.hasBlanketReel ||
      equipment.hasSolarBlanket ||
      equipment.hasAutoFill ||
      equipment.hasHandrail ||
      equipment.hasStartupChemicals;

    return pricedSelections.some(price => (price ?? 0) > 0) ||
      filterQty > 0 ||
      heaterQty > 0 ||
      automationQty > 0 ||
      cleanerQty > 0 ||
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
    const auxiliaryPumps =
      equipment.auxiliaryPumps && equipment.auxiliaryPumps.length > 0
        ? equipment.auxiliaryPumps
        : equipment.auxiliaryPump
          ? [equipment.auxiliaryPump]
          : [];
    const filterQty = Math.max(equipment.filterQuantity ?? 0, 0);
    const heaterQty = Math.max(equipment.heaterQuantity ?? 0, 0);
    const automationQty = Math.max(equipment.automationQuantity ?? 0, 0);

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

    // Auxiliary pumps
    auxiliaryPumps.forEach((pump, idx) => {
      items.push({
        category: 'Equipment',
        description: pump.name || `Auxiliary Pump ${idx + 1}`,
        unitPrice: pump.price,
        quantity: 1,
        total: pump.price,
      });
    });

    // Filter
    if (filterQty > 0) {
      items.push({
        category: 'Equipment',
        description: equipment.filter.name,
        unitPrice: equipment.filter.price,
        quantity: filterQty,
        total: equipment.filter.price * filterQty,
      });
    }

    // Cleaner
    const cleanerQuantity = Math.max(equipment.cleanerQuantity ?? 0, 0);
    if (equipment.cleaner.price > 0 && cleanerQuantity > 0) {
      items.push({
        category: 'Equipment',
        description: equipment.cleaner.name,
        unitPrice: equipment.cleaner.price,
        quantity: cleanerQuantity,
        total: equipment.cleaner.price * cleanerQuantity,
      });
    }

    // Heater
    if (heaterQty > 0) {
      items.push({
        category: 'Equipment',
        description: equipment.heater.name,
        unitPrice: equipment.heater.price,
        quantity: heaterQty,
        total: equipment.heater.price * heaterQty,
      });
    }

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
    if (automationQty > 0) {
      items.push({
        category: 'Equipment',
        description: equipment.automation.name,
        unitPrice: equipment.automation.price,
        quantity: automationQty,
        total: equipment.automation.price * automationQty,
      });
    }

    // Additional automation zones
    if (automationQty > 0 && equipment.automation.zones > 0) {
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

    // Equipment tax (7.25% in sheet) - shown as separate line item
    const subtotal = items.reduce((sum, i) => sum + i.total, 0);
    if (subtotal > 0 && prices.taxRate) {
      const taxAmount = Math.round(subtotal * prices.taxRate * 100) / 100; // match Excel cent rounding
      items.push({
        category: 'Equipment',
        description: 'Equipment Tax',
        unitPrice: prices.taxRate,
        quantity: subtotal,
        total: taxAmount,
      });
    }

    return items;
  }

  static calculateEquipmentSetCost(equipment: Equipment, _poolSpecs: PoolSpecs): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.misc.equipmentSet;

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

    // Heater set (for all heaters) - Excel PLUM!Row43: $200
    if (equipment.heater && equipment.heater.price > 0) {
      const isHeatPump = equipment.heater.name.toLowerCase().includes('heat pump');
      items.push({
        category: 'Equipment Set',
        description: isHeatPump ? 'Heat Pump Set' : 'Heater',
        unitPrice: isHeatPump ? prices.heatPump : 200,
        quantity: 1,
        total: isHeatPump ? prices.heatPump : 200,
      });
    }

    // Pool bonding - Excel PLUM!Row44: $125 × 1 = $125
    items.push({
      category: 'Equipment Set',
      description: 'Pool Bonding',
      unitPrice: 125,
      quantity: 1,
      total: 125,
    });

    const auxiliaryPumpCount =
      equipment?.auxiliaryPumps && equipment.auxiliaryPumps.length > 0
        ? equipment.auxiliaryPumps.length
        : equipment?.auxiliaryPump
          ? 1
          : 0;

    if (auxiliaryPumpCount > 0) {
      items.push({
        category: 'Equipment Set',
        description: 'Additional Pump',
        unitPrice: prices.additionalPump,
        quantity: auxiliaryPumpCount,
        total: prices.additionalPump * auxiliaryPumpCount,
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
    const isGuniteSpa = poolSpecs.spaType === 'gunite';

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
    const baseCost = Math.ceil(materialRate * chargeArea); // Excel uses ROUNDUP with 0 decimals (COST-NEW!D285)

    // Base finish line
    laborItems.push({
      category: 'Interior Finish',
      description: `${interiorFinish.finishType} Finish`,
      unitPrice: materialRate,
      quantity: chargeArea,
      total: baseCost,
    });

    // Spa finish
    if (isGuniteSpa && interiorFinish.hasSpa) {
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

    if (isGuniteSpa && interiorFinish.hasSpa) {
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

    // Waterproofing (if applicable)
    if (interiorFinish.hasWaterproofing && poolSpecs.poolType === 'gunite') {
      const waterproofRate = prices.extras.waterproofingPerSqft ?? 0;
      const spaPerimeter = isGuniteSpa ? (poolSpecs.spaPerimeter || PoolCalculations.calculateSpaPerimeter(poolSpecs)) : 0;
      const spaWaterproofSqft = spaPerimeter * 3.45; // matches INT sheet values (28 lnft -> 96.6 sqft)
      const waterproofQty = interiorArea + spaWaterproofSqft;
      laborItems.push({
        category: 'Interior Finish',
        description: 'Waterproofing',
        unitPrice: waterproofRate,
        quantity: waterproofQty,
        total: waterproofRate * waterproofQty,
      });
      if (isGuniteSpa && poolSpecs.isRaisedSpa) {
        const raisedSpaWaterproof = prices.extras.waterproofingRaisedSpa ?? 0;
        laborItems.push({
          category: 'Interior Finish',
          description: 'Waterproofing - Raised Spa',
          unitPrice: raisedSpaWaterproof,
          quantity: 1,
          total: raisedSpaWaterproof,
        });
      }
    }

    // Fittings (Drains, Vac, Returns, Hydro) as per INT sheet logic
    const mainPumpCount = equipment && equipment.pump && equipment.pump.price > 0 ? 1 : 0;
    const auxPumpCount = (
      equipment?.auxiliaryPumps && equipment.auxiliaryPumps.length > 0
        ? equipment.auxiliaryPumps
        : equipment?.auxiliaryPump
          ? [equipment.auxiliaryPump]
          : []
    ).filter(p => p && p.price > 0).length;
    const drains = (mainPumpCount + auxPumpCount) * 2 * 15;
    const vac = 0; // Excel INT sheet shows fittings total $110 (drains/returns/hydro only)
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

    const poolIsFiberglass = poolSpecs.poolType === 'fiberglass';
    const spaIsFiberglass = poolSpecs.spaType === 'fiberglass';

    if (!poolIsFiberglass && !spaIsFiberglass) return items;

    if (!hasPoolDefinition(poolSpecs)) {
      return items;
    }

    // Pool shell
    if (poolIsFiberglass) {
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
    }

    // Fiberglass spa shell
    if (spaIsFiberglass) {
      const spaModel = pricingData.fiberglass.spaModels.find(m => m.name === poolSpecs.spaFiberglassModelName);
      const spaPrice = poolSpecs.spaFiberglassModelPrice ?? spaModel?.price ?? 0;
      if (spaPrice > 0 && poolSpecs.spaFiberglassModelName) {
        items.push({
          category: 'Fiberglass Shell',
          description: `Fiberglass Spa - ${poolSpecs.spaFiberglassModelName}`,
          unitPrice: spaPrice,
          quantity: 1,
          total: spaPrice,
        });
      }
    }

    // Spillover (when selected)
    if (poolSpecs.hasSpillover && (poolIsFiberglass || spaIsFiberglass)) {
      items.push({
        category: 'Fiberglass Shell',
        description: 'Spillover',
        unitPrice: prices.spillover,
        quantity: 1,
        total: prices.spillover,
      });
    }

    // Discount (10% off shell costs only) - Excel Row 1165
    // Calculate selective sum of shell costs (pool shell + spa shell + spillover)
    let shellCostsTotal = 0;
    items.forEach((item) => {
      // Include only actual shell items, not freight, surcharge, crane
      if (item.description.toLowerCase().includes('fiberglass pool') ||
          item.description.toLowerCase().includes('fiberglass spa') ||
          item.description.toLowerCase().includes('spillover')) {
        shellCostsTotal += item.total;
      }
    });

    if (shellCostsTotal > 0) {
      const discount = shellCostsTotal * prices.discountRate;
      items.push({
        category: 'Fiberglass Shell',
        description: 'Discount',
        unitPrice: -discount,
        quantity: 1,
        total: -discount,
      });
    }

    // Tax (7.25% on total) - Excel Row 1168
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    if (subtotal > 0) {
      items.push({
        category: 'Fiberglass Shell',
        description: 'Tax',
        unitPrice: prices.taxRate,
        quantity: subtotal,
        total: subtotal * prices.taxRate,
      });
    }

    return items;
  }

  static calculateFiberglassInstallCost(poolSpecs: PoolSpecs): CostLineItem[] {
    const items: CostLineItem[] = [];
    const prices = pricingData.fiberglass;

    const poolIsFiberglass = poolSpecs.poolType === 'fiberglass';
    const spaIsFiberglass = poolSpecs.spaType === 'fiberglass';
    const hasAnyFiberglass = poolIsFiberglass || spaIsFiberglass;
    if (!hasAnyFiberglass) {
      return items;
    }

    // Determine selected size from model/size selection
    const selectedSize: string | undefined =
      poolSpecs.fiberglassSize ||
      pricingData.fiberglass.models.find(m => m.name === poolSpecs.fiberglassModelName)?.size;

    const isSmall = selectedSize === 'small';
    const isMedium = selectedSize === 'medium';
    const isLarge = selectedSize === 'large';

    // Freight (per shell) - size-based
    if (poolIsFiberglass) {
      if (isSmall) {
        items.push({ category: 'Fiberglass Install', description: 'Freight - Small', unitPrice: 950, quantity: 1, total: 950 });
      } else if (isMedium) {
        items.push({ category: 'Fiberglass Install', description: 'Freight - Medium', unitPrice: 1100, quantity: 1, total: 1100 });
      } else if (isLarge) {
        items.push({ category: 'Fiberglass Install', description: 'Freight - Large', unitPrice: 1200, quantity: 1, total: 1200 });
      }
    }

    // Surcharge (per shell) - currently 0 in sheet
    if (poolIsFiberglass && prices.surcharge2022 > 0) {
      items.push({
        category: 'Fiberglass Install',
        description: '2023 Surcharge',
        unitPrice: prices.surcharge2022,
        quantity: 1,
        total: prices.surcharge2022,
      });
    }

    // Crane selection
    const craneOption = poolSpecs.fiberglassCraneOption || 'no-crane';
    const addCrane = (label: string, cost: number, qty: number = 1) => {
      if (qty <= 0) return;
      items.push({
        category: 'Fiberglass Install',
        description: label,
        unitPrice: cost,
        quantity: qty,
        total: cost * qty,
      });
    };

    if (craneOption === 'no-crane') {
      addCrane('No Crane', prices.noCrane ?? 150);
    } else if (craneOption === 'crane-small') {
      addCrane('Crane - Small', 550);
    } else if (craneOption === 'crane-medium') {
      addCrane('Crane - Medium', 2000);
    } else if (craneOption === 'crane-large') {
      addCrane('Crane - Large', 2600);
    }

    // Spa-specific crane (FIBER!70) when a fiberglass spa is selected
    if (spaIsFiberglass) {
      addCrane('Crane - Spa', 150);
    }

    // Install labor (pool) - size based
    if (poolIsFiberglass) {
      if (isSmall) addCrane('Install - Small', 9000);
      if (isMedium) addCrane('Install - Medium', 9000);
      if (isLarge) addCrane('Install - Large', 9000);
    }

    // Install labor (spa)
    if (spaIsFiberglass) {
      addCrane('Install - Spa', 2600);
    }

    // Gravel (pool)
    if (poolIsFiberglass) {
      if (isSmall) addCrane('Gravel - Small', 1900);
      if (isMedium) addCrane('Gravel - Medium', 2650);
      if (isLarge) addCrane('Gravel - Large', 3110);
    }

    // Water (pool)
    if (poolIsFiberglass) {
      if (isSmall) addCrane('Water - Small', 980);
      if (isMedium) addCrane('Water - Medium', 1470);
      if (isLarge) addCrane('Water - Large', 1470);
    }

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

    const addFacing = (description: string, sqft: number, facingKey: string, raised: boolean = false, materialQtyOverride?: number) => {
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
        quantity: materialQtyOverride ?? sqft,
        total: materialRate * (materialQtyOverride ?? sqft),
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
      const spaPerimeter = poolSpecs.spaPerimeter || PoolCalculations.calculateSpaPerimeter(poolSpecs);
      const raisedHeight = 1.5; // 18 inches
      const wasteFactor = prices.raisedSpaWasteMultiplier ?? 1;
      const materialWaste = prices.raisedSpaMaterialWaste ?? 1;
      const laborSqft = Math.round(spaPerimeter * raisedHeight * wasteFactor);
      const materialSqft = Math.round(laborSqft * materialWaste * 100) / 100;
      addFacing(`Raised Spa ${poolSpecs.raisedSpaFacing} Facing`, laborSqft, facingKey, true, materialSqft);
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
