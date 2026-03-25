import pricingData from '../services/pricingData';
import { getEquipmentItemCost } from './equipmentCost';
import { getDefaultCleanerOption, getDefaultCleanerQuantity } from './cleanerDefaults';
import { normalizeEquipmentLighting } from './lighting';
import { getNoPumpSelection } from './pumpDefaults';
import {
  buildIncludedSaltCellOption,
  INCLUDED_SALT_CELL_OPTION_NAME,
  isIncludedSaltCellOptionName,
} from './saltCellCompatibility';
import {
  Equipment,
  EquipmentAccessorySelection,
  EquipmentPackageOption,
  FilterSelection,
  LightSelection,
  PumpSelection,
  CleanerSelection,
  HeaterSelection,
  AutomationSelection,
  SaltSystemSelection,
  AutoFillSystemSelection,
} from '../types/proposal-new';

export const CUSTOM_PACKAGE_ID = 'custom';

const defaultPackageOptions: EquipmentPackageOption[] = [
  {
    id: 'pfm01-basic-chlorine',
    name: 'PFM01 Basic Chlorine Package',
    mode: 'fixed',
    enabled: true,
    description: '4 bundled equipment selections for a streamlined fixed package.',
    basePrice: 1739,
    includeCheckValve: true,
    supportsSpa: false,
    allowAdditionalPumps: false,
    allowHeaterUpgrade: false,
    allowCleanerUpgrade: true,
    allowAutoFillUpgrade: true,
    allowPoolLightUpgrade: true,
    allowSpaLightUpgrade: false,
    allowWaterFeatureUpgrade: false,
    allowSanitationAccessoryUpgrade: true,
    includedWaterFeaturesBeforeExtraPump: 0,
    includedPumpName: 'Jandy 1.65HP Variable Pump',
    includedPumpQuantity: 1,
    includedFilterName: '150CV Filter',
    includedFilterQuantity: 1,
    includedSaltSystemName: 'Chlorine Inline Feeder',
    includedSaltSystemQuantity: 1,
    includedPoolLightName: 'Pool Light',
    includedPoolLightQuantity: 1,
    defaultCleanerName: '7240 Sport',
    defaultCleanerQuantity: 1,
    notes: 'Cannot include a spa or any water features. Additional pumps are not allowed.',
  },
  {
    id: 'pmf03-standard-automation',
    name: 'PMF03 Standard Automation Package',
    mode: 'fixed',
    enabled: true,
    description: '5 bundled equipment selections with automation already included.',
    basePrice: 3864,
    includeCheckValve: true,
    supportsSpa: false,
    allowAdditionalPumps: true,
    allowHeaterUpgrade: true,
    allowCleanerUpgrade: true,
    allowAutoFillUpgrade: true,
    allowPoolLightUpgrade: true,
    allowSpaLightUpgrade: false,
    allowWaterFeatureUpgrade: true,
    allowSanitationAccessoryUpgrade: true,
    includedWaterFeaturesBeforeExtraPump: 1,
    includedPumpName: 'Jandy 1.65HP Variable Pump',
    includedPumpQuantity: 1,
    includedFilterName: 'CV3030 Filter',
    includedFilterQuantity: 1,
    includedAutomationName: 'HL Base',
    includedAutomationQuantity: 1,
    includedSaltSystemName: INCLUDED_SALT_CELL_OPTION_NAME,
    includedSaltSystemQuantity: 1,
    includedPoolLightName: 'Pool Light',
    includedPoolLightQuantity: 1,
    defaultCleanerName: '7240 Sport',
    defaultCleanerQuantity: 1,
    notes:
      'Supports one water feature without adding another pump. A second water feature will auto-add an additional pump.',
  },
  {
    id: CUSTOM_PACKAGE_ID,
    name: 'Custom',
    mode: 'custom',
    enabled: true,
    description: 'Choose each equipment line item individually for maximum flexibility.',
    basePrice: 0,
    includeCheckValve: true,
    supportsSpa: true,
    allowAdditionalPumps: true,
    allowHeaterUpgrade: true,
    allowCleanerUpgrade: true,
    allowAutoFillUpgrade: true,
    allowPoolLightUpgrade: true,
    allowSpaLightUpgrade: true,
    allowWaterFeatureUpgrade: true,
    allowSanitationAccessoryUpgrade: true,
    includedWaterFeaturesBeforeExtraPump: 0,
    notes: 'Uses normal itemized equipment pricing plus the package check valve cost.',
  },
];

const normalizeName = (value?: string | null) => (value ?? '').trim().toLowerCase();

const hasName = (value?: string | null) => normalizeName(value).length > 0;

const isOptionEnabled = (option?: EquipmentPackageOption | null) =>
  option?.mode === 'custom' ? true : option?.enabled !== false;

const normalizeLegacyPackageOption = (option: EquipmentPackageOption): EquipmentPackageOption => {
  const isPmf03Package =
    option.id === 'pmf03-standard-automation' ||
    normalizeName(option.name) === normalizeName('PMF03 Standard Automation Package');
  if (!isPmf03Package) return option;

  const normalizedSaltName = normalizeName(option.includedSaltSystemName);
  const includedSaltQty = Math.max(Number(option.includedSaltSystemQuantity) || 0, 0);
  const hasLegacyMissingSaltConfig =
    !normalizedSaltName ||
    normalizedSaltName === 'none' ||
    normalizedSaltName.includes('no salt') ||
    includedSaltQty === 0;

  if (!hasLegacyMissingSaltConfig) return option;

  return {
    ...option,
    includedSaltSystemName: INCLUDED_SALT_CELL_OPTION_NAME,
    includedSaltSystemQuantity: 1,
  };
};

const mergeDefaultPackageOption = (option: EquipmentPackageOption): EquipmentPackageOption => {
  const fallback =
    defaultPackageOptions.find((candidate) => candidate.id === option.id) ||
    (option.mode === 'custom' ? defaultPackageOptions.find((candidate) => candidate.id === CUSTOM_PACKAGE_ID) : null);
  return normalizeLegacyPackageOption({
    ...(fallback || {}),
    ...option,
    id: option.id || fallback?.id || CUSTOM_PACKAGE_ID,
  });
};

const ensureCustomPackage = (options: EquipmentPackageOption[]) => {
  const hasCustom = options.some((option) => option.mode === 'custom' || option.id === CUSTOM_PACKAGE_ID);
  if (hasCustom) {
    return options.map((option) =>
      option.mode === 'custom' || option.id === CUSTOM_PACKAGE_ID
        ? ({ ...option, id: option.id || CUSTOM_PACKAGE_ID, mode: 'custom', enabled: true } as EquipmentPackageOption)
        : option
    );
  }
  return [...options, defaultPackageOptions.find((option) => option.id === CUSTOM_PACKAGE_ID)!];
};

const getPackageListFromPricing = (): EquipmentPackageOption[] => {
  return normalizeEquipmentPackageOptions(
    Array.isArray((pricingData as any)?.equipment?.packageOptions)
      ? ((pricingData as any).equipment.packageOptions as EquipmentPackageOption[])
      : []
  );
};

export function normalizeEquipmentPackageOptions(
  options?: EquipmentPackageOption[] | null
): EquipmentPackageOption[] {
  const configured = Array.isArray(options) ? options : [];
  if (!configured.length) {
    return defaultPackageOptions.map((option) => ({ ...option }));
  }
  return ensureCustomPackage(configured.map((option) => mergeDefaultPackageOption(option)));
}

const resolveCatalogItem = <T extends { name?: string }>(list: T[] | undefined, name?: string | null): T | undefined => {
  const target = normalizeName(name);
  if (!target) return undefined;
  return (list || []).find((item) => normalizeName(item?.name) === target);
};

const resolvePackageQty = (value?: number | null) => Math.max(Number(value) || 0, 0);

const buildPumpSelection = (name?: string | null): PumpSelection | undefined => {
  if (!hasName(name)) return undefined;
  const entry =
    resolveCatalogItem(pricingData.equipment.pumps, name) ||
    resolveCatalogItem((pricingData as any).equipment?.auxiliaryPumps, name);
  return {
    name: name || '',
    model: (entry as any)?.model,
    basePrice: (entry as any)?.basePrice,
    addCost1: (entry as any)?.addCost1,
    addCost2: (entry as any)?.addCost2,
    price: getEquipmentItemCost(entry as any, (entry as any)?.overheadMultiplier || pricingData.equipment.pumpOverheadMultiplier || 1),
  };
};

const buildFilterSelection = (name?: string | null): FilterSelection | undefined => {
  if (!hasName(name)) return undefined;
  const entry = resolveCatalogItem(pricingData.equipment.filters, name);
  return {
    name: name || '',
    sqft: (entry as any)?.sqft,
    basePrice: (entry as any)?.basePrice,
    addCost1: (entry as any)?.addCost1,
    addCost2: (entry as any)?.addCost2,
    price: getEquipmentItemCost(entry as any, 1),
  };
};

const buildCleanerSelection = (name?: string | null): CleanerSelection | undefined => {
  if (!hasName(name)) return undefined;
  const entry = resolveCatalogItem(pricingData.equipment.cleaners, name);
  return {
    name: name || '',
    basePrice: (entry as any)?.basePrice,
    addCost1: (entry as any)?.addCost1,
    addCost2: (entry as any)?.addCost2,
    price: getEquipmentItemCost(entry as any, 1),
  };
};

const buildHeaterSelection = (name?: string | null): HeaterSelection | undefined => {
  if (!hasName(name)) return undefined;
  const entry = resolveCatalogItem(pricingData.equipment.heaters, name);
  return {
    name: name || '',
    btu: (entry as any)?.btu,
    basePrice: (entry as any)?.basePrice,
    addCost1: (entry as any)?.addCost1,
    addCost2: (entry as any)?.addCost2,
    price: getEquipmentItemCost(entry as any, 1),
  };
};

const buildAutomationSelection = (name?: string | null, zones: number = 0): AutomationSelection | undefined => {
  if (!hasName(name)) return undefined;
  const entry = resolveCatalogItem(pricingData.equipment.automation, name);
  return {
    name: name || '',
    basePrice: (entry as any)?.basePrice,
    addCost1: (entry as any)?.addCost1,
    addCost2: (entry as any)?.addCost2,
    addCost3: (entry as any)?.addCost3,
    includesSaltCell: (entry as any)?.includesSaltCell,
    price: getEquipmentItemCost(entry as any, 1),
    zones,
  };
};

const buildSaltSystemSelection = (name?: string | null): SaltSystemSelection | undefined => {
  if (!hasName(name)) return undefined;
  if (isIncludedSaltCellOptionName(name)) return buildIncludedSaltCellOption();
  const entry = resolveCatalogItem(pricingData.equipment.saltSystem, name);
  return {
    name: name || '',
    model: (entry as any)?.model,
    basePrice: (entry as any)?.basePrice,
    addCost1: (entry as any)?.addCost1,
    addCost2: (entry as any)?.addCost2,
    price: getEquipmentItemCost(entry as any, 1),
    excludedFromSaltCell: (entry as any)?.excludedFromSaltCell,
    includedSaltCellPlaceholder: false,
  };
};

const buildAutoFillSelection = (name?: string | null): AutoFillSystemSelection | undefined => {
  if (!hasName(name)) return undefined;
  const entry = resolveCatalogItem(pricingData.equipment.autoFillSystem, name);
  return {
    name: name || '',
    model: (entry as any)?.model,
    basePrice: (entry as any)?.basePrice,
    addCost1: (entry as any)?.addCost1,
    addCost2: (entry as any)?.addCost2,
    percentIncrease: (entry as any)?.percentIncrease,
    requiresElectricRun: (entry as any)?.requiresElectricRun,
    price: getEquipmentItemCost(entry as any, 1),
  };
};

const buildAccessorySelection = (name?: string | null): EquipmentAccessorySelection | undefined => {
  if (!hasName(name)) return undefined;
  const entry = resolveCatalogItem((pricingData as any)?.equipment?.sanitationAccessories, name);
  return {
    name: name || '',
    basePrice: (entry as any)?.basePrice,
    addCost1: (entry as any)?.addCost1,
    addCost2: (entry as any)?.addCost2,
    price: getEquipmentItemCost(entry as any, 1),
  };
};

const buildLightSelection = (name: string, type: 'pool' | 'spa'): LightSelection => {
  const list = type === 'pool' ? pricingData.equipment.lights.poolLights : pricingData.equipment.lights.spaLights;
  const entry = resolveCatalogItem(list, name);
  return {
    type,
    name,
    basePrice: (entry as any)?.basePrice,
    addCost1: (entry as any)?.addCost1,
    addCost2: (entry as any)?.addCost2,
    price: getEquipmentItemCost(entry as any, 1),
  };
};

const findZeroCostItem = <T extends { name: string }>(list: T[], multiplier: number = 1) =>
  list.find((item) => getEquipmentItemCost(item as any, multiplier) === 0) || list[0];

export const getEquipmentPackageOptions = (): EquipmentPackageOption[] => getPackageListFromPricing();

export const getEnabledEquipmentPackageOptions = (): EquipmentPackageOption[] =>
  getEquipmentPackageOptions().filter(isOptionEnabled);

export const getEquipmentPackageById = (packageId?: string | null): EquipmentPackageOption | null => {
  if (!hasName(packageId)) return null;
  return getEquipmentPackageOptions().find((option) => option.id === packageId) || null;
};

export const getSelectedEquipmentPackage = (equipment?: Partial<Equipment> | null): EquipmentPackageOption | null =>
  getEquipmentPackageById(equipment?.packageSelectionId);

export const isCustomEquipmentPackage = (option?: EquipmentPackageOption | null) =>
  (option?.mode || 'fixed') === 'custom';

export const isFixedEquipmentPackage = (option?: EquipmentPackageOption | null) =>
  (option?.mode || 'fixed') === 'fixed';

export const getEffectivePrimarySanitationSystemName = (equipment?: Partial<Equipment> | null): string | undefined => {
  const selectedPackage = getSelectedEquipmentPackage(equipment);
  if (selectedPackage && isFixedEquipmentPackage(selectedPackage)) {
    return Math.max(selectedPackage.includedSaltSystemQuantity ?? 0, 0) > 0
      ? selectedPackage.includedSaltSystemName || equipment?.saltSystem?.name
      : undefined;
  }

  return equipment?.saltSystem?.name || selectedPackage?.includedSaltSystemName;
};

export const packageSupportsSpa = (option?: EquipmentPackageOption | null) =>
  option ? option.supportsSpa !== false : true;

export const packageAllowsWaterFeatures = (option?: EquipmentPackageOption | null) =>
  option
    ? option.allowWaterFeatureUpgrade !== false ||
      getPackageWaterFeaturesWithoutExtraPump(option) > 0 ||
      isCustomEquipmentPackage(option)
    : true;

export const packageAllowsAdditionalPumps = (option?: EquipmentPackageOption | null) =>
  option ? option.allowAdditionalPumps !== false || isCustomEquipmentPackage(option) : true;

export const getPackageWaterFeaturesWithoutExtraPump = (option?: EquipmentPackageOption | null) =>
  Math.max(option?.includedWaterFeaturesBeforeExtraPump ?? 0, 0);

export const getPackageTotal = (option?: EquipmentPackageOption | null): number => {
  if (!option || isCustomEquipmentPackage(option)) return 0;
  const base = Number(option.basePrice) || 0;
  const checkValve = option.includeCheckValve !== false ? Number((pricingData as any)?.equipment?.checkValve || 0) : 0;
  return base + checkValve;
};

export const buildPackageSummaryRows = (option?: EquipmentPackageOption | null) => {
  if (!option) return [];
  const rows: Array<{ label: string; value: string }> = [];
  const maybePush = (label: string, name?: string | null, qty?: number | null) => {
    if (!hasName(name)) return;
    const quantity = resolvePackageQty(qty) || 1;
    rows.push({
      label,
      value: quantity > 1 ? `${quantity} x ${name}` : String(name),
    });
  };

  maybePush('Pump', option.includedPumpName, option.includedPumpQuantity);
  maybePush('Filter', option.includedFilterName, option.includedFilterQuantity);
  maybePush('Automation', option.includedAutomationName, option.includedAutomationQuantity);
  maybePush('Sanitation', option.includedSaltSystemName, option.includedSaltSystemQuantity);
  maybePush('Pool Lights', option.includedPoolLightName, option.includedPoolLightQuantity);
  maybePush('Spa Lights', option.includedSpaLightName, option.includedSpaLightQuantity);
  maybePush('Heater', option.includedHeaterName, option.includedHeaterQuantity);
  maybePush('Cleaner', option.includedCleanerName, option.includedCleanerQuantity);
  maybePush('Auto-Fill', option.includedAutoFillSystemName, option.includedAutoFillSystemQuantity);
  maybePush(
    'Sanitation Accessory',
    option.includedSanitationAccessoryName,
    option.includedSanitationAccessoryQuantity
  );

  return rows;
};

export const buildPackageRuleNotes = (option?: EquipmentPackageOption | null): string[] => {
  if (!option) return [];
  const notes: string[] = [];
  if (!packageSupportsSpa(option)) {
    notes.push('This equipment package cannot include a spa.');
  }
  if (!packageAllowsWaterFeatures(option)) {
    notes.push('Water features are not available with this package.');
  } else {
    const allowance = getPackageWaterFeaturesWithoutExtraPump(option);
    if (allowance > 0) {
      notes.push(
        `This package supports ${allowance} water feature${allowance === 1 ? '' : 's'} before another pump is required.`
      );
    }
  }
  if (!packageAllowsAdditionalPumps(option)) {
    notes.push('Additional pumps are not available with this package.');
  }
  if (option.includeCheckValve !== false) {
    notes.push('Package pricing includes the check valve cost.');
  }
  if (option.notes?.trim()) {
    notes.push(option.notes.trim());
  }
  return notes;
};

export const createFreshEquipmentForPackage = (
  option: EquipmentPackageOption,
  opts?: { hasPool?: boolean; hasSpa?: boolean }
): Equipment => {
  const pumpOverhead = (pricingData as any).equipment?.pumpOverheadMultiplier ?? 1;
  const defaultPump = getNoPumpSelection(pumpOverhead);
  const defaultFilter = findZeroCostItem(pricingData.equipment.filters);
  const defaultCleaner =
    getDefaultCleanerOption(pricingData.equipment.cleaners) || findZeroCostItem(pricingData.equipment.cleaners);
  const defaultHeater = findZeroCostItem(pricingData.equipment.heaters);
  const defaultAutomation = findZeroCostItem(pricingData.equipment.automation);
  const defaultEquipment: Equipment = {
    pump: { ...defaultPump },
    pumpQuantity: 0,
    additionalPumps: [],
    auxiliaryPumps: [],
    auxiliaryPump: undefined,
    filter: {
      name: defaultFilter.name,
      sqft: (defaultFilter as any).sqft,
      basePrice: (defaultFilter as any).basePrice,
      addCost1: (defaultFilter as any).addCost1,
      addCost2: (defaultFilter as any).addCost2,
      price: getEquipmentItemCost(defaultFilter as any, 1),
    },
    filterQuantity: 0,
    cleaner: {
      name: defaultCleaner.name,
      basePrice: (defaultCleaner as any).basePrice,
      addCost1: (defaultCleaner as any).addCost1,
      addCost2: (defaultCleaner as any).addCost2,
      price: getEquipmentItemCost(defaultCleaner as any, 1),
    },
    cleanerQuantity: getDefaultCleanerQuantity(defaultCleaner),
    heater: {
      name: defaultHeater.name,
      btu: (defaultHeater as any).btu,
      basePrice: (defaultHeater as any).basePrice,
      addCost1: (defaultHeater as any).addCost1,
      addCost2: (defaultHeater as any).addCost2,
      price: getEquipmentItemCost(defaultHeater as any, 1),
    },
    heaterQuantity: 0,
    poolLights: [],
    spaLights: [],
    includePoolLights: false,
    includeSpaLights: false,
    numberOfLights: 0,
    hasSpaLight: false,
    automation: {
      name: defaultAutomation.name,
      basePrice: (defaultAutomation as any).basePrice,
      addCost1: (defaultAutomation as any).addCost1,
      addCost2: (defaultAutomation as any).addCost2,
      addCost3: (defaultAutomation as any).addCost3,
      includesSaltCell: (defaultAutomation as any).includesSaltCell,
      price: getEquipmentItemCost(defaultAutomation as any, 1),
      zones: 0,
    },
    automationQuantity: 0,
    saltSystem: undefined,
    saltSystemQuantity: 0,
    additionalSaltSystem: undefined,
    autoFillSystem: undefined,
    autoFillSystemQuantity: 0,
    sanitationAccessory: undefined,
    sanitationAccessoryQuantity: 0,
    hasBlanketReel: false,
    hasSolarBlanket: false,
    hasAutoFill: false,
    hasHandrail: false,
    hasStartupChemicals: false,
    packageSelectionId: option.id,
    customOptions: [],
    totalCost: 0,
    hasBeenEdited: true,
  };

  if (isCustomEquipmentPackage(option)) {
    return normalizeEquipmentLighting(defaultEquipment, {
      hasPool: opts?.hasPool,
      hasSpa: opts?.hasSpa,
    });
  }

  const pumpSelection = buildPumpSelection(option.includedPumpName);
  const filterSelection = buildFilterSelection(option.includedFilterName);
  const cleanerSelection = buildCleanerSelection(option.defaultCleanerName || option.includedCleanerName);
  const heaterSelection = buildHeaterSelection(option.includedHeaterName);
  const automationSelection = buildAutomationSelection(
    option.includedAutomationName,
    option.includedAutomationZones ?? 0
  );
  const saltSelection = buildSaltSystemSelection(option.includedSaltSystemName);
  const autoFillSelection = buildAutoFillSelection(option.defaultAutoFillSystemName || option.includedAutoFillSystemName);
  const accessorySelection = buildAccessorySelection(
    option.defaultSanitationAccessoryName || option.includedSanitationAccessoryName
  );

  const includedPoolLights = resolvePackageQty(option.includedPoolLightQuantity);
  const includedSpaLights = resolvePackageQty(option.includedSpaLightQuantity);
  const poolLightName = option.includedPoolLightName || pricingData.equipment.lights.poolLights?.[0]?.name || 'Pool Light';
  const spaLightName = option.includedSpaLightName || pricingData.equipment.lights.spaLights?.[0]?.name || 'Spa Light';
  const defaultCleanerQty = resolvePackageQty(option.defaultCleanerQuantity) || (option.defaultCleanerName ? 1 : 0);
  const defaultAutoFillQty = resolvePackageQty(option.defaultAutoFillSystemQuantity) || (option.defaultAutoFillSystemName ? 1 : 0);
  const defaultAccessoryQty =
    resolvePackageQty(option.defaultSanitationAccessoryQuantity) || (option.defaultSanitationAccessoryName ? 1 : 0);

  const nextEquipment: Equipment = {
    ...defaultEquipment,
    pump: pumpSelection || defaultEquipment.pump,
    pumpQuantity: resolvePackageQty(option.includedPumpQuantity),
    filter: filterSelection || defaultEquipment.filter,
    filterQuantity: resolvePackageQty(option.includedFilterQuantity),
    cleaner: cleanerSelection || defaultEquipment.cleaner,
    cleanerQuantity:
      defaultCleanerQty > 0
        ? defaultCleanerQty
        : resolvePackageQty(option.includedCleanerQuantity),
    heater: heaterSelection || defaultEquipment.heater,
    heaterQuantity: resolvePackageQty(option.includedHeaterQuantity),
    automation: automationSelection || defaultEquipment.automation,
    automationQuantity: resolvePackageQty(option.includedAutomationQuantity),
    saltSystem: saltSelection,
    saltSystemQuantity: resolvePackageQty(option.includedSaltSystemQuantity),
    autoFillSystem: autoFillSelection,
    autoFillSystemQuantity: defaultAutoFillQty > 0 ? defaultAutoFillQty : resolvePackageQty(option.includedAutoFillSystemQuantity),
    sanitationAccessory: accessorySelection,
    sanitationAccessoryQuantity:
      defaultAccessoryQty > 0
        ? defaultAccessoryQty
        : resolvePackageQty(option.includedSanitationAccessoryQuantity),
    includePoolLights: includedPoolLights > 0,
    includeSpaLights: includedSpaLights > 0 && packageSupportsSpa(option),
    poolLights:
      includedPoolLights > 0
        ? Array.from({ length: includedPoolLights }, () => buildLightSelection(poolLightName, 'pool'))
        : [],
    spaLights:
      includedSpaLights > 0 && packageSupportsSpa(option)
        ? Array.from({ length: includedSpaLights }, () => buildLightSelection(spaLightName, 'spa'))
        : [],
  };

  return normalizeEquipmentLighting(nextEquipment, {
    hasPool: opts?.hasPool,
    hasSpa: opts?.hasSpa && packageSupportsSpa(option),
  });
};
