import type { Proposal } from '../types/proposal-new';
import { contributionEqual, contributionValue } from './contributionInputs';
import { isPackageIncludedSelection } from './equipmentPackageSelections';

const catalogs: Record<string, string> = {
  pump: 'pumps', additionalPumps: 'pumps', auxiliaryPump: 'auxiliaryPumps', auxiliaryPumps: 'auxiliaryPumps',
  filter: 'filters', additionalFilters: 'filters', cleaner: 'cleaners', heater: 'heaters', additionalHeaters: 'heaters',
  heaterChiller: 'heaterChillers', automation: 'automation', saltSystem: 'saltSystem', additionalSaltSystem: 'saltSystem',
  autoFillSystem: 'autoFillSystem', sanitationAccessory: 'sanitationAccessories', poolLights: 'lights.poolLights', spaLights: 'lights.spaLights',
};
export function unavailableEquipment(proposal: Proposal, pricing: any) {
  return Object.entries(catalogs).flatMap(([field, path]) => {
    const catalog = path.split('.').reduce((value, key) => value?.[key], pricing.equipment) || [];
    const value = (proposal.equipment as any)?.[field];
    return (Array.isArray(value) ? value : value ? [value] : []).flatMap((item: any, index: number) =>
      item?.name && !/^(none|no\b)/i.test(item.name)
      && !isPackageIncludedSelection(proposal.equipment, field, item, pricing, index) && !catalog.some((entry: any) => item.id
        ? entry.id === item.id : entry.name?.trim().toLowerCase() === item.name.trim().toLowerCase())
        ? [{ field, index, item, array: Array.isArray(value) }] : []);
  });
}

export function isRetainedEquipment(item: any, current: Proposal, field: string) {
  const value = (current.equipment as any)?.[field];
  return (Array.isArray(value) ? value : value ? [value] : []).some(saved =>
    contributionEqual(contributionValue(saved), contributionValue(item)));
}

export function hasSavedEquipmentPrice(item: any) {
  return ['price', 'basePrice'].some(key => typeof item[key] === 'number' && Number.isFinite(item[key]) && item[key] >= 0);
}

// Normalization may replace unavailable items. Retain their complete saved representation
// in the calculation view; the baseline check still rejects any unexplained price drift.
export function retainUnavailableEquipment(normalized: Proposal, source: Proposal, pricing: any) {
  for (const { field, index, item, array } of unavailableEquipment(source, pricing)) {
    if (array) {
      (normalized.equipment as any)[field] ||= [];
      (normalized.equipment as any)[field][index] = structuredClone(item);
    } else (normalized.equipment as any)[field] = structuredClone(item);
  }
  return normalized;
}
