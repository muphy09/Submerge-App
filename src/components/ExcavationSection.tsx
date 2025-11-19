import { useState, useEffect } from 'react';
import { Excavation } from '../types/proposal';
import './SectionStyles.css';

interface Props {
  data: Excavation;
  onChange: (data: Excavation) => void;
}

function ExcavationSection({ data, onChange }: Props) {
  const [rates, setRates] = useState<any[]>([]);
  const [formData, setFormData] = useState<Excavation>(data);

  useEffect(() => {
    loadRates();
  }, []);

  useEffect(() => {
    setFormData(data);
  }, [data]);

  const loadRates = async () => {
    try {
      const ratesData = await window.electron.getExcavationRates();
      setRates(ratesData);
    } catch (error) {
      console.error('Failed to load excavation rates:', error);
    }
  };

  const handleChange = (field: keyof Excavation, value: any) => {
    const updated = { ...formData, [field]: value };

    // Auto-calculate cost based on difficulty
    if (field === 'difficulty') {
      const rate = rates.find(r => r.difficulty === value);
      if (rate) {
        updated.cost = rate.price_per_cubic_yard * 100; // Example calculation
      }
    }

    setFormData(updated);
    onChange(updated);
  };

  return (
    <div className="section-form">
      <div className="form-group">
        <label className="form-label required">Excavation Type</label>
        <input
          type="text"
          className="form-input"
          value={formData.excavationType}
          onChange={(e) => handleChange('excavationType', e.target.value)}
          placeholder="e.g., Standard dig, Rock removal"
        />
      </div>

      <div className="form-group">
        <label className="form-label required">Difficulty Level</label>
        <select
          className="form-input"
          value={formData.difficulty}
          onChange={(e) => handleChange('difficulty', e.target.value as any)}
        >
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Access Concerns</label>
        <div className="checkbox-group">
          <label>
            <input type="checkbox" /> Narrow access
          </label>
          <label>
            <input type="checkbox" /> Steep slope
          </label>
          <label>
            <input type="checkbox" /> Utilities present
          </label>
          <label>
            <input type="checkbox" /> Limited equipment access
          </label>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label required">Total Cost ($)</label>
        <input
          type="number"
          className="form-input"
          value={formData.cost}
          onChange={(e) => handleChange('cost', parseFloat(e.target.value))}
          min="0"
          step="100"
        />
      </div>

      {rates.length > 0 && (
        <div className="info-box">
          <strong>Reference Rates:</strong>
          <ul>
            {rates.map(rate => (
              <li key={rate.id}>{rate.difficulty}: ${rate.price_per_cubic_yard}/cubic yard</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ExcavationSection;
