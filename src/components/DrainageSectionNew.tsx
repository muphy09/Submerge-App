import { Drainage } from '../types/proposal-new';
import './SectionStyles.css';

interface Props {
  data: Drainage;
  onChange: (data: Drainage) => void;
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

function DrainageSectionNew({ data, onChange }: Props) {
  const handleChange = (field: keyof Drainage, value: number) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="section-form">
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Core Drainage</h2>
        </div>

        <div className="spec-grid spec-grid-2">
          <div className="spec-field">
            <label className="spec-label">Downspout Drain</label>
            <CompactInput
              value={data.downspoutTotalLF ?? 0}
              onChange={(e) => handleChange('downspoutTotalLF', parseFloat(e.target.value) || 0)}
              unit="LNFT"
              min="0"
              step="1"
            />
            <small className="form-help">Total from all downspouts</small>
          </div>

          <div className="spec-field">
            <label className="spec-label">Deck Drain</label>
            <CompactInput
              value={data.deckDrainTotalLF ?? 0}
              onChange={(e) => handleChange('deckDrainTotalLF', parseFloat(e.target.value) || 0)}
              unit="LNFT"
              min="0"
              step="1"
            />
            <small className="form-help">Deck drainage system</small>
          </div>

          <div className="spec-field">
            <label className="spec-label">French Drain</label>
            <CompactInput
              value={data.frenchDrainTotalLF ?? 0}
              onChange={(e) => handleChange('frenchDrainTotalLF', parseFloat(e.target.value) || 0)}
              unit="LNFT"
              min="0"
              step="1"
            />
            <small className="form-help">Perforated pipe with gravel</small>
          </div>

          <div className="spec-field">
            <label className="spec-label">Box Drain</label>
            <CompactInput
              value={data.boxDrainTotalLF ?? 0}
              onChange={(e) => handleChange('boxDrainTotalLF', parseFloat(e.target.value) || 0)}
              unit="LNFT"
              min="0"
              step="1"
            />
            <small className="form-help">Surface water collection</small>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DrainageSectionNew;
