import { useEffect, useMemo, useState } from 'react';
import { Equipment, PumpSelection, LightSelection, PlumbingRuns } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import { getSessionRole } from '../services/session';
import { getEquipmentItemCost } from '../utils/equipmentCost';
import { normalizeEquipmentLighting } from '../utils/lighting';
import CustomOptionsSection from './CustomOptionsSection';
import './SectionStyles.css';

interface Props {
  data: Equipment;
  onChange: (data: Equipment) => void;
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

function EquipmentSectionNew({ data, onChange, plumbingRuns, onChangePlumbingRuns, hasSpa, hasPool }: Props) {
  const sessionRole = getSessionRole();
  const canViewCostAmounts = sessionRole === 'admin' || sessionRole === 'owner';

  const defaults = useMemo(() => {
    const byCost = <T,>(list: T[]) =>
      list.find((item: any) => getEquipmentItemCost(item) === 0) || list[0];
    const pump = byCost(pricingData.equipment.pumps);
    const filter = byCost(pricingData.equipment.filters);
    const cleaner = byCost(pricingData.equipment.cleaners);
    const heater = byCost(pricingData.equipment.heaters);
    const automation = byCost(pricingData.equipment.automation);
    const autoFillSystem = byCost(pricingData.equipment.autoFillSystem);
    return { pump, filter, cleaner, heater, automation, autoFillSystem };
  }, []);

  const selectableDefaults = useMemo(() => ({
    pump: pricingData.equipment.pumps.find(p => !p.name.toLowerCase().includes('no pump')) || pricingData.equipment.pumps[0],
    filter: pricingData.equipment.filters.find(f => !f.name.toLowerCase().includes('no filter')) || pricingData.equipment.filters[0],
    heater: pricingData.equipment.heaters.find(h => !h.name.toLowerCase().includes('no heater')) || pricingData.equipment.heaters[0],
    automation: pricingData.equipment.automation.find(a => !a.name.toLowerCase().includes('no automation')) || pricingData.equipment.automation[0],
    autoFillSystem: pricingData.equipment.autoFillSystem.find(s => !s.name.toLowerCase().includes('no auto')) || pricingData.equipment.autoFillSystem[0],
  }), []);

  const hasRealSelection = (name: string | undefined, placeholder: string) =>
    !!(name && !name.toLowerCase().includes(placeholder));

  const pumpOverhead = pricingData.equipment.pumpOverheadMultiplier ?? 1;
  const costOf = (item: any, applyPumpOverhead?: boolean) =>
    getEquipmentItemCost(item, applyPumpOverhead ? pumpOverhead : 1);
  const hasHeaterSelection = hasRealSelection(data?.heater?.name, 'no heater');
  const getCostBadge = (amount: number) =>
    canViewCostAmounts ? (amount > 0 ? `$${amount.toLocaleString()}` : 'Included') : undefined;
  const noneOptionValue = 'none';
  const formatOptionLabel = (label: string, amount?: number) => {
    const badge = getCostBadge(amount ?? 0);
    return badge ? `${label} (${badge})` : label;
  };

  const pumpOptions = pricingData.equipment.pumps.filter(pump => !pump.name.toLowerCase().includes('no pump'));
  const filterOptions = pricingData.equipment.filters.filter(filter => !filter.name.toLowerCase().includes('no filter'));
  const cleanerOptions = pricingData.equipment.cleaners.filter(cleaner => !cleaner.name.toLowerCase().includes('no cleaner'));
  const heaterOptions = pricingData.equipment.heaters.filter(heater => !heater.name.toLowerCase().includes('no heater'));
  const automationOptions = pricingData.equipment.automation.filter(auto => !auto.name.toLowerCase().includes('no automation'));
  const saltOptions = pricingData.equipment.saltSystem.filter(system => !system.name.toLowerCase().includes('no salt'));
  const autoFillOptions = pricingData.equipment.autoFillSystem.filter(system => !system.name.toLowerCase().includes('no auto'));

  const buildAutoFillSelection = (system: any) => ({
    name: system?.name || '',
    model: (system as any)?.model,
    basePrice: (system as any)?.basePrice,
    addCost1: (system as any)?.addCost1,
    addCost2: (system as any)?.addCost2,
    price: costOf(system),
    percentIncrease: (system as any)?.percentIncrease,
  });

  const baseSafeData: Equipment = {
    pump: data?.pump || {
      name: defaults.pump.name,
      model: (defaults.pump as any).model,
      basePrice: (defaults.pump as any).basePrice,
      addCost1: (defaults.pump as any).addCost1,
      addCost2: (defaults.pump as any).addCost2,
      price: costOf(defaults.pump, true),
    },
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
    cleanerQuantity: data?.cleanerQuantity ?? 0,
    heater: data?.heater || {
      name: defaults.heater.name,
      btu: (defaults.heater as any).btu,
      basePrice: (defaults.heater as any).basePrice,
      addCost1: (defaults.heater as any).addCost1,
      addCost2: (defaults.heater as any).addCost2,
      price: costOf(defaults.heater),
      isVersaFlo: defaults.heater.isVersaFlo,
    },
    heaterQuantity: hasHeaterSelection ? Math.max(data?.heaterQuantity ?? 1, 1) : 0,
    upgradeToVersaFlo: data?.upgradeToVersaFlo ?? false,
    includePoolLights: data?.includePoolLights ?? false,
    includeSpaLights: data?.includeSpaLights ?? false,
    poolLights: data?.poolLights,
    spaLights: data?.spaLights,
    numberOfLights: data?.numberOfLights ?? 0,
    hasSpaLight: data?.hasSpaLight ?? false,
    automation: data?.automation || {
      name: defaults.automation.name,
      basePrice: (defaults.automation as any).basePrice,
      addCost1: (defaults.automation as any).addCost1,
      addCost2: (defaults.automation as any).addCost2,
      price: costOf(defaults.automation),
      zones: data?.automation?.zones ?? 0,
      percentIncrease: (defaults.automation as any).percentIncrease,
    },
    automationQuantity: data?.automationQuantity ?? 0,
    saltSystem: data?.saltSystem,
    saltSystemQuantity: data?.saltSystemQuantity ?? (data?.saltSystem ? 1 : 0),
    autoFillSystem:
      data?.autoFillSystem ??
      (data?.hasAutoFill
        ? buildAutoFillSelection(selectableDefaults.autoFillSystem || defaults.autoFillSystem)
        : undefined),
    autoFillSystemQuantity: data?.autoFillSystemQuantity ?? (data?.hasAutoFill ? 1 : 0),
    hasBlanketReel: data?.hasBlanketReel ?? false,
    hasSolarBlanket: data?.hasSolarBlanket ?? false,
    hasAutoFill: data?.hasAutoFill ?? false,
    hasHandrail: data?.hasHandrail ?? false,
    hasStartupChemicals: data?.hasStartupChemicals ?? false,
    customOptions: data?.customOptions ?? [],
    totalCost: data?.totalCost ?? 0,
    hasBeenEdited: data?.hasBeenEdited ?? false,
  };

  const safeData = normalizeEquipmentLighting(baseSafeData, { hasPool, hasSpa });

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
  const auxiliaryPumps = safeData.auxiliaryPumps || [];
  const maxAuxiliaryPumps = 2;
  const cleanerQuantity = Math.max(safeData.cleanerQuantity ?? (includeCleaner ? 1 : 0), 0);
  const filterQuantity = Math.max(safeData.filterQuantity ?? (includeFilter ? 1 : 0), 0);
  const heaterQuantity = Math.max(safeData.heaterQuantity ?? (includeHeater ? 1 : 0), 0);
  const automationQuantity = Math.max(safeData.automationQuantity ?? (includeAutomation ? 1 : 0), 0);
  const saltSystemQuantity = Math.max(safeData.saltSystemQuantity ?? (includeSalt ? 1 : 0), 0);
  const autoFillSystemQuantity = Math.max(
    safeData.autoFillSystemQuantity ?? (includeAutoFill ? 1 : 0),
    0
  );
  const poolLights = safeData.poolLights || [];
  const spaLights = safeData.spaLights || [];

  const updateData = (updates: Partial<Equipment>) => {
    onChange({ ...safeData, ...updates, hasBeenEdited: true });
  };

  const handleChange = (field: keyof Equipment, value: any) => {
    updateData({ [field]: value } as Partial<Equipment>);
  };

  const handleRunChange = (field: keyof PlumbingRuns, value: number) => {
    onChangePlumbingRuns({ ...plumbingRuns, [field]: value });
  };

  const setAuxiliaryPumps = (pumps: PumpSelection[]) => {
    updateData({ auxiliaryPumps: pumps, auxiliaryPump: pumps[0] });
  };

  const poolLightOptions = pricingData.equipment.lights.poolLights || [];
  const spaLightOptions = pricingData.equipment.lights.spaLights || [];

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
    return list.find(light => light.name === name) || list[0];
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
          isVersaFlo: selected?.isVersaFlo ?? defaults.heater.isVersaFlo,
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
          isVersaFlo: defaults.heater.isVersaFlo,
        },
        upgradeToVersaFlo: false,
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
    const defaultLight = poolLightOptions[0];
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
    const defaultLight = spaLightOptions[0];
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
          price: costOf(selected || defaults.automation),
          zones: safeData.automation?.zones ?? 0,
          percentIncrease: (selected as any)?.percentIncrease ?? (defaults.automation as any).percentIncrease,
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
          price: costOf(defaults.automation),
          zones: 0,
          percentIncrease: (defaults.automation as any).percentIncrease,
        },
        automationQuantity: 0,
      });
    }
  };

  const toggleSalt = (val: boolean) => {
    setIncludeSalt(val);
    if (!val) {
      updateData({ saltSystem: undefined, saltSystemQuantity: 0 });
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
      handleChange('pump', {
        name: pump.name,
        model: (pump as any).model,
        basePrice: (pump as any).basePrice,
        addCost1: (pump as any).addCost1,
        addCost2: (pump as any).addCost2,
        price: costOf(pump, true),
      });
    }
  };

  const handleAuxiliaryPumpChange = (index: number, name: string | number) => {
    const pump = pricingData.equipment.pumps.find(p => p.name === name);
    if (!pump) return;
    const next = [...auxiliaryPumps];
    next[index] = {
      name: pump.name,
      model: (pump as any).model,
      basePrice: (pump as any).basePrice,
      addCost1: (pump as any).addCost1,
      addCost2: (pump as any).addCost2,
      price: costOf(pump),
    };
    setAuxiliaryPumps(next);
  };

  const addAuxiliaryPump = () => {
    if (auxiliaryPumps.length >= maxAuxiliaryPumps) return;
    const defaultPump = pricingData.equipment.pumps.find(p => !p.name.toLowerCase().includes('no pump')) || selectableDefaults.pump;
    setAuxiliaryPumps([
      ...auxiliaryPumps,
      {
        name: defaultPump.name,
        model: (defaultPump as any).model,
        basePrice: (defaultPump as any).basePrice,
        addCost1: (defaultPump as any).addCost1,
        addCost2: (defaultPump as any).addCost2,
        price: costOf(defaultPump, true),
      },
    ]);
  };

  const removeAuxiliaryPump = (index: number) => {
    const next = auxiliaryPumps.filter((_, i) => i !== index);
    setAuxiliaryPumps(next);
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
          isVersaFlo: heater.isVersaFlo,
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
          price: costOf(automation),
          zones: safeData.automation.zones,
          percentIncrease: (automation as any).percentIncrease,
        },
        automationQuantity: Math.max(safeData.automationQuantity ?? 1, 1),
      });
    }
  };

  const handleSaltSystemChange = (name?: string) => {
    if (!name) {
      updateData({ saltSystem: undefined, saltSystemQuantity: 0 });
      return;
    }
    const system = pricingData.equipment.saltSystem.find(s => s.name === name);
    if (!system) {
      updateData({ saltSystem: undefined, saltSystemQuantity: 0 });
      return;
    }
    const nextQuantity = Math.max(safeData.saltSystemQuantity ?? 1, 1);
    updateData({
      saltSystem: {
        name: system.name,
        model: system.model,
        basePrice: (system as any).basePrice,
        addCost1: (system as any).addCost1,
        addCost2: (system as any).addCost2,
        price: costOf(system),
      },
      saltSystemQuantity: nextQuantity,
    });
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

  return (
    <div className="section-form">
      {/* Pump */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Pump</h2>
        </div>
        <div className="spec-field">
          <label className="spec-label">Pump</label>
          <select
            className="compact-input equipment-select"
            value={includePump ? safeData.pump.name : noneOptionValue}
            onChange={(e) => handlePumpSelect(e.target.value)}
          >
            <option value={noneOptionValue}>None</option>
            {pumpOptions.map(pump => (
              <option key={pump.name} value={pump.name}>
                {formatOptionLabel(pump.name, costOf(pump, true))}
              </option>
            ))}
          </select>
        </div>
        {includePump && (
          <>
            {auxiliaryPumps.map((pump, idx) => (
              <div key={idx} className="spec-field equipment-extra-field">
                <label className="spec-label">{`Additional Pump ${idx + 1}`}</label>
                <div className="equipment-inline-row">
                  <select
                    className="compact-input equipment-select"
                    value={pump?.name || safeData.pump.name}
                    onChange={(e) => handleAuxiliaryPumpChange(idx, e.target.value)}
                  >
                    {pumpOptions.map(option => (
                      <option key={option.name} value={option.name}>
                        {formatOptionLabel(option.name, costOf(option, true))}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="link-btn danger" onClick={() => removeAuxiliaryPump(idx)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}

            {auxiliaryPumps.length < maxAuxiliaryPumps && (
              <div className="action-row" style={{ marginTop: auxiliaryPumps.length ? '8px' : '12px' }}>
                <button type="button" className="action-btn secondary" onClick={addAuxiliaryPump}>
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
          <div className="spec-field">
            <label className="spec-label">Filter</label>
            <select
              className="compact-input equipment-select"
              value={includeFilter ? safeData.filter.name : noneOptionValue}
              onChange={(e) => handleFilterSelect(e.target.value)}
            >
              <option value={noneOptionValue}>None</option>
              {filterOptions.map(filter => (
                <option key={filter.name} value={filter.name}>
                  {formatOptionLabel(`${filter.name} (${filter.sqft} sqft)`, costOf(filter))}
                </option>
              ))}
            </select>
          </div>
          {includeFilter && (
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
          <div className="spec-field">
            <label className="spec-label">Cleaner</label>
            <select
              className="compact-input equipment-select"
              value={includeCleaner ? safeData.cleaner.name : noneOptionValue}
              onChange={(e) => handleCleanerSelect(e.target.value)}
            >
              <option value={noneOptionValue}>None</option>
              {cleanerOptions.map(cleaner => (
                <option key={cleaner.name} value={cleaner.name}>
                  {formatOptionLabel(cleaner.name, costOf(cleaner))}
                </option>
              ))}
            </select>
          </div>
          {includeCleaner && (
            <div className="spec-field">
              <label className="spec-label">Cleaner Quantity</label>
              <CompactInput
                value={cleanerQuantity}
                onChange={(e) => updateData({ cleanerQuantity: Math.max(0, parseInt(e.target.value) || 0) })}
                unit="ea"
                min="0"
                step="1"
                placeholder="1"
              />
            </div>
          )}
          {includeCleaner && (
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
          <div className="spec-field">
            <label className="spec-label">Heater Model</label>
            <select
              className="compact-input equipment-select"
              value={includeHeater ? safeData.heater.name : noneOptionValue}
              onChange={(e) => handleHeaterSelect(e.target.value)}
            >
              <option value={noneOptionValue}>None</option>
              {heaterOptions.map(heater => (
                <option key={heater.name} value={heater.name}>
                  {formatOptionLabel(heater.name, costOf(heater))}
                </option>
              ))}
            </select>
          </div>
          {includeHeater && (
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

        {includeHeater && hasSpa && !safeData.heater.isVersaFlo && (
          <div className="spec-field">
            <label className="spec-label">VersaFlo Upgrade</label>
            <div className="pool-type-buttons">
              <button
                type="button"
                className={`pool-type-btn ${safeData.upgradeToVersaFlo ? 'active' : ''}`}
                onClick={() => handleChange('upgradeToVersaFlo', true)}
              >
                Upgrade for Spa
              </button>
              <button
                type="button"
                className={`pool-type-btn ${!safeData.upgradeToVersaFlo ? 'active' : ''}`}
                onClick={() => handleChange('upgradeToVersaFlo', false)}
              >
                Skip Upgrade
              </button>
            </div>
            <small className="form-help">Required for spa heating when not VersaFlo.</small>
          </div>
        )}
      </div>

      {/* Pool Lights */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Pool Lights</h2>
        </div>
        <div className="spec-field">
          <label className="spec-label">Pool Light</label>
          <select
            className="compact-input equipment-select"
            value={includePoolLights && poolLights.length > 0 ? poolLights[0]?.name || noneOptionValue : noneOptionValue}
            onChange={(e) => handlePoolLightSelect(e.target.value)}
          >
            <option value={noneOptionValue}>None</option>
            {poolLightOptions.map(option => (
              <option key={option.name} value={option.name}>
                {formatOptionLabel(option.name, costOf(option))}
              </option>
            ))}
          </select>
        </div>
        {includePoolLights && (
          <>
            {poolLights.slice(1).map((light, idx) => (
              <div key={`pool-light-${idx + 1}`} className="spec-field equipment-extra-field">
                <label className="spec-label">{`Additional Pool Light ${idx + 1}`}</label>
                <div className="equipment-inline-row">
                  <select
                    className="compact-input equipment-select"
                    value={light?.name || poolLightOptions[0]?.name || ''}
                    onChange={(e) => handlePoolLightChange(idx + 1, e.target.value)}
                  >
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
              <button type="button" className="action-btn secondary" onClick={addPoolLight}>
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
          <div className="spec-field">
            <label className="spec-label">Spa Light</label>
            <select
              className="compact-input equipment-select"
              value={includeSpaLights && spaLights.length > 0 ? spaLights[0]?.name || noneOptionValue : noneOptionValue}
              onChange={(e) => handleSpaLightSelect(e.target.value)}
            >
              <option value={noneOptionValue}>None</option>
              {spaLightOptions.map(option => (
                <option key={option.name} value={option.name}>
                  {formatOptionLabel(option.name, costOf(option))}
                </option>
              ))}
            </select>
          </div>
          {includeSpaLights && (
            <>
              {spaLights.slice(1).map((light, idx) => (
                <div key={`spa-light-${idx + 1}`} className="spec-field equipment-extra-field">
                  <label className="spec-label">{`Additional Spa Light ${idx + 1}`}</label>
                  <div className="equipment-inline-row">
                    <select
                      className="compact-input equipment-select"
                      value={light?.name || spaLightOptions[0]?.name || ''}
                      onChange={(e) => handleSpaLightChange(idx + 1, e.target.value)}
                    >
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
                <button type="button" className="action-btn secondary" onClick={addSpaLight}>
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
          <div className="spec-field">
            <label className="spec-label">Automation System</label>
            <select
              className="compact-input equipment-select"
              value={includeAutomation ? safeData.automation.name : noneOptionValue}
              onChange={(e) => handleAutomationSelect(e.target.value)}
            >
              <option value={noneOptionValue}>None</option>
              {automationOptions.map(option => (
                <option key={option.name} value={option.name}>
                  {formatOptionLabel(option.name, costOf(option))}
                </option>
              ))}
            </select>
          </div>
          {includeAutomation && (
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
        <div className="spec-grid spec-grid-2">
          <div className="spec-field">
            <label className="spec-label">Sanitation System</label>
            <select
              className="compact-input equipment-select"
              value={includeSalt ? safeData.saltSystem?.name || noneOptionValue : noneOptionValue}
              onChange={(e) => handleSaltSelect(e.target.value)}
            >
              <option value={noneOptionValue}>None</option>
              {saltOptions.map(system => (
                <option key={system.name} value={system.name}>
                  {formatOptionLabel(system.name, costOf(system))}
                </option>
              ))}
            </select>
          </div>
          {includeSalt && (
            <div className="spec-field" style={{ maxWidth: '220px' }}>
              <label className="spec-label">Sanitation System Quantity</label>
              <CompactInput
                value={saltSystemQuantity}
                onChange={(e) => updateData({ saltSystemQuantity: Math.max(0, parseInt(e.target.value) || 0) })}
                unit="ea"
                min="0"
                step="1"
                placeholder="1"
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
        <div className="spec-grid-3-split">
          <div className="spec-field">
            <label className="spec-label">Auto-Fill System</label>
            <select
              className="compact-input equipment-select"
              value={includeAutoFill ? safeData.autoFillSystem?.name || noneOptionValue : noneOptionValue}
              onChange={(e) => handleAutoFillSelect(e.target.value)}
            >
              <option value={noneOptionValue}>None</option>
              {autoFillOptions.map(system => (
                <option key={system.name} value={system.name}>
                  {formatOptionLabel(system.name, costOf(system))}
                </option>
              ))}
            </select>
          </div>
          {includeAutoFill && (
            <div className="spec-field">
              <label className="spec-label">Auto-Fill System Quantity</label>
              <CompactInput
                value={autoFillSystemQuantity}
                onChange={(e) => updateData({ autoFillSystemQuantity: Math.max(0, parseInt(e.target.value) || 0) })}
                unit="ea"
                min="0"
                step="1"
                placeholder="1"
              />
            </div>
          )}
          {includeAutoFill && (
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
