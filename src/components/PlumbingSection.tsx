import { Plumbing } from '../types/proposal';
import './SectionStyles.css';

interface Props {
  data: Plumbing;
  onChange: (data: Plumbing) => void;
}

function PlumbingSection({ data, onChange }: Props) {
  const handleChange = (field: keyof Plumbing, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="section-form">
      <div className="form-group">
        <label className="form-label required">Pipe Type</label>
        <select
          className="form-input"
          value={data.pipeType}
          onChange={(e) => handleChange('pipeType', e.target.value)}
        >
          <option value="">Select pipe type</option>
          <option value="PVC Schedule 40">PVC Schedule 40</option>
          <option value="PVC Schedule 80">PVC Schedule 80</option>
          <option value="Flexible PVC">Flexible PVC</option>
          <option value="CPVC">CPVC</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label required">Pipe Length (feet)</label>
        <input
          type="number"
          className="form-input"
          value={data.pipeLength}
          onChange={(e) => handleChange('pipeLength', parseFloat(e.target.value))}
          min="0"
          step="1"
        />
      </div>

      <div className="form-group">
        <label className="form-label required">Labor Hours</label>
        <input
          type="number"
          className="form-input"
          value={data.laborHours}
          onChange={(e) => handleChange('laborHours', parseFloat(e.target.value))}
          min="0"
          step="0.5"
        />
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

export default PlumbingSection;
