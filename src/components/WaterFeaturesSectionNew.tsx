import { useMemo } from 'react';
import { WaterFeatures, WaterFeatureSelection } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import './SectionStyles.css';

interface Props {
  data: WaterFeatures;
  onChange: (data: WaterFeatures) => void;
}

function WaterFeaturesSectionNew({ data, onChange }: Props) {
  const catalog = pricingData.waterFeatures?.catalog ?? [];

  const selectionMap = useMemo(() => {
    const map = new Map<string, number>();
    (data?.selections ?? []).forEach((sel) => map.set(sel.featureId, sel.quantity));
    return map;
  }, [data?.selections]);

  const calculateTotal = (selections: WaterFeatureSelection[]) => {
    return catalog.reduce((sum, feature) => {
      const qty = selections.find((sel) => sel.featureId === feature.id)?.quantity || 0;
      return sum + feature.unitPrice * qty;
    }, 0);
  };

  const handleQuantityChange = (featureId: string, quantity: number) => {
    const sanitized = Math.max(0, quantity);
    const baseSelections = (data?.selections ?? []).filter((sel) => sel.featureId !== featureId);
    const nextSelections =
      sanitized > 0 ? [...baseSelections, { featureId, quantity: sanitized }] : baseSelections;

    const totalCost = calculateTotal(nextSelections);
    onChange({ ...data, selections: nextSelections, totalCost });
  };

  const groupedCatalog = useMemo(() => {
    return catalog.reduce<Record<string, typeof catalog>>((acc, item) => {
      const group = item.category || 'Water Features';
      if (!acc[group]) acc[group] = [];
      acc[group].push(item);
      return acc;
    }, {});
  }, [catalog]);

  const liveTotal = calculateTotal(data?.selections ?? []);

  if (!catalog.length) {
    return (
      <div className="section-form">
        <h2>Water Features</h2>
        <div className="form-help">
          No catalog data found. Verify pricing data is loaded from Regular pricing.xlsx (Equip tab, column S).
        </div>
      </div>
    );
  }

  return (
    <div className="section-form">
      <h2>Water Features</h2>
      <p className="form-help" style={{ marginBottom: '1.5rem' }}>
        Catalog mirrors the Regular pricing.xlsx Equip tab (column S). Enter a quantity for each feature you need.
      </p>

      {Object.entries(groupedCatalog).map(([category, items]) => (
        <div key={category} className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
          <div className="form-row" style={{ marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0 }}>{category}</h3>
          </div>
          {items.map((item) => {
            const qty = selectionMap.get(item.id) || 0;
            const lineTotal = qty * item.unitPrice;
            return (
              <div key={item.id} className="form-row" style={{ alignItems: 'flex-end', marginBottom: '0.75rem' }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">{item.name}</label>
                  {item.note && <div className="form-help">{item.note}</div>}
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Unit Price</label>
                  <div className="form-value">${item.unitPrice.toLocaleString()}</div>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Quantity</label>
                  <input
                    type="number"
                    className="form-input"
                    min="0"
                    step="1"
                    value={qty}
                    onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Line Total</label>
                  <div className="form-value">${lineTotal.toLocaleString()}</div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div className="card" style={{ padding: '1rem', background: '#0f172a', color: 'white' }}>
        <div className="form-row" style={{ alignItems: 'center' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <h3 style={{ margin: 0 }}>Water Features Subtotal</h3>
          </div>
          <div className="form-group" style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>${liveTotal.toLocaleString()}</div>
            <div className="form-help" style={{ color: '#e2e8f0' }}>
              Updates cost breakdown automatically
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WaterFeaturesSectionNew;
