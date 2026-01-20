import { useEffect } from 'react';
import { TileCopingDecking } from '../types/proposal-new';
import { getSessionRole } from '../services/session';
import './SectionStyles.css';

interface Props {
  data: TileCopingDecking;
  onChange: (data: TileCopingDecking) => void;
  poolPerimeter: number;
  isFiberglass: boolean;
  poolDeckingArea: number;
}

const CompactInput = ({
  type = 'number',
  value,
  onChange,
  unit,
  min,
  step,
  readOnly = false,
  placeholder,
}: {
  type?: string;
  value: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  unit?: string;
  min?: string;
  step?: string;
  readOnly?: boolean;
  placeholder?: string;
}) => {
  const displayValue = type === 'number' && value === 0 && !readOnly ? '' : value;
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
        readOnly={readOnly}
        placeholder={finalPlaceholder}
        style={readOnly ? { backgroundColor: '#f0f0f0', cursor: 'not-allowed' } : {}}
      />
      {unit && <span className="compact-input-unit">{unit}</span>}
    </div>
  );
};

function TileCopingDeckingSectionNew({ data, onChange, poolPerimeter, isFiberglass, poolDeckingArea }: Props) {
  const sessionRole = getSessionRole();
  const canViewCostAmounts = sessionRole === 'admin' || sessionRole === 'owner';
  const showStoneRockwork = false;
  const handleChange = (field: keyof TileCopingDecking, value: any) => {
    onChange({ ...data, [field]: value });
  };

  // Prefill decking area from Pool Specifications when available and not set here yet
  useEffect(() => {
    if ((data.deckingArea ?? 0) <= 0 && poolDeckingArea > 0) {
      onChange({ ...data, deckingArea: poolDeckingArea });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolDeckingArea]);

  return (
    <div className="section-form">
      {/* Tile Section - Only for gunite pools */}
      {!isFiberglass && (
        <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Tile</h2>
        </div>

          <div className="spec-grid-3-fixed">
            <div className="spec-field">
              <label className="spec-label required">Tile Level</label>
              <select
                className="compact-input"
                value={data.tileLevel}
                onChange={(e) => handleChange('tileLevel', parseInt(e.target.value, 10))}
              >
                <option value={1}>{canViewCostAmounts ? 'Level 1 (Included)' : 'Level 1'}</option>
                <option value={2}>{canViewCostAmounts ? 'Level 2 (+$7/LNFT)' : 'Level 2'}</option>
                <option value={3}>{canViewCostAmounts ? 'Level 3 (+$20/LNFT)' : 'Level 3'}</option>
              </select>
            </div>
            <div className="spec-field">
              <label className="spec-label">Additional Tile Length</label>
              <CompactInput
                value={data.additionalTileLength ?? 0}
                onChange={(e) => handleChange('additionalTileLength', parseFloat(e.target.value) || 0)}
                unit="LNFT"
                min="0"
                step="1"
              />
            </div>
            <div className="spec-field">
              <label className="spec-label">Trim Tile on Steps & Bench</label>
              <select
                className="compact-input"
                value={data.hasTrimTileOnSteps ? 'yes' : 'no'}
                onChange={(e) => handleChange('hasTrimTileOnSteps', e.target.value === 'yes')}
              >
                <option value="no">No Trim Tile</option>
                <option value="yes">Add Trim Tile</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Coping */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Coping</h2>
        </div>

        <div className="spec-grid-5-fixed">
          <div className="spec-field">
            <label className="spec-label required">Coping Type</label>
            <select
              className="compact-input"
              value={data.copingType}
              onChange={(e) => handleChange('copingType', e.target.value)}
            >
              <option value="travertine-level1">Travertine - Level 1</option>
              <option value="travertine-level2">Travertine - Level 2</option>
              <option value="cantilever">Cantilever</option>
              <option value="flagstone">Flagstone</option>
              <option value="paver">Paver</option>
              <option value="concrete">Concrete</option>
            </select>
          </div>
          <div className="spec-field">
            <label className="spec-label">Coping Size</label>
            <select
              className="compact-input"
              value={data.copingSize ?? '12x12'}
              onChange={(e) => handleChange('copingSize', e.target.value)}
            >
              <option value="12x12">12x12</option>
              <option value="16x16">16x16</option>
            </select>
          </div>
          <div className="spec-field">
            <label className="spec-label">Coping Length</label>
            <CompactInput
              value={data.copingLength ?? poolPerimeter}
              onChange={(e) => handleChange('copingLength', parseFloat(e.target.value) || poolPerimeter)}
              unit="LNFT"
              min="0"
              step="1"
              placeholder={`Auto: ${poolPerimeter}`}
            />
          </div>
          <div className="spec-field">
            <label className="spec-label">Bullnose</label>
            <CompactInput
              value={data.bullnoseLnft ?? 0}
              onChange={(e) => handleChange('bullnoseLnft', parseFloat(e.target.value) || 0)}
              unit="LNFT"
              min="0"
              step="1"
            />
          </div>

          <div className="spec-field">
            <label className="spec-label">Spillway Length</label>
            <CompactInput
              value={data.spillwayLnft ?? 0}
              onChange={(e) => handleChange('spillwayLnft', parseFloat(e.target.value) || 0)}
              unit="LNFT"
              min="0"
              step="1"
            />
          </div>
        </div>
      </div>

      {/* Decking */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Decking</h2>
        </div>

        <div className="spec-grid-5-fixed">
          <div className="spec-field">
            <label className="spec-label required">Decking Type</label>
            <select
              className="compact-input"
              value={data.deckingType}
              onChange={(e) => handleChange('deckingType', e.target.value)}
            >
              <option value="travertine-level1">Travertine - Level 1</option>
              <option value="travertine-level2">Travertine - Level 2</option>
              <option value="paver">Paver</option>
              <option value="concrete">Concrete</option>
            </select>
          </div>
        </div>

        {data.deckingType === 'concrete' && (
          <div className="spec-grid">
            <div className="spec-field">
              <label className="spec-label">Concrete Steps Length</label>
              <CompactInput
                value={data.concreteStepsLength ?? 0}
                onChange={(e) => handleChange('concreteStepsLength', parseFloat(e.target.value) || 0)}
                unit="LNFT"
                min="0"
                step="1"
              />
            </div>
          </div>
        )}
      </div>

      {/* Stone / Rockwork - hidden for now */}
      {showStoneRockwork && (
        <div className="spec-block">
          <div className="spec-block-header">
            <h2 className="spec-block-title">Stone / Rockwork</h2>
          </div>

          <div className="spec-grid spec-grid-2">
            <div className="spec-field">
              <label className="spec-label">Panel Ledge Facing</label>
              <CompactInput
                value={data.rockworkPanelLedgeSqft ?? 0}
                onChange={(e) => handleChange('rockworkPanelLedgeSqft', parseFloat(e.target.value) || 0)}
                unit="SQFT"
                min="0"
                step="1"
              />
            </div>

            <div className="spec-field">
              <label className="spec-label">Panel Ledge Material</label>
              <CompactInput
                value={data.rockworkPanelLedgeMaterialSqft ?? 0}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  handleChange('rockworkPanelLedgeMaterialSqft', val > 0 ? val : undefined);
                }}
                unit="SQFT"
                min="0"
                step="0.01"
              />
            </div>

            <div className="spec-field">
              <label className="spec-label">Stacked Stone Facing</label>
              <CompactInput
                value={data.rockworkStackedStoneSqft ?? 0}
                onChange={(e) => handleChange('rockworkStackedStoneSqft', parseFloat(e.target.value) || 0)}
                unit="SQFT"
                min="0"
                step="1"
              />
            </div>

            <div className="spec-field">
              <label className="spec-label">Tile Facing</label>
              <CompactInput
                value={data.rockworkTileSqft ?? 0}
                onChange={(e) => handleChange('rockworkTileSqft', parseFloat(e.target.value) || 0)}
                unit="SQFT"
                min="0"
                step="1"
              />
            </div>
          </div>
        </div>
      )}

      {/* Options */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Options</h2>
        </div>

        <div className="pool-type-buttons" style={{ maxWidth: '360px' }}>
          <button
            type="button"
            className={`pool-type-btn ${data.hasRoughGrading ? 'active' : ''}`}
            onClick={() => handleChange('hasRoughGrading', !data.hasRoughGrading)}
          >
            Rough Grading
          </button>
        </div>
      </div>
    </div>
  );
}

export default TileCopingDeckingSectionNew;
