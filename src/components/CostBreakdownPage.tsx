import { useState } from 'react';
import { Proposal, PAPDiscounts, CostLineItem } from '../types/proposal-new';
import MasterPricingEngine from '../services/masterPricingEngine';
import './CostBreakdownPage.css';

interface CostBreakdownPageProps {
  proposal: Partial<Proposal>;
  onClose: () => void;
  onPAPDiscountsChange: (discounts: PAPDiscounts) => void;
}

interface CategoryData {
  name: string;
  items: CostLineItem[];
  papDiscountKey?: keyof PAPDiscounts;
  showPAPInput: boolean;
  subcategories?: { name: string; items: CostLineItem[] }[];
}

function CostBreakdownPage({ proposal, onClose, onPAPDiscountsChange }: CostBreakdownPageProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [papDiscounts, setPapDiscounts] = useState<PAPDiscounts>(
    proposal.papDiscounts || {
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
    }
  );

  // Recalculate with current PAP discounts
  const result = MasterPricingEngine.calculateCompleteProposal(proposal, papDiscounts);
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

  const handlePAPDiscountChange = (key: keyof PAPDiscounts, value: number) => {
    const newDiscounts = { ...papDiscounts, [key]: value / 100 }; // Convert percentage to decimal
    setPapDiscounts(newDiscounts);
    onPAPDiscountsChange(newDiscounts);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
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
    { name: 'Water Features', items: costBreakdown.waterFeatures, showPAPInput: false },
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
  const papDiscountCategories = nonEmptyCategories.filter(
    (cat) => cat.showPAPInput && cat.papDiscountKey
  );

  const isAdjustmentItem = (item: CostLineItem) => {
    const desc = (item.description || '').toLowerCase();
    return desc.includes('pap discount') || desc.includes('tax');
  };

  const totalPapDiscount = nonEmptyCategories.reduce((sum, cat) => {
    const papAdjustments = cat.items.filter((item) =>
      (item.description || '').toLowerCase().includes('pap discount')
    );
    const catTotal = papAdjustments.reduce((acc, item) => acc + item.total, 0);
    return sum + catTotal;
  }, 0);

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
              <div>
                <p className="cost-breakdown-label">Detailed Breakdown</p>
                <p className="cost-breakdown-helper">
                  Expand a category to view labor/material details; adjust PAP discounts in the panel on the right.
                </p>
              </div>
            </div>

            <div className="cost-breakdown-categories">
              {nonEmptyCategories.map((category) => {
                const isExpanded = expandedCategories.has(category.name);
                const categoryTotal = category.items.reduce((sum, item) => sum + item.total, 0);

                // Calculate labor and material subtotals if applicable
                const adjustments = category.items.filter(isAdjustmentItem);
                const visibleItems = category.items.filter((item) => !isAdjustmentItem(item));
                const hasLabor = visibleItems.some(isLaborItem);
                const hasMaterial = visibleItems.some(isMaterialItem);
                const laborSubtotal = hasLabor
                  ? visibleItems.filter(isLaborItem).reduce((sum, item) => sum + item.total, 0)
                  : 0;
                const materialSubtotal = hasMaterial
                  ? visibleItems.filter(isMaterialItem).reduce((sum, item) => sum + item.total, 0)
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
                                          : formatCurrency(item.unitPrice);

                                        return (
                                          <tr key={idx}>
                                            <td>{item.description}</td>
                                            <td>{item.description.toLowerCase().includes('tax') ? '' : quantityDisplay}</td>
                                            <td>{item.description.toLowerCase().includes('tax') ? '' : unitPriceDisplay}</td>
                                            <td>{formatCurrency(item.total)}</td>
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
                                    : formatCurrency(item.unitPrice);

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
                                      <td>{formatCurrency(item.total)}</td>
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
                                <span>{formatCurrency(item.total)}</span>
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

            {papDiscountCategories.length > 0 && (
              <div className="pap-discount-card">
                <div className="pap-discount-card__header">
                  <h4>PAP Discount</h4>
                  <span>Adjust PAP discounts for eligible categories.</span>
                </div>
                <div className="pap-discount-list">
                  {papDiscountCategories.map((category) => (
                    <div key={category.name} className="pap-discount-row">
                      <span className="pap-discount-row__label">{category.name}</span>
                      <div className="pap-discount-input">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={(papDiscounts[category.papDiscountKey!] || 0) * 100}
                          onChange={(e) =>
                            handlePAPDiscountChange(
                              category.papDiscountKey!,
                              parseFloat(e.target.value) || 0
                            )
                          }
                        />
                        <span className="pap-discount-input__suffix">%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pap-discount-total-card">
                  <span className="pap-discount-total-label">Total PAP Discount:</span>
                  <div className="pap-discount-total-figure">
                    <span className="pap-discount-total-value">{formatCurrency(totalPapDiscount)}</span>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default CostBreakdownPage;
