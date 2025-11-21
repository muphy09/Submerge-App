import { Excavation, RBBLevel } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import './SectionStyles.css';

interface Props {
  data: Excavation;
  onChange: (data: Excavation) => void;
}

function ExcavationSectionNew({ data, onChange }: Props) {
  const handleChange = (field: keyof Excavation, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const addRBBLevel = () => {
    const newLevel: RBBLevel = {
      height: 6,
      length: 0,
      facing: 'none',
    };
    handleChange('rbbLevels', [...data.rbbLevels, newLevel]);
  };

  const updateRBBLevel = (index: number, field: keyof RBBLevel, value: any) => {
    const updated = [...data.rbbLevels];
    updated[index] = { ...updated[index], [field]: value };
    handleChange('rbbLevels', updated);
  };

  const removeRBBLevel = (index: number) => {
    const updated = data.rbbLevels.filter((_, i) => i !== index);
    handleChange('rbbLevels', updated);
  };

  return (
    <div className="section-form">
      {/* RBB (Raised Bond Beam) Section */}
      <h3>Raised Bond Beam (RBB)</h3>
      <div className="form-help" style={{ marginBottom: '1rem', fontStyle: 'italic' }}>
        Add raised bond beam levels for retaining walls or elevated pool edges
      </div>

      {data.rbbLevels.map((level, index) => (
        <div key={index} className="card" style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #ddd' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Height</label>
              <select
                className="form-input"
                value={level.height}
                onChange={(e) => updateRBBLevel(index, 'height', parseInt(e.target.value))}
              >
                <option value={6}>6"</option>
                <option value={12}>12"</option>
                <option value={18}>18"</option>
                <option value={24}>24"</option>
                <option value={30}>30"</option>
                <option value={36}>36"</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Length (LNFT)</label>
              <input
                type="number"
                className="form-input"
                value={level.length || ''}
                onChange={(e) => updateRBBLevel(index, 'length', parseFloat(e.target.value) || 0)}
                min="0"
                step="1"
                placeholder="0"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Facing</label>
              <select
                className="form-input"
                value={level.facing}
                onChange={(e) => updateRBBLevel(index, 'facing', e.target.value)}
              >
                <option value="none">None</option>
                <option value="tile">Tile</option>
                <option value="panel-ledge">Panel Ledge</option>
                <option value="stacked-stone">Stacked Stone</option>
              </select>
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => removeRBBLevel(index)}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}

      <button type="button" className="btn btn-add" onClick={addRBBLevel}>
        + Add RBB Level
      </button>

      {/* Columns Section */}
      <h3 style={{ marginTop: '2rem' }}>Columns</h3>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Number of Columns</label>
          <input
            type="number"
            className="form-input"
            value={data.columns.count || ''}
            onChange={(e) =>
              handleChange('columns', { ...data.columns, count: parseInt(e.target.value) || 0 })
            }
            min="0"
            step="1"
            placeholder="0"
          />
        </div>

        {data.columns.count > 0 && (
          <>
            <div className="form-group">
              <label className="form-label">Width (FT)</label>
              <input
                type="number"
                className="form-input"
                value={data.columns.width || ''}
                onChange={(e) =>
                  handleChange('columns', { ...data.columns, width: parseFloat(e.target.value) || 0 })
                }
                min="0"
                step="0.5"
                placeholder="0"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Depth (FT)</label>
              <input
                type="number"
                className="form-input"
                value={data.columns.depth || ''}
                onChange={(e) =>
                  handleChange('columns', { ...data.columns, depth: parseFloat(e.target.value) || 0 })
                }
                min="0"
                step="0.5"
                placeholder="0"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Height (FT)</label>
              <input
                type="number"
                className="form-input"
                value={data.columns.height || ''}
                onChange={(e) =>
                  handleChange('columns', { ...data.columns, height: parseFloat(e.target.value) || 0 })
                }
                min="0"
                step="0.5"
                placeholder="0"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Facing</label>
              <select
                className="form-input"
                value={data.columns.facing}
                onChange={(e) => handleChange('columns', { ...data.columns, facing: e.target.value })}
              >
                <option value="none">None</option>
                <option value="tile">Tile</option>
                <option value="panel-ledge">Panel Ledge</option>
                <option value="stacked-stone">Stacked Stone</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* Additional Work */}
      <h3 style={{ marginTop: '2rem' }}>Additional Work</h3>

      <div className="form-group">
        <label className="form-label">Additional Site Prep (Hours)</label>
        <input
          type="number"
          className="form-input"
          value={data.additionalSitePrepHours || ''}
          onChange={(e) => handleChange('additionalSitePrepHours', parseFloat(e.target.value) || 0)}
          min="0"
          step="0.5"
          placeholder="0"
        />
      </div>

      <div className="form-group">
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={data.hasGravelInstall}
            onChange={(e) => handleChange('hasGravelInstall', e.target.checked)}
          />
          <span>Gravel Install</span>
        </label>
      </div>

      <div className="form-group">
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={data.hasDirtHaul}
            onChange={(e) => handleChange('hasDirtHaul', e.target.checked)}
          />
          <span>Dirt Haul</span>
        </label>
      </div>

      <div className="form-group">
        <label className="form-label">Double Curtain (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.doubleCurtainLength || ''}
          onChange={(e) => handleChange('doubleCurtainLength', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
          placeholder="0"
        />
      </div>

      <div className="form-group">
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={data.needsSoilSampleEngineer}
            onChange={(e) => handleChange('needsSoilSampleEngineer', e.target.checked)}
          />
          <span>Soil Sample / Engineer Required</span>
        </label>
      </div>

      {/* Retaining Wall */}
      <h3 style={{ marginTop: '2rem' }}>Retaining Wall</h3>
      <div className="form-group">
        <label className="form-label">Retaining Wall Type</label>
        <select
          className="form-input"
          value={data.retainingWallType || 'No Retaining Wall'}
          onChange={(e) => handleChange('retainingWallType', e.target.value)}
        >
          {pricingData.masonry.retainingWalls.map((opt: any) => (
            <option key={opt.name} value={opt.name}>
              {opt.name} {opt.costPerSqft > 0 ? `- $${opt.costPerSqft}/SQFT` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Retaining Wall Length (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.retainingWallLength || 0}
          onChange={(e) => handleChange('retainingWallLength', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
      </div>
    </div>
  );
}

export default ExcavationSectionNew;
