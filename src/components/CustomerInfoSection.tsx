import { useEffect } from 'react';
import { CustomerInfo } from '../types/proposal';
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
      <div className="form-group">
        <label className="form-label required">Customer Name</label>
        <input
          type="text"
          className="form-input"
          value={data.customerName}
          onChange={(e) => handleChange('customerName', e.target.value)}
          onFocus={() => console.log('Input focused: customerName')}
          onKeyDown={(e) => console.log('Key down:', e.key)}
          placeholder="Enter customer name"
        />
      </div>

      <div className="form-group">
        <label className="form-label required">City</label>
        <input
          type="text"
          className="form-input"
          value={data.city}
          onChange={(e) => handleChange('city', e.target.value)}
          placeholder="Enter city"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Address</label>
        <input
          type="text"
          className="form-input"
          value={data.address || ''}
          onChange={(e) => handleChange('address', e.target.value)}
          placeholder="Enter full address (optional)"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Phone</label>
          <input
            type="tel"
            className="form-input"
            value={data.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="(123) 456-7890"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            type="email"
            className="form-input"
            value={data.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="customer@email.com"
          />
        </div>
      </div>
    </div>
  );
}

export default CustomerInfoSection;
