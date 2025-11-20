import { useState } from 'react';
import { CostBreakdown, CostLineItem } from '../types/proposal-new';
import './LiveCostBreakdown.css';

interface Props {
  costBreakdown: CostBreakdown;
  onToggle?: () => void;
}

function LiveCostBreakdown({ costBreakdown, onToggle }: Props) {
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
    const categoryTotal = items.reduce((sum, item) => sum + item.total, 0);

    return (
      <div className="live-cost-category">
        <div
          className="live-category-header"
          onClick={() => toggleSection(categoryName)}
        >
          <span className="live-expand-icon">{isExpanded ? '▼' : '▶'}</span>
          <span className="live-category-name">{categoryName}</span>
          <span className="live-category-total">
            ${categoryTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {isExpanded && (
          <div className="live-line-items">
            <table className="live-line-items-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td>{item.description}</td>
                    <td>{item.quantity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
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

  return (
    <div className="live-cost-breakdown">
      <div
        className="live-breakdown-header"
        onClick={onToggle}
        title="Hide cost breakdown"
      >
        <h3>Live Cost Breakdown</h3>
        {onToggle && (
          <button
            className="sidebar-toggle right-toggle"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            title="Hide cost breakdown"
          >
            ▶
          </button>
        )}
      </div>

      <div className="live-breakdown-content">
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

      <div className="live-grand-total">
        <span>GRAND TOTAL:</span>
        <span>${costBreakdown.totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    </div>
  );
}

export default LiveCostBreakdown;
