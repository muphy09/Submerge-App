import { useEffect, useState } from 'react';
import { InteriorFinish, InteriorFinishType } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import { subscribeToPricingData } from '../services/pricingDataStore';
import { type ProposalNoteOverrides } from '../utils/proposalNotes';
import CustomOptionsSection from './CustomOptionsSection';
import { TooltipAnchor } from './AppTooltip';
import ProposalNote from './ProposalNote';
import './SectionStyles.css';
import { isBronzePricingTier } from '../services/pricingTiers';

interface Props {
  data: InteriorFinish;
  onChange: (data: InteriorFinish) => void;
  hasSpa: boolean;
  isFiberglass: boolean;
  supportsMicroglass?: boolean;
  colorFieldLabel?: string;
  includeAssignLaterColor?: boolean;
  pricingTierId?: string;
  noteOverrides?: ProposalNoteOverrides;
}

function InteriorFinishSectionNew({
  data,
  onChange,
  hasSpa,
  isFiberglass,
  supportsMicroglass = true,
  colorFieldLabel = 'Color / Style',
  includeAssignLaterColor = false,
  pricingTierId,
  noteOverrides,
}: Props) {
  const [finishes, setFinishes] = useState(pricingData.interiorFinish.finishes || []);
  const fiberglassDisabledMessage = 'Cannot be adjusted, Fiberglass selected';
  const isBronzeTier = isBronzePricingTier(pricingTierId);

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
  const configuredColorOptions = Array.isArray(rawColors)
    ? rawColors
    : typeof rawColors === 'string'
      ? rawColors.split(',').map((c: string) => c.trim()).filter(Boolean)
      : [];
  const colorOptions = includeAssignLaterColor
    ? [
        'Assign Later',
        ...configuredColorOptions.filter(
          (color) => String(color || '').trim().toLowerCase() !== 'assign later'
        ),
      ]
    : configuredColorOptions;
  const colorMatchesOption = colorOptions.some(
    (option) => option.toLowerCase() === (data.color || '').toLowerCase()
  );
  const selectedColorValue = colorMatchesOption ? data.color : '';

  const includeMicroglass = supportsMicroglass && !isBronzeTier && (data.hasWaterproofing ?? true);

  // Auto-set defaults from pool specs and enforce a valid finish
  useEffect(() => {
    const updates: Partial<InteriorFinish> = {};
    if (data.hasSpa !== hasSpa) {
      updates.hasSpa = hasSpa;
    }
    if ((!supportsMicroglass || isBronzeTier) && data.hasWaterproofing !== false) {
      updates.hasWaterproofing = false;
    } else if (supportsMicroglass && !isBronzeTier && data.hasWaterproofing === undefined) {
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
  }, [hasSpa, finishes, isBronzeTier, supportsMicroglass]);

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
  }, [colorOptions.join(','), data.finishType, includeAssignLaterColor]);

  const handleChange = (field: keyof InteriorFinish, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="section-form">
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Finish Type</h2>
          <ProposalNote categoryKey="interiorFinish" subcategoryId="finishType" overrides={noteOverrides} />
        </div>

        {isFiberglass && (
          <div
            className="info-box"
            style={{ marginBottom: '12px', background: '#eff6ff', borderColor: '#93c5fd', color: '#1d4ed8' }}
          >
            Interior finish pricing does not apply to Fiberglass Shells.
          </div>
        )}

        <div className={`spec-grid ${supportsMicroglass ? 'spec-grid-3' : 'spec-grid-2'}`}>
          <div className="spec-field">
            <label className="spec-label required">Finish</label>
            <TooltipAnchor as="div" tooltip={isFiberglass ? fiberglassDisabledMessage : undefined}>
              <select
                className="compact-input"
                value={data.finishType}
                onChange={(e) => handleChange('finishType', e.target.value as InteriorFinishType)}
                disabled={isFiberglass}
              >
                {finishTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </TooltipAnchor>
          </div>

          <div className="spec-field">
            <label className="spec-label">{colorFieldLabel}</label>
            <TooltipAnchor as="div" tooltip={isFiberglass ? fiberglassDisabledMessage : undefined}>
              <select
                className="compact-input"
                value={selectedColorValue || ''}
                onChange={(e) => handleChange('color', e.target.value)}
                disabled={isFiberglass}
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
            </TooltipAnchor>
          </div>

          {supportsMicroglass && (
            <div className="spec-field">
              <label className="spec-label">Microglass</label>
              <TooltipAnchor
                as="div"
                tooltip={
                  isFiberglass
                    ? fiberglassDisabledMessage
                    : isBronzeTier
                      ? 'Microglass is not available in Bronze pricing.'
                      : undefined
                }
              >
                <button
                  type="button"
                  className={`pool-type-btn ${includeMicroglass ? 'active' : ''}`}
                  onClick={() => {
                    if (isBronzeTier) return;
                    handleChange('hasWaterproofing', !includeMicroglass);
                  }}
                  disabled={isFiberglass || isBronzeTier}
                  style={{ width: '100%', padding: '10px 14px' }}
                >
                  Include Waterproofing (Microglass)
                </button>
              </TooltipAnchor>
            </div>
          )}
        </div>
      </div>

      {!isFiberglass && (
        <CustomOptionsSection
          data={data.customOptions || []}
          onChange={(customOptions) => onChange({ ...data, customOptions })}
          noteCategoryKey="interiorFinish"
          noteOverrides={noteOverrides}
        />
      )}
    </div>
  );
}

export default InteriorFinishSectionNew;
