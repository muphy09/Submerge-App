import { useEffect, useState } from 'react';
import { CustomFeatures, CustomFeature } from '../types/proposal-new';
import './SectionStyles.css';

interface Props {
  data: CustomFeatures;
  onChange: (data: CustomFeatures) => void;
  retailPrice?: number;
}

function CustomFeaturesSectionNew({ data, onChange, retailPrice }: Props) {
  const [activeFeatureIndex, setActiveFeatureIndex] = useState<number | null>(null);
  const maxFeatures = 7;

  const toNumber = (value: any) => Number(value) || 0;
  const formatCurrency = (value?: number) =>
    `$${toNumber(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const featureTotal = (feature: CustomFeature) => toNumber(feature.laborCost) + toNumber(feature.materialCost);
  const recalcTotals = (features: CustomFeature[]) => {
    const normalized = features.map(f => ({ ...f, totalCost: featureTotal(f) }));
    const totalCost = normalized.reduce((sum, f) => sum + f.totalCost, 0);
    onChange({ features: normalized, totalCost });
  };
  const safeRetailPrice = Number.isFinite(retailPrice) ? (retailPrice as number) : 0;
  const negativeAdjustmentTotal = data.features.reduce((sum, feature) => {
    const total = featureTotal(feature);
    return total < 0 ? sum + Math.abs(total) : sum;
  }, 0);
  const showAdjustmentWarning =
    safeRetailPrice > 0 && negativeAdjustmentTotal > safeRetailPrice * 0.18;

  useEffect(() => {
    if (activeFeatureIndex !== null && activeFeatureIndex >= data.features.length) {
      setActiveFeatureIndex(null);
    }
  }, [activeFeatureIndex, data.features.length]);

  const addFeature = () => {
    const newFeature: CustomFeature = {
      name: '',
      description: '',
      laborCost: 0,
      materialCost: 0,
      totalCost: 0,
    };
    if (data.features.length >= maxFeatures) return;
    const next = [...data.features, newFeature];
    recalcTotals(next);
    setActiveFeatureIndex(next.length - 1);
  };

  const updateFeature = (index: number, field: keyof CustomFeature, value: any) => {
    const updated = data.features.map((f, i) =>
      i === index ? { ...f, [field]: value } : f,
    );
    recalcTotals(updated);
  };

  const removeFeature = (index: number) => {
    const updated = data.features.filter((_, i) => i !== index);
    recalcTotals(updated);
    setActiveFeatureIndex(null);
  };

  return (
    <div className="section-form">
      <div className="form-help" style={{ marginBottom: '1.5rem', fontStyle: 'italic' }}>
        Add any custom features or special work not covered in other sections (up to 7 features).
      </div>
      {showAdjustmentWarning && (
        <div className="custom-features-warning">Warning: over 18% threshold</div>
      )}

      {data.features.map((feature, index) => {
        const isEditing = activeFeatureIndex === index;
        const total = featureTotal(feature);
        const subtitle =
          feature.description?.trim() || 'No description provided';

        return (
          <div key={index} className="spec-subcard" style={{ marginBottom: '1rem' }}>
            <div className="spec-subcard-header">
              <div>
                <div className="spec-subcard-title">{feature.name?.trim() || `Custom Feature #${index + 1}`}</div>
                {!isEditing && (
                  <>
                    <div className="spec-subcard-subtitle">{subtitle.length > 120 ? `${subtitle.slice(0, 120)}…` : subtitle}</div>
                    <div className="spec-subcard-subtitle">
                      Labor: {formatCurrency(feature.laborCost)} | Material: {formatCurrency(feature.materialCost)} | Total:{' '}
                      {formatCurrency(total)}
                    </div>
                  </>
                )}
              </div>
              <div className="spec-subcard-actions stacked-actions">
                <div className="stacked-primary-actions">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setActiveFeatureIndex(isEditing ? null : index)}
                  >
                    {isEditing ? 'Collapse' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() => removeFeature(index)}
                  >
                    Remove
                  </button>
                </div>
                {!isEditing && data.features.length < maxFeatures && (
                  <button type="button" className="link-btn small" onClick={addFeature}>
                    Add Another
                  </button>
                )}
              </div>
            </div>

            {isEditing && (
              <div className="spec-field" style={{ marginTop: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Feature Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={feature.name}
                    onChange={(e) => updateFeature(index, 'name', e.target.value)}
                    placeholder="e.g., 16x16, Turf, etc."
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
                    value={feature.description}
                    onChange={(e) => updateFeature(index, 'description', e.target.value)}
                    placeholder="Description of the feature..."
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
                      value={feature.laborCost || ''}
                      onChange={(e) => updateFeature(index, 'laborCost', e.target.value)}
                      onBlur={(e) => updateFeature(index, 'laborCost', toNumber(e.target.value))}
                      step="0.01"
                      placeholder="0"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Material Cost</label>
                    <input
                      type="number"
                      className="form-input"
                      value={feature.materialCost || ''}
                      onChange={(e) => updateFeature(index, 'materialCost', e.target.value)}
                      onBlur={(e) => updateFeature(index, 'materialCost', toNumber(e.target.value))}
                      step="0.01"
                      placeholder="0"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Total Cost (Auto)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formatCurrency(total)}
                      readOnly
                      style={{ backgroundColor: '#f0f0f0', cursor: 'not-allowed' }}
                    />
                  </div>
                </div>

                <div
                  className="action-row"
                  style={{ marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}
                >
                  <button type="button" className="action-btn" onClick={() => setActiveFeatureIndex(null)}>
                    Done
                  </button>
                  {data.features.length < maxFeatures && (
                    <button type="button" className="action-btn secondary" onClick={addFeature}>
                      Add Another
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {data.features.length === 0 && data.features.length < maxFeatures && (
        <button type="button" className="btn btn-add" onClick={addFeature}>
          + Add Custom Feature
        </button>
      )}
      {data.features.length > 0 && data.features.length < maxFeatures && activeFeatureIndex === null && (
        <button type="button" className="btn btn-add" onClick={addFeature} style={{ marginTop: '0.75rem' }}>
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
