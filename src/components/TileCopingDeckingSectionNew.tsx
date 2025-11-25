import { useEffect } from 'react';
import { TileCopingDecking } from '../types/proposal-new';
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

const ButtonGroup = <T extends string | number>({
  label,
  value,
  options,
  onChange,
  required,
  helper,
}: {
  label: string;
  value: T;
  options: { label: string; value: T; badge?: string }[];
  onChange: (val: T) => void;
  required?: boolean;
  helper?: string;
}) => (
  <div className="spec-field">
    <label className={`spec-label ${required ? 'required' : ''}`}>{label}</label>
    <div className="pool-type-buttons stackable">
      {options.map(opt => (
        <button
          key={String(opt.value)}
          type="button"
          className={`pool-type-btn ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <span>{opt.label}</span>
            {opt.badge && <span className="info-pill">{opt.badge}</span>}
          </div>
        </button>
      ))}
    </div>
    {helper && <small className="form-help">{helper}</small>}
  </div>
);

function TileCopingDeckingSectionNew({ data, onChange, poolPerimeter, isFiberglass, poolDeckingArea }: Props) {
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
          <p className="spec-block-subtitle">Select tile level and add trim options</p>
        </div>

          <div className="spec-grid">
            <ButtonGroup
              label="Tile Level"
              required
              value={data.tileLevel}
              onChange={(val) => handleChange('tileLevel', val)}
              helper="Level 1: Standard ceramic | Level 2: Glass | Level 3: Premium glass"
              options={[
                { label: 'Level 1 (Included)', value: 1 },
                { label: 'Level 2 (+$7/LNFT)', value: 2 },
                { label: 'Level 3 (+$20/LNFT)', value: 3 },
              ]}
            />
          </div>

          <div className="spec-grid spec-grid-2">
            <div className="spec-field">
              <label className="spec-label">Additional Tile Length</label>
              <CompactInput
                value={data.additionalTileLength ?? 0}
                onChange={(e) => handleChange('additionalTileLength', parseFloat(e.target.value) || 0)}
                unit="LNFT"
                min="0"
                step="1"
              />
              <small className="form-help">Spillway or infinity edge (beyond perimeter)</small>
            </div>

            <div className="spec-field">
              <label className="spec-label">Trim Tile on Steps & Bench</label>
              <div className="pool-type-buttons">
                <button
                  type="button"
                  className={`pool-type-btn ${data.hasTrimTileOnSteps ? 'active' : ''}`}
                  onClick={() => handleChange('hasTrimTileOnSteps', true)}
                >
                  Add Trim Tile
                </button>
                <button
                  type="button"
                  className={`pool-type-btn ${!data.hasTrimTileOnSteps ? 'active' : ''}`}
                  onClick={() => handleChange('hasTrimTileOnSteps', false)}
                >
                  No Trim Tile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Coping */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Coping</h2>
          <p className="spec-block-subtitle">Choose coping type and enter lengths</p>
        </div>

        <div className="spec-grid spec-grid-2">
          <ButtonGroup
            label="Coping Type"
            required
            value={data.copingType}
            onChange={(val) => handleChange('copingType', val)}
            options={[
              { label: 'Cantilever', value: 'cantilever' },
              { label: 'Flagstone', value: 'flagstone' },
              { label: 'Paver', value: 'paver' },
              { label: 'Travertine - L1', value: 'travertine-level1' },
              { label: 'Travertine - L2', value: 'travertine-level2' },
              { label: 'Concrete', value: 'concrete' },
            ]}
          />

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
            <small className="form-help">Defaults to pool perimeter ({poolPerimeter} LNFT)</small>
          </div>
        </div>

        <div className="spec-grid spec-grid-3">
          <div className="spec-field">
            <label className="spec-label">Bullnose</label>
            <CompactInput
              value={data.bullnoseLnft ?? 0}
              onChange={(e) => handleChange('bullnoseLnft', parseFloat(e.target.value) || 0)}
              unit="LNFT"
              min="0"
              step="1"
            />
            <small className="form-help">Regular bullnose edges around spas, steps, etc.</small>
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

      {/* Double Bullnose - Dedicated block */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Double Bullnose Travertine</h2>
        </div>

        <div className="spec-grid spec-grid-2">
          <div className="spec-field" style={{ maxWidth: '260px' }}>
            <label className="spec-label">Double Bullnose Length</label>
            <CompactInput
              value={data.doubleBullnoseLnft ?? 0}
              onChange={(e) => handleChange('doubleBullnoseLnft', parseFloat(e.target.value) || 0)}
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
          <p className="spec-block-subtitle">Select deck surface and enter areas/lengths.</p>
        </div>

        <div className="spec-grid spec-grid-2">
          <ButtonGroup
            label="Decking Type"
            required
            value={data.deckingType}
            onChange={(val) => handleChange('deckingType', val)}
            options={[
              { label: 'Paver', value: 'paver' },
              { label: 'Travertine - L1', value: 'travertine-level1' },
              { label: 'Travertine - L2', value: 'travertine-level2' },
              { label: 'Concrete', value: 'concrete' },
            ]}
          />

          <div className="spec-field">
            <label className="spec-label required">Decking Area</label>
            <CompactInput
              value={data.deckingArea ?? 0}
              onChange={(e) => handleChange('deckingArea', parseFloat(e.target.value) || 0)}
              unit="SQFT"
              min="0"
              step="1"
            />
          </div>
        </div>

        <div className="spec-grid spec-grid-3">
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
      </div>

      {/* Stone / Rockwork */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Stone / Rockwork</h2>
          <p className="spec-block-subtitle">Keep labor vs. material clear with inline labels.</p>
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
            <small className="form-help">Use if material overage differs (~15% in Excel).</small>
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

      {/* Options */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Options</h2>
        </div>

        <div className="pool-type-buttons" style={{ maxWidth: '360px' }}>
          <button
            type="button"
            className={`pool-type-btn ${data.hasRoughGrading ? 'active' : ''}`}
            onClick={() => handleChange('hasRoughGrading', true)}
          >
            Include Rough Grading
          </button>
          <button
            type="button"
            className={`pool-type-btn ${!data.hasRoughGrading ? 'active' : ''}`}
            onClick={() => handleChange('hasRoughGrading', false)}
          >
            Exclude Rough Grading
          </button>
        </div>
        <small className="form-help" style={{ marginTop: '8px' }}>Keep unless deck is off contract.</small>
      </div>
    </div>
  );
}

export default TileCopingDeckingSectionNew;
