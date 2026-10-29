import type { AddOnSelection, CostLineItem, Equipment, PricingAddOn } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import { getSelectedEquipmentPackage, isFixedEquipmentPackage } from './equipmentPackages';

export type AddOnCategory = 'equipment' | 'interiorFinish';

export function equipmentAllowsAddOns(equipment: Equipment): boolean {
  const pkg = getSelectedEquipmentPackage(equipment);
  return !isFixedEquipmentPackage(pkg) || pkg?.allowAddOns !== false;
}

// Resolve financial inputs only from the loaded proposal's pinned pricing model.
// Saved selections carry identity and a display name, never editable costs.
export function selectedAddOns(category: AddOnCategory, selections?: AddOnSelection[]): PricingAddOn[] {
  const ids = new Set((selections || []).map(item => item.id));
  return (pricingData[category].addOns || []).filter(item => ids.has(item.id));
}

export function buildAddOnItems(category: AddOnCategory, selections?: AddOnSelection[]): CostLineItem[] {
  const label = category === 'equipment' ? 'Equipment' : 'Interior Finish';
  return selectedAddOns(category, selections).map(item => {
    if ([item.cost1, item.cost2].some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      throw new Error(`Invalid add-on cost: ${item.name}`);
    }
    const cost = item.cost1 + item.cost2;
    return {
      category: label,
      description: item.name,
      unitPrice: cost,
      quantity: 1,
      total: cost,
      details: { subcategory: 'Add-ons', selectionId: `addon:${item.id}`, addOnId: item.id },
    };
  });
}

export function defaultAddOns(category: AddOnCategory): AddOnSelection[] {
  return (pricingData[category].addOns || []).filter(item => item.includeByDefault)
    .map(({ id, name }) => ({ id, name }));
}
