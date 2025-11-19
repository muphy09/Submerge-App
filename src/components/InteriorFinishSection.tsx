import { useState, useEffect } from 'react';
import { InteriorFinish } from '../types/proposal';
import './SectionStyles.css';

interface Props {
  data: InteriorFinish;
  onChange: (data: InteriorFinish) => void;
}

function InteriorFinishSection({ data, onChange }: Props) {
  const [formData, setFormData] = useState<InteriorFinish>(data);

  useEffect(() => {
    setFormData(data);
  }, [data]);

  const handleChange = (field: keyof InteriorFinish, value: any) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    onChange(updated);
  };

  return (
    <div className="section-form">
      <div className="form-group">
        <label className="form-label required">Finish Type</label>
        <select
          className="form-input"
          value={formData.finishType}
          onChange={(e) => handleChange('finishType', e.target.value)}
        >
          <option value="">Select finish type</option>
          <option value="Plaster - White">Plaster - White</option>
          <option value="Plaster - Colored">Plaster - Colored</option>
          <option value="Pebble Tec">Pebble Tec</option>
          <option value="Pebble Sheen">Pebble Sheen</option>
          <option value="Glass Bead">Glass Bead</option>
          <option value="Tile">Tile</option>
          <option value="Vinyl Liner">Vinyl Liner</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label required">Color</label>
        <input
          type="text"
          className="form-input"
          value={formData.color}
          onChange={(e) => handleChange('color', e.target.value)}
          placeholder="e.g., Caribbean Blue, White"
        />
      </div>

      <div className="form-group">
        <label className="form-label required">Surface Area (sq ft)</label>
        <input
          type="number"
          className="form-input"
          value={formData.area}
          onChange={(e) => handleChange('area', parseFloat(e.target.value))}
          min="0"
          step="1"
        />
      </div>

      <div className="form-group">
        <label className="form-label required">Total Cost ($)</label>
        <input
          type="number"
          className="form-input"
          value={formData.cost}
          onChange={(e) => handleChange('cost', parseFloat(e.target.value))}
          min="0"
          step="100"
        />
      </div>
    </div>
  );
}

export default InteriorFinishSection;
