import { useEffect } from 'react';
import { InteriorFinish, InteriorFinishType } from '../types/proposal-new';
import './SectionStyles.css';

interface Props {
  data: InteriorFinish;
  onChange: (data: InteriorFinish) => void;
  poolSurfaceArea: number;
  hasSpa: boolean;
}

function InteriorFinishSectionNew({ data, onChange, poolSurfaceArea, hasSpa }: Props) {
  // Auto-set surface area from pool specs
  useEffect(() => {
    if (poolSurfaceArea !== data.surfaceArea) {
      onChange({ ...data, surfaceArea: poolSurfaceArea, hasSpa });
    }
  }, [poolSurfaceArea, hasSpa]);

  const handleChange = (field: keyof InteriorFinish, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const finishTypes: { value: InteriorFinishType; label: string }[] = [
    { value: 'plaster', label: 'Plaster (White/Color)' },
    { value: 'pebble-tec', label: 'Pebble Tec' },
    { value: 'pebble-sheen', label: 'Pebble Sheen' },
    { value: 'pebble-fina', label: 'Pebble Fina' },
    { value: 'mini-pebble', label: 'Mini Pebble' },
    { value: 'beadcrete', label: 'Beadcrete' },
    { value: 'quartz-scapes', label: 'Quartz Scapes' },
    { value: 'hydrazzo', label: 'Hydrazzo' },
    { value: 'tile', label: 'Tile (Full)' },
    { value: 'ivory-quartz', label: 'Ivory Quartz' },
    { value: 'pebble-tec-l1', label: 'Pebble Tec - Level 1' },
    { value: 'pebble-tec-l2', label: 'Pebble Tec - Level 2' },
    { value: 'pebble-tec-l3', label: 'Pebble Tec - Level 3' },
    { value: 'pebble-sheen-l1', label: 'Pebble Sheen - Level 1' },
    { value: 'pebble-sheen-l2', label: 'Pebble Sheen - Level 2' },
    { value: 'pebble-sheen-l3', label: 'Pebble Sheen - Level 3' },
    { value: 'pebble-fina-l1', label: 'Pebble Fina - Level 1' },
    { value: 'pebble-fina-l2', label: 'Pebble Fina - Level 2' },
    { value: 'pebble-brilliance', label: 'Pebble Brilliance' },
    { value: 'pebble-breeze', label: 'Pebble Breeze' },
    { value: 'pebble-essence', label: 'Pebble Essence' },
  ];

  return (
    <div className="section-form">
      <div className="form-group">
        <label className="form-label required">Finish Type</label>
        <select
          className="form-input"
          value={data.finishType}
          onChange={(e) => handleChange('finishType', e.target.value as InteriorFinishType)}
        >
          {finishTypes.map(type => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Color/Style</label>
        <input
          type="text"
          className="form-input"
          value={data.color}
          onChange={(e) => handleChange('color', e.target.value)}
          placeholder="Enter color or style name"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Surface Area (SQFT) - Auto-calculated</label>
        <input
          type="number"
          className="form-input"
          value={data.surfaceArea}
          readOnly
          style={{ backgroundColor: '#f0f0f0', cursor: 'not-allowed' }}
        />
        <small className="form-help">Automatically set from pool specifications</small>
      </div>

      {hasSpa && (
        <div className="alert" style={{
          marginTop: '1rem',
          padding: '1rem',
          backgroundColor: '#dbeafe',
          borderLeft: '4px solid #3b82f6',
          borderRadius: '4px'
        }}>
          <strong>Spa Finish Included:</strong> Additional finish costs for spa will be calculated automatically.
        </div>
      )}
    </div>
  );
}

export default InteriorFinishSectionNew;
