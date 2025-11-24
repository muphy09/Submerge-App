import { Equipment } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import './SectionStyles.css';

interface Props {
  data: Equipment;
  onChange: (data: Equipment) => void;
  hasSpa: boolean;
}

function EquipmentSectionNew({ data, onChange, hasSpa }: Props) {
  const handleChange = (field: keyof Equipment, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const handlePumpChange = (name: string) => {
    const pump = pricingData.equipment.pumps.find(p => p.name === name);
    if (pump) {
      handleChange('pump', {
        name: pump.name,
        model: pump.model,
        price: pump.price,
      });
    }
  };

  const handleFilterChange = (name: string) => {
    const filter = pricingData.equipment.filters.find(f => f.name === name);
    if (filter) {
      handleChange('filter', {
        name: filter.name,
        sqft: filter.sqft,
        price: filter.price,
      });
    }
  };

  const handleCleanerChange = (name: string) => {
    const cleaner = pricingData.equipment.cleaners.find(c => c.name === name);
    if (cleaner) {
      const nextQuantity =
        cleaner.price > 0
          ? (data.cleanerQuantity && data.cleanerQuantity > 0 ? data.cleanerQuantity : 1)
          : 0;

      onChange({
        ...data,
        cleaner: {
          name: cleaner.name,
          price: cleaner.price,
        },
        cleanerQuantity: nextQuantity,
      });
    }
  };

  const handleHeaterChange = (name: string) => {
    const heater = pricingData.equipment.heaters.find(h => h.name === name);
    if (heater) {
      handleChange('heater', {
        name: heater.name,
        btu: heater.btu,
        price: heater.price,
        isVersaFlo: heater.isVersaFlo,
      });
    }
  };

  const handleAutomationChange = (name: string) => {
    const automation = pricingData.equipment.automation.find(a => a.name === name);
    if (automation) {
      handleChange('automation', {
        name: automation.name,
        price: automation.price,
        zones: data.automation.zones,
        hasChemistry: automation.hasChemistry,
      });
    }
  };

  return (
    <div className="section-form">
      {/* Pump */}
      <h3>Pump</h3>
      <div className="form-group">
        <label className="form-label required">Primary Pump</label>
        <select
          className="form-input"
      value={data.pump.name}
      onChange={(e) => handlePumpChange(e.target.value)}
    >
      {pricingData.equipment.pumps.map(pump => (
        <option key={pump.name} value={pump.name}>
          {pump.name} {pump.name.includes('(Included)') ? '(Included)' : ''} - ${pump.price.toLocaleString()}
        </option>
      ))}
    </select>
  </div>

      {/* Filter */}
      <h3 style={{ marginTop: '1.5rem' }}>Filter</h3>
      <div className="form-group">
        <label className="form-label required">Filter</label>
        <select
          className="form-input"
          value={data.filter.name}
          onChange={(e) => handleFilterChange(e.target.value)}
        >
          {pricingData.equipment.filters.map(filter => (
            <option key={filter.name} value={filter.name}>
              {filter.name} - ${filter.price.toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      {/* Cleaner */}
      <h3 style={{ marginTop: '1.5rem' }}>Pool Cleaner</h3>
      <div className="form-group">
        <label className="form-label required">Cleaner</label>
        <select
          className="form-input"
          value={data.cleaner.name}
          onChange={(e) => handleCleanerChange(e.target.value)}
        >
          {pricingData.equipment.cleaners.map(cleaner => (
            <option key={cleaner.name} value={cleaner.name}>
              {cleaner.name}{cleaner.price > 0 ? ` - $${cleaner.price.toLocaleString()}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Cleaner Quantity</label>
        <input
          type="number"
          className="form-input"
          value={data.cleanerQuantity ?? 0}
          onChange={(e) =>
            onChange({
              ...data,
              cleanerQuantity: Math.max(0, parseInt(e.target.value) || 0),
            })
          }
          min="0"
          step="1"
        />
        <small className="form-help">Matches Excel NEW POOL cleaner qty (set to 0 to exclude).</small>
      </div>

      {/* Heater */}
      <h3 style={{ marginTop: '1.5rem' }}>Heater</h3>
      <div className="form-group">
        <label className="form-label required">Heater</label>
        <select
          className="form-input"
          value={data.heater.name}
          onChange={(e) => handleHeaterChange(e.target.value)}
        >
          {pricingData.equipment.heaters.map(heater => (
            <option key={heater.name} value={heater.name}>
              {heater.name} - ${heater.price.toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      {!data.heater.isVersaFlo && hasSpa && (
        <div className="form-group">
          <label className="form-checkbox">
            <input
              type="checkbox"
              checked={data.upgradeToVersaFlo}
              onChange={(e) => handleChange('upgradeToVersaFlo', e.target.checked)}
            />
            <span>Upgrade to VersaFlo (required for spa heating)</span>
          </label>
        </div>
      )}

      {/* Lights */}
      <h3 style={{ marginTop: '1.5rem' }}>Lights</h3>
      <div className="form-group">
        <label className="form-label">Number of Pool Lights</label>
        <input
          type="number"
          className="form-input"
          value={data.numberOfLights || ''}
          onChange={(e) => handleChange('numberOfLights', parseInt(e.target.value) || 0)}
          min="0"
          step="1"
          placeholder="0"
        />
        <small className="form-help">
          {`Enter total pool lights (typical builds use 2). Additional lights $${pricingData.equipment.lights.additionalLightPrice} each.`}
        </small>
      </div>

      {hasSpa && (
        <div className="form-group">
          <label className="form-checkbox">
            <input
              type="checkbox"
              checked={data.hasSpaLight}
              onChange={(e) => handleChange('hasSpaLight', e.target.checked)}
            />
            <span>Add Spa Light (${pricingData.equipment.lights.spaLightAddon})</span>
          </label>
        </div>
      )}

      {/* Automation */}
      <h3 style={{ marginTop: '1.5rem' }}>Automation</h3>
      <div className="form-group">
        <label className="form-label required">Automation System</label>
        <select
          className="form-input"
          value={data.automation.name}
          onChange={(e) => handleAutomationChange(e.target.value)}
        >
          {pricingData.equipment.automation.map(auto => (
            <option key={auto.name} value={auto.name}>
              {auto.name} - ${auto.price.toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Additional Zones</label>
        <input
          type="number"
          className="form-input"
          value={data.automation.zones || ''}
          onChange={(e) => handleChange('automation', { ...data.automation, zones: parseInt(e.target.value) || 0 })}
          min="0"
          step="1"
          placeholder="0"
        />
        <small className="form-help">Additional zones beyond base: ${pricingData.equipment.automationZoneAddon}/zone</small>
      </div>

      {/* Salt System */}
      <h3 style={{ marginTop: '1.5rem' }}>Salt System (Optional)</h3>
      <div className="form-group">
        <label className="form-label">Salt System</label>
        <select
          className="form-input"
          value={data.saltSystem?.name || ''}
          onChange={(e) => {
            const system = pricingData.equipment.saltSystem.find(s => s.name === e.target.value);
            handleChange('saltSystem', system ? {
              name: system.name,
              model: system.model,
              price: system.price,
            } : undefined);
          }}
        >
          <option value="">None</option>
          {pricingData.equipment.saltSystem.map(system => (
            <option key={system.name} value={system.name}>
              {system.name}{system.price > 0 ? ` - $${system.price.toLocaleString()}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Accessories */}
      <h3 style={{ marginTop: '1.5rem' }}>Accessories</h3>
      <div className="form-group">
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={data.hasBlanketReel}
            onChange={(e) => handleChange('hasBlanketReel', e.target.checked)}
          />
          <span>Blanket Reel</span>
        </label>
      </div>

      <div className="form-group">
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={data.hasSolarBlanket}
            onChange={(e) => handleChange('hasSolarBlanket', e.target.checked)}
          />
          <span>Solar Blanket</span>
        </label>
      </div>

      <div className="form-group">
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={data.hasAutoFill}
            onChange={(e) => handleChange('hasAutoFill', e.target.checked)}
          />
          <span>Auto Fill</span>
        </label>
      </div>

      <div className="form-group">
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={data.hasHandrail}
            onChange={(e) => handleChange('hasHandrail', e.target.checked)}
          />
          <span>Handrail</span>
        </label>
      </div>

      <div className="form-group">
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={data.hasStartupChemicals}
            onChange={(e) => handleChange('hasStartupChemicals', e.target.checked)}
          />
          <span>Startup Chemicals</span>
        </label>
      </div>
    </div>
  );
}

export default EquipmentSectionNew;
