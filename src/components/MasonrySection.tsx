import { Masonry } from '../types/proposal';
import './SectionStyles.css';

interface Props {
  data: Masonry;
  onChange: (data: Masonry) => void;
}

function MasonrySection({ data, onChange }: Props) {
  const handleChange = (field: keyof Masonry, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="section-form">
      <div className="form-group">
        <label className="form-label">Wall Type</label>
        <input
          type="text"
          className="form-input"
          value={data.wallType || ''}
          onChange={(e) => handleChange('wallType', e.target.value)}
          placeholder="e.g., Retaining wall, Privacy wall"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Wall Area (sq ft)</label>
        <input
          type="number"
          className="form-input"
          value={data.wallArea || 0}
          onChange={(e) => handleChange('wallArea', parseFloat(e.target.value))}
          min="0"
          step="1"
        />
      </div>

      <div className="checkbox-group">
        <label>
          <input
            type="checkbox"
            checked={data.fireplaceIncluded}
            onChange={(e) => handleChange('fireplaceIncluded', e.target.checked)}
          />
          Include Fireplace
        </label>

        <label>
          <input
            type="checkbox"
            checked={data.outdoorKitchen}
            onChange={(e) => handleChange('outdoorKitchen', e.target.checked)}
          />
          Include Outdoor Kitchen
        </label>
      </div>

      <div className="form-group">
        <label className="form-label required">Total Cost ($)</label>
        <input
          type="number"
          className="form-input"
          value={data.cost}
          onChange={(e) => handleChange('cost', parseFloat(e.target.value))}
          min="0"
          step="100"
        />
      </div>
    </div>
  );
}

export default MasonrySection;
