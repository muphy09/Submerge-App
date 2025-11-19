import { useState, useEffect } from 'react';
import { PoolSpecs } from '../types/proposal';
import './SectionStyles.css';

interface Props {
  data: PoolSpecs;
  onChange: (data: PoolSpecs) => void;
}

function PoolSpecsSection({ data, onChange }: Props) {
  const [poolModels, setPoolModels] = useState<any[]>([]);

  useEffect(() => {
    loadPoolModels();
  }, []);

  const loadPoolModels = async () => {
    try {
      const models = await window.electron.getPoolModels();
      setPoolModels(models);
    } catch (error) {
      console.error('Failed to load pool models:', error);
    }
  };

  const handleChange = (field: keyof PoolSpecs, value: any) => {
    const updated = { ...data, [field]: value };
    onChange(updated);
  };

  const handleModelSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = parseInt(e.target.value);
    const model = poolModels.find(m => m.id === modelId);

    if (model) {
      const updated = {
        ...data,
        poolModel: model.model,
        poolType: model.type,
        length: model.length,
        width: model.width,
        depth: model.depth,
        basePrice: model.base_price,
      };
      onChange(updated);
    }
  };

  return (
    <div className="section-form">
      <div className="form-group">
        <label className="form-label">Select Pool Model (Quick Fill)</label>
        <select className="form-input" onChange={handleModelSelect} defaultValue="">
          <option value="">-- Select a pre-configured pool model --</option>
          {poolModels.map(model => (
            <option key={model.id} value={model.id}>
              {model.type} - {model.model} ({model.length}' x {model.width}' x {model.depth}') - ${model.base_price.toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label required">Pool Type</label>
        <select
          className="form-input"
          value={data.poolType}
          onChange={(e) => handleChange('poolType', e.target.value as any)}
        >
          <option value="Fiberglass">Fiberglass</option>
          <option value="Concrete">Concrete</option>
          <option value="Vinyl">Vinyl</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Pool Model Name</label>
        <input
          type="text"
          className="form-input"
          value={data.poolModel || ''}
          onChange={(e) => handleChange('poolModel', e.target.value)}
          placeholder="e.g., Small Fiberglass Caesar"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label required">Length (feet)</label>
          <input
            type="number"
            className="form-input"
            value={data.length}
            onChange={(e) => handleChange('length', parseFloat(e.target.value))}
            min="0"
            step="0.5"
          />
        </div>

        <div className="form-group">
          <label className="form-label required">Width (feet)</label>
          <input
            type="number"
            className="form-input"
            value={data.width}
            onChange={(e) => handleChange('width', parseFloat(e.target.value))}
            min="0"
            step="0.5"
          />
        </div>

        <div className="form-group">
          <label className="form-label required">Depth (feet)</label>
          <input
            type="number"
            className="form-input"
            value={data.depth}
            onChange={(e) => handleChange('depth', parseFloat(e.target.value))}
            min="0"
            step="0.5"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Shape</label>
        <input
          type="text"
          className="form-input"
          value={data.shape || ''}
          onChange={(e) => handleChange('shape', e.target.value)}
          placeholder="e.g., Rectangle, Kidney, Freeform"
        />
      </div>

      <div className="form-group">
        <label className="form-label required">Base Price ($)</label>
        <input
          type="number"
          className="form-input"
          value={data.basePrice}
          onChange={(e) => handleChange('basePrice', parseFloat(e.target.value))}
          min="0"
          step="100"
        />
      </div>

      <div className="info-box">
        <strong>Pool Volume:</strong> {(data.length * data.width * data.depth * 7.48).toFixed(2)} gallons
      </div>
    </div>
  );
}

export default PoolSpecsSection;
