import { useState } from 'react';
import { CostBreakdown, CostLineItem, Proposal } from '../types/proposal-new';
import PremierAdvantageWarranty from './PremierAdvantageWarranty';
import ppasLogo from '../../PPAS Logo.png';
import './CostBreakdownView.css';

interface Props {
  costBreakdown: CostBreakdown;
  customerName: string;
  proposal?: Partial<Proposal>;
}

const isPapDiscount = (item: CostLineItem): boolean =>
  item.description?.toLowerCase().includes('pap discount') ?? false;

function CostBreakdownView({ costBreakdown, customerName, proposal }: Props) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [zoomLevel, setZoomLevel] = useState(0.5); // Start at 50% (0.5 scale)

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const renderLineItems = (items: CostLineItem[] | undefined, categoryName: string) => {
    const safeItems = items || [];
    const displayItems = safeItems.filter(
      (item) =>
        !isPapDiscount(item) &&
        ((item.quantity ?? 0) > 0 || (item.total ?? 0) !== 0)
    );
    const isExpanded = expandedSections.has(categoryName);
    const total = safeItems.reduce((sum, item) => sum + (item.total ?? 0), 0);

    return (
      <div className="cost-category">
        <div
          className="category-header"
          onClick={() => toggleSection(categoryName)}
          style={{ cursor: 'pointer' }}
        >
          <span className="expand-icon">{isExpanded ? '▼' : '►'}</span>
          <span className="category-name">{categoryName}</span>
          <span className="category-total">
            ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {isExpanded && displayItems.length > 0 && (
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
                {displayItems.map((item, index) => (
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

        {isExpanded && displayItems.length === 0 && (
          <div className="line-items empty">
            <div className="line-items-empty-state">No line items yet</div>
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
      'Fiberglass Install',
      'Startup/Orientation',
      'Custom Features',
    ]);
    setExpandedSections(allSections);
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  // Keep unused helpers referenced so TS doesn't prune them (reserved for future interactive view)
  void renderLineItems;
  void expandAll;
  void collapseAll;

  const scaleValue = 0.5 + (zoomLevel * 0.5); // Maps 0-1 slider to 0.5-1.0 scale
  const scaleStyle = {
    transform: `scale(${scaleValue})`,
    transformOrigin: 'top center',
  };

  return (
    <div className="cost-breakdown-wrapper">
      <div className="stacked-sheets" style={scaleStyle}>
        <div className="cost-breakdown-container">
          <div className="breakdown-header">
            <div>
              <p className="breakdown-eyebrow">Job Cost Summary</p>
              <h2 className="breakdown-title">Proposal and Specifications</h2>
              <p className="breakdown-subtitle">
                Prepared for: <span className="breakdown-customer">{customerName}</span>
              </p>
            </div>
            <div className="breakdown-logo">
              <img src={ppasLogo} alt="PPAS Logo" />
            </div>
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
              <span>Tile Material:</span>
              <span>${costBreakdown.totals.tileMaterial.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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
              <span>Stone/Rockwork:</span>
              <span>${costBreakdown.totals.stoneRockworkLabor.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="summary-row">
              <span>Drainage:</span>
              <span>${costBreakdown.totals.drainage.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="summary-row">
              <span>Equipment Ordered:</span>
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
            <div className="summary-row">
              <span>Fiberglass Shell:</span>
              <span>${costBreakdown.totals.fiberglassShell.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="summary-row">
              <span>Fiberglass Install:</span>
              <span>${costBreakdown.totals.fiberglassInstall.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="summary-row">
              <span>Startup/Orientation:</span>
              <span>${costBreakdown.totals.startupOrientation.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="summary-row">
              <span>Custom Features:</span>
              <span>${costBreakdown.totals.customFeatures.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Cost Summary Section */}
          <div className="cost-summary-section">
            <div className="summary-row subtotal-row">
              <span>TOTAL COSTS:</span>
              <span>${costBreakdown.totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
        </div>

        {proposal && (
          <div className="warranty-shell">
            <PremierAdvantageWarranty proposal={proposal} />
          </div>
        )}
      </div>

      <div className="zoom-control-container">
        <label className="zoom-label">
          <span className="zoom-icon">🔍</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={zoomLevel}
            onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
            className="zoom-slider"
          />
          <span className="zoom-percentage">{Math.round(scaleValue * 100)}%</span>
        </label>
      </div>
    </div>
  );
}

export default CostBreakdownView;
