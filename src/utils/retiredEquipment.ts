import pricingData from '../services/pricingData';
import { Equipment } from '../types/proposal-new';

type NamedItem = { name?: string | null };

export const RETIRED_EQUIPMENT_TOOLTIP = 'Retired Equipment. Please select another.';

const normalizeName = (value?: string | null) => (value ?? '').trim().toLowerCase();

const hasNameInList = (list: NamedItem[] | undefined, name?: string | null): boolean => {
  const target = normalizeName(name);
  if (!target) return false;
  return (list ?? []).some((item) => normalizeName(item?.name) === target);
};

const isRetiredName = (name: string | undefined, list: NamedItem[] | undefined): boolean => {
  const target = normalizeName(name);
  if (!target || target === 'none') return false;
  return !hasNameInList(list, name);
};

const hasRealSelection = (name: string | undefined, placeholder: string): boolean => {
  const target = normalizeName(name);
  return Boolean(target) && !target.includes(placeholder);
};

export type RetiredEquipmentFlags = {
  pump: boolean;
  auxiliaryPumps: boolean[];
  filter: boolean;
  cleaner: boolean;
  heater: boolean;
  automation: boolean;
  saltSystem: boolean;
  autoFillSystem: boolean;
  poolLights: boolean[];
  spaLights: boolean[];
  any: boolean;
};

export const getRetiredEquipmentFlags = (equipment?: Equipment): RetiredEquipmentFlags => {
  if (!equipment) {
    return {
      pump: false,
      auxiliaryPumps: [],
      filter: false,
      cleaner: false,
      heater: false,
      automation: false,
      saltSystem: false,
      autoFillSystem: false,
      poolLights: [],
      spaLights: [],
      any: false,
    };
  }

  const pumpSelected = hasRealSelection(equipment.pump?.name, 'no pump');
  const filterSelected = hasRealSelection(equipment.filter?.name, 'no filter');
  const cleanerSelected = hasRealSelection(equipment.cleaner?.name, 'no cleaner');
  const heaterSelected = hasRealSelection(equipment.heater?.name, 'no heater');
  const automationSelected =
    hasRealSelection(equipment.automation?.name, 'no automation') ||
    (equipment.automationQuantity ?? 0) > 0 ||
    (equipment.automation?.zones ?? 0) > 0;
  const saltSelected = hasRealSelection(equipment.saltSystem?.name, 'no salt');
  const autoFillSelected = hasRealSelection(equipment.autoFillSystem?.name, 'no auto');

  const pump = pumpSelected && isRetiredName(equipment.pump?.name, pricingData.equipment.pumps);
  const auxiliarySelections = equipment.auxiliaryPumps?.length
    ? equipment.auxiliaryPumps
    : equipment.auxiliaryPump
    ? [equipment.auxiliaryPump]
    : [];
  const auxiliaryCatalog =
    (pricingData as any).equipment?.auxiliaryPumps || pricingData.equipment.pumps;
  const auxiliaryPumps = auxiliarySelections.map((item) =>
    isRetiredName(item?.name, auxiliaryCatalog)
  );
  const filter = filterSelected && isRetiredName(equipment.filter?.name, pricingData.equipment.filters);
  const cleaner = cleanerSelected && isRetiredName(equipment.cleaner?.name, pricingData.equipment.cleaners);
  const heater = heaterSelected && isRetiredName(equipment.heater?.name, pricingData.equipment.heaters);
  const automation = automationSelected && isRetiredName(equipment.automation?.name, pricingData.equipment.automation);
  const saltSystem = saltSelected && isRetiredName(equipment.saltSystem?.name, pricingData.equipment.saltSystem);
  const autoFillSystem =
    autoFillSelected && isRetiredName(equipment.autoFillSystem?.name, pricingData.equipment.autoFillSystem);
  const poolLights = (equipment.poolLights ?? []).map((light) =>
    isRetiredName(light?.name, pricingData.equipment.lights.poolLights)
  );
  const spaLights = (equipment.spaLights ?? []).map((light) =>
    isRetiredName(light?.name, pricingData.equipment.lights.spaLights)
  );

  const any =
    pump ||
    filter ||
    cleaner ||
    heater ||
    automation ||
    saltSystem ||
    autoFillSystem ||
    auxiliaryPumps.some(Boolean) ||
    poolLights.some(Boolean) ||
    spaLights.some(Boolean);

  return {
    pump,
    auxiliaryPumps,
    filter,
    cleaner,
    heater,
    automation,
    saltSystem,
    autoFillSystem,
    poolLights,
    spaLights,
    any,
  };
};

export const hasRetiredEquipment = (equipment?: Equipment): boolean =>
  getRetiredEquipmentFlags(equipment).any;
