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

  // Pricing constants
  const ELECTRICAL_THRESHOLD = 65; // First 65ft included in base price
  const ELECTRICAL_OVERRUN_RATE = 18; // $18/ft beyond 65ft
  const LIGHT_RUN_RATE = 2.75; // $2.75/ft
  const LIGHT_RUN_MULTIPLIER = 1.25; // 1 ft = 1.25 ft billable conduit

  const electricalOverrun = data.runs.electricalRun > ELECTRICAL_THRESHOLD
    ? data.runs.electricalRun - ELECTRICAL_THRESHOLD
    : 0;

  // Light run - every foot counts (no threshold)
  const lightRunBillableConduit = data.runs.lightRun * LIGHT_RUN_MULTIPLIER;
  const lightRunCost = lightRunBillableConduit * LIGHT_RUN_RATE;

  return (
    <div className="section-form">
      <div className="form-help" style={{ marginBottom: '1.5rem', fontStyle: 'italic' }}>
        Enter electrical run lengths in linear feet (LNFT). Base electrical includes first 65 ft. Light run charges apply to every foot.
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
            ⚠️ Overrun: {electricalOverrun} ft over {ELECTRICAL_THRESHOLD} ft threshold - Additional charges apply (${ELECTRICAL_OVERRUN_RATE}/ft)
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
        <small className="form-help">All lights to equipment pad (1 ft = 1.25 ft billable @ ${LIGHT_RUN_RATE}/ft)</small>
        {data.runs.lightRun > 0 && (
          <small className="form-help" style={{ color: '#3b82f6', display: 'block', marginTop: '0.25rem' }}>
            ℹ️ Billable conduit: {lightRunBillableConduit.toFixed(2)} ft = ${lightRunCost.toFixed(2)}
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
          <span>Base Electrical (includes first 65 ft):</span>
          <span>$1,650</span>
        </div>
        {electricalOverrun > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', color: '#f59e0b' }}>
            <span>Electrical Overrun ({electricalOverrun} ft @ ${ELECTRICAL_OVERRUN_RATE}/ft):</span>
            <span>${(electricalOverrun * ELECTRICAL_OVERRUN_RATE).toLocaleString()}</span>
          </div>
        )}
        {data.runs.lightRun > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', color: '#3b82f6' }}>
            <span>Light Run ({lightRunBillableConduit.toFixed(2)} ft billable @ ${LIGHT_RUN_RATE}/ft):</span>
            <span>${lightRunCost.toFixed(2)}</span>
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
