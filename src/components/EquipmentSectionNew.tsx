import { useEffect, useMemo, useRef, useState } from 'react';
import { Equipment, PumpSelection, LightSelection } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import { getEquipmentItemCost } from '../utils/equipmentCost';
import { normalizeEquipmentLighting } from '../utils/lighting';
import './SectionStyles.css';

interface Props {
  data: Equipment;
  onChange: (data: Equipment) => void;
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

const ButtonGroup = <T extends string | number>({
  value,
  options,
  onChange,
  buttonClassName,
}: {
  value: T;
  options: { label: string; value: T; badge?: string }[];
  onChange: (val: T) => void;
  buttonClassName?: string;
}) => (
  <div className={`pool-type-buttons stackable ${buttonClassName || ''}`.trim()}>
    {options.map(opt => (
      <button
        key={String(opt.value)}
        type="button"
        className={`pool-type-btn ${value === opt.value ? 'active' : ''}`}
        onClick={() => onChange(opt.value)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <span>{opt.label}</span>
          {opt.badge && <span className="info-pill">{opt.badge}</span>}
        </div>
      </button>
    ))}
  </div>
);

function EquipmentSectionNew({ data, onChange, hasSpa, hasPool }: Props) {
  const defaults = useMemo(() => {
    const byCost = <T,>(list: T[]) =>
      list.find((item: any) => getEquipmentItemCost(item) === 0) || list[0];
    const pump = byCost(pricingData.equipment.pumps);
    const filter = byCost(pricingData.equipment.filters);
    const cleaner = byCost(pricingData.equipment.cleaners);
    const heater = byCost(pricingData.equipment.heaters);
    const automation = byCost(pricingData.equipment.automation);
    return { pump, filter, cleaner, heater, automation };
  }, []);

  const selectableDefaults = useMemo(() => ({
    pump: pricingData.equipment.pumps.find(p => !p.name.toLowerCase().includes('no pump')) || pricingData.equipment.pumps[0],
    filter: pricingData.equipment.filters.find(f => !f.name.toLowerCase().includes('no filter')) || pricingData.equipment.filters[0],
    heater: pricingData.equipment.heaters.find(h => !h.name.toLowerCase().includes('no heater')) || pricingData.equipment.heaters[0],
    automation: pricingData.equipment.automation.find(a => !a.name.toLowerCase().includes('no automation')) || pricingData.equipment.automation[0],
  }), []);

  const hasRealSelection = (name: string | undefined, placeholder: string) =>
    !!(name && !name.toLowerCase().includes(placeholder));

  const pumpOverhead = pricingData.equipment.pumpOverheadMultiplier ?? 1;
  const costOf = (item: any, applyPumpOverhead?: boolean) =>
    getEquipmentItemCost(item, applyPumpOverhead ? pumpOverhead : 1);

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
    heaterQuantity:
      data?.heaterQuantity ?? (hasRealSelection(data?.heater?.name, 'no heater') ? 1 : 0),
    upgradeToVersaFlo: data?.upgradeToVersaFlo ?? false,
    includePoolLights: data?.includePoolLights ?? true,
    includeSpaLights: data?.includeSpaLights ?? hasSpa,
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
      hasChemistry: defaults.automation.hasChemistry,
    },
    automationQuantity: data?.automationQuantity ?? 0,
    saltSystem: data?.saltSystem,
    hasBlanketReel: data?.hasBlanketReel ?? false,
    hasSolarBlanket: data?.hasSolarBlanket ?? false,
    hasAutoFill: data?.hasAutoFill ?? false,
    hasHandrail: data?.hasHandrail ?? false,
    hasStartupChemicals: data?.hasStartupChemicals ?? false,
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
  const [includeFilter, setIncludeFilter] = useState<boolean>(() => (data?.filterQuantity ?? 0) > 0);
  const [includeCleaner, setIncludeCleaner] = useState<boolean>((safeData.cleanerQuantity ?? 0) > 0);
  const [includeHeater, setIncludeHeater] = useState<boolean>(() => hasRealSelection(data?.heater?.name, 'no heater'));
  const [includePoolLights, setIncludePoolLights] = useState<boolean>(() => hasPool && safeData.includePoolLights !== false);
  const [includeSpaLights, setIncludeSpaLights] = useState<boolean>(() => hasSpa && safeData.includeSpaLights !== false);
  const [includeAutomation, setIncludeAutomation] = useState<boolean>(() =>
    (data?.automationQuantity ?? 0) > 0 || (data?.automation?.zones ?? 0) > 0
  );
  const [includeSalt, setIncludeSalt] = useState<boolean>(!!safeData.saltSystem?.name);
  const auxiliaryPumps = safeData.auxiliaryPumps || [];
  const maxAuxiliaryPumps = 2;
  const cleanerQuantity = Math.max(safeData.cleanerQuantity ?? (includeCleaner ? 1 : 0), 0);
  const filterQuantity = Math.max(safeData.filterQuantity ?? (includeFilter ? 1 : 0), 0);
  const heaterQuantity = Math.max(safeData.heaterQuantity ?? (includeHeater ? 1 : 0), 0);
  const automationQuantity = Math.max(safeData.automationQuantity ?? (includeAutomation ? 1 : 0), 0);
  const poolLights = safeData.poolLights || [];
  const spaLights = safeData.spaLights || [];
  const poolLightsToggledRef = useRef(false);
  const spaLightsToggledRef = useRef(false);

  const updateData = (updates: Partial<Equipment>) => {
    onChange({ ...safeData, ...updates, hasBeenEdited: true });
  };

  const handleChange = (field: keyof Equipment, value: any) => {
    updateData({ [field]: value } as Partial<Equipment>);
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
    if (!hasPool) {
      if (includePoolLights && poolLights.length > 0) {
        commitLighting([], spaLights, includePoolLights, includeSpaLights);
      }
      return;
    }
    if (!includePoolLights && !poolLightsToggledRef.current) {
      setIncludePoolLights(true);
    }
    if (includePoolLights && poolLights.length === 0 && poolLightOptions.length > 0 && !poolLightsToggledRef.current) {
      commitLighting([buildLightSelection(poolLightOptions[0], 'pool')], spaLights, true, includeSpaLights);
    }
  }, [hasPool, includePoolLights, poolLights.length, spaLights, includeSpaLights, poolLightOptions]);

  useEffect(() => {
    if (!hasSpa) {
      if (includeSpaLights || spaLights.length > 0) {
        commitLighting(poolLights, [], includePoolLights, false);
        setIncludeSpaLights(false);
      }
      return;
    }
    if (!includeSpaLights && !spaLightsToggledRef.current) {
      setIncludeSpaLights(true);
    }
    if (includeSpaLights && spaLights.length === 0 && spaLightOptions.length > 0 && !spaLightsToggledRef.current) {
      commitLighting(poolLights, [buildLightSelection(spaLightOptions[0], 'spa')], includePoolLights, true);
    }
  }, [hasSpa, includeSpaLights, spaLights.length, poolLights, includePoolLights, spaLightOptions]);

  const togglePoolLighting = (val: boolean) => {
    poolLightsToggledRef.current = true;
    setIncludePoolLights(val);
    if (val) {
      const defaultLight = poolLightOptions[0] ? buildLightSelection(poolLightOptions[0], 'pool') : undefined;
      const nextPoolLights = poolLights.length > 0 ? poolLights : defaultLight ? [defaultLight] : [];
      commitLighting(nextPoolLights, spaLights, true, includeSpaLights);
    } else {
      commitLighting([], spaLights, false, includeSpaLights);
    }
  };

  const toggleSpaLighting = (val: boolean) => {
    spaLightsToggledRef.current = true;
    if (!hasSpa) {
      setIncludeSpaLights(false);
      return;
    }
    setIncludeSpaLights(val);
    if (val) {
      const defaultLight = spaLightOptions[0] ? buildLightSelection(spaLightOptions[0], 'spa') : undefined;
      const nextSpaLights = spaLights.length > 0 ? spaLights : defaultLight ? [defaultLight] : [];
      commitLighting(poolLights, nextSpaLights, includePoolLights, true);
    } else {
      commitLighting(poolLights, [], includePoolLights, false);
    }
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
      togglePoolLighting(false);
    } else {
      commitLighting(next, spaLights, true, includeSpaLights);
    }
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
      toggleSpaLighting(false);
    } else {
      commitLighting(poolLights, next, includePoolLights, true);
    }
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
          hasChemistry: selected?.hasChemistry ?? defaults.automation.hasChemistry,
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
          hasChemistry: defaults.automation.hasChemistry,
        },
        automationQuantity: 0,
      });
    }
  };

  const toggleSalt = (val: boolean) => {
    setIncludeSalt(val);
    if (!val) {
      handleChange('saltSystem', undefined);
    }
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
          hasChemistry: automation.hasChemistry,
        },
        automationQuantity: Math.max(safeData.automationQuantity ?? 1, 1),
      });
    }
  };

  const handleSaltSystemChange = (name?: string) => {
    if (!name) {
      handleChange('saltSystem', undefined);
      return;
    }
    const system = pricingData.equipment.saltSystem.find(s => s.name === name);
    handleChange(
      'saltSystem',
      system
        ? {
            name: system.name,
            model: system.model,
            basePrice: (system as any).basePrice,
            addCost1: (system as any).addCost1,
            addCost2: (system as any).addCost2,
            price: costOf(system),
          }
        : undefined
    );
  };

  return (
    <div className="section-form">
      {/* Pump */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Pump</h2>
          <p className="spec-block-subtitle">Add a Pump and Auxillary Pumps</p>
          <div className="pool-type-buttons" style={{ marginTop: '8px' }}>
            <button
              type="button"
              className={`pool-type-btn ${includePump ? 'active' : ''}`}
              onClick={() => togglePump(!includePump)}
            >
              {includePump ? 'Remove Pump' : 'Add Pump'}
            </button>
          </div>
        </div>
        {includePump && (
          <div className="spec-field">
            <ButtonGroup
              value={safeData.pump.name}
              onChange={handlePumpChange}
              buttonClassName="pump-row"
              options={pricingData.equipment.pumps
                .filter(pump => !pump.name.toLowerCase().includes('no pump'))
                .map(pump => ({
                  label: pump.name,
                  value: pump.name,
                  badge: costOf(pump, true) > 0 ? `$${costOf(pump, true).toLocaleString()}` : 'Included',
                }))}
            />

            {auxiliaryPumps.map((pump, idx) => (
              <div key={idx} className="spec-subcard" style={{ marginTop: '12px' }}>
                <div className="spec-subcard-header">
                  <div className="spec-subcard-title">Auxiliary Pump #{idx + 1}</div>
                  <div className="spec-subcard-actions">
                    <button type="button" className="link-btn danger" onClick={() => removeAuxiliaryPump(idx)}>
                      Remove
                    </button>
                  </div>
                </div>
                <ButtonGroup
                  value={pump?.name || safeData.pump.name}
                  onChange={(name) => handleAuxiliaryPumpChange(idx, name)}
                  buttonClassName="pump-row"
                  options={pricingData.equipment.pumps
                    .filter(p => !p.name.toLowerCase().includes('no pump'))
                    .map(p => ({
                      label: p.name,
                      value: p.name,
                      badge: costOf(p, true) > 0 ? `$${costOf(p, true).toLocaleString()}` : 'Included',
                    }))}
                />
              </div>
            ))}

            {auxiliaryPumps.length < maxAuxiliaryPumps && (
              <div className="action-row" style={{ marginTop: auxiliaryPumps.length ? '8px' : '12px' }}>
                <button type="button" className="action-btn secondary" onClick={addAuxiliaryPump}>
                  Add Auxiliary Pump
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Filter</h2>
          <p className="spec-block-subtitle">Add a Filter</p>
          <div className="pool-type-buttons" style={{ marginTop: '8px' }}>
            <button
              type="button"
              className={`pool-type-btn ${includeFilter ? 'active' : ''}`}
              onClick={() => toggleFilter(!includeFilter)}
            >
              {includeFilter ? 'Remove Filter' : 'Add Filter'}
            </button>
          </div>
        </div>
        {includeFilter && (
          <div className="spec-field">
            <ButtonGroup
              value={safeData.filter.name}
              onChange={handleFilterChange}
              buttonClassName="filter-grid"
            options={pricingData.equipment.filters
              .filter(filter => !filter.name.toLowerCase().includes('no filter'))
                .map(filter => ({
                  label: `${filter.name} (${filter.sqft} sqft)`,
                  value: filter.name,
                  badge: costOf(filter) > 0 ? `$${costOf(filter).toLocaleString()}` : 'Included',
              }))}
          />
            <div className="spec-field" style={{ maxWidth: '220px', marginTop: '12px' }}>
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
          </div>
        )}
      </div>

      {/* Cleaner */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Cleaner</h2>
          <p className="spec-block-subtitle">Add a Cleaner</p>
          <div className="pool-type-buttons" style={{ marginTop: '8px' }}>
            <button
              type="button"
              className={`pool-type-btn ${includeCleaner ? 'active' : ''}`}
              onClick={() => toggleCleaner(!includeCleaner)}
            >
              {includeCleaner ? 'Remove Cleaner' : 'Add Cleaner'}
            </button>
          </div>
        </div>
        {includeCleaner && (
          <div className="spec-field">
            <ButtonGroup
              value={safeData.cleaner.name}
              onChange={handleCleanerChange}
              buttonClassName="cleaner-row"
            options={pricingData.equipment.cleaners
              .filter(cleaner => !cleaner.name.toLowerCase().includes('no cleaner'))
                .map(cleaner => ({
                  label: cleaner.name,
                  value: cleaner.name,
                  badge: costOf(cleaner) > 0 ? `$${costOf(cleaner).toLocaleString()}` : 'Included',
              }))}
          />
            <div className="spec-field" style={{ maxWidth: '220px', marginTop: '12px' }}>
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
          </div>
        )}
      </div>

      {/* Heating */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Heater</h2>
          <p className="spec-block-subtitle">Choose Heater Model</p>
          <div className="pool-type-buttons" style={{ marginTop: '8px' }}>
            <button
              type="button"
              className={`pool-type-btn ${includeHeater ? 'active' : ''}`}
              onClick={() => toggleHeater(!includeHeater)}
            >
              {includeHeater ? 'Remove Heater' : 'Add Heater'}
            </button>
          </div>
        </div>
        {includeHeater && (
          <>
            <div className="spec-grid spec-grid-2">
              <div className="spec-field">
                <ButtonGroup
                  value={safeData.heater.name}
                  onChange={handleHeaterChange}
                options={pricingData.equipment.heaters
                  .filter(heater => !heater.name.toLowerCase().includes('no heater'))
                    .map(heater => ({
                      label: heater.name,
                      value: heater.name,
                      badge: costOf(heater) > 0 ? `$${costOf(heater).toLocaleString()}` : 'Included',
                  }))}
              />
              </div>
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
            </div>

            {hasSpa && !safeData.heater.isVersaFlo && (
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
          </>
        )}
      </div>

      {/* Pool Lights */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Pool Lights</h2>
          <p className="spec-block-subtitle">Select pool lighting fixtures.</p>
          <div className="pool-type-buttons" style={{ marginTop: '8px' }}>
            <button
              type="button"
              className={`pool-type-btn ${includePoolLights ? 'active' : ''}`}
              onClick={() => togglePoolLighting(!includePoolLights)}
            >
              {includePoolLights ? 'Remove Pool Lights' : 'Add Pool Lights'}
            </button>
          </div>
        </div>
        {includePoolLights && (
          <div className="spec-field">
            {poolLights.map((light, idx) => (
              <div key={`pool-light-${idx}`} className="spec-subcard" style={{ marginTop: idx === 0 ? '0' : '12px' }}>
                <div className="spec-subcard-header">
                  <div className="spec-subcard-title">Pool Light #{idx + 1}</div>
                  {poolLights.length > 1 && (
                    <div className="spec-subcard-actions">
                      <button type="button" className="link-btn danger" onClick={() => removePoolLight(idx)}>
                        Remove
                      </button>
                    </div>
                  )}
                </div>
                <ButtonGroup
                  value={light?.name || poolLightOptions[0]?.name}
                  onChange={(name) => handlePoolLightChange(idx, name)}
                  options={poolLightOptions.map(option => ({
                    label: option.name,
                    value: option.name,
                    badge: costOf(option) > 0 ? `$${costOf(option).toLocaleString()}` : 'Included',
                  }))}
                />
              </div>
            ))}

            <div className="action-row" style={{ marginTop: poolLights.length ? '12px' : '0' }}>
              <button type="button" className="action-btn secondary" onClick={addPoolLight}>
                Add another Pool Light
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Spa Lights */}
      {hasSpa && (
        <div className="spec-block">
          <div className="spec-block-header">
            <h2 className="spec-block-title">Spa Lights</h2>
            <p className="spec-block-subtitle">Select spa lighting fixtures.</p>
            <div className="pool-type-buttons" style={{ marginTop: '8px' }}>
              <button
                type="button"
                className={`pool-type-btn ${includeSpaLights ? 'active' : ''}`}
                onClick={() => toggleSpaLighting(!includeSpaLights)}
              >
                {includeSpaLights ? 'Remove Spa Lights' : 'Add Spa Lights'}
              </button>
            </div>
          </div>
          {includeSpaLights && (
            <div className="spec-field">
              {spaLights.map((light, idx) => (
                <div key={`spa-light-${idx}`} className="spec-subcard" style={{ marginTop: idx === 0 ? '0' : '12px' }}>
                  <div className="spec-subcard-header">
                    <div className="spec-subcard-title">Spa Light #{idx + 1}</div>
                    {spaLights.length > 1 && (
                      <div className="spec-subcard-actions">
                        <button type="button" className="link-btn danger" onClick={() => removeSpaLight(idx)}>
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  <ButtonGroup
                    value={light?.name || spaLightOptions[0]?.name}
                    onChange={(name) => handleSpaLightChange(idx, name)}
                    options={spaLightOptions.map(option => ({
                      label: option.name,
                      value: option.name,
                      badge: costOf(option) > 0 ? `$${costOf(option).toLocaleString()}` : 'Included',
                    }))}
                  />
                </div>
              ))}

              <div className="action-row" style={{ marginTop: spaLights.length ? '12px' : '0' }}>
                <button type="button" className="action-btn secondary" onClick={addSpaLight}>
                  Add another Spa Light
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Automation */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Automation</h2>
          <p className="spec-block-subtitle">Toggle automation and select system.</p>
          <div className="pool-type-buttons" style={{ marginTop: '8px' }}>
            <button
              type="button"
              className={`pool-type-btn ${includeAutomation ? 'active' : ''}`}
              onClick={() => toggleAutomation(!includeAutomation)}
            >
              {includeAutomation ? 'Remove Automation' : 'Add Automation'}
            </button>
          </div>
        </div>
        {includeAutomation && (
          <>
            <div className="spec-field">
              <ButtonGroup
                value={safeData.automation.name}
                onChange={handleAutomationChange}
                buttonClassName="automation-grid"
              options={pricingData.equipment.automation
                .filter(auto => !auto.name.toLowerCase().includes('no automation'))
                  .map(auto => ({
                    label: auto.name,
                    value: auto.name,
                    badge: costOf(auto) > 0 ? `$${costOf(auto).toLocaleString()}` : 'Included',
                }))}
            />
            </div>

            <div className="spec-grid spec-grid-2" style={{ marginTop: '12px' }}>
              <div className="spec-field" style={{ maxWidth: '220px' }}>
                <label className="spec-label">Automation Quantity</label>
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
              <div className="spec-field" style={{ maxWidth: '240px' }}>
                <label className="spec-label">Additional Zones</label>
                <CompactInput
                  value={safeData.automation.zones ?? 0}
                  onChange={(e) =>
                    handleChange('automation', { ...safeData.automation, zones: parseInt(e.target.value) || 0 })
                  }
                  unit="ea"
                  min="0"
                  step="1"
                />
                <small className="form-help">Beyond base zones (${pricingData.equipment.automationZoneAddon}/zone).</small>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sanitation System (formerly Salt) */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Sanitation System</h2>
          <p className="spec-block-subtitle">Toggle sanitation system and select if needed.</p>
          <div className="pool-type-buttons" style={{ marginTop: '8px' }}>
            <button
              type="button"
              className={`pool-type-btn ${includeSalt ? 'active' : ''}`}
              onClick={() => toggleSalt(!includeSalt)}
            >
              {includeSalt ? 'Remove Sanitation System' : 'Add Sanitation System'}
            </button>
          </div>
        </div>
        {includeSalt && (
          <div className="spec-field">
              <ButtonGroup
                value={safeData.saltSystem?.name || ''}
                onChange={(val) => handleSaltSystemChange(val || undefined)}
            options={pricingData.equipment.saltSystem
              .filter(system => !system.name.toLowerCase().includes('no salt'))
                  .map(system => ({
                    label: system.name,
                    value: system.name,
                    badge: costOf(system) > 0 ? `$${costOf(system).toLocaleString()}` : 'Included',
                  }))}
            />
            </div>
        )}
      </div>

      {/* Accessories */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Additional Accessories</h2>
          <p className="spec-block-subtitle">Toggle accessories for this build.</p>
        </div>
        <div className="spec-grid spec-grid-2">
          {[
            { key: 'hasBlanketReel', label: 'Blanket Reel' },
            { key: 'hasSolarBlanket', label: 'Solar Blanket' },
            { key: 'hasAutoFill', label: 'Auto Fill' },
            { key: 'hasHandrail', label: 'Handrail' },
            { key: 'hasStartupChemicals', label: 'Startup Chemicals' },
          ].map(item => (
            <div key={item.key} className="spec-field">
              <div className="pool-type-buttons">
                <button
                  type="button"
                  className={`pool-type-btn ${(safeData as any)[item.key] ? 'active' : ''}`}
                  onClick={() => handleChange(item.key as keyof Equipment, !(safeData as any)[item.key])}
                >
                  {item.label}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default EquipmentSectionNew;
