import { useEffect, useMemo, useState } from 'react';
import { Equipment, PumpSelection } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import './SectionStyles.css';

interface Props {
  data: Equipment;
  onChange: (data: Equipment) => void;
  hasSpa: boolean;
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

function EquipmentSectionNew({ data, onChange, hasSpa }: Props) {
  const defaults = useMemo(() => {
    const pump = pricingData.equipment.pumps.find(p => p.price === 0) || pricingData.equipment.pumps[0];
    const filter = pricingData.equipment.filters.find(f => f.price === 0) || pricingData.equipment.filters[0];
    const cleaner = pricingData.equipment.cleaners.find(c => c.price === 0) || pricingData.equipment.cleaners[0];
    const heater = pricingData.equipment.heaters.find(h => h.price === 0) || pricingData.equipment.heaters[0];
    const automation = pricingData.equipment.automation.find(a => a.price === 0) || pricingData.equipment.automation[0];
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

  const safeData: Equipment = {
    pump: data?.pump || { name: defaults.pump.name, model: defaults.pump.model, price: defaults.pump.price },
    auxiliaryPumps:
      data?.auxiliaryPumps ||
      (data?.auxiliaryPump ? [data.auxiliaryPump] : []),
    auxiliaryPump: data?.auxiliaryPump ?? data?.auxiliaryPumps?.[0],
    filter: data?.filter || { name: defaults.filter.name, sqft: defaults.filter.sqft, price: defaults.filter.price },
    filterQuantity: data?.filterQuantity ?? 0,
    cleaner: data?.cleaner || { name: defaults.cleaner.name, price: defaults.cleaner.price },
    cleanerQuantity: data?.cleanerQuantity ?? 0,
    heater: data?.heater || {
      name: defaults.heater.name,
      btu: defaults.heater.btu,
      price: defaults.heater.price,
      isVersaFlo: defaults.heater.isVersaFlo,
    },
    heaterQuantity:
      data?.heaterQuantity ?? (hasRealSelection(data?.heater?.name, 'no heater') ? 1 : 0),
    upgradeToVersaFlo: data?.upgradeToVersaFlo ?? false,
    numberOfLights: data?.numberOfLights ?? 0,
    hasSpaLight: data?.hasSpaLight ?? false,
    automation: data?.automation || {
      name: defaults.automation.name,
      price: defaults.automation.price,
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
  const [includeLighting, setIncludeLighting] = useState<boolean>((safeData.numberOfLights ?? 0) > 0 || safeData.hasSpaLight);
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

  const updateData = (updates: Partial<Equipment>) => {
    onChange({ ...safeData, ...updates, hasBeenEdited: true });
  };

  const handleChange = (field: keyof Equipment, value: any) => {
    updateData({ [field]: value } as Partial<Equipment>);
  };

  const setAuxiliaryPumps = (pumps: PumpSelection[]) => {
    updateData({ auxiliaryPumps: pumps, auxiliaryPump: pumps[0] });
  };

  const togglePump = (val: boolean) => {
    setIncludePump(val);
    if (val) {
      const selectedPump = hasRealSelection(safeData.pump?.name, 'no pump') ? safeData.pump : selectableDefaults.pump;
      updateData({
        pump: {
          name: selectedPump?.name || defaults.pump.name,
          model: selectedPump?.model || defaults.pump.model,
          price: selectedPump?.price ?? defaults.pump.price,
        },
        auxiliaryPumps: auxiliaryPumps,
        auxiliaryPump: auxiliaryPumps[0],
      });
    } else {
      updateData({
        pump: { name: defaults.pump.name, model: defaults.pump.model, price: defaults.pump.price },
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
          sqft: selectedFilter?.sqft ?? defaults.filter.sqft,
          price: selectedFilter?.price ?? defaults.filter.price,
        },
        filterQuantity: Math.max(safeData.filterQuantity ?? 1, 1),
      });
    } else {
      updateData({
        filter: { name: defaults.filter.name, sqft: defaults.filter.sqft, price: defaults.filter.price },
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
        cleaner: { name: selected.name, price: selected.price },
        cleanerQuantity: Math.max(safeData.cleanerQuantity ?? baseQty, baseQty),
      });
    } else {
      updateData({
        cleaner: { name: defaults.cleaner.name, price: defaults.cleaner.price },
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
          btu: selected?.btu ?? defaults.heater.btu,
          price: selected?.price ?? defaults.heater.price,
          isVersaFlo: selected?.isVersaFlo ?? defaults.heater.isVersaFlo,
        },
        heaterQuantity: Math.max(safeData.heaterQuantity ?? 1, 1),
      });
    } else {
      updateData({
        heater: {
          name: defaults.heater.name,
          btu: defaults.heater.btu,
          price: defaults.heater.price,
          isVersaFlo: defaults.heater.isVersaFlo,
        },
        upgradeToVersaFlo: false,
        heaterQuantity: 0,
      });
    }
  };

  const toggleLighting = (val: boolean) => {
    setIncludeLighting(val);
    if (!val) {
      updateData({
        numberOfLights: 0,
        hasSpaLight: false,
      });
    }
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
          price: selected?.price ?? defaults.automation.price,
          zones: safeData.automation?.zones ?? 0,
          hasChemistry: selected?.hasChemistry ?? defaults.automation.hasChemistry,
        },
        automationQuantity: Math.max(safeData.automationQuantity ?? 1, 1),
      });
    } else {
      updateData({
        automation: {
          name: defaults.automation.name,
          price: defaults.automation.price,
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
      handleChange('pump', { name: pump.name, model: pump.model, price: pump.price });
    }
  };

  const handleAuxiliaryPumpChange = (index: number, name: string | number) => {
    const pump = pricingData.equipment.pumps.find(p => p.name === name);
    if (!pump) return;
    const next = [...auxiliaryPumps];
    next[index] = { name: pump.name, model: pump.model, price: pump.price };
    setAuxiliaryPumps(next);
  };

  const addAuxiliaryPump = () => {
    if (auxiliaryPumps.length >= maxAuxiliaryPumps) return;
    const defaultPump = pricingData.equipment.pumps.find(p => !p.name.toLowerCase().includes('no pump')) || selectableDefaults.pump;
    setAuxiliaryPumps([
      ...auxiliaryPumps,
      { name: defaultPump.name, model: defaultPump.model, price: defaultPump.price },
    ]);
  };

  const removeAuxiliaryPump = (index: number) => {
    const next = auxiliaryPumps.filter((_, i) => i !== index);
    setAuxiliaryPumps(next);
  };

  const handleFilterChange = (name: string) => {
    const filter = pricingData.equipment.filters.find(f => f.name === name);
    if (filter) {
      updateData({ filter: { name: filter.name, sqft: filter.sqft, price: filter.price }, filterQuantity: Math.max(safeData.filterQuantity ?? 1, 1) });
    }
  };

  const handleCleanerChange = (name: string) => {
    const cleaner = pricingData.equipment.cleaners.find(c => c.name === name);
    if (cleaner) {
      const nextQuantity = safeData.cleanerQuantity && safeData.cleanerQuantity > 0 ? safeData.cleanerQuantity : 1;
      updateData({
        cleaner: { name: cleaner.name, price: cleaner.price },
        cleanerQuantity: nextQuantity,
      });
    }
  };

  const handleHeaterChange = (name: string) => {
    const heater = pricingData.equipment.heaters.find(h => h.name === name);
    if (heater) {
      updateData({
        heater: { name: heater.name, btu: heater.btu, price: heater.price, isVersaFlo: heater.isVersaFlo },
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
          price: automation.price,
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
    handleChange('saltSystem', system ? { name: system.name, model: system.model, price: system.price } : undefined);
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
                  badge: pump.price > 0 ? `$${pump.price.toLocaleString()}` : 'Included',
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
                      badge: p.price > 0 ? `$${p.price.toLocaleString()}` : 'Included',
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
                  badge: filter.price > 0 ? `$${filter.price.toLocaleString()}` : 'Included',
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
                  badge: cleaner.price > 0 ? `$${cleaner.price.toLocaleString()}` : 'Included',
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
                      badge: heater.price > 0 ? `$${heater.price.toLocaleString()}` : 'Included',
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

      {/* Lighting */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Lighting</h2>
          <p className="spec-block-subtitle">Toggle lighting and enter counts.</p>
          <div className="pool-type-buttons" style={{ marginTop: '8px' }}>
            <button
              type="button"
              className={`pool-type-btn ${includeLighting ? 'active' : ''}`}
              onClick={() => toggleLighting(!includeLighting)}
            >
              {includeLighting ? 'Remove Lighting' : 'Add Lighting'}
            </button>
          </div>
        </div>
        {includeLighting && (
          <div className="spec-grid spec-grid-3">
            <div className="spec-field">
              <label className="spec-label">Pool Lights</label>
              <CompactInput
                value={safeData.numberOfLights ?? 0}
                onChange={(e) => handleChange('numberOfLights', parseInt(e.target.value) || 0)}
                unit="ea"
                min="0"
                step="1"
              />
              <small className="form-help">Typical builds use 2.</small>
            </div>

            {hasSpa && (
              <div className="spec-field">
                <label className="spec-label">Spa Light</label>
                <div className="pool-type-buttons">
                  <button
                    type="button"
                    className={`pool-type-btn ${safeData.hasSpaLight ? 'active' : ''}`}
                    onClick={() => handleChange('hasSpaLight', true)}
                  >
                    Add Spa Light
                  </button>
                  <button
                    type="button"
                    className={`pool-type-btn ${!safeData.hasSpaLight ? 'active' : ''}`}
                    onClick={() => handleChange('hasSpaLight', false)}
                  >
                    No Spa Light
                  </button>
                </div>
                <small className="form-help">Spa light add-on: ${pricingData.equipment.lights.spaLightAddon}</small>
              </div>
            )}
          </div>
        )}
      </div>

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
                    badge: auto.price > 0 ? `$${auto.price.toLocaleString()}` : 'Included',
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

      {/* Salt System */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Salt System</h2>
          <p className="spec-block-subtitle">Toggle salt system and select if needed.</p>
          <div className="pool-type-buttons" style={{ marginTop: '8px' }}>
            <button
              type="button"
              className={`pool-type-btn ${includeSalt ? 'active' : ''}`}
              onClick={() => toggleSalt(!includeSalt)}
            >
              {includeSalt ? 'Remove Salt System' : 'Add Salt System'}
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
                    badge: system.price > 0 ? `$${system.price.toLocaleString()}` : 'Included',
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
