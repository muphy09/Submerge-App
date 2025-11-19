import { CustomFeatures, CustomFeature } from '../types/proposal';
import './SectionStyles.css';

interface Props {
  data: CustomFeatures;
  onChange: (data: CustomFeatures) => void;
}

function CustomFeaturesSection({ data, onChange }: Props) {
  const addFeature = () => {
    const newFeature: CustomFeature = {
      name: '',
      description: '',
      cost: 0,
    };

    const features = [...data.features, newFeature];
    const totalCost = features.reduce((sum, f) => sum + f.cost, 0);
    onChange({ features, totalCost });
  };

  const removeFeature = (index: number) => {
    const features = data.features.filter((_, i) => i !== index);
    const totalCost = features.reduce((sum, f) => sum + f.cost, 0);
    onChange({ features, totalCost });
  };

  const updateFeature = (index: number, field: keyof CustomFeature, value: any) => {
    const features = [...data.features];
    features[index] = { ...features[index], [field]: value };
    const totalCost = features.reduce((sum, f) => sum + f.cost, 0);
    onChange({ features, totalCost });
  };

  return (
    <div className="section-form">
      <div className="add-item-section">
        <button className="btn btn-add" onClick={addFeature}>
          + Add Custom Feature
        </button>
      </div>

      <div className="items-list">
        {data.features.length === 0 ? (
          <p className="empty-message">No custom features added yet</p>
        ) : (
          data.features.map((feature, index) => (
            <div key={index} className="custom-feature-card">
              <div className="card-header">
                <h4>Custom Feature #{index + 1}</h4>
                <button className="btn-remove" onClick={() => removeFeature(index)}>×</button>
              </div>

              <div className="form-group">
                <label className="form-label">Feature Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={feature.name}
                  onChange={(e) => updateFeature(index, 'name', e.target.value)}
                  placeholder="e.g., Infinity edge, Swim-up bar"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  value={feature.description}
                  onChange={(e) => updateFeature(index, 'description', e.target.value)}
                  placeholder="Describe the custom feature..."
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Cost ($)</label>
                <input
                  type="number"
                  className="form-input"
                  value={feature.cost}
                  onChange={(e) => updateFeature(index, 'cost', parseFloat(e.target.value))}
                  min="0"
                  step="100"
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="total-section">
        <strong>Custom Features Total: ${data.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
      </div>
    </div>
  );
}

export default CustomFeaturesSection;
