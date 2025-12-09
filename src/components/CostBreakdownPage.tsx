import { useEffect, useState } from 'react';
import { Proposal, PAPDiscounts, CostLineItem, ManualAdjustments } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import MasterPricingEngine from '../services/masterPricingEngine';
import './CostBreakdownPage.css';

interface CostBreakdownPageProps {
  proposal: Partial<Proposal>;
  onClose: () => void;
  onAdjustmentsChange?: (adjustments: ManualAdjustments) => void;
}

interface CategoryData {
  name: string;
  items: CostLineItem[];
  papDiscountKey?: keyof PAPDiscounts;
  showPAPInput: boolean;
  subcategories?: { name: string; items: CostLineItem[] }[];
}

type BreakdownViewMode = 'cogs' | 'retail';

function CostBreakdownPage({ proposal, onClose, onAdjustmentsChange }: CostBreakdownPageProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<BreakdownViewMode>('cogs');
  const papDiscounts: PAPDiscounts =
    proposal.papDiscounts || pricingData.papDiscountRates || {
      excavation: 0,
      plumbing: 0,
      steel: 0,
      electrical: 0,
      shotcrete: 0,
      tileCopingLabor: 0,
      tileCopingMaterial: 0,
      equipment: 0,
      interiorFinish: 0,
      startup: 0,
    };
  const [manualAdjustments, setManualAdjustments] = useState<ManualAdjustments>(
    proposal.manualAdjustments ||
      (pricingData as any).manualAdjustments || {
        positive1: 0,
        positive2: 0,
        negative1: 0,
        negative2: 0,
      }
  );

  const proposalForCalc: Partial<Proposal> = {
    ...proposal,
    manualAdjustments,
  };

  useEffect(() => {
    setManualAdjustments(
      proposal.manualAdjustments ||
        (pricingData as any).manualAdjustments || {
          positive1: 0,
          positive2: 0,
          negative1: 0,
          negative2: 0,
        }
    );
  }, [proposal.manualAdjustments]);

  // Recalculate with current PAP discounts and manual adjustments
  const result = MasterPricingEngine.calculateCompleteProposal(proposalForCalc, papDiscounts);
  const { costBreakdown, pricing } = result;

  const toggleCategory = (categoryName: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryName)) {
      newExpanded.delete(categoryName);
    } else {
      newExpanded.add(categoryName);
    }
    setExpandedCategories(newExpanded);
  };

  const handleAdjustmentChange = (key: keyof ManualAdjustments, rawValue: number) => {
    const safeValue = Number.isFinite(rawValue) ? Math.max(rawValue, 0) : 0;
    const updated: ManualAdjustments = { ...manualAdjustments, [key]: safeValue };
    setManualAdjustments(updated);
    onAdjustmentsChange?.(updated);
  };

  const roundToCents = (amount: number): number => Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100;

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const costBasis = pricing.totalCostsBeforeOverhead || costBreakdown.totals?.grandTotal || 0;
  const retailTarget = pricing.retailPrice || proposal.totalCost || costBasis;
  const retailFactor = viewMode === 'retail' && costBasis > 0 ? retailTarget / costBasis : 1;

  const getDisplayValue = (amount: number): number => roundToCents((Number.isFinite(amount) ? amount : 0) * retailFactor);

  const getDisplayUnitPrice = (item: CostLineItem): number => {
    // Keep PAP discount rows showing percentages; all others scale with the active view
    return getDisplayValue(item.unitPrice);
  };

  const isMaterialItem = (item: CostLineItem): boolean => {
    const desc = (item.description || '').toLowerCase();
    const cat = (item.category || '').toLowerCase();
    if (desc.includes('pap discount')) return false;
    return cat.includes('material') || desc.includes('material') || desc.includes('tax');
  };

  const isLaborItem = (item: CostLineItem): boolean => {
    const desc = (item.description || '').toLowerCase();
    if (desc.includes('pap discount')) return false;
    const cat = (item.category || '').toLowerCase();
    return cat.includes('labor') || (!isMaterialItem(item) && !desc.includes('tax'));
  };

  // Define all categories with their data
  const categories: CategoryData[] = [
    { name: 'Plans & Engineering', items: costBreakdown.plansAndEngineering, showPAPInput: false },
    { name: 'Layout', items: costBreakdown.layout, showPAPInput: false },
    { name: 'Permit', items: costBreakdown.permit, showPAPInput: false },
    { name: 'Excavation', items: costBreakdown.excavation, papDiscountKey: 'excavation', showPAPInput: true },
    { name: 'Plumbing', items: costBreakdown.plumbing, papDiscountKey: 'plumbing', showPAPInput: true },
    { name: 'Gas', items: costBreakdown.gas, showPAPInput: false },
    { name: 'Steel', items: costBreakdown.steel, papDiscountKey: 'steel', showPAPInput: true },
    { name: 'Electrical', items: costBreakdown.electrical, papDiscountKey: 'electrical', showPAPInput: true },
    {
      name: 'Shotcrete',
      items: [...costBreakdown.shotcreteLabor, ...costBreakdown.shotcreteMaterial],
      papDiscountKey: 'shotcrete',
      showPAPInput: true,
      subcategories: [
        { name: 'Labor', items: costBreakdown.shotcreteLabor },
        { name: 'Material', items: costBreakdown.shotcreteMaterial },
      ],
    },
    {
      name: 'Tile',
      items: [...costBreakdown.tileLabor, ...costBreakdown.tileMaterial],
      papDiscountKey: 'tileCopingLabor',
      showPAPInput: true,
      subcategories: [
        { name: 'Labor', items: costBreakdown.tileLabor },
        { name: 'Material', items: costBreakdown.tileMaterial },
      ],
    },
    {
      name: 'Coping/Decking',
      items: [...costBreakdown.copingDeckingLabor, ...costBreakdown.copingDeckingMaterial],
      showPAPInput: false,
      subcategories: [
        { name: 'Labor', items: costBreakdown.copingDeckingLabor },
        { name: 'Material', items: costBreakdown.copingDeckingMaterial },
      ],
    },
    {
      name: 'Stone/Rockwork',
      items: [...costBreakdown.stoneRockworkLabor, ...costBreakdown.stoneRockworkMaterial],
      showPAPInput: false,
      subcategories: [
        { name: 'Labor', items: costBreakdown.stoneRockworkLabor },
        { name: 'Material', items: costBreakdown.stoneRockworkMaterial },
      ],
    },
    { name: 'Drainage', items: costBreakdown.drainage, showPAPInput: false },
    { name: 'Equipment Ordered', items: costBreakdown.equipmentOrdered, papDiscountKey: 'equipment', showPAPInput: true },
    { name: 'Equipment Set', items: costBreakdown.equipmentSet, showPAPInput: false },
    { name: 'Cleanup', items: costBreakdown.cleanup, showPAPInput: false },
    { name: 'Interior Finish', items: costBreakdown.interiorFinish, papDiscountKey: 'interiorFinish', showPAPInput: true },
    { name: 'Water Truck', items: costBreakdown.waterTruck, showPAPInput: false },
    { name: 'Fiberglass Shell', items: costBreakdown.fiberglassShell, showPAPInput: false },
    { name: 'Fiberglass Install', items: costBreakdown.fiberglassInstall, showPAPInput: false },
    { name: 'Startup/Orientation', items: costBreakdown.startupOrientation, papDiscountKey: 'startup', showPAPInput: true },
    { name: 'Custom Features', items: costBreakdown.customFeatures, showPAPInput: false },
  ];

  // Filter out empty categories
  const nonEmptyCategories = categories.filter(cat => cat.items.length > 0);

  const isAdjustmentItem = (item: CostLineItem) => {
    const desc = (item.description || '').toLowerCase();
    return desc.includes('pap discount') || desc.includes('tax');
  };

  const positiveTotal =
    (manualAdjustments.positive1 || 0) + (manualAdjustments.positive2 || 0);
  const negativeTotal =
    (manualAdjustments.negative1 || 0) + (manualAdjustments.negative2 || 0);
  const totalAdjustments = positiveTotal - negativeTotal;
  const showDiscountWarning =
    pricing.retailPrice > 0 && negativeTotal > pricing.retailPrice * 0.18;
  const adjustmentFields: { key: keyof ManualAdjustments; label: string; sign: '+' | '-' }[] = [
    { key: 'positive1', label: 'Positive Adjustment 1', sign: '+' },
    { key: 'positive2', label: 'Positive Adjustment 2', sign: '+' },
    { key: 'negative1', label: 'Negative Adjustment 1', sign: '-' },
    { key: 'negative2', label: 'Negative Adjustment 2', sign: '-' },
  ];

  const customerName =
    proposal.customerInfo?.customerName?.trim() && proposal.customerInfo.customerName.trim().length > 0
      ? proposal.customerInfo.customerName.trim()
      : 'No Customer Name';

  return (
    <div className="cost-breakdown-page-overlay" onClick={onClose}>
      <div className="cost-breakdown-page-container" onClick={(e) => e.stopPropagation()}>
        <div className="cost-breakdown-page-header">
          <div>
            <p className="cost-breakdown-eyebrow">{customerName}</p>
            <h2>Cost Breakdown</h2>
          </div>
          <button className="cost-breakdown-close-button" onClick={onClose} aria-label="Close cost breakdown">
            X
          </button>
        </div>

        <div className="cost-breakdown-main">
          <div className="cost-breakdown-left">
            <div className="cost-breakdown-left-header">
              <div className="cost-breakdown-toggle" role="group" aria-label="Select breakdown view">
                <button
                  className={`cost-breakdown-toggle__option ${viewMode === 'cogs' ? 'active' : ''}`}
                  onClick={() => setViewMode('cogs')}
                  type="button"
                  aria-pressed={viewMode === 'cogs'}
                  title="Show cost of goods (COGS) amounts"
                >
                  COGS Breakdown
                </button>
                <button
                  className={`cost-breakdown-toggle__option ${viewMode === 'retail' ? 'active' : ''}`}
                  onClick={() => setViewMode('retail')}
                  type="button"
                  aria-pressed={viewMode === 'retail'}
                  title="Show retail pricing amounts"
                >
                  Retail Cost Breakdown
                </button>
              </div>
            </div>

            <div className="cost-breakdown-categories">
              {nonEmptyCategories.map((category) => {
                const isExpanded = expandedCategories.has(category.name);
                const categoryTotal = category.items.reduce((sum, item) => sum + getDisplayValue(item.total), 0);

                // Calculate labor and material subtotals if applicable
                const adjustments = category.items.filter(isAdjustmentItem);
                const visibleItems = category.items.filter((item) => !isAdjustmentItem(item));
                const hasLabor = visibleItems.some(isLaborItem);
                const hasMaterial = visibleItems.some(isMaterialItem);
                const laborSubtotal = hasLabor
                  ? visibleItems.filter(isLaborItem).reduce((sum, item) => sum + getDisplayValue(item.total), 0)
                  : 0;
                const materialSubtotal = hasMaterial
                  ? visibleItems.filter(isMaterialItem).reduce((sum, item) => sum + getDisplayValue(item.total), 0)
                  : 0;
                const isWaterTruck = category.name === 'Water Truck';
                const hasLaborSubcategory = Boolean(
                  category.subcategories?.some((sub) => sub.name.toLowerCase().includes('labor'))
                );
                const laborSubtotalLabel =
                  hasLaborSubcategory && category.name === 'Shotcrete'
                    ? 'Shotcrete Labor Subtotal:'
                    : hasLaborSubcategory && category.name === 'Tile'
                    ? 'Tile Labor Subtotal:'
                    : hasLaborSubcategory
                    ? 'Labor Subtotal:'
                    : `${category.name} Subtotal:`;
                const materialSubtotalLabel =
                  category.name === 'Shotcrete'
                    ? 'Shotcrete Material Subtotal:'
                    : category.name === 'Tile'
                    ? 'Tile Material Subtotal:'
                    : 'Material Subtotal:';

                return (
                  <div key={category.name} className="cost-breakdown-category">
                    <div
                      className="cost-breakdown-category-header"
                      onClick={() => toggleCategory(category.name)}
                    >
                      <span className={`cost-breakdown-expand-icon ${isExpanded ? 'open' : ''}`}>
                        &gt;
                      </span>
                      <span className="cost-breakdown-category-name">{category.name}</span>
                      <span className="cost-breakdown-category-total">
                        {formatCurrency(categoryTotal)}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="cost-breakdown-category-content">
                        {/* If category has subcategories, render them */}
                        {category.subcategories ? (
                          <>
                            {category.subcategories.map((subcategory) => {
                              const visibleSubItems = subcategory.items.filter((item) => !isAdjustmentItem(item));
                              if (visibleSubItems.length === 0) return null;
                              return (
                                <div key={subcategory.name} className="cost-breakdown-subcategory">
                                  <div className="cost-breakdown-subcategory-title">{subcategory.name}</div>
                                  <table className="cost-breakdown-items-table">
                                    <thead>
                                      <tr>
                                        <th>Description</th>
                                        <th>Quantity</th>
                                        <th>Unit Price</th>
                                        <th>Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {visibleSubItems.map((item, idx) => {
                                        const isPapDiscount = item.description.includes('PAP Discount');
                                        const percentage =
                                          category.papDiscountKey && isPapDiscount
                                            ? (papDiscounts[category.papDiscountKey] || 0) * 100
                                            : 0;
                                        const quantityDisplay = isPapDiscount ? '1' : item.quantity.toFixed(2);
                                        const unitPriceDisplay = isPapDiscount
                                          ? `${percentage.toFixed(2)}%`
                                          : formatCurrency(getDisplayUnitPrice(item));

                                        return (
                                          <tr key={idx}>
                                            <td>{item.description}</td>
                                            <td>{item.description.toLowerCase().includes('tax') ? '' : quantityDisplay}</td>
                                            <td>{item.description.toLowerCase().includes('tax') ? '' : unitPriceDisplay}</td>
                                            <td>{formatCurrency(getDisplayValue(item.total))}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            })}
                          </>
                        ) : (
                          <>
                            {/* Line Items Table */}
                            <table className="cost-breakdown-items-table">
                              <thead>
                                <tr>
                                  <th>Description</th>
                                  {isWaterTruck && <th>Quantity</th>}
                                  {isWaterTruck && <th>Total Gallons to Fill</th>}
                                  {isWaterTruck && <th>Truck Total</th>}
                                  {!isWaterTruck && <th>Quantity</th>}
                                  <th>Unit Price</th>
                                  <th>Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {visibleItems.map((item, idx) => {
                                  const isTaxLine = item.description.toLowerCase().includes('tax');
                                  const gallons = item.details?.totalGallons;
                                  const truckGallons = item.details?.truckTotalGallons ??
                                    (isWaterTruck ? item.quantity * 7000 : undefined);
                                  const isPapDiscount = item.description.includes('PAP Discount');
                                  const percentage =
                                    category.papDiscountKey && isPapDiscount
                                      ? (papDiscounts[category.papDiscountKey] || 0) * 100
                                      : 0;
                                  const quantityDisplay = isPapDiscount ? '1' : item.quantity.toFixed(2);
                                  const unitPriceDisplay = isPapDiscount
                                    ? `${percentage.toFixed(2)}%`
                                    : formatCurrency(getDisplayUnitPrice(item));

                                  return (
                                    <tr key={idx}>
                                      <td>{item.description}</td>
                                      {isWaterTruck && (
                                        <td>{isTaxLine ? '' : quantityDisplay}</td>
                                      )}
                                      {isWaterTruck && (
                                        <td>{gallons !== undefined ? Number(gallons).toLocaleString(undefined, { maximumFractionDigits: 0 }) : ''}</td>
                                      )}
                                      {isWaterTruck && (
                                        <td>{truckGallons !== undefined ? Number(truckGallons).toLocaleString(undefined, { maximumFractionDigits: 0 }) : ''}</td>
                                      )}
                                      {!isWaterTruck && (
                                        <td>{isTaxLine ? '' : quantityDisplay}</td>
                                      )}
                                      <td>{isTaxLine ? '' : unitPriceDisplay}</td>
                                      <td>{formatCurrency(getDisplayValue(item.total))}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </>
                        )}

                        {/* Subtotals */}
                        {(hasLabor || hasMaterial || adjustments.length > 0) && (
                          <div className="cost-breakdown-subtotals">
                            {hasLabor && laborSubtotal !== 0 && (
                              <div className="cost-breakdown-subtotal-row">
                                <span>{laborSubtotalLabel}</span>
                                <span>{formatCurrency(laborSubtotal)}</span>
                              </div>
                            )}
                            {hasMaterial && materialSubtotal !== 0 && (
                              <div className="cost-breakdown-subtotal-row">
                                <span>{materialSubtotalLabel}</span>
                                <span>{formatCurrency(materialSubtotal)}</span>
                              </div>
                            )}
                            {adjustments.map((item, idx) => (
                              <div key={`${category.name}-adj-${idx}`} className="cost-breakdown-subtotal-row">
                                <span>
                                  {(() => {
                                    const desc = item.description || '';
                                    if (category.name === 'Shotcrete') {
                                      return desc.startsWith('Shotcrete') ? desc : `Shotcrete ${desc}`;
                                    }
                                    if (category.name === 'Tile' && desc.toLowerCase().includes('tax')) {
                                      return desc.toLowerCase().startsWith('tile') ? desc : `Tile ${desc}`;
                                    }
                                    return desc;
                                  })()}
                                </span>
                                <span>{formatCurrency(getDisplayValue(item.total))}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Category Total */}
                        <div className="cost-breakdown-category-total-row">
                          <span>{category.name} Total:</span>
                          <span>{formatCurrency(categoryTotal)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="cost-breakdown-summary-column">
            <div className="cost-breakdown-summary-card">
              <h3>Financial Summary</h3>
              <div className="cost-breakdown-summary-rows">
                <div className="cost-breakdown-summary-row">
                  <span>Total COGS:</span>
                  <span className="cost-breakdown-summary-value">{formatCurrency(pricing.totalCOGS)}</span>
                </div>
                <div className="cost-breakdown-summary-row">
                  <span>Retail Price:</span>
                  <span className="cost-breakdown-summary-value">{formatCurrency(pricing.retailPrice)}</span>
                </div>
                <div className="cost-breakdown-summary-row muted">
                  <span>Dig Comm. ({(pricing.digCommissionRate * 100).toFixed(2)}%):</span>
                  <span>{formatCurrency(pricing.digCommission)}</span>
                </div>
                <div className="cost-breakdown-summary-row muted">
                  <span>Admin Fee ({(pricing.adminFeeRate * 100).toFixed(2)}%):</span>
                  <span>{formatCurrency(pricing.adminFee)}</span>
                </div>
                <div className="cost-breakdown-summary-row muted">
                  <span>Closeout Comm. ({(pricing.closeoutCommissionRate * 100).toFixed(2)}%):</span>
                  <span>{formatCurrency(pricing.closeoutCommission)}</span>
                </div>
              </div>
              <div className="cost-breakdown-profit-card">
                <span>Gross Profit:</span>
                <div className="cost-breakdown-profit-figure">
                  <span>{formatCurrency(pricing.grossProfit)}</span>
                  <span className="cost-breakdown-profit-margin">({pricing.grossProfitMargin.toFixed(2)}%)</span>
                </div>
              </div>
            </div>
          <div className="adjustments-card">
            <div className="adjustments-card__header">
              <h4>Adjustments</h4>
              <span>Manual Retail Price changes</span>
            </div>
            {showDiscountWarning && (
              <div className="adjustments-warning">Warning: over 18% threshold</div>
            )}
            <div className="adjustments-list">
              {adjustmentFields.map((field) => (
                <div key={field.key} className="adjustments-row">
                  <span className="adjustments-row__label">{field.label}</span>
                  <div className={`adjustments-input ${field.sign === '-' ? 'negative' : 'positive'}`}>
                    <span className="adjustments-input__prefix">{field.sign}</span>
                    {(() => {
                      const current = manualAdjustments[field.key];
                      const displayValue = current === 0 ? '' : current ?? '';
                      return (
                      <input
                        type="number"
                        step="50"
                        inputMode="decimal"
                        value={displayValue}
                        placeholder="0"
                        onChange={(e) => handleAdjustmentChange(field.key, parseFloat(e.target.value))}
                      />
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
            <div className="adjustments-total-card">
              <span className="adjustments-total-label">Total Adjustments:</span>
              <div className="adjustments-total-figure">
                <span className="adjustments-total-value">{formatCurrency(totalAdjustments)}</span>
              </div>
            </div>
          </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default CostBreakdownPage;
