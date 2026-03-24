import { useEffect, useMemo, useState } from 'react';
import {
  Equipment,
  EquipmentPackageOption,
  PumpSelection,
  LightSelection,
  PlumbingRuns,
  SaltSystemSelection,
  EquipmentAccessorySelection,
} from '../types/proposal-new';
import pricingData from '../services/pricingData';
import { getEquipmentItemCost } from '../utils/equipmentCost';
import { getDefaultCleanerOption, getDefaultCleanerQuantity } from '../utils/cleanerDefaults';
import { normalizeEquipmentLighting } from '../utils/lighting';
import { getRetiredEquipmentFlags } from '../utils/retiredEquipment';
import {
  automationIncludesSaltCell,
  buildIncludedSaltCellOption,
  isExcludedFromSaltCell,
  isIncludedSaltCellOptionName,
  isIncludedSaltCellSelection,
  isNoSaltSystemName,
  isRealSaltSystemSelection,
} from '../utils/saltCellCompatibility';
import {
  getEnabledEquipmentPackageOptions,
  getSelectedEquipmentPackage,
  isCustomEquipmentPackage,
  isFixedEquipmentPackage,
  packageAllowsAdditionalPumps,
  packageSupportsSpa,
} from '../utils/equipmentPackages';
import { getAdditionalPumpSelections, getBasePumpQuantity } from '../utils/pumpSelections';
import { getNoPumpSelection } from '../utils/pumpDefaults';
import CustomOptionsSection from './CustomOptionsSection';
import RetiredEquipmentIndicator from './RetiredEquipmentIndicator';
import './SectionStyles.css';

interface Props {
  data: Equipment;
  onChange: (data: Equipment) => void;
  onSelectPackage: (packageId: string) => void;
  plumbingRuns: PlumbingRuns;
  onChangePlumbingRuns: (runs: PlumbingRuns) => void;
  hasSpa: boolean;
  hasPool: boolean;
}

const CompactInput = ({
  type = 'number',
  value,
  onChange,
  unit,
  min,
  step,
  readOnly = false,
  placeholder,
}: {
  type?: string;
  value: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  unit?: string;
  min?: string;
  step?: string;
  readOnly?: boolean;
  placeholder?: string;
}) => {
  const displayValue = type === 'number' && value === 0 && !readOnly ? '' : value;
  const finalPlaceholder = placeholder ?? (type === 'number' ? '0' : undefined);

  return (
    <div className="compact-input-wrapper">
      <input
        type={type}
        className="compact-input"
        value={displayValue}
        onChange={onChange}
        min={min}
        step={step}
        readOnly={readOnly}
        placeholder={finalPlaceholder}
        style={readOnly ? { backgroundColor: '#f0f0f0', cursor: 'not-allowed' } : {}}
      />
      {unit && <span className="compact-input-unit">{unit}</span>}
    </div>
  );
};

const LabelWithRetired = ({ text, showRetired }: { text: string; showRetired?: boolean }) => (
  <div className="spec-label-row">
    <label className="spec-label">{text}</label>
    {showRetired && <RetiredEquipmentIndicator />}
  </div>
);

function EquipmentSectionNew({
  data,
  onChange,
  onSelectPackage,
  plumbingRuns,
  onChangePlumbingRuns,
  hasSpa,
  hasPool,
}: Props) {
  const autoFillSelectionRequiresElectric = (selection?: { name?: string; requiresElectricRun?: boolean }) => {
    const selectionName = selection?.name?.trim() || '';
    const normalizedName = selectionName.toLowerCase();
    const catalogMatch = selectionName
      ? pricingData.equipment.autoFillSystem.find((system) => system.name === selectionName)
      : undefined;
    return Boolean(selection?.requiresElectricRun || catalogMatch?.requiresElectricRun || normalizedName.includes('electric'));
  };

  const defaults = useMemo(() => {
    const byCost = <T,>(list: T[]) =>
      list.find((item: any) => getEquipmentItemCost(item) === 0) || list[0];
    const pump = getNoPumpSelection();
    const filter = byCost(pricingData.equipment.filters);
    const cleaner = getDefaultCleanerOption(pricingData.equipment.cleaners) || byCost(pricingData.equipment.cleaners);
    const heater = byCost(pricingData.equipment.heaters);
    const automation = byCost(pricingData.equipment.automation);
    const autoFillSystem = byCost(pricingData.equipment.autoFillSystem);
    const sanitationAccessory = byCost(((pricingData as any).equipment?.sanitationAccessories || []) as any[]);
    return { pump, filter, cleaner, heater, automation, autoFillSystem, sanitationAccessory };
  }, []);

  const selectableDefaults = useMemo(() => ({
    pump: pricingData.equipment.pumps.find(p => !p.name.toLowerCase().includes('no pump')) || pricingData.equipment.pumps[0],
    filter: pricingData.equipment.filters.find(f => !f.name.toLowerCase().includes('no filter')) || pricingData.equipment.filters[0],
    heater: pricingData.equipment.heaters.find(h => !h.name.toLowerCase().includes('no heater')) || pricingData.equipment.heaters[0],
    automation: pricingData.equipment.automation.find(a => !a.name.toLowerCase().includes('no automation')) || pricingData.equipment.automation[0],
    saltSystem: pricingData.equipment.saltSystem.find(s => !isNoSaltSystemName(s.name)) || pricingData.equipment.saltSystem[0],
    autoFillSystem: pricingData.equipment.autoFillSystem.find(s => !s.name.toLowerCase().includes('no auto')) || pricingData.equipment.autoFillSystem[0],
    sanitationAccessory:
      (((pricingData as any).equipment?.sanitationAccessories || []) as any[]).find(
        (s: any) => !s.name.toLowerCase().includes('no sanitation')
      ) || (((pricingData as any).equipment?.sanitationAccessories || []) as any[])[0],
  }), []);

  const hasRealSelection = (name: string | undefined, placeholder: string) =>
    !!(name && !name.toLowerCase().includes(placeholder));

  const pumpOverhead = pricingData.equipment.pumpOverheadMultiplier ?? 1;
  const costOf = (item: any, applyPumpOverhead?: boolean) =>
    getEquipmentItemCost(item, applyPumpOverhead ? pumpOverhead : 1);
  const hasHeaterSelection = hasRealSelection(data?.heater?.name, 'no heater');
  const noneOptionValue = 'none';
  const formatOptionLabel = (label: string, _amount?: number) => label;
  const isAuxPumpPlaceholder = (name: string) => {
    const lowered = name.toLowerCase();
    return lowered.includes('no pump') || lowered.includes('no aux') || lowered.includes('no auxiliary');
  };
  const getDefaultAuxiliaryPump = () =>
    auxiliaryPumpCatalog.find((pump: any) => pump.defaultAuxiliaryPump) ||
    auxiliaryPumpCatalog.find((pump: any) => !isAuxPumpPlaceholder(pump.name)) ||
    auxiliaryPumpCatalog[0];

  const pumpOptions = pricingData.equipment.pumps.filter(pump => !pump.name.toLowerCase().includes('no pump'));
  const auxiliaryPumpCatalog =
    (pricingData as any).equipment?.auxiliaryPumps?.length
      ? (pricingData as any).equipment.auxiliaryPumps
      : pricingData.equipment.pumps;
  const auxiliaryPumpOptions = auxiliaryPumpCatalog.filter((pump: any) =>
    !isAuxPumpPlaceholder(pump.name)
  );
  const filterOptions = pricingData.equipment.filters.filter(filter => !filter.name.toLowerCase().includes('no filter'));
  const cleanerOptions = pricingData.equipment.cleaners.filter(cleaner => !cleaner.name.toLowerCase().includes('no cleaner'));
  const heaterOptions = pricingData.equipment.heaters.filter(heater => !heater.name.toLowerCase().includes('no heater'));
  const automationOptions = pricingData.equipment.automation.filter(auto => !auto.name.toLowerCase().includes('no automation'));
  const saltCatalog = pricingData.equipment.saltSystem.filter(system => !isNoSaltSystemName(system.name));
  const autoFillOptions = pricingData.equipment.autoFillSystem.filter(system => !system.name.toLowerCase().includes('no auto'));
  const sanitationAccessoryCatalog = ((pricingData as any).equipment?.sanitationAccessories || []) as any[];
  const sanitationAccessoryOptions = sanitationAccessoryCatalog.filter(
    (accessory: any) => !accessory.name.toLowerCase().includes('no sanitation')
  );

  const buildAutoFillSelection = (system: any) => ({
    name: system?.name || '',
    model: (system as any)?.model,
    basePrice: (system as any)?.basePrice,
    addCost1: (system as any)?.addCost1,
    addCost2: (system as any)?.addCost2,
    price: costOf(system),
    percentIncrease: (system as any)?.percentIncrease,
    requiresElectricRun: (system as any)?.requiresElectricRun,
  });
  const buildSaltSystemSelection = (system: any): SaltSystemSelection => ({
    name: system?.name || '',
    model: (system as any)?.model,
    basePrice: (system as any)?.basePrice,
    addCost1: (system as any)?.addCost1,
    addCost2: (system as any)?.addCost2,
    price: costOf(system),
    excludedFromSaltCell: (system as any)?.excludedFromSaltCell,
    includedSaltCellPlaceholder: false,
  });
  const buildSanitationAccessorySelection = (accessory: any): EquipmentAccessorySelection => ({
    name: accessory?.name || '',
    basePrice: (accessory as any)?.basePrice,
    addCost1: (accessory as any)?.addCost1,
    addCost2: (accessory as any)?.addCost2,
    price: costOf(accessory),
  });

  const hasPumpSelection = hasRealSelection(data?.pump?.name, 'no pump');
  const normalizedAdditionalPumps = getAdditionalPumpSelections(data);
  const normalizedBasePumpQuantity = Math.max(getBasePumpQuantity(data), 0);

  const baseSafeData: Equipment = {
    pump: data?.pump || {
      name: defaults.pump.name,
      model: (defaults.pump as any).model,
      basePrice: (defaults.pump as any).basePrice,
      addCost1: (defaults.pump as any).addCost1,
      addCost2: (defaults.pump as any).addCost2,
      price: costOf(defaults.pump, true),
    },
    pumpQuantity: normalizedBasePumpQuantity || Math.max(data?.pumpQuantity ?? (hasPumpSelection ? 1 : 0), 0),
    additionalPumps: normalizedAdditionalPumps,
    auxiliaryPumps:
      data?.auxiliaryPumps ||
      (data?.auxiliaryPump ? [data.auxiliaryPump] : []),
    auxiliaryPump: data?.auxiliaryPump ?? data?.auxiliaryPumps?.[0],
    filter: data?.filter || {
      name: defaults.filter.name,
      sqft: (defaults.filter as any).sqft,
      basePrice: (defaults.filter as any).basePrice,
      addCost1: (defaults.filter as any).addCost1,
      addCost2: (defaults.filter as any).addCost2,
      price: costOf(defaults.filter),
    },
    filterQuantity: data?.filterQuantity ?? 0,
    cleaner: data?.cleaner || {
      name: defaults.cleaner.name,
      basePrice: (defaults.cleaner as any).basePrice,
      addCost1: (defaults.cleaner as any).addCost1,
      addCost2: (defaults.cleaner as any).addCost2,
      price: costOf(defaults.cleaner),
    },
    cleanerQuantity: data?.cleanerQuantity ?? getDefaultCleanerQuantity(data?.cleaner || defaults.cleaner),
    heater: data?.heater || {
      name: defaults.heater.name,
      btu: (defaults.heater as any).btu,
      basePrice: (defaults.heater as any).basePrice,
      addCost1: (defaults.heater as any).addCost1,
      addCost2: (defaults.heater as any).addCost2,
      price: costOf(defaults.heater),
    },
    heaterQuantity: hasHeaterSelection ? Math.max(data?.heaterQuantity ?? 1, 1) : 0,
    includePoolLights: data?.includePoolLights,
    includeSpaLights: data?.includeSpaLights,
    poolLights: data?.poolLights,
    spaLights: data?.spaLights,
    numberOfLights: data?.numberOfLights ?? 0,
    hasSpaLight: data?.hasSpaLight ?? false,
    automation: data?.automation || {
      name: defaults.automation.name,
      basePrice: (defaults.automation as any).basePrice,
      addCost1: (defaults.automation as any).addCost1,
      addCost2: (defaults.automation as any).addCost2,
      addCost3: (defaults.automation as any).addCost3,
      includesSaltCell: (defaults.automation as any).includesSaltCell,
      price: costOf(defaults.automation),
      zones: data?.automation?.zones ?? 0,
    },
    automationQuantity: data?.automationQuantity ?? 0,
    saltSystem: data?.saltSystem,
    saltSystemQuantity:
      data?.saltSystemQuantity ?? (isRealSaltSystemSelection(data?.saltSystem) ? 1 : 0),
    additionalSaltSystem: data?.additionalSaltSystem,
    autoFillSystem:
      data?.autoFillSystem ??
      (data?.hasAutoFill
        ? buildAutoFillSelection(selectableDefaults.autoFillSystem || defaults.autoFillSystem)
        : undefined),
    autoFillSystemQuantity: data?.autoFillSystemQuantity ?? (data?.hasAutoFill ? 1 : 0),
    sanitationAccessory: data?.sanitationAccessory,
    sanitationAccessoryQuantity: data?.sanitationAccessoryQuantity ?? 0,
    hasBlanketReel: data?.hasBlanketReel ?? false,
    hasSolarBlanket: data?.hasSolarBlanket ?? false,
    hasAutoFill: data?.hasAutoFill ?? false,
    hasHandrail: data?.hasHandrail ?? false,
    hasStartupChemicals: data?.hasStartupChemicals ?? false,
    packageSelectionId: data?.packageSelectionId,
    customOptions: data?.customOptions ?? [],
    totalCost: data?.totalCost ?? 0,
    hasBeenEdited: data?.hasBeenEdited ?? false,
  };

  const safeData = normalizeEquipmentLighting(baseSafeData, { hasPool, hasSpa });
  const retiredFlags = getRetiredEquipmentFlags(safeData);
  const packageOptions = getEnabledEquipmentPackageOptions();
  const selectedPackage = getSelectedEquipmentPackage(safeData);
  const isFixedPackage = isFixedEquipmentPackage(selectedPackage);
  const packageIncludesPump = isFixedPackage && Math.max(selectedPackage?.includedPumpQuantity ?? 0, 0) > 0;
  const packageIncludesFilter = isFixedPackage && Math.max(selectedPackage?.includedFilterQuantity ?? 0, 0) > 0;
  const packageIncludesCleaner = isFixedPackage && Math.max(selectedPackage?.includedCleanerQuantity ?? 0, 0) > 0;
  const packageIncludesHeater = isFixedPackage && Math.max(selectedPackage?.includedHeaterQuantity ?? 0, 0) > 0;
  const packageIncludesPoolLights = isFixedPackage && Math.max(selectedPackage?.includedPoolLightQuantity ?? 0, 0) > 0;
  const packageIncludesSpaLights = isFixedPackage && Math.max(selectedPackage?.includedSpaLightQuantity ?? 0, 0) > 0;
  const packageIncludesAutomation = isFixedPackage && Math.max(selectedPackage?.includedAutomationQuantity ?? 0, 0) > 0;
  const packageIncludesSalt = isFixedPackage && Math.max(selectedPackage?.includedSaltSystemQuantity ?? 0, 0) > 0;
  const packageIncludesAutoFill = isFixedPackage && Math.max(selectedPackage?.includedAutoFillSystemQuantity ?? 0, 0) > 0;
  const packageIncludesSanitationAccessory =
    isFixedPackage && Math.max(selectedPackage?.includedSanitationAccessoryQuantity ?? 0, 0) > 0;
  const packageLocksSanitationSystem = isFixedPackage;
  const packageHasNoSanitationSystem = packageLocksSanitationSystem && !packageIncludesSalt;
  const packageAllowsPumpChanges = !isFixedPackage || packageAllowsAdditionalPumps(selectedPackage);
  const packageAllowsHeaterChanges = !isFixedPackage || Boolean(selectedPackage?.allowHeaterUpgrade);
  const packageAllowsCleanerChanges = !isFixedPackage || Boolean(selectedPackage?.allowCleanerUpgrade);
  const packageAllowsPoolLightChanges = !isFixedPackage || Boolean(selectedPackage?.allowPoolLightUpgrade);
  const packageAllowsSpaLightChanges = !isFixedPackage || Boolean(selectedPackage?.allowSpaLightUpgrade);
  const packageAllowsAutoFillChanges = !isFixedPackage || Boolean(selectedPackage?.allowAutoFillUpgrade);
  const packageAllowsSanitationAccessoryChanges =
    !isFixedPackage || Boolean(selectedPackage?.allowSanitationAccessoryUpgrade);
  const selectedPackageName = selectedPackage?.name || 'this package';
  const sanitationAccessoryQuantity = Math.max(
    safeData.sanitationAccessoryQuantity ?? (safeData.sanitationAccessory?.name ? 1 : 0),
    0
  );
  const includeSanitationAccessory =
    sanitationAccessoryQuantity > 0 &&
    !!safeData.sanitationAccessory?.name &&
    !safeData.sanitationAccessory.name.toLowerCase().includes('no sanitation');
  const packageButtonDisabledMessage = 'This equipment package is not possible with a Spa';
  const packageLockedCategoryMessage = `${selectedPackageName} includes this selection. Change the package to modify it.`;
  const addPoolLightDisabledReason =
    isFixedPackage && !packageAllowsPoolLightChanges
      ? 'This equipment package does not allow additional pool lights.'
      : undefined;
  const addSpaLightDisabledReason =
    isFixedPackage && !packageAllowsSpaLightChanges
      ? 'This equipment package does not allow spa light upgrades.'
      : undefined;
  const cleanerDisabledByPackage = isFixedPackage && !packageIncludesCleaner && !packageAllowsCleanerChanges;
  const heaterDisabledByPackage = isFixedPackage && !packageIncludesHeater && !packageAllowsHeaterChanges;
  const automationDisabledByPackage = isFixedPackage && !packageIncludesAutomation;
  const autoFillDisabledByPackage = isFixedPackage && !packageIncludesAutoFill && !packageAllowsAutoFillChanges;
  const sanitationAccessoryDisabledByPackage =
    isFixedPackage && !packageIncludesSanitationAccessory && !packageAllowsSanitationAccessoryChanges;

  const renderRetiredOption = (name?: string) =>
    name ? (
      <option key={`retired-${name}`} value={name} disabled>
        {name}
      </option>
    ) : null;

  useEffect(() => {
    if (!data?.pump || !data?.filter || !data?.heater || !data?.automation || !data?.cleaner) {
      onChange(safeData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [includePump, setIncludePump] = useState<boolean>(() => hasRealSelection(data?.pump?.name, 'no pump'));
  const [includeFilter, setIncludeFilter] = useState<boolean>(() => hasRealSelection(data?.filter?.name, 'no filter'));
  const [includeCleaner, setIncludeCleaner] = useState<boolean>(() => hasRealSelection(data?.cleaner?.name, 'no cleaner'));
  const [includeHeater, setIncludeHeater] = useState<boolean>(() => hasHeaterSelection);
  const [includePoolLights, setIncludePoolLights] = useState<boolean>(() => (safeData.poolLights?.length ?? 0) > 0);
  const [includeSpaLights, setIncludeSpaLights] = useState<boolean>(() => (safeData.spaLights?.length ?? 0) > 0);
  const [includeAutomation, setIncludeAutomation] = useState<boolean>(() =>
    hasRealSelection(data?.automation?.name, 'no automation') ||
    (data?.automationQuantity ?? 0) > 0 ||
    (data?.automation?.zones ?? 0) > 0
  );
  const [includeSalt, setIncludeSalt] = useState<boolean>(() => hasRealSelection(safeData.saltSystem?.name, 'no salt'));
  const [includeAutoFill, setIncludeAutoFill] = useState<boolean>(() =>
    hasRealSelection(safeData.autoFillSystem?.name, 'no auto')
  );

  useEffect(() => {
    setIncludePump(hasRealSelection(safeData.pump?.name, 'no pump') && (safeData.pumpQuantity ?? 0) > 0);
    setIncludeFilter(hasRealSelection(safeData.filter?.name, 'no filter') && (safeData.filterQuantity ?? 0) > 0);
    setIncludeCleaner(hasRealSelection(safeData.cleaner?.name, 'no cleaner') && (safeData.cleanerQuantity ?? 0) > 0);
    setIncludeHeater(hasRealSelection(safeData.heater?.name, 'no heater') && (safeData.heaterQuantity ?? 0) > 0);
    setIncludePoolLights((safeData.poolLights?.length ?? 0) > 0);
    setIncludeSpaLights((safeData.spaLights?.length ?? 0) > 0);
    setIncludeAutomation(
      (hasRealSelection(safeData.automation?.name, 'no automation') && (safeData.automationQuantity ?? 0) > 0) ||
        (safeData.automation?.zones ?? 0) > 0
    );
    setIncludeSalt(
      isRealSaltSystemSelection(safeData.saltSystem) ||
        isIncludedSaltCellSelection(safeData.saltSystem)
    );
    setIncludeAutoFill(
      hasRealSelection(safeData.autoFillSystem?.name, 'no auto') && (safeData.autoFillSystemQuantity ?? 0) > 0
    );
  }, [
    safeData.packageSelectionId,
    safeData.pump?.name,
    safeData.pumpQuantity,
    safeData.additionalPumps,
    safeData.filter?.name,
    safeData.filterQuantity,
    safeData.cleaner?.name,
    safeData.cleanerQuantity,
    safeData.heater?.name,
    safeData.heaterQuantity,
    safeData.poolLights,
    safeData.spaLights,
    safeData.automation?.name,
    safeData.automation?.zones,
    safeData.automationQuantity,
    safeData.saltSystem?.name,
    safeData.saltSystem?.includedSaltCellPlaceholder,
    safeData.autoFillSystem?.name,
    safeData.autoFillSystemQuantity,
  ]);
  const additionalPumps = safeData.additionalPumps || [];
  const auxiliaryPumps = safeData.auxiliaryPumps || [];
  const maxAuxiliaryPumps = 2;
  const pumpQuantity = Math.max(safeData.pumpQuantity ?? (includePump ? 1 : 0), 0);
  const includedPumpQuantity = packageIncludesPump ? Math.max(selectedPackage?.includedPumpQuantity ?? 0, 0) : 0;
  const primaryPumpSummaryQuantity = hasRealSelection(safeData.pump?.name, 'no pump') && pumpQuantity > 0 ? pumpQuantity : 0;
  const cleanerQuantity = Math.max(safeData.cleanerQuantity ?? (includeCleaner ? 1 : 0), 0);
  const filterQuantity = Math.max(safeData.filterQuantity ?? (includeFilter ? 1 : 0), 0);
  const heaterQuantity = Math.max(safeData.heaterQuantity ?? (includeHeater ? 1 : 0), 0);
  const automationQuantity = Math.max(safeData.automationQuantity ?? (includeAutomation ? 1 : 0), 0);
  const saltSystemQuantity = Math.max(
    safeData.saltSystemQuantity ?? (isRealSaltSystemSelection(safeData.saltSystem) ? 1 : 0),
    0
  );
  const autoFillSystemQuantity = Math.max(
    safeData.autoFillSystemQuantity ?? (includeAutoFill ? 1 : 0),
    0
  );
  const autoFillRequiresElectric = includeAutoFill && autoFillSelectionRequiresElectric(safeData.autoFillSystem);
  const automationHasIncludedSaltCell =
    includeAutomation &&
    hasRealSelection(safeData.automation?.name, 'no automation') &&
    automationIncludesSaltCell(safeData.automation);
  const primarySaltOptions = saltCatalog.filter(system => !isExcludedFromSaltCell(system));
  const additionalSaltOptions = saltCatalog.filter(system => isExcludedFromSaltCell(system));
  const visibleSaltOptions = automationHasIncludedSaltCell
    ? [buildIncludedSaltCellOption(), ...primarySaltOptions]
    : primarySaltOptions;
  const showSaltQuantity = includeSalt && isRealSaltSystemSelection(safeData.saltSystem);
  const showAdditionalSaltOptions = includeSalt;
  const poolLights = safeData.poolLights || [];
  const spaLights = safeData.spaLights || [];
  const summarizeQuantity = (name: string, quantity: number) =>
    quantity > 1 ? `${quantity} x ${name}` : name;
  const summarizeSelectionNames = (names: Array<string | undefined>) => {
    const filtered = names
      .map((name) => (name || '').trim())
      .filter((name) => name.length > 0);
    if (!filtered.length) return '';

    const counts = new Map<string, number>();
    filtered.forEach((name) => counts.set(name, (counts.get(name) || 0) + 1));
    if (counts.size === 1) {
      const [name, quantity] = Array.from(counts.entries())[0];
      return summarizeQuantity(name, quantity);
    }
    return filtered.join(', ');
  };
  const packageSummaryRows = useMemo(() => {
    const rows: Array<{ label: string; value: string }> = [];
    const pushRow = (label: string, value?: string) => {
      if (!value) return;
      rows.push({ label, value });
    };

    if (
      primaryPumpSummaryQuantity > 0 &&
      hasRealSelection(safeData.pump?.name, 'no pump')
    ) {
      pushRow('Pump', summarizeQuantity(safeData.pump?.name || 'Pump', primaryPumpSummaryQuantity));
    }

    const additionalPumpSummary = summarizeSelectionNames(
      additionalPumps
        .map((pump) => pump?.name)
        .filter((name) => hasRealSelection(name, 'no pump'))
    );
    pushRow('Additional Pump', additionalPumpSummary);

    const auxiliaryPumpSummary = summarizeSelectionNames(
      auxiliaryPumps
        .map((pump) => pump?.name)
        .filter((name) => hasRealSelection(name, 'no pump'))
    );
    pushRow('Auxiliary Pumps', auxiliaryPumpSummary);

    if ((packageIncludesFilter || includeFilter) && hasRealSelection(safeData.filter?.name, 'no filter') && filterQuantity > 0) {
      pushRow('Filter', summarizeQuantity(safeData.filter?.name || 'Filter', filterQuantity));
    }

    if ((packageIncludesCleaner || includeCleaner) && hasRealSelection(safeData.cleaner?.name, 'no cleaner') && cleanerQuantity > 0) {
      pushRow('Cleaner', summarizeQuantity(safeData.cleaner?.name || 'Cleaner', cleanerQuantity));
    }

    if ((packageIncludesHeater || includeHeater) && hasRealSelection(safeData.heater?.name, 'no heater') && heaterQuantity > 0) {
      pushRow('Heater', summarizeQuantity(safeData.heater?.name || 'Heater', heaterQuantity));
    }

    if (
      (packageIncludesAutomation || includeAutomation) &&
      hasRealSelection(safeData.automation?.name, 'no automation') &&
      automationQuantity > 0
    ) {
      pushRow('Automation', summarizeQuantity(safeData.automation?.name || 'Automation', automationQuantity));
    }

    if (isIncludedSaltCellSelection(safeData.saltSystem)) {
      pushRow('Sanitation', safeData.saltSystem?.name || 'Included Salt Cell');
    } else if (
      (packageIncludesSalt || includeSalt) &&
      isRealSaltSystemSelection(safeData.saltSystem) &&
      saltSystemQuantity > 0
    ) {
      pushRow('Sanitation', summarizeQuantity(safeData.saltSystem?.name || 'Sanitation System', saltSystemQuantity));
    }

    if (safeData.additionalSaltSystem?.name) {
      pushRow('Additional Sanitation', safeData.additionalSaltSystem.name);
    }

    if (
      (packageIncludesSanitationAccessory || includeSanitationAccessory) &&
      !!safeData.sanitationAccessory?.name &&
      sanitationAccessoryQuantity > 0
    ) {
      pushRow(
        'Sanitation Accessory',
        summarizeQuantity(safeData.sanitationAccessory.name, sanitationAccessoryQuantity)
      );
    }

    const poolLightSummary = summarizeSelectionNames(poolLights.map((light) => light?.name));
    pushRow('Pool Lights', poolLightSummary);

    const spaLightSummary = summarizeSelectionNames(spaLights.map((light) => light?.name));
    pushRow('Spa Lights', spaLightSummary);

    if (
      (packageIncludesAutoFill || includeAutoFill) &&
      hasRealSelection(safeData.autoFillSystem?.name, 'no auto') &&
      autoFillSystemQuantity > 0
    ) {
      pushRow('Auto-Fill', summarizeQuantity(safeData.autoFillSystem?.name || 'Auto-Fill System', autoFillSystemQuantity));
    }

    return rows;
  }, [
    additionalPumps,
    auxiliaryPumps,
    autoFillSystemQuantity,
    automationQuantity,
    cleanerQuantity,
    filterQuantity,
    heaterQuantity,
    includeAutoFill,
    includeAutomation,
    includeCleaner,
    includeFilter,
    includeHeater,
    includePump,
    includeSalt,
    includeSanitationAccessory,
    packageIncludesAutoFill,
    packageIncludesAutomation,
    packageIncludesCleaner,
    packageIncludesFilter,
    packageIncludesHeater,
    packageIncludesPump,
    packageIncludesSalt,
    packageIncludesSanitationAccessory,
    poolLights,
    primaryPumpSummaryQuantity,
    safeData.additionalSaltSystem?.name,
    safeData.autoFillSystem?.name,
    safeData.automation?.name,
    safeData.cleaner?.name,
    safeData.filter?.name,
    safeData.heater?.name,
    safeData.pump?.name,
    safeData.saltSystem,
    safeData.sanitationAccessory?.name,
    sanitationAccessoryQuantity,
    saltSystemQuantity,
    spaLights,
  ]);

  const updateData = (updates: Partial<Equipment>) => {
    onChange({ ...safeData, ...updates, hasBeenEdited: true });
  };

  const handleRunChange = (field: keyof PlumbingRuns, value: number) => {
    onChangePlumbingRuns({ ...plumbingRuns, [field]: value });
  };

  const setAuxiliaryPumps = (pumps: PumpSelection[]) => {
    updateData({ auxiliaryPumps: pumps, auxiliaryPump: pumps[0] });
  };

  const setAdditionalPumps = (pumps: PumpSelection[]) => {
    updateData({ additionalPumps: pumps });
  };

  const poolLightOptions = pricingData.equipment.lights.poolLights || [];
  const spaLightOptions = pricingData.equipment.lights.spaLights || [];

  const getPackageButtonDescription = (option: EquipmentPackageOption) => option.description?.trim() || '';

  const getDefaultLightOption = (type: 'pool' | 'spa') => {
    const list = type === 'pool' ? poolLightOptions : spaLightOptions;
    return list.find(light => (light as any)?.defaultLightChoice) || list[0];
  };

  const buildLightSelection = (option: any, type: 'pool' | 'spa'): LightSelection => ({
    type,
    name: option?.name || '',
    basePrice: (option as any)?.basePrice ?? 0,
    addCost1: (option as any)?.addCost1 ?? 0,
    addCost2: (option as any)?.addCost2 ?? 0,
    price: (option as any)?.price,
  });

  const commitLighting = (
    nextPoolLights: LightSelection[],
    nextSpaLights: LightSelection[],
    nextIncludePool: boolean,
    nextIncludeSpa: boolean,
  ) => {
    updateData({
      includePoolLights: nextIncludePool,
      includeSpaLights: nextIncludeSpa && hasSpa,
      poolLights: nextIncludePool ? nextPoolLights : [],
      spaLights: nextIncludeSpa && hasSpa ? nextSpaLights : [],
      numberOfLights: nextIncludePool ? Math.max(nextPoolLights.length - 1, 0) : 0,
      hasSpaLight: nextIncludeSpa && hasSpa && nextSpaLights.length > 0,
    });
  };

  const findLightOption = (name: string, type: 'pool' | 'spa') => {
    const list = type === 'pool' ? poolLightOptions : spaLightOptions;
    return list.find(light => light.name === name) || getDefaultLightOption(type);
  };

  const togglePump = (val: boolean) => {
    setIncludePump(val);
    if (val) {
      const selectedPump = hasRealSelection(safeData.pump?.name, 'no pump') ? safeData.pump : selectableDefaults.pump;
      updateData({
        pump: {
          name: selectedPump?.name || defaults.pump.name,
          model: (selectedPump as any)?.model || (defaults.pump as any).model,
          basePrice: (selectedPump as any)?.basePrice ?? (defaults.pump as any).basePrice,
          addCost1: (selectedPump as any)?.addCost1 ?? (defaults.pump as any).addCost1,
          addCost2: (selectedPump as any)?.addCost2 ?? (defaults.pump as any).addCost2,
          price: costOf(selectedPump || defaults.pump, true),
        },
        pumpQuantity: packageIncludesPump ? includedPumpQuantity : 1,
        additionalPumps: safeData.additionalPumps || [],
        auxiliaryPumps: auxiliaryPumps,
        auxiliaryPump: auxiliaryPumps[0],
      });
    } else {
      updateData({
        pump: {
          name: defaults.pump.name,
          model: (defaults.pump as any).model,
          basePrice: (defaults.pump as any).basePrice,
          addCost1: (defaults.pump as any).addCost1,
          addCost2: (defaults.pump as any).addCost2,
          price: costOf(defaults.pump, true),
        },
        pumpQuantity: 0,
        additionalPumps: [],
        auxiliaryPumps: [],
        auxiliaryPump: undefined,
      });
    }
  };

  const toggleFilter = (val: boolean) => {
    setIncludeFilter(val);
    if (val) {
      const selectedFilter = hasRealSelection(safeData.filter?.name, 'no filter') ? safeData.filter : selectableDefaults.filter;
      updateData({
        filter: {
          name: selectedFilter?.name || defaults.filter.name,
          sqft: (selectedFilter as any)?.sqft ?? (defaults.filter as any).sqft,
          basePrice: (selectedFilter as any)?.basePrice ?? (defaults.filter as any).basePrice,
          addCost1: (selectedFilter as any)?.addCost1 ?? (defaults.filter as any).addCost1,
          addCost2: (selectedFilter as any)?.addCost2 ?? (defaults.filter as any).addCost2,
          price: costOf(selectedFilter || defaults.filter),
        },
        filterQuantity: Math.max(safeData.filterQuantity ?? 1, 1),
      });
    } else {
      updateData({
        filter: {
          name: defaults.filter.name,
          sqft: (defaults.filter as any).sqft,
          basePrice: (defaults.filter as any).basePrice,
          addCost1: (defaults.filter as any).addCost1,
          addCost2: (defaults.filter as any).addCost2,
          price: costOf(defaults.filter),
        },
        filterQuantity: 0,
      });
    }
  };

  const toggleCleaner = (val: boolean) => {
    setIncludeCleaner(val);
    if (val) {
      const selected = safeData.cleaner?.name ? safeData.cleaner : defaults.cleaner;
      const baseQty = 1;
      updateData({
        cleaner: {
          name: selected.name,
          basePrice: (selected as any).basePrice,
          addCost1: (selected as any).addCost1,
          addCost2: (selected as any).addCost2,
          price: costOf(selected),
        },
        cleanerQuantity: Math.max(safeData.cleanerQuantity ?? baseQty, baseQty),
      });
    } else {
      updateData({
        cleaner: {
          name: defaults.cleaner.name,
          basePrice: (defaults.cleaner as any).basePrice,
          addCost1: (defaults.cleaner as any).addCost1,
          addCost2: (defaults.cleaner as any).addCost2,
          price: costOf(defaults.cleaner),
        },
        cleanerQuantity: 0,
      });
      handleRunChange('cleanerRun', 0);
    }
  };

  const toggleHeater = (val: boolean) => {
    setIncludeHeater(val);
    if (val) {
      const selected = hasRealSelection(safeData.heater?.name, 'no heater') ? safeData.heater : selectableDefaults.heater;
      updateData({
        heater: {
          name: selected?.name || defaults.heater.name,
          btu: (selected as any)?.btu ?? (defaults.heater as any).btu,
          basePrice: (selected as any)?.basePrice ?? (defaults.heater as any).basePrice,
          addCost1: (selected as any)?.addCost1 ?? (defaults.heater as any).addCost1,
          addCost2: (selected as any)?.addCost2 ?? (defaults.heater as any).addCost2,
          price: costOf(selected || defaults.heater),
        },
        heaterQuantity: Math.max(safeData.heaterQuantity ?? 1, 1),
      });
    } else {
      updateData({
        heater: {
          name: defaults.heater.name,
          btu: (defaults.heater as any).btu,
          basePrice: (defaults.heater as any).basePrice,
          addCost1: (defaults.heater as any).addCost1,
          addCost2: (defaults.heater as any).addCost2,
          price: costOf(defaults.heater),
        },
        heaterQuantity: 0,
      });
    }
  };

  useEffect(() => {
    if (!hasPool && (includePoolLights || poolLights.length > 0)) {
      setIncludePoolLights(false);
      commitLighting([], spaLights, false, includeSpaLights);
    }
  }, [hasPool, includePoolLights, poolLights.length, spaLights, includeSpaLights]);

  useEffect(() => {
    if (!hasSpa && (includeSpaLights || spaLights.length > 0)) {
      setIncludeSpaLights(false);
      commitLighting(poolLights, [], includePoolLights, false);
    }
  }, [hasSpa, includeSpaLights, spaLights.length, poolLights, includePoolLights]);

  useEffect(() => {
    if (packageHasNoSanitationSystem) {
      if (includeSalt) {
        setIncludeSalt(false);
      }
      if (safeData.saltSystem || safeData.additionalSaltSystem || (safeData.saltSystemQuantity ?? 0) > 0) {
        updateData({ saltSystem: undefined, saltSystemQuantity: 0, additionalSaltSystem: undefined });
      }
      return;
    }

    const automationSelected =
      includeAutomation && hasRealSelection(safeData.automation?.name, 'no automation');
    const currentSaltIsIncluded = isIncludedSaltCellSelection(safeData.saltSystem);
    const currentSaltIsPrimary =
      isRealSaltSystemSelection(safeData.saltSystem) && !isExcludedFromSaltCell(safeData.saltSystem);

    if (!automationSelected) {
      if (currentSaltIsIncluded) {
        setIncludeSalt(false);
        updateData({ saltSystem: undefined, saltSystemQuantity: 0, additionalSaltSystem: undefined });
        return;
      }
      if (safeData.saltSystem?.name && !currentSaltIsPrimary) {
        const fallbackSaltSystem = primarySaltOptions[0] || selectableDefaults.saltSystem;
        if (fallbackSaltSystem) {
          updateData({
            saltSystem: buildSaltSystemSelection(fallbackSaltSystem),
            saltSystemQuantity: Math.max(safeData.saltSystemQuantity ?? 1, 1),
          });
        }
        return;
      }
      if (currentSaltIsPrimary && !includeSalt) {
        setIncludeSalt(true);
      }
      return;
    }

    if (automationHasIncludedSaltCell) {
      if (!includeSalt) {
        setIncludeSalt(true);
      }
      if (currentSaltIsPrimary) {
        if ((safeData.saltSystemQuantity ?? 0) !== Math.max(safeData.saltSystemQuantity ?? 1, 1)) {
          updateData({ saltSystemQuantity: Math.max(safeData.saltSystemQuantity ?? 1, 1) });
        }
        return;
      }
      if (
        !currentSaltIsIncluded ||
        !safeData.saltSystem?.includedSaltCellPlaceholder ||
        (safeData.saltSystemQuantity ?? 0) !== 0
      ) {
        updateData({ saltSystem: buildIncludedSaltCellOption(), saltSystemQuantity: 0 });
      }
      return;
    }

    if (!includeSalt) {
      setIncludeSalt(true);
    }

    if (!currentSaltIsPrimary) {
      const fallbackSaltSystem = primarySaltOptions[0] || selectableDefaults.saltSystem;
      if (fallbackSaltSystem) {
        updateData({
          saltSystem: buildSaltSystemSelection(fallbackSaltSystem),
          saltSystemQuantity: Math.max(safeData.saltSystemQuantity ?? 1, 1),
        });
      }
      return;
    }

    if ((safeData.saltSystemQuantity ?? 0) < 1) {
      updateData({ saltSystemQuantity: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    packageHasNoSanitationSystem,
    includeAutomation,
    automationHasIncludedSaltCell,
    includeSalt,
    safeData.automation?.name,
    safeData.saltSystem?.name,
    safeData.saltSystem?.excludedFromSaltCell,
    safeData.saltSystem?.includedSaltCellPlaceholder,
    safeData.saltSystemQuantity,
  ]);

  const handlePoolLightSelect = (name: string) => {
    if (name === noneOptionValue) {
      setIncludePoolLights(false);
      commitLighting([], spaLights, false, includeSpaLights);
      return;
    }
    const option = findLightOption(name, 'pool');
    if (!option) return;
    const nextPoolLights = poolLights.length > 0 ? [...poolLights] : [];
    const primary = buildLightSelection(option, 'pool');
    if (nextPoolLights.length > 0) {
      nextPoolLights[0] = primary;
    } else {
      nextPoolLights.push(primary);
    }
    setIncludePoolLights(true);
    commitLighting(nextPoolLights, spaLights, true, includeSpaLights);
  };

  const handleSpaLightSelect = (name: string) => {
    if (name === noneOptionValue) {
      setIncludeSpaLights(false);
      commitLighting(poolLights, [], includePoolLights, false);
      return;
    }
    if (!hasSpa) return;
    const option = findLightOption(name, 'spa');
    if (!option) return;
    const nextSpaLights = spaLights.length > 0 ? [...spaLights] : [];
    const primary = buildLightSelection(option, 'spa');
    if (nextSpaLights.length > 0) {
      nextSpaLights[0] = primary;
    } else {
      nextSpaLights.push(primary);
    }
    setIncludeSpaLights(true);
    commitLighting(poolLights, nextSpaLights, includePoolLights, true);
  };

  const addPoolLight = () => {
    const defaultLight = getDefaultLightOption('pool');
    if (!defaultLight) return;
    const nextPoolLights = [...poolLights, buildLightSelection(defaultLight, 'pool')];
    commitLighting(nextPoolLights, spaLights, true, includeSpaLights);
  };

  const removePoolLight = (index: number) => {
    const next = poolLights.filter((_, i) => i !== index);
    if (next.length === 0) {
      setIncludePoolLights(false);
      commitLighting([], spaLights, false, includeSpaLights);
      return;
    }
    commitLighting(next, spaLights, true, includeSpaLights);
  };

  const handlePoolLightChange = (index: number, name: string) => {
    const option = findLightOption(name, 'pool');
    if (!option) return;
    const next = [...poolLights];
    next[index] = buildLightSelection(option, 'pool');
    commitLighting(next, spaLights, true, includePoolLights);
  };

  const addSpaLight = () => {
    const defaultLight = getDefaultLightOption('spa');
    if (!defaultLight || !hasSpa) return;
    const nextSpaLights = [...spaLights, buildLightSelection(defaultLight, 'spa')];
    commitLighting(poolLights, nextSpaLights, includePoolLights, true);
  };

  const removeSpaLight = (index: number) => {
    const next = spaLights.filter((_, i) => i !== index);
    if (next.length === 0) {
      setIncludeSpaLights(false);
      commitLighting(poolLights, [], includePoolLights, false);
      return;
    }
    commitLighting(poolLights, next, includePoolLights, true);
  };

  const handleSpaLightChange = (index: number, name: string) => {
    const option = findLightOption(name, 'spa');
    if (!option) return;
    const next = [...spaLights];
    next[index] = buildLightSelection(option, 'spa');
    commitLighting(poolLights, next, includePoolLights, true);
  };

  const toggleAutomation = (val: boolean) => {
    setIncludeAutomation(val);
    if (val) {
      const selected = hasRealSelection(safeData.automation?.name, 'no automation')
        ? safeData.automation
        : selectableDefaults.automation;
      updateData({
        automation: {
          name: selected?.name || defaults.automation.name,
          basePrice: (selected as any)?.basePrice ?? (defaults.automation as any).basePrice,
          addCost1: (selected as any)?.addCost1 ?? (defaults.automation as any).addCost1,
          addCost2: (selected as any)?.addCost2 ?? (defaults.automation as any).addCost2,
          addCost3: (selected as any)?.addCost3 ?? (defaults.automation as any).addCost3,
          includesSaltCell:
            (selected as any)?.includesSaltCell ?? (defaults.automation as any).includesSaltCell,
          price: costOf(selected || defaults.automation),
          zones: safeData.automation?.zones ?? 0,
        },
        automationQuantity: Math.max(safeData.automationQuantity ?? 1, 1),
      });
    } else {
      updateData({
        automation: {
          name: defaults.automation.name,
          basePrice: (defaults.automation as any).basePrice,
          addCost1: (defaults.automation as any).addCost1,
          addCost2: (defaults.automation as any).addCost2,
          addCost3: (defaults.automation as any).addCost3,
          includesSaltCell: (defaults.automation as any).includesSaltCell,
          price: costOf(defaults.automation),
          zones: 0,
        },
        automationQuantity: 0,
      });
    }
  };

  const toggleSalt = (val: boolean) => {
    setIncludeSalt(val);
    if (!val) {
      updateData({ saltSystem: undefined, saltSystemQuantity: 0, additionalSaltSystem: undefined });
    }
  };

  const toggleAutoFill = (val: boolean) => {
    setIncludeAutoFill(val);
    if (!val) {
      updateData({ autoFillSystem: undefined, autoFillSystemQuantity: 0, hasAutoFill: false });
      handleRunChange('autoFillRun', 0);
    }
  };

  const handlePumpSelect = (name: string) => {
    if (name === noneOptionValue) {
      togglePump(false);
      return;
    }
    setIncludePump(true);
    handlePumpChange(name);
  };

  const handleFilterSelect = (name: string) => {
    if (name === noneOptionValue) {
      toggleFilter(false);
      return;
    }
    setIncludeFilter(true);
    handleFilterChange(name);
  };

  const handleCleanerSelect = (name: string) => {
    if (name === noneOptionValue) {
      toggleCleaner(false);
      return;
    }
    setIncludeCleaner(true);
    handleCleanerChange(name);
  };

  const handleHeaterSelect = (name: string) => {
    if (name === noneOptionValue) {
      toggleHeater(false);
      return;
    }
    setIncludeHeater(true);
    handleHeaterChange(name);
  };

  const handleAutomationSelect = (name: string) => {
    if (name === noneOptionValue) {
      toggleAutomation(false);
      return;
    }
    setIncludeAutomation(true);
    handleAutomationChange(name);
  };

  const handleSaltSelect = (name: string) => {
    if (name === noneOptionValue) {
      toggleSalt(false);
      return;
    }
    setIncludeSalt(true);
    handleSaltSystemChange(name);
  };

  const handleAutoFillSelect = (name: string) => {
    if (name === noneOptionValue) {
      toggleAutoFill(false);
      return;
    }
    setIncludeAutoFill(true);
    handleAutoFillSystemChange(name);
  };

  const handlePumpChange = (name: string) => {
    const pump = pricingData.equipment.pumps.find(p => p.name === name);
    if (pump) {
      updateData({
        pump: {
          name: pump.name,
          model: (pump as any).model,
          basePrice: (pump as any).basePrice,
          addCost1: (pump as any).addCost1,
          addCost2: (pump as any).addCost2,
          price: costOf(pump, true),
        },
        pumpQuantity: packageIncludesPump ? includedPumpQuantity : 1,
      });
    }
  };

  const handleAdditionalPumpChange = (index: number, name: string | number) => {
    const pump = pricingData.equipment.pumps.find((p) => p.name === name);
    if (!pump) return;
    const next = [...additionalPumps];
    next[index] = {
      name: pump.name,
      model: (pump as any).model,
      basePrice: (pump as any)?.basePrice,
      addCost1: (pump as any)?.addCost1,
      addCost2: (pump as any)?.addCost2,
      price: costOf(pump, true),
    };
    setAdditionalPumps(next);
  };

  const handleAuxiliaryPumpChange = (index: number, name: string | number) => {
    const pump = auxiliaryPumpCatalog.find((p: any) => p.name === name);
    if (!pump) return;
    const next = [...auxiliaryPumps];
    const existing = next[index];
    next[index] = {
      name: pump.name,
      model: (pump as any).model,
      basePrice: (pump as any).basePrice,
      addCost1: (pump as any).addCost1,
      addCost2: (pump as any).addCost2,
      price: costOf(pump, true),
      autoAddedForSpa: existing?.autoAddedForSpa,
      autoAddedReason: existing?.autoAddedReason,
    };
    setAuxiliaryPumps(next);
  };

  const addAuxiliaryPump = () => {
    if (!packageAllowsPumpChanges || auxiliaryPumps.length >= maxAuxiliaryPumps) return;
    const defaultPump = getDefaultAuxiliaryPump() || selectableDefaults.pump;
    setAuxiliaryPumps([
      ...auxiliaryPumps,
      {
        name: defaultPump.name,
        model: (defaultPump as any).model,
        basePrice: (defaultPump as any).basePrice,
        addCost1: (defaultPump as any).addCost1,
        addCost2: (defaultPump as any).addCost2,
        price: costOf(defaultPump, true),
        autoAddedForSpa: false,
        autoAddedReason: undefined,
      },
    ]);
  };

  const addAdditionalPump = () => {
    if (!packageAllowsPumpChanges) return;
    const selectedPump =
      hasRealSelection(safeData.pump?.name, 'no pump') && safeData.pump?.name
        ? pumpOptions.find((pump) => pump.name === safeData.pump?.name) || safeData.pump
        : selectableDefaults.pump;
    if (!selectedPump) return;

    setAdditionalPumps([
      ...additionalPumps,
      {
        name: selectedPump.name,
        model: (selectedPump as any).model,
        basePrice: (selectedPump as any).basePrice,
        addCost1: (selectedPump as any).addCost1,
        addCost2: (selectedPump as any).addCost2,
        price: costOf(selectedPump, true),
      },
    ]);
  };

  const removeAuxiliaryPump = (index: number) => {
    const next = auxiliaryPumps.filter((_, i) => i !== index);
    setAuxiliaryPumps(next);
  };

  const removeAdditionalPump = (index: number) => {
    const next = additionalPumps.filter((_, i) => i !== index);
    setAdditionalPumps(next);
  };

  const handleFilterChange = (name: string) => {
    const filter = pricingData.equipment.filters.find(f => f.name === name);
    if (filter) {
      updateData({
        filter: {
          name: filter.name,
          sqft: (filter as any).sqft,
          basePrice: (filter as any).basePrice,
          addCost1: (filter as any).addCost1,
          addCost2: (filter as any).addCost2,
          price: costOf(filter),
        },
        filterQuantity: Math.max(safeData.filterQuantity ?? 1, 1),
      });
    }
  };

  const handleCleanerChange = (name: string) => {
    const cleaner = pricingData.equipment.cleaners.find(c => c.name === name);
    if (cleaner) {
      const nextQuantity = safeData.cleanerQuantity && safeData.cleanerQuantity > 0 ? safeData.cleanerQuantity : 1;
      updateData({
        cleaner: {
          name: cleaner.name,
          basePrice: (cleaner as any).basePrice,
          addCost1: (cleaner as any).addCost1,
          addCost2: (cleaner as any).addCost2,
          price: costOf(cleaner),
        },
        cleanerQuantity: nextQuantity,
      });
    }
  };

  const handleHeaterChange = (name: string) => {
    const heater = pricingData.equipment.heaters.find(h => h.name === name);
    if (heater) {
      updateData({
        heater: {
          name: heater.name,
          btu: (heater as any).btu,
          basePrice: (heater as any).basePrice,
          addCost1: (heater as any).addCost1,
          addCost2: (heater as any).addCost2,
          price: costOf(heater),
        },
        heaterQuantity: Math.max(safeData.heaterQuantity ?? 1, 1),
      });
    }
  };

  const handleAutomationChange = (name: string) => {
    const automation = pricingData.equipment.automation.find(a => a.name === name);
    if (automation) {
      updateData({
        automation: {
          name: automation.name,
          basePrice: (automation as any).basePrice,
          addCost1: (automation as any).addCost1,
          addCost2: (automation as any).addCost2,
          addCost3: (automation as any).addCost3,
          includesSaltCell: (automation as any).includesSaltCell,
          price: costOf(automation),
          zones: safeData.automation.zones,
        },
        automationQuantity: Math.max(safeData.automationQuantity ?? 1, 1),
      });
    }
  };

  const handleSaltSystemChange = (name?: string) => {
    if (!name) {
      updateData({ saltSystem: undefined, saltSystemQuantity: 0, additionalSaltSystem: undefined });
      return;
    }
    if (isIncludedSaltCellOptionName(name)) {
      updateData({ saltSystem: buildIncludedSaltCellOption(), saltSystemQuantity: 0 });
      return;
    }
    const system = pricingData.equipment.saltSystem.find(s => s.name === name);
    if (!system) {
      updateData({ saltSystem: undefined, saltSystemQuantity: 0 });
      return;
    }
    const nextQuantity = Math.max(safeData.saltSystemQuantity ?? 1, 1);
    updateData({
      saltSystem: buildSaltSystemSelection(system),
      saltSystemQuantity: nextQuantity,
    });
  };

  const handleAdditionalSaltSystemChange = (name?: string) => {
    if (!name || name === noneOptionValue) {
      updateData({ additionalSaltSystem: undefined });
      return;
    }
    const system = pricingData.equipment.saltSystem.find(s => s.name === name);
    if (!system || !isExcludedFromSaltCell(system)) {
      updateData({ additionalSaltSystem: undefined });
      return;
    }
    updateData({ additionalSaltSystem: buildSaltSystemSelection(system) });
  };

  const handleAutoFillSystemChange = (name?: string) => {
    if (!name) {
      updateData({ autoFillSystem: undefined, autoFillSystemQuantity: 0, hasAutoFill: false });
      return;
    }
    const system = pricingData.equipment.autoFillSystem.find(s => s.name === name);
    if (!system) {
      updateData({ autoFillSystem: undefined, autoFillSystemQuantity: 0, hasAutoFill: false });
      return;
    }
    const nextQuantity = Math.max(safeData.autoFillSystemQuantity ?? 1, 1);
    updateData({
      autoFillSystem: buildAutoFillSelection(system),
      autoFillSystemQuantity: nextQuantity,
      hasAutoFill: false,
    });
  };

  const handleSanitationAccessoryChange = (name?: string) => {
    if (!name || name === noneOptionValue) {
      updateData({ sanitationAccessory: undefined, sanitationAccessoryQuantity: 0 });
      return;
    }
    const accessory = sanitationAccessoryCatalog.find((entry: any) => entry.name === name);
    if (!accessory) {
      updateData({ sanitationAccessory: undefined, sanitationAccessoryQuantity: 0 });
      return;
    }
    updateData({
      sanitationAccessory: buildSanitationAccessorySelection(accessory),
      sanitationAccessoryQuantity: Math.max(safeData.sanitationAccessoryQuantity ?? 1, 1),
    });
  };

  const renderReadOnlySelection = (label: string, value: string, note?: string, showRetired?: boolean) => (
    <div className="spec-field">
      {showRetired ? <LabelWithRetired text={label} showRetired={showRetired} /> : <label className="spec-label">{label}</label>}
      <CompactInput type="text" value={value} readOnly />
      {note && <small className="form-help">{note}</small>}
    </div>
  );

  const renderReadOnlyQuantity = (label: string, value: number, note?: string) => (
    <div className="spec-field" style={{ maxWidth: '220px' }}>
      <label className="spec-label">{label}</label>
      <CompactInput value={value} unit="ea" readOnly />
      {note && <small className="form-help">{note}</small>}
    </div>
  );

  return (
    <div className="section-form">
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Package Options</h2>
        </div>
        <div className="equipment-package-options">
          {packageOptions.map((option) => {
            const isSelected = safeData.packageSelectionId === option.id;
            const isDisabled = hasSpa && !packageSupportsSpa(option);
            const buttonTitle = isDisabled ? packageButtonDisabledMessage : undefined;
            const isCustom = isCustomEquipmentPackage(option);
            const packageStatusLabel = isSelected ? 'Selected' : isDisabled ? 'Spa blocked' : 'Available';
            const packageStatusClass = isSelected ? 'selected' : isDisabled ? 'disabled' : 'available';
            const packageDescription = getPackageButtonDescription(option);
            return (
              <button
                key={option.id}
                type="button"
                className={`equipment-package-button ${isSelected ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                title={buttonTitle}
                aria-disabled={isDisabled}
                aria-pressed={isSelected}
                onClick={() => {
                  if (isDisabled) return;
                  if (option.id !== safeData.packageSelectionId) {
                    onSelectPackage(option.id);
                  }
                }}
              >
                <span className="equipment-package-button__header">
                  <span className="equipment-package-button__eyebrow">{isCustom ? 'Custom build' : 'Fixed bundle'}</span>
                  <span className={`equipment-package-button__status ${packageStatusClass}`}>{packageStatusLabel}</span>
                </span>
                <span className="equipment-package-button__title">{option.name}</span>
                {packageDescription && (
                  <span className="equipment-package-button__description">{packageDescription}</span>
                )}
              </button>
            );
          })}
        </div>
        {selectedPackage && packageSummaryRows.length > 0 && (
          <div className="package-summary">
            <div className="package-summary-header">
              <strong>Equipment Package Contents</strong>
            </div>
            <div className="package-summary-grid">
              {packageSummaryRows.map((row) => (
                <div key={`${row.label}-${row.value}`} className="package-summary-item">
                  <span className="package-summary-label">{row.label}</span>
                  <span className="package-summary-value">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

        {/* Pump */}
      <div className="spec-block">
          <div className="spec-block-header">
            <h2 className="spec-block-title">Pump</h2>
          </div>
          <div className="spec-grid spec-grid-2">
            {packageIncludesPump
              ? renderReadOnlySelection('Pump', safeData.pump?.name || selectedPackage?.includedPumpName || 'Included', packageLockedCategoryMessage)
              : (
                <div className="spec-field">
                  <LabelWithRetired text="Pump" showRetired={retiredFlags.pump} />
                  <select
                    className="compact-input equipment-select"
                    value={includePump ? safeData.pump.name : noneOptionValue}
                    onChange={(e) => handlePumpSelect(e.target.value)}
                  >
                    <option value={noneOptionValue}>None</option>
                    {retiredFlags.pump && renderRetiredOption(safeData.pump.name)}
                    {pumpOptions.map(pump => (
                      <option key={pump.name} value={pump.name}>
                        {formatOptionLabel(pump.name, costOf(pump, true))}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            {packageIncludesPump
              ? renderReadOnlyQuantity('Pump Quantity', Math.max(selectedPackage?.includedPumpQuantity ?? pumpQuantity, 0))
              : includePump && (
                renderReadOnlyQuantity('Pump Quantity', pumpQuantity)
              )}
          </div>
        {(includePump || packageIncludesPump) && (
          <>
              {additionalPumps.map((pump, idx) => (
                <div key={`additional-pump-${idx}`} className="spec-field equipment-extra-field">
                  <LabelWithRetired text={`Additional Pump ${idx + 1}`} showRetired={retiredFlags.additionalPumps[idx]} />
                  <div className="equipment-inline-row">
                    <select
                      className="compact-input equipment-select"
                      value={pump?.name || safeData.pump?.name || selectableDefaults.pump?.name || ''}
                      onChange={(e) => handleAdditionalPumpChange(idx, e.target.value)}
                    >
                      {retiredFlags.additionalPumps[idx] && renderRetiredOption(pump?.name || safeData.pump?.name)}
                      {pumpOptions.map((option) => (
                        <option key={option.name} value={option.name}>
                          {formatOptionLabel(option.name, costOf(option, true))}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="link-btn danger"
                      onClick={() => removeAdditionalPump(idx)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {auxiliaryPumps.map((pump, idx) => (
                <div key={idx} className="spec-field equipment-extra-field">
                  <LabelWithRetired text={`Auxiliary Pump ${idx + 1}`} showRetired={retiredFlags.auxiliaryPumps[idx]} />
                  <div className="equipment-inline-row">
                    <select
                      className="compact-input equipment-select"
                      value={pump?.name || getDefaultAuxiliaryPump()?.name || ''}
                      onChange={(e) => handleAuxiliaryPumpChange(idx, e.target.value)}
                    >
                      {retiredFlags.auxiliaryPumps[idx] && renderRetiredOption(pump?.name || getDefaultAuxiliaryPump()?.name)}
                      {auxiliaryPumpOptions.map((option: any) => (
                        <option key={option.name} value={option.name}>
                          {formatOptionLabel(option.name, costOf(option, true))}
                        </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() => removeAuxiliaryPump(idx)}
                    title={
                      pump?.autoAddedReason === 'waterFeature'
                        ? 'This pump will be added again while the package still needs it for water features.'
                        : undefined
                    }
                  >
                    Remove
                  </button>
                </div>
                {pump?.autoAddedForSpa && (
                  <small className="form-help">Auto-added for spa.</small>
                )}
                {pump?.autoAddedReason === 'waterFeature' && (
                  <small className="form-help">Additional pump added for Water Feature</small>
                )}
              </div>
            ))}

            {packageAllowsPumpChanges && (
              <div
                className="action-row"
                style={{ marginTop: additionalPumps.length || auxiliaryPumps.length ? '8px' : '12px' }}
              >
                <button
                  type="button"
                  className="action-btn secondary"
                  onClick={addAdditionalPump}
                >
                  Add Additional Pump
                </button>
                <button
                  type="button"
                  className="action-btn secondary"
                  onClick={addAuxiliaryPump}
                  disabled={auxiliaryPumps.length >= maxAuxiliaryPumps}
                  title={auxiliaryPumps.length >= maxAuxiliaryPumps ? 'Maximum auxiliary pumps reached.' : undefined}
                >
                  Add Auxiliary Pump
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Filter */}
        <div className="spec-block">
          <div className="spec-block-header">
            <h2 className="spec-block-title">Filter</h2>
          </div>
          <div className="spec-grid spec-grid-2">
            {packageIncludesFilter
              ? renderReadOnlySelection(
                  'Filter',
                  safeData.filter?.name || selectedPackage?.includedFilterName || 'Included',
                  packageLockedCategoryMessage
                )
              : (
                <div className="spec-field">
                  <LabelWithRetired text="Filter" showRetired={retiredFlags.filter} />
                  <select
                    className="compact-input equipment-select"
                    value={includeFilter ? safeData.filter.name : noneOptionValue}
                    onChange={(e) => handleFilterSelect(e.target.value)}
                  >
                    <option value={noneOptionValue}>None</option>
                    {retiredFlags.filter && renderRetiredOption(safeData.filter.name)}
                    {filterOptions.map(filter => (
                      <option key={filter.name} value={filter.name}>
                        {formatOptionLabel(`${filter.name} (${filter.sqft} sqft)`, costOf(filter))}
                      </option>
                    ))}
                  </select>
                </div>
              )}
          {packageIncludesFilter
            ? renderReadOnlyQuantity('Filter Quantity', Math.max(selectedPackage?.includedFilterQuantity ?? filterQuantity, 0))
            : includeFilter && (
              <div className="spec-field" style={{ maxWidth: '220px' }}>
                <label className="spec-label">Filter Quantity</label>
                <CompactInput
                  value={filterQuantity}
                  onChange={(e) => updateData({ filterQuantity: Math.max(0, parseInt(e.target.value) || 0) })}
                  unit="ea"
                  min="0"
                  step="1"
                  placeholder="1"
                />
              </div>
            )}
        </div>
      </div>

      {/* Cleaner */}
        <div className="spec-block">
          <div className="spec-block-header">
            <h2 className="spec-block-title">Cleaner</h2>
          </div>
          <div className="spec-grid-3-split">
            {packageIncludesCleaner
              ? renderReadOnlySelection(
                  'Cleaner',
                  safeData.cleaner?.name || selectedPackage?.includedCleanerName || 'Included',
                  packageLockedCategoryMessage
                )
              : (
                <div className="spec-field">
                  <LabelWithRetired text="Cleaner" showRetired={retiredFlags.cleaner} />
                  <select
                    className="compact-input equipment-select"
                    value={includeCleaner ? safeData.cleaner.name : noneOptionValue}
                    onChange={(e) => handleCleanerSelect(e.target.value)}
                    disabled={cleanerDisabledByPackage}
                    title={cleanerDisabledByPackage ? 'This equipment package does not allow cleaner upgrades.' : undefined}
                  >
                    <option value={noneOptionValue}>None</option>
                    {retiredFlags.cleaner && renderRetiredOption(safeData.cleaner.name)}
                    {cleanerOptions.map(cleaner => (
                      <option key={cleaner.name} value={cleaner.name}>
                        {formatOptionLabel(cleaner.name, costOf(cleaner))}
                      </option>
                    ))}
                  </select>
                  {cleanerDisabledByPackage && (
                    <small className="form-help">This equipment package does not allow cleaner upgrades.</small>
                  )}
                </div>
              )}
          {(includeCleaner || packageIncludesCleaner) && (
            <div className="spec-field">
              <label className="spec-label">Cleaner Quantity</label>
              <CompactInput
                value={packageIncludesCleaner ? Math.max(selectedPackage?.includedCleanerQuantity ?? cleanerQuantity, 0) : cleanerQuantity}
                onChange={(e) => updateData({ cleanerQuantity: Math.max(0, parseInt(e.target.value) || 0) })}
                unit="ea"
                min="0"
                step="1"
                placeholder="1"
                readOnly={packageIncludesCleaner}
              />
            </div>
          )}
          {(includeCleaner || packageIncludesCleaner) && (
            <div className="spec-field">
              <label className="spec-label">Cleaner Run</label>
              <CompactInput
                value={plumbingRuns.cleanerRun ?? 0}
                onChange={(e) => handleRunChange('cleanerRun', parseFloat(e.target.value) || 0)}
                unit="LNFT"
                min="0"
                step="1"
                placeholder="0"
              />
            </div>
          )}
        </div>
      </div>

      {/* Heating */}
        <div className="spec-block">
          <div className="spec-block-header">
            <h2 className="spec-block-title">Heater</h2>
          </div>
          <div className="spec-grid spec-grid-2">
            {packageIncludesHeater
              ? renderReadOnlySelection(
                  'Heater Model',
                  safeData.heater?.name || selectedPackage?.includedHeaterName || 'Included',
                  packageLockedCategoryMessage
                )
              : (
                <div className="spec-field">
                  <LabelWithRetired text="Heater Model" showRetired={retiredFlags.heater} />
                  <select
                    className="compact-input equipment-select"
                    value={includeHeater ? safeData.heater.name : noneOptionValue}
                    onChange={(e) => handleHeaterSelect(e.target.value)}
                    disabled={heaterDisabledByPackage}
                    title={heaterDisabledByPackage ? 'This equipment package does not allow heater upgrades.' : undefined}
                  >
                    <option value={noneOptionValue}>None</option>
                    {retiredFlags.heater && renderRetiredOption(safeData.heater.name)}
                    {heaterOptions.map(heater => (
                      <option key={heater.name} value={heater.name}>
                        {formatOptionLabel(heater.name, costOf(heater))}
                      </option>
                    ))}
                  </select>
                  {heaterDisabledByPackage && (
                    <small className="form-help">This equipment package does not allow heater upgrades.</small>
                  )}
                </div>
              )}
          {packageIncludesHeater
            ? renderReadOnlyQuantity('Heater Quantity', Math.max(selectedPackage?.includedHeaterQuantity ?? heaterQuantity, 0))
            : includeHeater && (
              <div className="spec-field" style={{ maxWidth: '220px' }}>
                <label className="spec-label">Heater Quantity</label>
                <CompactInput
                  value={heaterQuantity}
                  onChange={(e) => updateData({ heaterQuantity: Math.max(0, parseInt(e.target.value) || 0) })}
                  unit="ea"
                  min="0"
                  step="1"
                  placeholder="1"
                />
              </div>
            )}
        </div>

      </div>

      {/* Pool Lights */}
        <div className="spec-block">
          <div className="spec-block-header">
            <h2 className="spec-block-title">Pool Lights</h2>
          </div>
          {packageIncludesPoolLights
            ? renderReadOnlySelection(
                'Pool Light 1 (Included in Package)',
                poolLights[0]?.name || selectedPackage?.includedPoolLightName || 'Included',
                packageLockedCategoryMessage
              )
            : (
              <div className="spec-field">
                <LabelWithRetired text="Pool Light 1 (Added Automatically)" showRetired={retiredFlags.poolLights[0]} />
                <select
                  className="compact-input equipment-select"
                  value={includePoolLights && poolLights.length > 0 ? poolLights[0]?.name || noneOptionValue : noneOptionValue}
                  onChange={(e) => handlePoolLightSelect(e.target.value)}
                >
                  <option value={noneOptionValue}>None</option>
                  {retiredFlags.poolLights[0] && renderRetiredOption(poolLights[0]?.name)}
                  {poolLightOptions.map(option => (
                    <option key={option.name} value={option.name}>
                      {formatOptionLabel(option.name, costOf(option))}
                    </option>
                  ))}
                </select>
              </div>
            )}
          {(includePoolLights || packageIncludesPoolLights) && (
            <>
              {poolLights.slice(1).map((light, idx) => (
                <div key={`pool-light-${idx + 1}`} className="spec-field equipment-extra-field">
                  <LabelWithRetired
                    text={
                      isFixedPackage
                        ? idx === 0
                          ? 'Pool Light 2 (Upgrade)'
                          : `Additional Pool Light ${idx + 2}`
                        : idx === 0
                        ? 'Pool Light 2 (Added Automatically)'
                        : `Additional Pool Light ${idx + 2}`
                    }
                    showRetired={retiredFlags.poolLights[idx + 1]}
                  />
                  <div className="equipment-inline-row">
                      <select
                      className="compact-input equipment-select"
                      value={light?.name || getDefaultLightOption('pool')?.name || ''}
                      onChange={(e) => handlePoolLightChange(idx + 1, e.target.value)}
                    >
                      {retiredFlags.poolLights[idx + 1] && renderRetiredOption(light?.name)}
                      {poolLightOptions.map(option => (
                        <option key={option.name} value={option.name}>
                          {formatOptionLabel(option.name, costOf(option))}
                        </option>
                      ))}
                  </select>
                  <button type="button" className="link-btn danger" onClick={() => removePoolLight(idx + 1)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <div className="action-row" style={{ marginTop: '12px' }}>
              <button
                type="button"
                className="action-btn secondary"
                onClick={addPoolLight}
                disabled={Boolean(addPoolLightDisabledReason)}
                title={addPoolLightDisabledReason}
              >
                Add another Pool Light
              </button>
            </div>
          </>
        )}
      </div>

      {/* Spa Lights */}
        {hasSpa && (
          <div className="spec-block">
            <div className="spec-block-header">
              <h2 className="spec-block-title">Spa Lights</h2>
            </div>
            {packageIncludesSpaLights
              ? renderReadOnlySelection(
                  'Spa Light (Included in Package)',
                  spaLights[0]?.name || selectedPackage?.includedSpaLightName || 'Included',
                  packageLockedCategoryMessage
                )
              : (
                <div className="spec-field">
                  <LabelWithRetired text="Spa Light (Added Automatically)" showRetired={retiredFlags.spaLights[0]} />
                  <select
                    className="compact-input equipment-select"
                    value={includeSpaLights && spaLights.length > 0 ? spaLights[0]?.name || noneOptionValue : noneOptionValue}
                    onChange={(e) => handleSpaLightSelect(e.target.value)}
                    disabled={Boolean(addSpaLightDisabledReason)}
                    title={addSpaLightDisabledReason}
                  >
                    <option value={noneOptionValue}>None</option>
                    {retiredFlags.spaLights[0] && renderRetiredOption(spaLights[0]?.name)}
                    {spaLightOptions.map(option => (
                      <option key={option.name} value={option.name}>
                        {formatOptionLabel(option.name, costOf(option))}
                      </option>
                    ))}
                  </select>
                  {addSpaLightDisabledReason && (
                    <small className="form-help">This equipment package does not allow spa light upgrades.</small>
                  )}
                </div>
              )}
            {(includeSpaLights || packageIncludesSpaLights) && (
              <>
                {spaLights.slice(1).map((light, idx) => (
                  <div key={`spa-light-${idx + 1}`} className="spec-field equipment-extra-field">
                    <LabelWithRetired
                      text={`Additional Spa Light ${idx + 1}`}
                      showRetired={retiredFlags.spaLights[idx + 1]}
                    />
                    <div className="equipment-inline-row">
                      <select
                        className="compact-input equipment-select"
                        value={light?.name || getDefaultLightOption('spa')?.name || ''}
                        onChange={(e) => handleSpaLightChange(idx + 1, e.target.value)}
                      >
                        {retiredFlags.spaLights[idx + 1] && renderRetiredOption(light?.name)}
                        {spaLightOptions.map(option => (
                          <option key={option.name} value={option.name}>
                            {formatOptionLabel(option.name, costOf(option))}
                          </option>
                      ))}
                    </select>
                    <button type="button" className="link-btn danger" onClick={() => removeSpaLight(idx + 1)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              <div className="action-row" style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  className="action-btn secondary"
                  onClick={addSpaLight}
                  disabled={Boolean(addSpaLightDisabledReason)}
                  title={addSpaLightDisabledReason}
                >
                  Add another Spa Light
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Automation */}
        <div className="spec-block">
          <div className="spec-block-header">
            <h2 className="spec-block-title">Automation</h2>
          </div>
          <div className="spec-grid spec-grid-2">
            {packageIncludesAutomation
              ? renderReadOnlySelection(
                  'Automation System',
                  safeData.automation?.name || selectedPackage?.includedAutomationName || 'Included',
                  packageLockedCategoryMessage
                )
              : (
                <div className="spec-field">
                  <LabelWithRetired text="Automation System" showRetired={retiredFlags.automation} />
                  <select
                    className="compact-input equipment-select"
                    value={includeAutomation ? safeData.automation.name : noneOptionValue}
                    onChange={(e) => handleAutomationSelect(e.target.value)}
                    disabled={automationDisabledByPackage}
                    title={automationDisabledByPackage ? 'This equipment package does not allow automation changes.' : undefined}
                  >
                    <option value={noneOptionValue}>None</option>
                    {retiredFlags.automation && renderRetiredOption(safeData.automation.name)}
                    {automationOptions.map(option => (
                      <option key={option.name} value={option.name}>
                        {formatOptionLabel(option.name, costOf(option))}
                      </option>
                    ))}
                  </select>
                  {automationDisabledByPackage && (
                    <small className="form-help">Automation is locked by the selected equipment package.</small>
                  )}
                </div>
              )}
          {packageIncludesAutomation
            ? renderReadOnlyQuantity(
                'Automation System Quantity',
                Math.max(selectedPackage?.includedAutomationQuantity ?? automationQuantity, 0)
              )
            : includeAutomation && (
              <div className="spec-field" style={{ maxWidth: '220px' }}>
                <label className="spec-label">Automation System Quantity</label>
                <CompactInput
                  value={automationQuantity}
                  onChange={(e) =>
                    updateData({ automationQuantity: Math.max(0, parseInt(e.target.value) || 0) })
                  }
                  unit="ea"
                  min="0"
                  step="1"
                  placeholder="1"
                />
              </div>
            )}
        </div>
      </div>

      {/* Sanitation System (formerly Salt) */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Sanitation System</h2>
        </div>
        <div className="spec-grid-3-split">
          {packageLocksSanitationSystem
            ? renderReadOnlySelection(
                'Sanitation System',
                packageIncludesSalt
                  ? safeData.saltSystem?.name || selectedPackage?.includedSaltSystemName || 'Included'
                  : 'None',
                packageIncludesSalt ? packageLockedCategoryMessage : undefined
              )
            : (
              <div className="spec-field">
                <LabelWithRetired text="Sanitation System" showRetired={retiredFlags.saltSystem} />
                <select
                  className="compact-input equipment-select"
                  value={includeSalt ? safeData.saltSystem?.name || noneOptionValue : noneOptionValue}
                  onChange={(e) => handleSaltSelect(e.target.value)}
                >
                  {!includeAutomation && <option value={noneOptionValue}>None</option>}
                  {retiredFlags.saltSystem && renderRetiredOption(safeData.saltSystem?.name)}
                  {visibleSaltOptions.map(system => (
                    <option key={system.name} value={system.name}>
                      {formatOptionLabel(system.name, costOf(system))}
                    </option>
                  ))}
                </select>
              </div>
            )}
          {!isFixedPackage && showAdditionalSaltOptions && (
            <div className="spec-field">
              <label className="spec-label">Additional Options</label>
              <select
                className="compact-input equipment-select"
                value={safeData.additionalSaltSystem?.name || noneOptionValue}
                onChange={(e) => handleAdditionalSaltSystemChange(e.target.value)}
              >
                <option value={noneOptionValue}>None</option>
                {safeData.additionalSaltSystem?.name &&
                  !additionalSaltOptions.some((system) => system.name === safeData.additionalSaltSystem?.name) &&
                  renderRetiredOption(safeData.additionalSaltSystem?.name)}
                {additionalSaltOptions.map(system => (
                  <option key={system.name} value={system.name}>
                    {formatOptionLabel(system.name, costOf(system))}
                  </option>
                ))}
              </select>
            </div>
          )}
          {packageIncludesSalt
            ? renderReadOnlyQuantity(
                'Sanitation System Quantity',
                Math.max(selectedPackage?.includedSaltSystemQuantity ?? saltSystemQuantity, 0)
              )
            : showSaltQuantity && (
              <div className="spec-field" style={{ maxWidth: '220px' }}>
                <label className="spec-label">Sanitation System Quantity</label>
                <CompactInput
                  value={saltSystemQuantity}
                  onChange={(e) =>
                    updateData({ saltSystemQuantity: Math.max(1, parseInt(e.target.value) || 1) })
                  }
                  unit="ea"
                  min="1"
                  step="1"
                  placeholder="1"
                />
              </div>
            )}
        </div>
        <div className="spec-grid spec-grid-2">
          {packageIncludesSanitationAccessory
            ? renderReadOnlySelection(
                'Sanitation Accessory',
                safeData.sanitationAccessory?.name || selectedPackage?.includedSanitationAccessoryName || 'Included',
                packageLockedCategoryMessage
              )
            : (
              <div className="spec-field">
                <LabelWithRetired text="Sanitation Accessory" showRetired={retiredFlags.sanitationAccessory} />
                <select
                  className="compact-input equipment-select"
                  value={includeSanitationAccessory ? safeData.sanitationAccessory?.name || noneOptionValue : noneOptionValue}
                  onChange={(e) => handleSanitationAccessoryChange(e.target.value)}
                  disabled={sanitationAccessoryDisabledByPackage}
                  title={
                    sanitationAccessoryDisabledByPackage
                      ? 'This equipment package does not allow sanitation accessory upgrades.'
                      : undefined
                  }
                >
                  <option value={noneOptionValue}>None</option>
                  {retiredFlags.sanitationAccessory && renderRetiredOption(safeData.sanitationAccessory?.name)}
                  {sanitationAccessoryOptions.map((accessory: any) => (
                    <option key={accessory.name} value={accessory.name}>
                      {formatOptionLabel(accessory.name, costOf(accessory))}
                    </option>
                  ))}
                </select>
                {sanitationAccessoryDisabledByPackage && (
                  <small className="form-help">This equipment package does not allow sanitation accessory upgrades.</small>
                )}
              </div>
            )}
          {(includeSanitationAccessory || packageIncludesSanitationAccessory) && (
            <div className="spec-field" style={{ maxWidth: '220px' }}>
              <label className="spec-label">Accessory Quantity</label>
              <CompactInput
                value={
                  packageIncludesSanitationAccessory
                    ? Math.max(selectedPackage?.includedSanitationAccessoryQuantity ?? sanitationAccessoryQuantity, 0)
                    : sanitationAccessoryQuantity
                }
                onChange={(e) =>
                  updateData({ sanitationAccessoryQuantity: Math.max(1, parseInt(e.target.value) || 1) })
                }
                unit="ea"
                min="1"
                step="1"
                placeholder="1"
                readOnly={packageIncludesSanitationAccessory}
              />
            </div>
          )}
        </div>
      </div>

      {/* Auto-fill */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Auto-fill</h2>
        </div>
        <div className={`spec-grid-3-split auto-fill-grid ${autoFillRequiresElectric ? 'auto-fill-grid-electric' : ''}`}>
          {packageIncludesAutoFill
            ? renderReadOnlySelection(
                'Auto-Fill System',
                safeData.autoFillSystem?.name || selectedPackage?.includedAutoFillSystemName || 'Included',
                packageLockedCategoryMessage
              )
            : (
              <div className="spec-field">
                <LabelWithRetired text="Auto-Fill System" showRetired={retiredFlags.autoFillSystem} />
                <select
                  className="compact-input equipment-select"
                  value={includeAutoFill ? safeData.autoFillSystem?.name || noneOptionValue : noneOptionValue}
                  onChange={(e) => handleAutoFillSelect(e.target.value)}
                  disabled={autoFillDisabledByPackage}
                  title={autoFillDisabledByPackage ? 'This equipment package does not allow auto-fill upgrades.' : undefined}
                >
                  <option value={noneOptionValue}>None</option>
                  {retiredFlags.autoFillSystem && renderRetiredOption(safeData.autoFillSystem?.name)}
                  {autoFillOptions.map(system => (
                    <option key={system.name} value={system.name}>
                      {formatOptionLabel(system.name, costOf(system))}
                    </option>
                  ))}
                </select>
                {autoFillDisabledByPackage && (
                  <small className="form-help">This equipment package does not allow auto-fill upgrades.</small>
                )}
              </div>
            )}
          {(includeAutoFill || packageIncludesAutoFill) && (
            <div className="spec-field">
              <label className="spec-label">Auto-Fill System Quantity</label>
              <CompactInput
                value={autoFillSystemQuantity}
                onChange={(e) => updateData({ autoFillSystemQuantity: Math.max(0, parseInt(e.target.value) || 0) })}
                unit="ea"
                min="0"
                step="1"
                placeholder="1"
                readOnly={packageIncludesAutoFill}
              />
            </div>
          )}
          {(includeAutoFill || packageIncludesAutoFill) && (
            <div className="spec-field">
              <label className="spec-label">Auto-Fill Run</label>
              <CompactInput
                value={plumbingRuns.autoFillRun ?? 0}
                onChange={(e) => handleRunChange('autoFillRun', parseFloat(e.target.value) || 0)}
                unit="LNFT"
                min="0"
                step="1"
                placeholder="0"
              />
            </div>
          )}
          {(includeAutoFill || packageIncludesAutoFill) && autoFillRequiresElectric && (
            <div className="spec-field">
              <label className="spec-label">Electric Run</label>
              <CompactInput
                value={plumbingRuns.autoFillRun ?? 0}
                onChange={(e) => handleRunChange('autoFillRun', parseFloat(e.target.value) || 0)}
                unit="LNFT"
                min="0"
                step="1"
                placeholder="0"
              />
            </div>
          )}
        </div>
      </div>

      <CustomOptionsSection
        data={safeData.customOptions || []}
        onChange={(customOptions) => updateData({ customOptions })}
      />
    </div>
  );
}

export default EquipmentSectionNew;
