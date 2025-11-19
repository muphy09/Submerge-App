import { TileCopingDecking } from '../types/proposal';
import './SectionStyles.css';

interface Props {
  data: TileCopingDecking;
  onChange: (data: TileCopingDecking) => void;
}

function TileCopingDeckingSection({ data, onChange }: Props) {
  const handleChange = (field: keyof TileCopingDecking, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="section-form">
      <h3 className="subsection-title">Tile (Optional)</h3>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Tile Type</label>
          <input
            type="text"
            className="form-input"
            value={data.tileType || ''}
            onChange={(e) => handleChange('tileType', e.target.value)}
            placeholder="e.g., Glass mosaic, Ceramic"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Tile Area (sq ft)</label>
          <input
            type="number"
            className="form-input"
            value={data.tileArea || 0}
            onChange={(e) => handleChange('tileArea', parseFloat(e.target.value))}
            min="0"
            step="1"
          />
        </div>
      </div>

      <h3 className="subsection-title">Coping</h3>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label required">Coping Type</label>
          <select
            className="form-input"
            value={data.copingType}
            onChange={(e) => handleChange('copingType', e.target.value)}
          >
            <option value="">Select coping type</option>
            <option value="Precast concrete">Precast Concrete</option>
            <option value="Natural stone">Natural Stone</option>
            <option value="Brick">Brick</option>
            <option value="Travertine">Travertine</option>
            <option value="Cantilever">Cantilever</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label required">Coping Length (linear ft)</label>
          <input
            type="number"
            className="form-input"
            value={data.copingLength}
            onChange={(e) => handleChange('copingLength', parseFloat(e.target.value))}
            min="0"
            step="1"
          />
        </div>
      </div>

      <h3 className="subsection-title">Decking</h3>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label required">Decking Type</label>
          <select
            className="form-input"
            value={data.deckingType}
            onChange={(e) => handleChange('deckingType', e.target.value)}
          >
            <option value="">Select decking type</option>
            <option value="Concrete - Brushed">Concrete - Brushed</option>
            <option value="Concrete - Stamped">Concrete - Stamped</option>
            <option value="Pavers">Pavers</option>
            <option value="Travertine">Travertine</option>
            <option value="Flagstone">Flagstone</option>
            <option value="Wood">Wood</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label required">Decking Area (sq ft)</label>
          <input
            type="number"
            className="form-input"
            value={data.deckingArea}
            onChange={(e) => handleChange('deckingArea', parseFloat(e.target.value))}
            min="0"
            step="1"
          />
        </div>
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

export default TileCopingDeckingSection;
