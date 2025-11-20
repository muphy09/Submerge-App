import { Drainage } from '../types/proposal-new';
import './SectionStyles.css';

interface Props {
  data: Drainage;
  onChange: (data: Drainage) => void;
}

function DrainageSectionNew({ data, onChange }: Props) {
  const handleChange = (field: keyof Drainage, value: number) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="section-form">
      <h2>Drainage</h2>

      <div className="form-help" style={{ marginBottom: '1.5rem' }}>
        Enter total linear footage for each drainage type needed for the project.
      </div>

      <div className="form-group">
        <label className="form-label">Downspout Drain (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.downspoutTotalLF}
          onChange={(e) => handleChange('downspoutTotalLF', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
        <small className="form-help">Total from all downspouts - $11/ft</small>
      </div>

      <div className="form-group">
        <label className="form-label">Deck Drain (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.deckDrainTotalLF}
          onChange={(e) => handleChange('deckDrainTotalLF', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
        <small className="form-help">Deck drainage system - $15/ft</small>
      </div>

      <div className="form-group">
        <label className="form-label">French Drain (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.frenchDrainTotalLF}
          onChange={(e) => handleChange('frenchDrainTotalLF', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
        <small className="form-help">Perforated pipe with gravel - $12/ft</small>
      </div>

      <div className="form-group">
        <label className="form-label">Box Drain (LNFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.boxDrainTotalLF}
          onChange={(e) => handleChange('boxDrainTotalLF', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
        <small className="form-help">Surface water collection - $18/ft</small>
      </div>
    </div>
  );
}

export default DrainageSectionNew;
