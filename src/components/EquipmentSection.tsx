import { useState, useEffect } from 'react';
import { Equipment, EquipmentItem } from '../types/proposal';
import './SectionStyles.css';

interface Props {
  data: Equipment;
  onChange: (data: Equipment) => void;
}

function EquipmentSection({ data, onChange }: Props) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedItem, setSelectedItem] = useState('');

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    try {
      const items = await window.electron.getEquipmentCatalog();
      setCatalog(items);
    } catch (error) {
      console.error('Failed to load equipment catalog:', error);
    }
  };

  const addItem = () => {
    const catalogItem = catalog.find(c => c.id === parseInt(selectedItem));
    if (!catalogItem) return;

    const newItem: EquipmentItem = {
      category: catalogItem.category,
      name: catalogItem.name,
      model: catalogItem.model,
      quantity: 1,
      unitPrice: catalogItem.price,
      totalPrice: catalogItem.price,
    };

    const items = [...data.items, newItem];
    const totalCost = items.reduce((sum, item) => sum + item.totalPrice, 0);
    onChange({ items, totalCost });
  };

  const removeItem = (index: number) => {
    const items = data.items.filter((_, i) => i !== index);
    const totalCost = items.reduce((sum, item) => sum + item.totalPrice, 0);
    onChange({ items, totalCost });
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    const items = [...data.items];
    items[index].quantity = quantity;
    items[index].totalPrice = items[index].unitPrice * quantity;
    const totalCost = items.reduce((sum, item) => sum + item.totalPrice, 0);
    onChange({ items, totalCost });
  };

  const categories = [...new Set(catalog.map(c => c.category))];
  const filteredItems = selectedCategory
    ? catalog.filter(c => c.category === selectedCategory)
    : catalog;

  return (
    <div className="section-form">
      <div className="add-item-section">
        <h3>Add Equipment</h3>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Category</label>
            <select
              className="form-input"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Item</label>
            <select
              className="form-input"
              value={selectedItem}
              onChange={(e) => setSelectedItem(e.target.value)}
            >
              <option value="">Select equipment</option>
              {filteredItems.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name} - {item.model} (${item.price})
                </option>
              ))}
            </select>
          </div>

          <button className="btn btn-add" onClick={addItem} disabled={!selectedItem}>
            Add
          </button>
        </div>
      </div>

      <div className="items-list">
        <h3>Selected Equipment</h3>
        {data.items.length === 0 ? (
          <p className="empty-message">No equipment added yet</p>
        ) : (
          <table className="items-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Name</th>
                <th>Model</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => (
                <tr key={index}>
                  <td>{item.category}</td>
                  <td>{item.name}</td>
                  <td>{item.model}</td>
                  <td>
                    <input
                      type="number"
                      className="qty-input"
                      value={item.quantity}
                      onChange={(e) => updateItemQuantity(index, parseInt(e.target.value))}
                      min="1"
                    />
                  </td>
                  <td>${item.unitPrice.toLocaleString()}</td>
                  <td>${item.totalPrice.toLocaleString()}</td>
                  <td>
                    <button className="btn-remove" onClick={() => removeItem(index)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="total-section">
        <strong>Equipment Total: ${data.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
      </div>
    </div>
  );
}

export default EquipmentSection;
