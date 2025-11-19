import { Drainage } from '../types/proposal';
import './SectionStyles.css';

interface Props {
  data: Drainage;
  onChange: (data: Drainage) => void;
}

function DrainageSection({ data, onChange }: Props) {
  const handleChange = (field: keyof Drainage, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="section-form">
      <div className="form-group">
        <label className="form-label required">Drain Type</label>
        <select
          className="form-input"
          value={data.drainType}
          onChange={(e) => handleChange('drainType', e.target.value)}
        >
          <option value="">Select drain type</option>
          <option value="Main drain">Main Drain</option>
          <option value="Deck drain">Deck Drain</option>
          <option value="Overflow drain">Overflow Drain</option>
          <option value="French drain">French Drain</option>
        </select>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label required">Number of Drains</label>
          <input
            type="number"
            className="form-input"
            value={data.drainCount}
            onChange={(e) => handleChange('drainCount', parseInt(e.target.value))}
            min="0"
            step="1"
          />
        </div>

        <div className="form-group">
          <label className="form-label required">Piping Length (feet)</label>
          <input
            type="number"
            className="form-input"
            value={data.pipingLength}
            onChange={(e) => handleChange('pipingLength', parseFloat(e.target.value))}
            min="0"
            step="1"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label required">Total Cost ($)</label>
        <input
          type="number"
          className="form-input"
          value={data.cost}
          onChange={(e) => handleChange('cost', parseFloat(e.target.value))}
          min="0"
          step="50"
        />
      </div>
    </div>
  );
}

export default DrainageSection;
