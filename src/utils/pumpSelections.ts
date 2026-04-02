import { Equipment, PumpSelection } from '../types/proposal-new';
import { getSelectedEquipmentPackage, isFixedEquipmentPackage } from './equipmentPackages';

const normalizeName = (value?: string | null) => (value ?? '').trim().toLowerCase();

export const hasRealPumpSelection = (pump?: Partial<PumpSelection> | null) => {
  const name = normalizeName(pump?.name);
  return Boolean(name) && !name.includes('no pump');
};

export const getBasePumpQuantity = (equipment?: Partial<Equipment> | null) => {
  if (!hasRealPumpSelection(equipment?.pump)) return 0;
  const selectedPackage = getSelectedEquipmentPackage(equipment as Partial<Equipment>);
  if (selectedPackage && isFixedEquipmentPackage(selectedPackage)) {
    return Math.max(selectedPackage.includedPumpQuantity ?? 0, 0);
  }
  return 1;
};

export const getExplicitAdditionalPumps = (equipment?: Partial<Equipment> | null): PumpSelection[] =>
  Array.isArray(equipment?.additionalPumps) ? equipment!.additionalPumps!.filter(Boolean) : [];

export const getLegacyAdditionalPumpCount = (equipment?: Partial<Equipment> | null) => {
  const totalQty = Math.max(
    equipment?.pumpQuantity ?? (hasRealPumpSelection(equipment?.pump) ? 1 : 0),
    0
  );
  return Math.max(totalQty - getBasePumpQuantity(equipment), 0);
};

export const getAdditionalPumpSelections = (equipment?: Partial<Equipment> | null): PumpSelection[] => {
  const explicit = getExplicitAdditionalPumps(equipment);
  if (explicit.length > 0) return explicit;

  const legacyCount = getLegacyAdditionalPumpCount(equipment);
  if (legacyCount <= 0 || !hasRealPumpSelection(equipment?.pump)) return [];

  const basePump = equipment?.pump as PumpSelection | undefined;
  if (!basePump) return [];

  return Array.from({ length: legacyCount }, () => ({ ...basePump }));
};
