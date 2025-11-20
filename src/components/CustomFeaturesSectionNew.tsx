import { CustomFeatures, CustomFeature } from '../types/proposal-new';
import './SectionStyles.css';

interface Props {
  data: CustomFeatures;
  onChange: (data: CustomFeatures) => void;
}

function CustomFeaturesSectionNew({ data, onChange }: Props) {
  const addFeature = () => {
    const newFeature: CustomFeature = {
      name: '',
      description: '',
      laborCost: 0,
      materialCost: 0,
      totalCost: 0,
    };
    onChange({ ...data, features: [...data.features, newFeature] });
  };

  const updateFeature = (index: number, field: keyof CustomFeature, value: any) => {
    const updated = [...data.features];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-calculate total cost
    if (field === 'laborCost' || field === 'materialCost') {
      updated[index].totalCost = updated[index].laborCost + updated[index].materialCost;
    }

    const totalCost = updated.reduce((sum, f) => sum + f.totalCost, 0);
    onChange({ features: updated, totalCost });
  };

  const removeFeature = (index: number) => {
    const updated = data.features.filter((_, i) => i !== index);
    const totalCost = updated.reduce((sum, f) => sum + f.totalCost, 0);
    onChange({ features: updated, totalCost });
  };

  return (
    <div className="section-form">
      <h2>Custom Features</h2>

      <div className="form-help" style={{ marginBottom: '1.5rem' }}>
        Add any custom features or special work not covered in other sections (up to 7 features).
      </div>

      {data.features.map((feature, index) => (
        <div key={index} className="card" style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #ddd' }}>
          <div className="form-group">
            <label className="form-label">Feature Name</label>
            <input
              type="text"
              className="form-input"
              value={feature.name}
              onChange={(e) => updateFeature(index, 'name', e.target.value)}
              placeholder="e.g., Fire Pit, BBQ Island, etc."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-input"
              value={feature.description}
              onChange={(e) => updateFeature(index, 'description', e.target.value)}
              placeholder="Detailed description of the feature..."
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Labor Cost</label>
              <input
                type="number"
                className="form-input"
                value={feature.laborCost}
                onChange={(e) => updateFeature(index, 'laborCost', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.01"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Material Cost</label>
              <input
                type="number"
                className="form-input"
                value={feature.materialCost}
                onChange={(e) => updateFeature(index, 'materialCost', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.01"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Total Cost (Auto)</label>
              <input
                type="text"
                className="form-input"
                value={`$${feature.totalCost.toLocaleString()}`}
                readOnly
                style={{ backgroundColor: '#f0f0f0', cursor: 'not-allowed' }}
              />
            </div>
          </div>

          <button
            type="button"
            className="btn btn-danger"
            onClick={() => removeFeature(index)}
            style={{ marginTop: '0.5rem' }}
          >
            Remove Feature
          </button>
        </div>
      ))}

      {data.features.length < 7 && (
        <button type="button" className="btn btn-add" onClick={addFeature}>
          + Add Custom Feature
        </button>
      )}

      {data.features.length > 0 && (
        <div className="cost-summary" style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#f9fafb',
          borderRadius: '4px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>Total Custom Features:</span>
            <span>${data.totalCost.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomFeaturesSectionNew;
