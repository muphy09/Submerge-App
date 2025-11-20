import { useState } from 'react';
import { CostBreakdown, CostLineItem } from '../types/proposal-new';
import './CostBreakdownView.css';

interface Props {
  costBreakdown: CostBreakdown;
  customerName: string;
}

function CostBreakdownView({ costBreakdown, customerName }: Props) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const renderLineItems = (items: CostLineItem[], categoryName: string) => {
    if (!items || items.length === 0) return null;

    const isExpanded = expandedSections.has(categoryName);

    return (
      <div className="cost-category">
        <div
          className="category-header"
          onClick={() => toggleSection(categoryName)}
          style={{ cursor: 'pointer' }}
        >
          <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
          <span className="category-name">{categoryName}</span>
          <span className="category-total">
            ${items.reduce((sum, item) => sum + item.total, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {isExpanded && (
          <div className="line-items">
            <table className="line-items-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Unit Price</th>
                  <th>Quantity</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td>{item.description}</td>
                    <td>${item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>{item.quantity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>${item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const expandAll = () => {
    const allSections = new Set([
      'Plans & Engineering',
      'Layout',
      'Permit',
      'Excavation',
      'Plumbing',
      'Gas',
      'Steel',
      'Electrical',
      'Shotcrete Labor',
      'Shotcrete Material',
      'Tile Labor',
      'Tile Material',
      'Coping/Decking Labor',
      'Coping/Decking Material',
      'Stone/Rockwork',
      'Drainage',
      'Equipment Ordered',
      'Equipment Set',
      'Water Features',
      'Cleanup',
      'Interior Finish',
      'Water Truck',
      'Fiberglass Shell',
    ]);
    setExpandedSections(allSections);
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  return (
    <div className="cost-breakdown-container">
      <div className="breakdown-header">
        <h1>Job Cost Summary</h1>
        <h2>Customer: {customerName}</h2>
        <div className="breakdown-actions">
          <button className="btn btn-secondary" onClick={expandAll}>
            Expand All
          </button>
          <button className="btn btn-secondary" onClick={collapseAll}>
            Collapse All
          </button>
        </div>
      </div>

      <div className="breakdown-content">
        {renderLineItems(costBreakdown.plansAndEngineering, 'Plans & Engineering')}
        {renderLineItems(costBreakdown.layout, 'Layout')}
        {renderLineItems(costBreakdown.permit, 'Permit')}
        {renderLineItems(costBreakdown.excavation, 'Excavation')}
        {renderLineItems(costBreakdown.plumbing, 'Plumbing')}
        {renderLineItems(costBreakdown.gas, 'Gas')}
        {renderLineItems(costBreakdown.steel, 'Steel')}
        {renderLineItems(costBreakdown.electrical, 'Electrical')}
        {renderLineItems(costBreakdown.shotcreteLabor, 'Shotcrete Labor')}
        {renderLineItems(costBreakdown.shotcreteMaterial, 'Shotcrete Material')}
        {renderLineItems(costBreakdown.tileLabor, 'Tile Labor')}
        {renderLineItems(costBreakdown.tileMaterial, 'Tile Material')}
        {renderLineItems(costBreakdown.copingDeckingLabor, 'Coping/Decking Labor')}
        {renderLineItems(costBreakdown.copingDeckingMaterial, 'Coping/Decking Material')}
        {renderLineItems(costBreakdown.stoneRockworkLabor, 'Stone/Rockwork')}
        {renderLineItems(costBreakdown.drainage, 'Drainage')}
        {renderLineItems(costBreakdown.equipmentOrdered, 'Equipment Ordered')}
        {renderLineItems(costBreakdown.equipmentSet, 'Equipment Set')}
        {renderLineItems(costBreakdown.waterFeatures, 'Water Features')}
        {renderLineItems(costBreakdown.cleanup, 'Cleanup')}
        {renderLineItems(costBreakdown.interiorFinish, 'Interior Finish')}
        {renderLineItems(costBreakdown.waterTruck, 'Water Truck')}
        {renderLineItems(costBreakdown.fiberglassShell, 'Fiberglass Shell')}
      </div>

      <div className="breakdown-summary">
        <div className="summary-grid">
          <div className="summary-row">
            <span>Plans & Engineering:</span>
            <span>${costBreakdown.totals.plansAndEngineering.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Layout:</span>
            <span>${costBreakdown.totals.layout.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Permit:</span>
            <span>${costBreakdown.totals.permit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Excavation:</span>
            <span>${costBreakdown.totals.excavation.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Plumbing:</span>
            <span>${costBreakdown.totals.plumbing.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Gas:</span>
            <span>${costBreakdown.totals.gas.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Steel:</span>
            <span>${costBreakdown.totals.steel.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Electrical:</span>
            <span>${costBreakdown.totals.electrical.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Shotcrete Labor:</span>
            <span>${costBreakdown.totals.shotcreteLabor.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Shotcrete Material:</span>
            <span>${costBreakdown.totals.shotcreteMaterial.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Tile Labor:</span>
            <span>${costBreakdown.totals.tileLabor.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Coping/Decking Labor:</span>
            <span>${costBreakdown.totals.copingDeckingLabor.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Coping/Decking Material:</span>
            <span>${costBreakdown.totals.copingDeckingMaterial.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Equipment:</span>
            <span>${costBreakdown.totals.equipmentOrdered.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Equipment Set:</span>
            <span>${costBreakdown.totals.equipmentSet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Water Features:</span>
            <span>${costBreakdown.totals.waterFeatures.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Cleanup:</span>
            <span>${costBreakdown.totals.cleanup.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Interior Finish:</span>
            <span>${costBreakdown.totals.interiorFinish.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="summary-row">
            <span>Water Truck:</span>
            <span>${costBreakdown.totals.waterTruck.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          {costBreakdown.totals.fiberglassShell > 0 && (
            <div className="summary-row">
              <span>Fiberglass Shell:</span>
              <span>${costBreakdown.totals.fiberglassShell.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {costBreakdown.totals.drainage > 0 && (
            <div className="summary-row">
              <span>Drainage:</span>
              <span>${costBreakdown.totals.drainage.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>

        <div className="grand-total">
          <span>GRAND TOTAL:</span>
          <span>${costBreakdown.totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>
  );
}

export default CostBreakdownView;
