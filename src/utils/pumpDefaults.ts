import pricingData from '../services/pricingData';
import { PumpSelection } from '../types/proposal-new';
import { getEquipmentItemCost } from './equipmentCost';

export const NO_PUMP_NAME = 'No Pump (Select pump)';

const normalizeName = (value?: string | null) => (value ?? '').trim().toLowerCase();

export const isNoPumpName = (value?: string | null) => normalizeName(value).includes('no pump');

export const findNoPumpCatalogEntry = () =>
  pricingData.equipment.pumps.find((pump) => isNoPumpName(pump?.name));

export const getNoPumpSelection = (
  overheadMultiplier: number = pricingData.equipment.pumpOverheadMultiplier ?? 1
): PumpSelection => {
  const pump = findNoPumpCatalogEntry();
  if (!pump) {
    return {
      name: NO_PUMP_NAME,
      basePrice: 0,
      addCost1: 0,
      addCost2: 0,
      price: 0,
    };
  }

  return {
    name: pump.name,
    model: (pump as any).model,
    basePrice: (pump as any).basePrice,
    addCost1: (pump as any).addCost1,
    addCost2: (pump as any).addCost2,
    price: getEquipmentItemCost(pump as any, overheadMultiplier),
  };
};
