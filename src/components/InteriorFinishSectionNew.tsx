import React, { useEffect } from 'react';
import { InteriorFinish, InteriorFinishType } from '../types/proposal-new';
import './SectionStyles.css';

// Reuse compact input styling from other sections
const CompactInput = ({
  type = 'number',
  value,
  onChange,
  unit,
  min,
  step,
  placeholder,
}: {
  type?: string;
  value: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  unit?: string;
  min?: string;
  step?: string;
  placeholder?: string;
}) => {
  const displayValue = type === 'number' && value === 0 ? '' : value;
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
        placeholder={finalPlaceholder}
      />
      {unit && <span className="compact-input-unit">{unit}</span>}
    </div>
  );
};

interface Props {
  data: InteriorFinish;
  onChange: (data: InteriorFinish) => void;
  poolSurfaceArea: number;
  hasSpa: boolean;
}

function InteriorFinishSectionNew({ data, onChange, poolSurfaceArea, hasSpa }: Props) {
  // Allowed finish list (restricted)
  const finishTypes: { value: InteriorFinishType; label: string }[] = [
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
  ];
  const colorOptions = [
    'Bordeaux',
    'Desert Gold',
    'French Grey',
    'Irish Mist',
    'White Diamonds',
    'HighTech Carribean Blue',
  ];

  // Auto-set defaults from pool specs and enforce a valid finish
  useEffect(() => {
    const updates: Partial<InteriorFinish> = {};
    if (!data.surfaceArea || data.surfaceArea <= 0) {
      updates.surfaceArea = poolSurfaceArea;
    }
    if (data.hasSpa !== hasSpa) {
      updates.hasSpa = hasSpa;
    }
    if (data.hasWaterproofing === undefined) {
      updates.hasWaterproofing = false;
    }
    const allowedValues = finishTypes.map((f) => f.value);
    if (!allowedValues.includes(data.finishType)) {
      updates.finishType = finishTypes[0].value;
    }
    if (Object.keys(updates).length > 0) {
      onChange({ ...data, ...updates });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolSurfaceArea, hasSpa]);

  const handleChange = (field: keyof InteriorFinish, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="section-form">
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Finish Type</h2>
          <p className="spec-block-subtitle">Select finish, color/style, and adjust surface area if needed.</p>
        </div>

        <div className="spec-grid spec-grid-3">
          <div className="spec-field">
            <label className="spec-label required">Finish</label>
            <select
              className="compact-input"
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

          <div className="spec-field">
            <label className="spec-label">Color / Style</label>
            <select
              className="compact-input"
              value={data.color || ''}
              onChange={(e) => handleChange('color', e.target.value)}
            >
              <option value="" disabled>
                Select color/style
              </option>
              {colorOptions.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              {data.color && !colorOptions.includes(data.color) && (
                <option value={data.color}>{data.color}</option>
              )}
            </select>
          </div>

          <div className="spec-field">
            <label className="spec-label">Surface Area - Automatically Calculated</label>
            <CompactInput
              value={data.surfaceArea || ''}
              onChange={(e) => handleChange('surfaceArea', parseFloat(e.target.value) || 0)}
              unit="SQFT"
              min="0"
              step="1"
              placeholder={poolSurfaceArea ? poolSurfaceArea.toString() : '0'}
            />
          </div>
        </div>

        <div className="spec-grid spec-grid-3">
          <div className="spec-field">
            <label className="spec-label">Waterproofing</label>
            <label className="checkbox-inline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={data.hasWaterproofing ?? false}
                onChange={(e) => handleChange('hasWaterproofing', e.target.checked)}
              />
              <span>Include waterproofing</span>
            </label>
          </div>
        </div>

        {hasSpa && (
          <div
            className="info-box"
            style={{
              marginTop: '12px',
              background: '#dbeafe',
              borderColor: '#bfdbfe',
              color: '#1d4ed8',
            }}
          >
            <strong>Spa Finish Included:</strong> Additional finish costs for spa calculate automatically.
          </div>
        )}
      </div>
    </div>
  );
}

export default InteriorFinishSectionNew;
