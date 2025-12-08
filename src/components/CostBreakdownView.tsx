import { useState } from 'react';
import { CostBreakdown, CostLineItem, PricingCalculations, Proposal } from '../types/proposal-new';
import SubmergeAdvantageWarranty from './SubmergeAdvantageWarranty';
import submergeLogo from '../../Submerge Logo.png';
import './CostBreakdownView.css';

interface Props {
  costBreakdown: CostBreakdown;
  customerName: string;
  proposal?: Partial<Proposal>;
  pricing?: PricingCalculations;
  showWarranty?: boolean;
  showZoomControl?: boolean;
}

const isPapDiscount = (item: CostLineItem): boolean =>
  item.description?.toLowerCase().includes('pap discount') ?? false;

function CostBreakdownView({
  costBreakdown,
  customerName,
  proposal,
  pricing,
  showWarranty = true,
  showZoomControl = true,
}: Props) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [zoomLevel, setZoomLevel] = useState(showZoomControl ? 0.5 : 1); // Start at 50% (0.5 scale) when slider is shown

  const formatCurrency = (value: number): string =>
    `$${(Number.isFinite(value) ? value : 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const roundToTwo = (value: number): number =>
    Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

  const baseTotals = costBreakdown?.totals || ({} as CostBreakdown['totals']);
  const costBasis =
    pricing?.totalCostsBeforeOverhead ??
    proposal?.pricing?.totalCostsBeforeOverhead ??
    baseTotals.grandTotal ??
    0;

  let retailPrice =
    pricing?.retailPrice ??
    proposal?.pricing?.retailPrice ??
    proposal?.totalCost ??
    0;

  if (!retailPrice && costBasis) {
    retailPrice = costBasis;
  }

  const retailFactor = costBasis > 0 ? retailPrice / costBasis : 1;

  // Map cost totals into retail-valued rows that sum to the retail price.
  const categoryRows = [
    { label: 'Plans & Engineering', cost: baseTotals.plansAndEngineering ?? 0 },
    { label: 'Layout', cost: baseTotals.layout ?? 0 },
    { label: 'Permit', cost: baseTotals.permit ?? 0 },
    { label: 'Excavation', cost: baseTotals.excavation ?? 0 },
    { label: 'Plumbing', cost: baseTotals.plumbing ?? 0 },
    { label: 'Gas', cost: baseTotals.gas ?? 0 },
    { label: 'Steel', cost: baseTotals.steel ?? 0 },
    { label: 'Electrical', cost: baseTotals.electrical ?? 0 },
    { label: 'Shotcrete Labor', cost: baseTotals.shotcreteLabor ?? 0 },
    { label: 'Shotcrete Material', cost: baseTotals.shotcreteMaterial ?? 0 },
    { label: 'Tile Labor', cost: baseTotals.tileLabor ?? 0 },
    { label: 'Tile Material', cost: baseTotals.tileMaterial ?? 0 },
    { label: 'Coping/Decking Labor', cost: baseTotals.copingDeckingLabor ?? 0 },
    { label: 'Coping/Decking Material', cost: baseTotals.copingDeckingMaterial ?? 0 },
    {
      label: 'Stone/Rockwork',
      cost: (baseTotals.stoneRockworkLabor ?? 0) + (baseTotals.stoneRockworkMaterial ?? 0),
    },
    { label: 'Drainage', cost: baseTotals.drainage ?? 0 },
    { label: 'Equipment Ordered', cost: baseTotals.equipmentOrdered ?? 0 },
    { label: 'Equipment Set', cost: baseTotals.equipmentSet ?? 0 },
    { label: 'Cleanup', cost: baseTotals.cleanup ?? 0 },
    { label: 'Interior Finish', cost: baseTotals.interiorFinish ?? 0 },
    { label: 'Water Truck', cost: baseTotals.waterTruck ?? 0 },
    { label: 'Fiberglass Shell', cost: baseTotals.fiberglassShell ?? 0 },
    { label: 'Fiberglass Install', cost: baseTotals.fiberglassInstall ?? 0 },
    { label: 'Startup/Orientation', cost: baseTotals.startupOrientation ?? 0 },
    { label: 'Custom Features', cost: baseTotals.customFeatures ?? 0 },
  ];

  let runningRetailTotal = 0;
  const retailRows = categoryRows.map((row, idx) => {
    const isLastRow = idx === categoryRows.length - 1;
    let retailValue = roundToTwo(row.cost * retailFactor);

    if (isLastRow) {
      // Nudge the final row to absorb any rounding difference.
      const targetTotal = retailPrice || runningRetailTotal + retailValue;
      const adjustment = roundToTwo(targetTotal - (runningRetailTotal + retailValue));
      retailValue = roundToTwo(retailValue + adjustment);
    }

    runningRetailTotal += retailValue;
    return { ...row, retail: retailValue };
  });

  const displayRetailPrice = roundToTwo(retailPrice || runningRetailTotal);

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
          <span className="expand-icon">{isExpanded ? 'v' : '>'}</span>
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

  const scaleValue = showZoomControl ? 0.5 + (zoomLevel * 0.5) : 1; // Maps 0-1 slider to 0.5-1.0 scale
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
            <img src={submergeLogo} alt="Submerge Logo" />
          </div>
          </div>

        <div className="breakdown-summary">
          <div className="summary-grid">
            {retailRows.map((row) => (
              <div className="summary-row" key={row.label}>
                <span>{row.label}:</span>
                <span>{formatCurrency(row.retail)}</span>
              </div>
            ))}
          </div>

          {/* Cost Summary Section */}
          <div className="cost-summary-section">
            <div className="summary-row subtotal-row">
              <span>RETAIL PRICE:</span>
              <span>{formatCurrency(displayRetailPrice)}</span>
            </div>
          </div>
        </div>
        </div>

        {showWarranty && proposal && (
          <div className="warranty-shell">
            <SubmergeAdvantageWarranty proposal={proposal} />
          </div>
        )}
      </div>

      {showZoomControl && (
        <div className="zoom-control-container">
          <label className="zoom-label">
            <span className="zoom-icon">Zoom</span>
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
      )}
    </div>
  );
}

export default CostBreakdownView;
