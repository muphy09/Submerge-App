import { useEffect, useState } from 'react';
import { InteriorFinish, InteriorFinishType } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import { subscribeToPricingData } from '../services/pricingDataStore';
import CustomOptionsSection from './CustomOptionsSection';
import './SectionStyles.css';

interface Props {
  data: InteriorFinish;
  onChange: (data: InteriorFinish) => void;
  hasSpa: boolean;
  isFiberglass: boolean;
}

function InteriorFinishSectionNew({ data, onChange, hasSpa, isFiberglass }: Props) {
  const [finishes, setFinishes] = useState(pricingData.interiorFinish.finishes || []);
  const fiberglassDisabledMessage = 'Cannot be adjusted, Fiberglass selected';

  useEffect(() => {
    const unsubscribe = subscribeToPricingData((snapshot) => {
      setFinishes(snapshot.interiorFinish.finishes || []);
    });
    return unsubscribe;
  }, []);

  const selectedFinish = finishes.find((f) => f.id === data.finishType) || finishes[0];
  const finishTypes: { value: InteriorFinishType; label: string }[] =
    finishes.length > 0
      ? finishes.map((finish) => ({
          value: finish.id,
          label: finish.name,
        }))
      : data.finishType
        ? [{ value: data.finishType, label: data.finishType }]
        : [{ value: '', label: 'No finishes configured' }];
  const rawColors = selectedFinish?.colors as any;
  const colorOptions = Array.isArray(rawColors)
    ? rawColors
    : typeof rawColors === 'string'
      ? rawColors.split(',').map((c: string) => c.trim()).filter(Boolean)
      : [];
  const colorMatchesOption = colorOptions.some(
    (option) => option.toLowerCase() === (data.color || '').toLowerCase()
  );
  const selectedColorValue = colorMatchesOption ? data.color : '';

  const includeMicroglass = data.hasWaterproofing ?? true;

  // Auto-set defaults from pool specs and enforce a valid finish
  useEffect(() => {
    const updates: Partial<InteriorFinish> = {};
    if (data.hasSpa !== hasSpa) {
      updates.hasSpa = hasSpa;
    }
    if (data.hasWaterproofing === undefined) {
      updates.hasWaterproofing = true;
    }
    const allowedValues = finishTypes.map((f) => f.value);
    if (allowedValues.length && !allowedValues.includes(data.finishType)) {
      updates.finishType = finishTypes[0].value;
      updates.color = '';
    }
    if (Object.keys(updates).length > 0) {
      onChange({ ...data, ...updates });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSpa, finishes]);

  // Keep color in sync with finish-specific options
  useEffect(() => {
    if (colorOptions.length === 0) {
      if (data.color) {
        onChange({ ...data, color: '' });
      }
      return;
    }
    if (!colorMatchesOption) {
      onChange({ ...data, color: colorOptions[0] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorOptions.join(','), data.finishType]);

  const handleChange = (field: keyof InteriorFinish, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="section-form">
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Finish Type</h2>
          <p className="spec-block-subtitle">Select interior finish and color / style.</p>
        </div>

        {isFiberglass && (
          <div
            className="info-box"
            style={{ marginBottom: '12px', background: '#eff6ff', borderColor: '#93c5fd', color: '#1d4ed8' }}
          >
            Interior finish pricing does not apply to fiberglass shells. Water truck charges still calculate from pool gallons.
          </div>
        )}

        <div className="spec-grid spec-grid-3">
          <div className="spec-field">
            <label className="spec-label required">Finish</label>
            <select
              className="compact-input"
              value={data.finishType}
              onChange={(e) => handleChange('finishType', e.target.value as InteriorFinishType)}
              disabled={isFiberglass}
              title={isFiberglass ? fiberglassDisabledMessage : undefined}
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
              value={selectedColorValue || ''}
              onChange={(e) => handleChange('color', e.target.value)}
              disabled={isFiberglass}
              title={isFiberglass ? fiberglassDisabledMessage : undefined}
            >
              <option value="" disabled>
                Select color/style
              </option>
              {colorOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              {colorOptions.length === 0 && <option value="">No colors configured</option>}
            </select>
          </div>

          <div className="spec-field">
            <label className="spec-label">Microglass</label>
            <button
              type="button"
              className={`pool-type-btn ${includeMicroglass ? 'active' : ''}`}
              onClick={() => handleChange('hasWaterproofing', !includeMicroglass)}
              disabled={isFiberglass}
              title={isFiberglass ? fiberglassDisabledMessage : undefined}
              style={{ width: '100%', padding: '10px 14px' }}
            >
              Include Waterproofing (Microglass)
            </button>
          </div>
        </div>
      </div>

      {!isFiberglass && (
        <CustomOptionsSection
          data={data.customOptions || []}
          onChange={(customOptions) => onChange({ ...data, customOptions })}
        />
      )}
    </div>
  );
}

export default InteriorFinishSectionNew;
