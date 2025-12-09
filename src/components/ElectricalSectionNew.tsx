import { Electrical, ElectricalRuns, PlumbingRuns } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import './SectionStyles.css';

interface Props {
  data: Electrical;
  onChange: (data: Electrical) => void;
  plumbingRuns: PlumbingRuns;
  onChangePlumbingRuns: (runs: PlumbingRuns) => void;
  hasSpa: boolean;
}

// Reusable compact input to mirror Pool Specs / Excavation styling
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

function ElectricalSectionNew({ data, onChange, plumbingRuns, onChangePlumbingRuns, hasSpa }: Props) {
  const handleRunChange = (field: keyof ElectricalRuns, value: number) => {
    onChange({
      ...data,
      runs: { ...data.runs, [field]: value },
    });
  };

  const handleGasRunChange = (value: number) => {
    onChangePlumbingRuns({ ...plumbingRuns, gasRun: value });
  };

  // Pricing constants
  const ELECTRICAL_THRESHOLD = 65; // First 65 ft included in base price
  const ELECTRICAL_OVERRUN_RATE = 18; // $18/ft beyond 65 ft
  const gasRun = plumbingRuns?.gasRun ?? 0;
  const GAS_THRESHOLD = pricingData.plumbing.gasOverrunThreshold;
  const GAS_OVERRUN_RATE = pricingData.electrical.gasPerFtOverThreshold;
  const gasOverrun = Math.max(0, gasRun - GAS_THRESHOLD);
  const gasOverrunCost = gasOverrun * GAS_OVERRUN_RATE;

  const electricalOverrun = Math.max(0, (data.runs.electricalRun || 0) - ELECTRICAL_THRESHOLD);

  return (
    <div className="section-form">
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Gas Run</h2>
          <p className="spec-block-subtitle">Base Gas includes the first 25ft.</p>
        </div>

        <div className="spec-grid spec-grid-3">
          <div className="spec-field">
            <label className="spec-label">Gas Run</label>
            <CompactInput
              value={gasRun}
              onChange={(e) => handleGasRunChange(parseFloat(e.target.value) || 0)}
              unit="LNFT"
              min="0"
              step="1"
              placeholder="0"
            />
            <small className="form-help">Meter to heater</small>
          </div>
        </div>

        {gasOverrun > 0 && (
          <div className="info-box" style={{ marginTop: '8px', background: '#fff7ed', borderColor: '#fdba74', color: '#9a3412' }}>
            <strong>Gas Overrun:</strong> {gasOverrun} ft over {GAS_THRESHOLD} ft maximum. Additional charges added - ${gasOverrunCost.toLocaleString()}
          </div>
        )}
      </div>

      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Electrical Runs</h2>
          <p className="spec-block-subtitle">Base Electrical includes the first 65ft</p>
        </div>

        <div className="spec-grid spec-grid-3">
          <div className="spec-field">
            <label className="spec-label">Main Electrical Run</label>
            <CompactInput
              value={data.runs.electricalRun || 0}
              onChange={(e) => handleRunChange('electricalRun', parseFloat(e.target.value) || 0)}
              unit="LNFT"
              min="0"
              step="0.1"
              placeholder="0"
            />
            <small className="form-help">House panel to equipment pad</small>
          </div>

          <div className="spec-field">
            <label className="spec-label">Light Run</label>
            <CompactInput
              value={data.runs.lightRun || 0}
              onChange={(e) => handleRunChange('lightRun', parseFloat(e.target.value) || 0)}
              unit="LNFT"
              min="0"
              step="0.1"
              placeholder="0"
            />
            <small className="form-help">All lights to equipment pad</small>
          </div>

          <div className="spec-field">
            <label className="spec-label">Heat Pump Electrical Run</label>
            <CompactInput
              value={data.runs.heatPumpElectricalRun || 0}
              onChange={(e) => handleRunChange('heatPumpElectricalRun', parseFloat(e.target.value) || 0)}
              unit="LNFT"
              min="0"
              step="1"
              placeholder="0"
            />
            <small className="form-help">Only if using a heat pump </small>
          </div>
        </div>

        {electricalOverrun > 0 && (
          <div className="info-box" style={{ marginTop: '8px', background: '#fff7ed', borderColor: '#fdba74', color: '#9a3412' }}>
            <strong>Electrical Overrun:</strong> {electricalOverrun} ft over {ELECTRICAL_THRESHOLD}ft maximum. Additional charges added - ${(
              electricalOverrun * ELECTRICAL_OVERRUN_RATE
            ).toLocaleString()}
          </div>
        )}
        {hasSpa && (
          <div className="info-box" style={{ marginTop: '8px' }}>
            Spa electrical is included in base pricing; additional spa light wiring is handled in the Equipment section.
          </div>
        )}
      </div>
    </div>
  );
}

export default ElectricalSectionNew;
