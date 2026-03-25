import pricingData from '../services/pricingData';
import { AutomationSelection, SaltSystemSelection } from '../types/proposal-new';

export const INCLUDED_SALT_CELL_OPTION_NAME = 'Salt System with Automation';
const LEGACY_INCLUDED_SALT_CELL_OPTION_NAME = 'Salt Cell Included with Automation System';

const normalizeName = (value?: string | null) => (value ?? '').trim().toLowerCase();

export const isNoSaltSystemName = (name?: string | null) => normalizeName(name).includes('no salt');

export const isIncludedSaltCellOptionName = (name?: string | null) => {
  const normalized = normalizeName(name);
  return (
    normalized === normalizeName(INCLUDED_SALT_CELL_OPTION_NAME) ||
    normalized === normalizeName(LEGACY_INCLUDED_SALT_CELL_OPTION_NAME)
  );
};

export const isIncludedSaltCellSelection = (selection?: Partial<SaltSystemSelection> | null) =>
  Boolean(selection?.includedSaltCellPlaceholder) || isIncludedSaltCellOptionName(selection?.name);

export const isRealSaltSystemSelection = (selection?: Partial<SaltSystemSelection> | null) =>
  Boolean(selection?.name) &&
  !isNoSaltSystemName(selection?.name) &&
  !isIncludedSaltCellSelection(selection);

export const automationIncludesSaltCell = (automation?: Partial<AutomationSelection> | null) => {
  if (typeof automation?.includesSaltCell === 'boolean') {
    return automation.includesSaltCell;
  }

  const match = (pricingData.equipment.automation || []).find(
    (entry: any) => normalizeName(entry?.name) === normalizeName(automation?.name)
  );

  return Boolean((match as any)?.includesSaltCell);
};

export const isExcludedFromSaltCell = (system?: Partial<SaltSystemSelection> | null) => {
  if (typeof system?.excludedFromSaltCell === 'boolean') {
    return system.excludedFromSaltCell;
  }

  const match = (pricingData.equipment.saltSystem || []).find(
    (entry: any) => normalizeName(entry?.name) === normalizeName(system?.name)
  );

  return Boolean((match as any)?.excludedFromSaltCell);
};

export const buildIncludedSaltCellOption = (): SaltSystemSelection => ({
  name: INCLUDED_SALT_CELL_OPTION_NAME,
  model: 'IncludedSaltCell',
  basePrice: 0,
  addCost1: 0,
  addCost2: 0,
  price: 0,
  excludedFromSaltCell: false,
  includedSaltCellPlaceholder: true,
});
