import { Electrical, ElectricalRuns } from '../types/proposal-new';
import './SectionStyles.css';

interface Props {
  data: Electrical;
  onChange: (data: Electrical) => void;
  hasSpa: boolean;
}

function ElectricalSectionNew({ data, onChange, hasSpa }: Props) {
  const handleRunChange = (field: keyof ElectricalRuns, value: number) => {
    onChange({
      ...data,
      runs: { ...data.runs, [field]: value },
    });
  };

  // Overrun thresholds
  const ELECTRICAL_THRESHOLD = 100;
  const LIGHT_THRESHOLD = 150;

  const electricalOverrun = data.runs.electricalRun > ELECTRICAL_THRESHOLD
    ? data.runs.electricalRun - ELECTRICAL_THRESHOLD
    : 0;
  const lightOverrun = data.runs.lightRun > LIGHT_THRESHOLD
    ? data.runs.lightRun - LIGHT_THRESHOLD
    : 0;

  return (
    <div className="section-form">
      <h2>Electrical</h2>

      <div className="form-help" style={{ marginBottom: '1.5rem' }}>
        Enter electrical run lengths in linear feet (LNFT). Overrun charges apply automatically when thresholds are exceeded.
      </div>

      <div className="form-group">
        <label className="form-label">Main Electrical Run (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.runs.electricalRun}
          onChange={(e) => handleRunChange('electricalRun', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
        <small className="form-help">House panel to equipment pad</small>
        {electricalOverrun > 0 && (
          <small className="form-help" style={{ color: '#f59e0b', display: 'block', marginTop: '0.25rem' }}>
            ⚠️ Overrun: {electricalOverrun} ft over threshold ({ELECTRICAL_THRESHOLD} ft) - Additional charges apply ($18/ft)
          </small>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">Light Run (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.runs.lightRun}
          onChange={(e) => handleRunChange('lightRun', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
        <small className="form-help">All lights to equipment pad</small>
        {lightOverrun > 0 && (
          <small className="form-help" style={{ color: '#f59e0b', display: 'block', marginTop: '0.25rem' }}>
            ⚠️ Overrun: {lightOverrun} ft over threshold ({LIGHT_THRESHOLD} ft) - Additional charges apply ($450/ft)
          </small>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">Heat Pump Electrical Run (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.runs.heatPumpElectricalRun}
          onChange={(e) => handleRunChange('heatPumpElectricalRun', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
        <small className="form-help">Only if using heat pump (charged per 10 ft)</small>
      </div>

      {hasSpa && (
        <div className="alert" style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: '#dbeafe',
          borderLeft: '4px solid #3b82f6',
          borderRadius: '4px'
        }}>
          <strong>Note:</strong> Spa electrical included in base electrical pricing. Additional spa light wiring calculated in equipment section.
        </div>
      )}

      <div className="cost-summary" style={{
        marginTop: '2rem',
        padding: '1rem',
        backgroundColor: '#f9fafb',
        borderRadius: '4px'
      }}>
        <h4>Cost Summary</h4>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
          <span>Base Electrical:</span>
          <span>$1,650</span>
        </div>
        {electricalOverrun > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', color: '#f59e0b' }}>
            <span>Electrical Overrun ({electricalOverrun} ft):</span>
            <span>${(electricalOverrun * 18).toLocaleString()}</span>
          </div>
        )}
        {lightOverrun > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', color: '#f59e0b' }}>
            <span>Light Run Overrun ({lightOverrun} ft):</span>
            <span>${(lightOverrun * 450).toLocaleString()}</span>
          </div>
        )}
        {hasSpa && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
            <span>Spa Electrical:</span>
            <span>$100</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default ElectricalSectionNew;
