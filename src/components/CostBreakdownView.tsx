import { useState } from 'react';
import { CostBreakdown, CostLineItem, PricingCalculations, Proposal } from '../types/proposal-new';
import SubmergeAdvantageWarranty from './SubmergeAdvantageWarranty';
import FranchiseLogo from './FranchiseLogo';
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
  const franchiseId = proposal?.franchiseId;

  let retailPrice =
    pricing?.retailPrice ??
    proposal?.pricing?.retailPrice ??
    proposal?.totalCost ??
    0;

  if (!retailPrice && costBasis) {
    retailPrice = costBasis;
  }

  const retailFactor = costBasis > 0 ? retailPrice / costBasis : 1;

  const getRetailOverride = (item?: CostLineItem): number | null => {
    if (!item) return null;
    const override = (item.details as any)?.retailOverride;
    return Number.isFinite(override) ? Number(override) : null;
  };

  const allItems: CostLineItem[] = [
    ...(costBreakdown.plansAndEngineering || []),
    ...(costBreakdown.layout || []),
    ...(costBreakdown.permit || []),
    ...(costBreakdown.excavation || []),
    ...(costBreakdown.plumbing || []),
    ...(costBreakdown.gas || []),
    ...(costBreakdown.steel || []),
    ...(costBreakdown.electrical || []),
    ...(costBreakdown.shotcreteLabor || []),
    ...(costBreakdown.shotcreteMaterial || []),
    ...(costBreakdown.tileLabor || []),
    ...(costBreakdown.tileMaterial || []),
    ...(costBreakdown.copingDeckingLabor || []),
    ...(costBreakdown.copingDeckingMaterial || []),
    ...(costBreakdown.stoneRockworkLabor || []),
    ...(costBreakdown.stoneRockworkMaterial || []),
    ...(costBreakdown.drainage || []),
    ...(costBreakdown.waterFeatures || []),
    ...(costBreakdown.equipmentOrdered || []),
    ...(costBreakdown.equipmentSet || []),
    ...(costBreakdown.cleanup || []),
    ...(costBreakdown.interiorFinish || []),
    ...(costBreakdown.waterTruck || []),
    ...(costBreakdown.fiberglassShell || []),
    ...(costBreakdown.fiberglassInstall || []),
    ...(costBreakdown.startupOrientation || []),
    ...(costBreakdown.customFeatures || []),
  ];

  const overrideItems = allItems.filter((item) => getRetailOverride(item) !== null);
  const overrideCostBasis = overrideItems.reduce((sum, item) => sum + (item.total ?? 0), 0);
  const overrideRetailTotal = overrideItems.reduce((sum, item) => sum + (getRetailOverride(item) || 0), 0);
  const remainingCostBasis = costBasis - overrideCostBasis;
  const adjustedRetailFactor =
    remainingCostBasis > 0 ? (retailPrice - overrideRetailTotal) / remainingCostBasis : retailFactor;
  const safeAdjustedRetailFactor = Number.isFinite(adjustedRetailFactor) ? adjustedRetailFactor : retailFactor;

  // Map cost totals into retail-valued rows that sum to the retail price.
  const categoryRows = [
    { label: 'Plans & Engineering', cost: baseTotals.plansAndEngineering ?? 0, items: costBreakdown.plansAndEngineering || [] },
    { label: 'Layout', cost: baseTotals.layout ?? 0, items: costBreakdown.layout || [] },
    { label: 'Permit', cost: baseTotals.permit ?? 0, items: costBreakdown.permit || [] },
    { label: 'Excavation', cost: baseTotals.excavation ?? 0, items: costBreakdown.excavation || [] },
    { label: 'Plumbing', cost: baseTotals.plumbing ?? 0, items: costBreakdown.plumbing || [] },
    { label: 'Gas', cost: baseTotals.gas ?? 0, items: costBreakdown.gas || [] },
    { label: 'Steel', cost: baseTotals.steel ?? 0, items: costBreakdown.steel || [] },
    { label: 'Electrical', cost: baseTotals.electrical ?? 0, items: costBreakdown.electrical || [] },
    { label: 'Shotcrete Labor', cost: baseTotals.shotcreteLabor ?? 0, items: costBreakdown.shotcreteLabor || [] },
    { label: 'Shotcrete Material', cost: baseTotals.shotcreteMaterial ?? 0, items: costBreakdown.shotcreteMaterial || [] },
    { label: 'Tile Labor', cost: baseTotals.tileLabor ?? 0, items: costBreakdown.tileLabor || [] },
    { label: 'Tile Material', cost: baseTotals.tileMaterial ?? 0, items: costBreakdown.tileMaterial || [] },
    { label: 'Coping/Decking Labor', cost: baseTotals.copingDeckingLabor ?? 0, items: costBreakdown.copingDeckingLabor || [] },
    { label: 'Coping/Decking Material', cost: baseTotals.copingDeckingMaterial ?? 0, items: costBreakdown.copingDeckingMaterial || [] },
    {
      label: 'Stone/Rockwork',
      cost: (baseTotals.stoneRockworkLabor ?? 0) + (baseTotals.stoneRockworkMaterial ?? 0),
      items: [
        ...(costBreakdown.stoneRockworkLabor || []),
        ...(costBreakdown.stoneRockworkMaterial || []),
      ],
    },
    { label: 'Drainage', cost: baseTotals.drainage ?? 0, items: costBreakdown.drainage || [] },
    { label: 'Equipment Ordered', cost: baseTotals.equipmentOrdered ?? 0, items: costBreakdown.equipmentOrdered || [] },
    { label: 'Equipment Set', cost: baseTotals.equipmentSet ?? 0, items: costBreakdown.equipmentSet || [] },
    { label: 'Water Features', cost: baseTotals.waterFeatures ?? 0, items: costBreakdown.waterFeatures || [] },
    { label: 'Cleanup', cost: baseTotals.cleanup ?? 0, items: costBreakdown.cleanup || [] },
    { label: 'Interior Finish', cost: baseTotals.interiorFinish ?? 0, items: costBreakdown.interiorFinish || [] },
    { label: 'Water Truck', cost: baseTotals.waterTruck ?? 0, items: costBreakdown.waterTruck || [] },
    { label: 'Fiberglass Shell', cost: baseTotals.fiberglassShell ?? 0, items: costBreakdown.fiberglassShell || [] },
    { label: 'Fiberglass Install', cost: baseTotals.fiberglassInstall ?? 0, items: costBreakdown.fiberglassInstall || [] },
    { label: 'Startup/Orientation', cost: baseTotals.startupOrientation ?? 0, items: costBreakdown.startupOrientation || [] },
    { label: 'Custom Features', cost: baseTotals.customFeatures ?? 0, items: costBreakdown.customFeatures || [] },
  ];

  let runningRetailTotal = 0;
  const retailRows = categoryRows.map((row, idx) => {
    const isLastRow = idx === categoryRows.length - 1;
    const overrideRetailTotalForRow = (row.items || []).reduce(
      (sum, item) => sum + (getRetailOverride(item) || 0),
      0
    );
    const overrideCostForRow = (row.items || []).reduce(
      (sum, item) => sum + (getRetailOverride(item) !== null ? (item.total ?? 0) : 0),
      0
    );
    const remainingCostForRow = row.cost - overrideCostForRow;
    let retailValue = roundToTwo(overrideRetailTotalForRow + (remainingCostForRow * safeAdjustedRetailFactor));

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
            <FranchiseLogo alt="Franchise Logo" franchiseId={franchiseId} />
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
