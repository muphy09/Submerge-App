import { useState, useEffect } from 'react';
import { WaterFeatures, WaterFeature } from '../types/proposal';
import './SectionStyles.css';

interface Props {
  data: WaterFeatures;
  onChange: (data: WaterFeatures) => void;
}

function WaterFeaturesSection({ data, onChange }: Props) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [selectedFeature, setSelectedFeature] = useState('');

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    try {
      const features = await window.electron.getWaterFeaturesCatalog();
      setCatalog(features);
    } catch (error) {
      console.error('Failed to load water features catalog:', error);
    }
  };

  const addFeature = () => {
    const catalogFeature = catalog.find(c => c.id === parseInt(selectedFeature));
    if (!catalogFeature) return;

    const newFeature: WaterFeature = {
      type: catalogFeature.type,
      name: catalogFeature.name,
      quantity: 1,
      unitPrice: catalogFeature.price,
      totalPrice: catalogFeature.price,
    };

    const features = [...data.features, newFeature];
    const totalCost = features.reduce((sum, f) => sum + f.totalPrice, 0);
    onChange({ features, totalCost });
  };

  const removeFeature = (index: number) => {
    const features = data.features.filter((_, i) => i !== index);
    const totalCost = features.reduce((sum, f) => sum + f.totalPrice, 0);
    onChange({ features, totalCost });
  };

  const updateFeatureQuantity = (index: number, quantity: number) => {
    const features = [...data.features];
    features[index].quantity = quantity;
    features[index].totalPrice = features[index].unitPrice * quantity;
    const totalCost = features.reduce((sum, f) => sum + f.totalPrice, 0);
    onChange({ features, totalCost });
  };

  return (
    <div className="section-form">
      <div className="add-item-section">
        <h3>Add Water Feature</h3>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Feature</label>
            <select
              className="form-input"
              value={selectedFeature}
              onChange={(e) => setSelectedFeature(e.target.value)}
            >
              <option value="">Select water feature</option>
              {catalog.map(feature => (
                <option key={feature.id} value={feature.id}>
                  {feature.name} - {feature.type} (${feature.price})
                </option>
              ))}
            </select>
          </div>

          <button className="btn btn-add" onClick={addFeature} disabled={!selectedFeature}>
            Add
          </button>
        </div>
      </div>

      <div className="items-list">
        <h3>Selected Water Features</h3>
        {data.features.length === 0 ? (
          <p className="empty-message">No water features added yet</p>
        ) : (
          <table className="items-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.features.map((feature, index) => (
                <tr key={index}>
                  <td>{feature.type}</td>
                  <td>{feature.name}</td>
                  <td>
                    <input
                      type="number"
                      className="qty-input"
                      value={feature.quantity}
                      onChange={(e) => updateFeatureQuantity(index, parseInt(e.target.value))}
                      min="1"
                    />
                  </td>
                  <td>${feature.unitPrice.toLocaleString()}</td>
                  <td>${feature.totalPrice.toLocaleString()}</td>
                  <td>
                    <button className="btn-remove" onClick={() => removeFeature(index)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="total-section">
        <strong>Water Features Total: ${data.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
      </div>
    </div>
  );
}

export default WaterFeaturesSection;
