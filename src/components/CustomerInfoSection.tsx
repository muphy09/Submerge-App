import { useState, useEffect } from 'react';
import { CustomerInfo } from '../types/proposal';
import './SectionStyles.css';

interface Props {
  data: CustomerInfo;
  onChange: (data: CustomerInfo) => void;
}

function CustomerInfoSection({ data, onChange }: Props) {
  const [formData, setFormData] = useState<CustomerInfo>(data);

  useEffect(() => {
    setFormData(data);
  }, [data]);

  const handleChange = (field: keyof CustomerInfo, value: string) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    onChange(updated);
  };

  return (
    <div className="section-form">
      <div className="form-group">
        <label className="form-label required">Customer Name</label>
        <input
          type="text"
          className="form-input"
          value={formData.customerName}
          onChange={(e) => handleChange('customerName', e.target.value)}
          placeholder="Enter customer name"
        />
      </div>

      <div className="form-group">
        <label className="form-label required">City</label>
        <input
          type="text"
          className="form-input"
          value={formData.city}
          onChange={(e) => handleChange('city', e.target.value)}
          placeholder="Enter city"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Address</label>
        <input
          type="text"
          className="form-input"
          value={formData.address || ''}
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
            value={formData.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="(123) 456-7890"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            type="email"
            className="form-input"
            value={formData.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="customer@email.com"
          />
        </div>
      </div>
    </div>
  );
}

export default CustomerInfoSection;
