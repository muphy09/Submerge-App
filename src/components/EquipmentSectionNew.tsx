import { useEffect, useMemo, useState } from 'react';
import { Equipment } from '../types/proposal-new';
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
}: {
  value: T;
  options: { label: string; value: T; badge?: string }[];
  onChange: (val: T) => void;
}) => (
  <div className="pool-type-buttons stackable">
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

  const safeData: Equipment = {
    pump: data?.pump || { name: defaults.pump.name, model: defaults.pump.model, price: defaults.pump.price },
    filter: data?.filter || { name: defaults.filter.name, sqft: defaults.filter.sqft, price: defaults.filter.price },
    cleaner: data?.cleaner || { name: defaults.cleaner.name, price: defaults.cleaner.price },
    cleanerQuantity: data?.cleanerQuantity ?? 0,
    heater: data?.heater || {
      name: defaults.heater.name,
      btu: defaults.heater.btu,
      price: defaults.heater.price,
      isVersaFlo: defaults.heater.isVersaFlo,
    },
    upgradeToVersaFlo: data?.upgradeToVersaFlo ?? false,
    numberOfLights: data?.numberOfLights ?? 0,
    hasSpaLight: data?.hasSpaLight ?? false,
    automation: data?.automation || {
      name: defaults.automation.name,
      price: defaults.automation.price,
      zones: data?.automation?.zones ?? 0,
      hasChemistry: defaults.automation.hasChemistry,
    },
    saltSystem: data?.saltSystem,
    hasBlanketReel: data?.hasBlanketReel ?? false,
    hasSolarBlanket: data?.hasSolarBlanket ?? false,
    hasAutoFill: data?.hasAutoFill ?? false,
    hasHandrail: data?.hasHandrail ?? false,
    hasStartupChemicals: data?.hasStartupChemicals ?? false,
    totalCost: data?.totalCost ?? 0,
  };

  useEffect(() => {
    if (!data?.pump || !data?.filter || !data?.heater || !data?.automation || !data?.cleaner) {
      onChange(safeData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [includePump, setIncludePump] = useState<boolean>(!!safeData.pump?.name);
  const [includeFilter, setIncludeFilter] = useState<boolean>(!!safeData.filter?.name);
  const [includeCleaner, setIncludeCleaner] = useState<boolean>((safeData.cleanerQuantity ?? 0) > 0);
  const [includeHeater, setIncludeHeater] = useState<boolean>(!!safeData.heater?.name);
  const [includeLighting, setIncludeLighting] = useState<boolean>((safeData.numberOfLights ?? 0) > 0 || safeData.hasSpaLight);
  const [includeAutomation, setIncludeAutomation] = useState<boolean>(!!safeData.automation?.name);
  const [includeSalt, setIncludeSalt] = useState<boolean>(!!safeData.saltSystem?.name);
  const [includeAccessories] = useState<boolean>(true);

  const handleChange = (field: keyof Equipment, value: any) => {
    onChange({ ...safeData, [field]: value });
  };

  const togglePump = (val: boolean) => {
    setIncludePump(val);
    if (val) {
      handleChange('pump', {
        name: safeData.pump?.name || defaults.pump.name,
        model: safeData.pump?.model || defaults.pump.model,
        price: safeData.pump?.price ?? defaults.pump.price,
      });
    } else {
      handleChange('pump', { name: defaults.pump.name, model: defaults.pump.model, price: defaults.pump.price });
    }
  };

  const toggleFilter = (val: boolean) => {
    setIncludeFilter(val);
    if (val) {
      handleChange('filter', {
        name: safeData.filter?.name || defaults.filter.name,
        sqft: safeData.filter?.sqft ?? defaults.filter.sqft,
        price: safeData.filter?.price ?? defaults.filter.price,
      });
    } else {
      handleChange('filter', { name: defaults.filter.name, sqft: defaults.filter.sqft, price: defaults.filter.price });
    }
  };

  const toggleCleaner = (val: boolean) => {
    setIncludeCleaner(val);
    if (val) {
      const selected = safeData.cleaner?.name ? safeData.cleaner : defaults.cleaner;
      const baseQty = selected.price > 0 ? 1 : 0;
      handleChange('cleaner', { name: selected.name, price: selected.price });
      handleChange('cleanerQuantity', safeData.cleanerQuantity ?? baseQty);
    } else {
      handleChange('cleaner', { name: defaults.cleaner.name, price: defaults.cleaner.price });
      handleChange('cleanerQuantity', 0);
    }
  };

  const toggleHeater = (val: boolean) => {
    setIncludeHeater(val);
    if (val) {
      const selected = safeData.heater?.name ? safeData.heater : defaults.heater;
      handleChange('heater', {
        name: selected.name,
        btu: selected.btu,
        price: selected.price,
        isVersaFlo: selected.isVersaFlo,
      });
    } else {
      handleChange('heater', {
        name: defaults.heater.name,
        btu: defaults.heater.btu,
        price: defaults.heater.price,
        isVersaFlo: defaults.heater.isVersaFlo,
      });
      handleChange('upgradeToVersaFlo', false);
    }
  };

  const toggleLighting = (val: boolean) => {
    setIncludeLighting(val);
    if (!val) {
      handleChange('numberOfLights', 0);
      handleChange('hasSpaLight', false);
    }
  };

  const toggleAutomation = (val: boolean) => {
    setIncludeAutomation(val);
    if (val) {
      const selected = safeData.automation?.name ? safeData.automation : defaults.automation;
      handleChange('automation', {
        name: selected.name,
        price: selected.price,
        zones: safeData.automation?.zones ?? 0,
        hasChemistry: selected.hasChemistry,
      });
    } else {
      handleChange('automation', {
        name: defaults.automation.name,
        price: defaults.automation.price,
        zones: 0,
        hasChemistry: defaults.automation.hasChemistry,
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

  const handleFilterChange = (name: string) => {
    const filter = pricingData.equipment.filters.find(f => f.name === name);
    if (filter) {
      handleChange('filter', { name: filter.name, sqft: filter.sqft, price: filter.price });
    }
  };

  const handleCleanerChange = (name: string) => {
    const cleaner = pricingData.equipment.cleaners.find(c => c.name === name);
    if (cleaner) {
      const nextQuantity = cleaner.price > 0 ? (safeData.cleanerQuantity && safeData.cleanerQuantity > 0 ? safeData.cleanerQuantity : 1) : 0;
      handleChange('cleaner', { name: cleaner.name, price: cleaner.price });
      handleChange('cleanerQuantity', nextQuantity);
    }
  };

  const handleHeaterChange = (name: string) => {
    const heater = pricingData.equipment.heaters.find(h => h.name === name);
    if (heater) {
      handleChange('heater', { name: heater.name, btu: heater.btu, price: heater.price, isVersaFlo: heater.isVersaFlo });
    }
  };

  const handleAutomationChange = (name: string) => {
    const automation = pricingData.equipment.automation.find(a => a.name === name);
    if (automation) {
      handleChange('automation', {
        name: automation.name,
        price: automation.price,
        zones: safeData.automation.zones,
        hasChemistry: automation.hasChemistry,
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
          <p className="spec-block-subtitle">Toggle pump selection and choose a model.</p>
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
                options={pricingData.equipment.pumps
                  .filter(pump => !pump.name.toLowerCase().includes('no pump'))
                  .map(pump => ({
                    label: pump.name,
                    value: pump.name,
                    badge: pump.price > 0 ? `$${pump.price.toLocaleString()}` : 'Included',
                  }))}
              />
            </div>
          )}
      </div>

      {/* Filter */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Filter</h2>
          <p className="spec-block-subtitle">Toggle filter selection and choose a model.</p>
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
                options={pricingData.equipment.filters
                  .filter(filter => !filter.name.toLowerCase().includes('no filter'))
                  .map(filter => ({
                    label: `${filter.name} (${filter.sqft} sqft)`,
                    value: filter.name,
                    badge: filter.price > 0 ? `$${filter.price.toLocaleString()}` : 'Included',
                  }))}
              />
            </div>
          )}
      </div>

      {/* Cleaner */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Cleaner</h2>
          <p className="spec-block-subtitle">Toggle cleaner selection and choose a model.</p>
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
          <div className="spec-grid spec-grid-2">
            <div className="spec-field">
              <ButtonGroup
                value={safeData.cleaner.name}
                onChange={handleCleanerChange}
                options={pricingData.equipment.cleaners
                  .filter(cleaner => !cleaner.name.toLowerCase().includes('no cleaner'))
                  .map(cleaner => ({
                    label: cleaner.name,
                    value: cleaner.name,
                    badge: cleaner.price > 0 ? `$${cleaner.price.toLocaleString()}` : 'Included',
                  }))}
              />
            </div>
            <div className="spec-field" style={{ maxWidth: '220px' }}>
              <label className="spec-label">Cleaner Quantity</label>
              <CompactInput
                value={safeData.cleanerQuantity ?? 0}
                onChange={(e) => handleChange('cleanerQuantity', Math.max(0, parseInt(e.target.value) || 0))}
                unit="ea"
                min="0"
                step="1"
              />
              <small className="form-help">Set to 0 to exclude.</small>
            </div>
          </div>
        )}
      </div>

      {/* Heating */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Heater</h2>
          <p className="spec-block-subtitle">Toggle heater selection and choose a model.</p>
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
          </div>
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
          <div className="spec-grid spec-grid-2">
            <div className="spec-field">
              <ButtonGroup
                value={safeData.automation.name}
                onChange={handleAutomationChange}
                options={pricingData.equipment.automation
                  .filter(auto => !auto.name.toLowerCase().includes('no automation'))
                  .map(auto => ({
                    label: auto.name,
                    value: auto.name,
                    badge: auto.price > 0 ? `$${auto.price.toLocaleString()}` : 'Included',
                  }))}
              />
            </div>

            <div className="spec-field" style={{ maxWidth: '220px' }}>
              <label className="spec-label">Additional Zones</label>
              <CompactInput
                value={safeData.automation.zones ?? 0}
                onChange={(e) => handleChange('automation', { ...safeData.automation, zones: parseInt(e.target.value) || 0 })}
                unit="ea"
                min="0"
                step="1"
              />
              <small className="form-help">Beyond base zones (${pricingData.equipment.automationZoneAddon}/zone).</small>
            </div>
          </div>
        )}
      </div>

      {/* Salt System */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Salt System (Optional)</h2>
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
