import { useEffect } from 'react';
import { CustomerInfo } from '../types/proposal-new';
import './SectionStyles.css';

interface Props {
  data: CustomerInfo;
  onChange: (data: CustomerInfo) => void;
}

function CustomerInfoSection({ data, onChange }: Props) {
  useEffect(() => {
    console.log('CustomerInfoSection mounted', { data });
    return () => console.log('CustomerInfoSection unmounted');
  }, []);

  const handleChange = (field: keyof CustomerInfo, value: string) => {
    console.log('handleChange called', { field, value });
    const updated = { ...data, [field]: value };
    onChange(updated);
  };

  return (
    <div className="section-form">
      <div className="customer-info-row-1">
        <div className="form-group">
          <label className="form-label required">Customer Name</label>
          <input
            type="text"
            className="form-input"
            value={data.customerName}
            onChange={(e) => handleChange('customerName', e.target.value)}
            onFocus={() => console.log('Input focused: customerName')}
            onKeyDown={(e) => console.log('Key down:', e.key)}
            placeholder="John Smith"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Address (optional)</label>
          <input
            type="text"
            className="form-input"
            value={data.address || ''}
            onChange={(e) => handleChange('address', e.target.value)}
            placeholder="Enter full address"
          />
        </div>
      </div>

      <div className="customer-info-row-2">
        <div className="form-group">
          <label className="form-label required">City</label>
          <input
            type="text"
            className="form-input"
            value={data.city}
            onChange={(e) => handleChange('city', e.target.value)}
            placeholder="Anytown"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Phone (optional)</label>
          <input
            type="tel"
            className="form-input"
            value={data.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="📞 (555) 123-4567"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Email (optional)</label>
          <input
            type="email"
            className="form-input"
            value={data.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="✉ john.smith@example.com"
          />
        </div>
      </div>
    </div>
  );
}

export default CustomerInfoSection;
