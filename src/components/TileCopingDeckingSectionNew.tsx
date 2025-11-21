import { TileCopingDecking } from '../types/proposal-new';
import './SectionStyles.css';

interface Props {
  data: TileCopingDecking;
  onChange: (data: TileCopingDecking) => void;
  poolPerimeter: number;
  isFiberglass: boolean;
}

function TileCopingDeckingSectionNew({ data, onChange, poolPerimeter, isFiberglass }: Props) {
  const handleChange = (field: keyof TileCopingDecking, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="section-form">
      {/* Tile Section - Only for gunite pools */}
      {!isFiberglass && (
        <>
          <h3>Tile</h3>
          <div className="form-group">
            <label className="form-label required">Tile Level</label>
            <select
              className="form-input"
              value={data.tileLevel}
              onChange={(e) => handleChange('tileLevel', parseInt(e.target.value) as 1 | 2 | 3)}
            >
              <option value={1}>Level 1 (Included)</option>
              <option value={2}>Level 2 (+$7/LNFT upgrade)</option>
              <option value={3}>Level 3 (+$20/LNFT upgrade)</option>
            </select>
            <small className="form-help">Level 1: Standard ceramic | Level 2: Glass | Level 3: Premium glass</small>
          </div>

          <div className="form-group">
            <label className="form-label">Additional Tile Length (LNFT)</label>
            <input
              type="number"
              className="form-input"
              value={data.additionalTileLength || ''}
              onChange={(e) => handleChange('additionalTileLength', parseFloat(e.target.value) || 0)}
              min="0"
              step="1"
              placeholder="0"
            />
            <small className="form-help">For spillway or infinity edge (beyond perimeter)</small>
          </div>

          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={data.hasTrimTileOnSteps}
                onChange={(e) => handleChange('hasTrimTileOnSteps', e.target.checked)}
              />
              <span>Add Trim Tile to Steps & Bench</span>
            </label>
          </div>
        </>
      )}

      {/* Coping */}
      <h3 style={{ marginTop: '2rem' }}>Coping</h3>
      <div className="form-group">
        <label className="form-label required">Coping Type</label>
        <select
          className="form-input"
          value={data.copingType}
          onChange={(e) => handleChange('copingType', e.target.value)}
        >
          <option value="cantilever">Cantilever</option>
          <option value="flagstone">Flagstone</option>
          <option value="paver">Paver</option>
          <option value="travertine-level1">Travertine - Level 1</option>
          <option value="travertine-level2">Travertine - Level 2</option>
          <option value="concrete">Concrete</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Coping Length (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.copingLength || ''}
          onChange={(e) => handleChange('copingLength', parseFloat(e.target.value) || poolPerimeter)}
          min="0"
          step="1"
          placeholder={`Auto: ${poolPerimeter}`}
        />
        <small className="form-help">Defaults to pool perimeter ({poolPerimeter} LNFT)</small>
      </div>

      <div className="form-group">
        <label className="form-label">Double Bullnose (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.doubleBullnoseLnft || ''}
          onChange={(e) => handleChange('doubleBullnoseLnft', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
          placeholder="0"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Spillway Length (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.spillwayLnft || ''}
          onChange={(e) => handleChange('spillwayLnft', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
          placeholder="0"
        />
      </div>

      {/* Decking */}
      <h3 style={{ marginTop: '2rem' }}>Decking</h3>
      <div className="form-group">
        <label className="form-label required">Decking Type</label>
        <select
          className="form-input"
          value={data.deckingType}
          onChange={(e) => handleChange('deckingType', e.target.value)}
        >
          <option value="paver">Paver</option>
          <option value="travertine-level1">Travertine - Level 1</option>
          <option value="travertine-level2">Travertine - Level 2</option>
          <option value="concrete">Concrete</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label required">Decking Area (SQFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.deckingArea || ''}
          onChange={(e) => handleChange('deckingArea', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
          placeholder="0"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Concrete Steps Length (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.concreteStepsLength || ''}
          onChange={(e) => handleChange('concreteStepsLength', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
          placeholder="0"
        />
      </div>

      {/* Stone / Rockwork */}
      <h3 style={{ marginTop: '2rem' }}>Stone / Rockwork</h3>
      <div className="form-group">
        <label className="form-label">Panel Ledge Facing (SQFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.rockworkPanelLedgeSqft || ''}
          onChange={(e) => handleChange('rockworkPanelLedgeSqft', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
          placeholder="0"
        />
      </div>
      <div className="form-group">
        <label className="form-label">Stacked Stone Facing (SQFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.rockworkStackedStoneSqft || ''}
          onChange={(e) => handleChange('rockworkStackedStoneSqft', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
          placeholder="0"
        />
      </div>
      <div className="form-group">
        <label className="form-label">Tile Facing (SQFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.rockworkTileSqft || ''}
          onChange={(e) => handleChange('rockworkTileSqft', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
          placeholder="0"
        />
      </div>

      {/* Options */}
      <h3 style={{ marginTop: '2rem' }}>Options</h3>
      <div className="form-group">
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={data.hasRoughGrading}
            onChange={(e) => handleChange('hasRoughGrading', e.target.checked)}
          />
          <span>Rough Grading (Keep unless deck is off contract)</span>
        </label>
      </div>
    </div>
  );
}

export default TileCopingDeckingSectionNew;
