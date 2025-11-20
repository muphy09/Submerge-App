import { Plumbing, PlumbingRuns } from '../types/proposal-new';
import './SectionStyles.css';

interface Props {
  data: Plumbing;
  onChange: (data: Plumbing) => void;
  hasSpa: boolean;
}

function PlumbingSectionNew({ data, onChange, hasSpa }: Props) {
  const handleRunChange = (field: keyof PlumbingRuns, value: number) => {
    onChange({
      ...data,
      runs: { ...data.runs, [field]: value },
    });
  };

  // Overrun thresholds
  const SKIMMER_THRESHOLD = 33;
  const GAS_THRESHOLD = 30;

  const skimmerOverrun = data.runs.skimmerRun > SKIMMER_THRESHOLD ? data.runs.skimmerRun - SKIMMER_THRESHOLD : 0;
  const gasOverrun = data.runs.gasRun > GAS_THRESHOLD ? data.runs.gasRun - GAS_THRESHOLD : 0;

  return (
    <div className="section-form">
      <div className="form-help" style={{ marginBottom: '1.5rem', fontStyle: 'italic' }}>
        Enter run lengths in linear feet (LNFT). Overrun charges apply automatically when thresholds are exceeded.
      </div>

      {/* Core Runs */}
      <h3>Core Plumbing</h3>

      <div className="form-group">
        <label className="form-label">Skimmer Run (LNFT) - Total All Skimmers</label>
        <input
          type="number"
          className="form-input"
          value={data.runs.skimmerRun}
          onChange={(e) => handleRunChange('skimmerRun', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
        {skimmerOverrun > 0 && (
          <small className="form-help" style={{ color: '#f59e0b' }}>
            ⚠️ Overrun: {skimmerOverrun} ft over threshold ({SKIMMER_THRESHOLD} ft) - Additional charges apply
          </small>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">Additional Skimmers</label>
        <input
          type="number"
          className="form-input"
          value={data.runs.additionalSkimmers}
          onChange={(e) => handleRunChange('additionalSkimmers', parseInt(e.target.value) || 0)}
          min="0"
          step="1"
        />
        <small className="form-help">(1) skimmer is included in base price</small>
      </div>

      <div className="form-group">
        <label className="form-label">Main Drain Run (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.runs.mainDrainRun}
          onChange={(e) => handleRunChange('mainDrainRun', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
        <small className="form-help">Main drain to equipment</small>
      </div>

      <div className="form-group">
        <label className="form-label">Cleaner Run (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.runs.cleanerRun}
          onChange={(e) => handleRunChange('cleanerRun', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
        <small className="form-help">Pool center to equipment</small>
      </div>

      <div className="form-group">
        <label className="form-label">Auto-Fill Run (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.runs.autoFillRun}
          onChange={(e) => handleRunChange('autoFillRun', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
        <small className="form-help">Hose bibb to auto water leveler</small>
      </div>

      {/* Gas Run */}
      <h3 style={{ marginTop: '2rem' }}>Gas</h3>
      <div className="form-group">
        <label className="form-label">Gas Run (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.runs.gasRun}
          onChange={(e) => handleRunChange('gasRun', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
        <small className="form-help">Meter to heater</small>
        {gasOverrun > 0 && (
          <small className="form-help" style={{ color: '#f59e0b', display: 'block', marginTop: '0.25rem' }}>
            ⚠️ Overrun: {gasOverrun} ft over threshold ({GAS_THRESHOLD} ft) - Additional charges apply
          </small>
        )}
      </div>

      {/* Water Features */}
      <h3 style={{ marginTop: '2rem' }}>Water Features Plumbing</h3>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Water Feature 1 (LNFT)</label>
          <input
            type="number"
            className="form-input"
            value={data.runs.waterFeature1Run}
            onChange={(e) => handleRunChange('waterFeature1Run', parseFloat(e.target.value) || 0)}
            min="0"
            step="1"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Water Feature 2 (LNFT)</label>
          <input
            type="number"
            className="form-input"
            value={data.runs.waterFeature2Run}
            onChange={(e) => handleRunChange('waterFeature2Run', parseFloat(e.target.value) || 0)}
            min="0"
            step="1"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Water Feature 3 (LNFT)</label>
          <input
            type="number"
            className="form-input"
            value={data.runs.waterFeature3Run}
            onChange={(e) => handleRunChange('waterFeature3Run', parseFloat(e.target.value) || 0)}
            min="0"
            step="1"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Water Feature 4 (LNFT)</label>
          <input
            type="number"
            className="form-input"
            value={data.runs.waterFeature4Run}
            onChange={(e) => handleRunChange('waterFeature4Run', parseFloat(e.target.value) || 0)}
            min="0"
            step="1"
          />
        </div>
      </div>

      {/* In-Floor Cleaning */}
      <h3 style={{ marginTop: '2rem' }}>In-Floor Cleaning System</h3>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">I/F Valve to Equipment (LNFT)</label>
          <input
            type="number"
            className="form-input"
            value={data.runs.infloorValveToEQ}
            onChange={(e) => handleRunChange('infloorValveToEQ', parseFloat(e.target.value) || 0)}
            min="0"
            step="1"
          />
        </div>

        <div className="form-group">
          <label className="form-label">I/F Valve to Pool (LNFT)</label>
          <input
            type="number"
            className="form-input"
            value={data.runs.infloorValveToPool}
            onChange={(e) => handleRunChange('infloorValveToPool', parseFloat(e.target.value) || 0)}
            min="0"
            step="1"
          />
        </div>
      </div>

      {/* Spa Run */}
      {hasSpa && (
        <>
          <h3 style={{ marginTop: '2rem' }}>Spa Plumbing</h3>
          <div className="form-group">
            <label className="form-label">Spa Run (LNFT)</label>
            <input
              type="number"
              className="form-input"
              value={data.runs.spaRun}
              onChange={(e) => handleRunChange('spaRun', parseFloat(e.target.value) || 0)}
              min="0"
              step="1"
            />
            <small className="form-help">Spa to equipment</small>
          </div>
        </>
      )}
    </div>
  );
}

export default PlumbingSectionNew;
