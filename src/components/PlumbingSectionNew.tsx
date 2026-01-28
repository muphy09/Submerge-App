import { Plumbing, PlumbingRuns } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import { getSessionRole } from '../services/session';
import CustomOptionsSection from './CustomOptionsSection';
import './SectionStyles.css';

interface Props {
  data: Plumbing;
  onChange: (data: Plumbing) => void;
  hasSpa: boolean;
}

// Compact input mirrors Pool Specs / Excavation styling with inline unit label
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

function PlumbingSectionNew({ data, onChange, hasSpa }: Props) {
  const sessionRole = getSessionRole();
  const canViewCostAmounts = sessionRole === 'admin' || sessionRole === 'owner';

  const handleRunChange = (field: keyof PlumbingRuns, value: number) => {
    onChange({
      ...data,
      runs: { ...data.runs, [field]: value },
    });
  };

  const SKIMMER_THRESHOLD = pricingData.plumbing.poolOverrunThreshold;
  const SKIMMER_RATE = pricingData.plumbing.poolOverrunPerFt;
  const skimmerOverrun = Math.max(0, (data.runs.skimmerRun || 0) - SKIMMER_THRESHOLD);
  const skimmerOverrunCost = skimmerOverrun * SKIMMER_RATE;
  const skimmerOverrunMessage = canViewCostAmounts
    ? `Additional charges added - $${skimmerOverrunCost.toLocaleString()}`
    : 'Additional charges apply';

  const renderRunInput = (
    label: string,
    field: keyof PlumbingRuns,
    helper?: string,
    opts?: { unit?: string; readOnly?: boolean; placeholder?: string }
  ) => {
    const isReadOnly = opts?.readOnly;
    const valueForInput = isReadOnly ? '' : (data.runs[field] ?? 0);
    return (
      <div className="spec-field">
        <label className="spec-label">{label}</label>
        <CompactInput
          value={valueForInput}
          onChange={
            isReadOnly
              ? undefined
              : (e) => handleRunChange(field, parseFloat(e.target.value) || 0)
          }
          unit={opts?.unit ?? 'LNFT'}
          min="0"
          step="1"
          readOnly={isReadOnly}
          placeholder={opts?.placeholder ?? '0'}
        />
        {helper && <small className="form-help">{helper}</small>}
      </div>
    );
  };

  return (
    <div className="section-form">
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Core Plumbing</h2>
          <p className="spec-block-subtitle">Overruns will calculate automatically.</p>
        </div>

        <div className="spec-grid spec-grid-3">
          {renderRunInput('Total Skimmer Run', 'skimmerRun', 'All skimmers to equipment pad')}
          {renderRunInput('Main Drain Run', 'mainDrainRun', 'Main drain to equipment')}
          {hasSpa
            ? renderRunInput('Spa Run', 'spaRun', 'Spa to equipment')
            : renderRunInput('Spa Run', 'spaRun', 'Enable a spa in Pool Specs to activate', { readOnly: true, placeholder: '0' })}
        </div>

        {skimmerOverrun > 0 && (
          <div className="info-box" style={{ marginTop: '8px', background: '#fff7ed', borderColor: '#fdba74', color: '#9a3412' }}>
            <strong>Skimmer Overrun:</strong> {skimmerOverrun} ft over {SKIMMER_THRESHOLD} ft maximum. {skimmerOverrunMessage}
          </div>
        )}

        <div className="spec-subcard">
          <div className="spec-subcard-header">
            <h4 className="spec-subcard-title">Additional Skimmers</h4>
            <span className="info-pill">1 skimmer included</span>
          </div>
          <div className="spec-grid">
            <div className="spec-field" style={{ maxWidth: '220px' }}>
              <label className="spec-label">Extra Skimmers</label>
              <CompactInput
                value={data.runs.additionalSkimmers ?? 0}
                onChange={(e) => handleRunChange('additionalSkimmers', parseInt(e.target.value) || 0)}
                unit="ea"
                min="0"
                step="1"
                placeholder="0"
              />
              <small className="form-help">Beyond base package</small>
            </div>
          </div>
        </div>
      </div>

      <CustomOptionsSection
        data={data.customOptions || []}
        onChange={(customOptions) => onChange({ ...data, customOptions })}
      />
    </div>
  );
}

export default PlumbingSectionNew;
