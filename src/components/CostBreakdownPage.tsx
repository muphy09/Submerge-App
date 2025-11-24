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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Excavation']));
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

  return (
    <div className="cost-breakdown-page-overlay" onClick={onClose}>
      <div className="cost-breakdown-page-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="cost-breakdown-page-header">
          <h2>Cost Breakdown - PAP Discount Management</h2>
          <button className="cost-breakdown-close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Main Content */}
        <div className="cost-breakdown-page-content">
          {/* Categories */}
          <div className="cost-breakdown-categories">
            {nonEmptyCategories.map((category) => {
              const isExpanded = expandedCategories.has(category.name);
              const categoryTotal = category.items.reduce((sum, item) => sum + item.total, 0);

              // Calculate labor and material subtotals if applicable
              const hasLabor = category.items.some(item => item.description.toLowerCase().includes('labor'));
              const hasMaterial = category.items.some(item =>
                item.description.toLowerCase().includes('material') ||
                item.description.toLowerCase().includes('tax')
              );
              const laborSubtotal = hasLabor ? category.items
                .filter(item => item.description.toLowerCase().includes('labor') ||
                              (!item.description.toLowerCase().includes('material') &&
                               !item.description.toLowerCase().includes('tax') &&
                               !item.description.toLowerCase().includes('pap')))
                .reduce((sum, item) => sum + item.total, 0) : 0;
              const materialSubtotal = hasMaterial ? category.items
                .filter(item => item.description.toLowerCase().includes('material') ||
                              item.description.toLowerCase().includes('tax'))
                .reduce((sum, item) => sum + item.total, 0) : 0;

              return (
                <div key={category.name} className="cost-breakdown-category">
                  <div
                    className="cost-breakdown-category-header"
                    onClick={() => toggleCategory(category.name)}
                  >
                    <span className="cost-breakdown-expand-icon">
                      {isExpanded ? '▼' : '▶'}
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
                            const subtotal = subcategory.items.reduce((sum, item) => sum + item.total, 0);
                            if (subcategory.items.length === 0) return null;
                            return (
                              <div key={subcategory.name} className="cost-breakdown-subcategory">
                                <h4 className="cost-breakdown-subcategory-header">
                                  {subcategory.name}
                                  <span className="cost-breakdown-subcategory-total">
                                    {formatCurrency(subtotal)}
                                  </span>
                                </h4>
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
                                    {subcategory.items.map((item, idx) => (
                                      <tr
                                        key={idx}
                                        className={item.description.includes('PAP Discount') ? 'pap-discount-row' : ''}
                                      >
                                        <td>{item.description}</td>
                                        <td>{item.description.toLowerCase().includes('tax') ? '' : item.quantity.toFixed(2)}</td>
                                        <td>{item.description.toLowerCase().includes('tax') ? '' : formatCurrency(item.unitPrice)}</td>
                                        <td>{formatCurrency(item.total)}</td>
                                      </tr>
                                    ))}
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
                                <th>Quantity</th>
                                <th>Unit Price</th>
                                <th>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {category.items.map((item, idx) => (
                                <tr
                                  key={idx}
                                  className={item.description.includes('PAP Discount') ? 'pap-discount-row' : ''}
                                >
                                  <td>{item.description}</td>
                                  <td>{item.description.toLowerCase().includes('tax') ? '' : item.quantity.toFixed(2)}</td>
                                  <td>{item.description.toLowerCase().includes('tax') ? '' : formatCurrency(item.unitPrice)}</td>
                                  <td>{formatCurrency(item.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}

                      {/* Subtotals */}
                      {(hasLabor || hasMaterial) && (
                        <div className="cost-breakdown-subtotals">
                          {hasLabor && laborSubtotal !== 0 && (
                            <div className="cost-breakdown-subtotal-row">
                              <span>Labor Subtotal:</span>
                              <span>{formatCurrency(laborSubtotal)}</span>
                            </div>
                          )}
                          {hasMaterial && materialSubtotal !== 0 && (
                            <div className="cost-breakdown-subtotal-row">
                              <span>Material Subtotal:</span>
                              <span>{formatCurrency(materialSubtotal)}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* PAP Discount Input */}
                      {category.showPAPInput && category.papDiscountKey && (
                        <div className="cost-breakdown-pap-input">
                          <label>
                            PAP Discount (%):
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={papDiscounts[category.papDiscountKey] * 100}
                              onChange={(e) => handlePAPDiscountChange(
                                category.papDiscountKey!,
                                parseFloat(e.target.value) || 0
                              )}
                            />
                          </label>
                          <span className="pap-discount-slider-wrapper">
                            <input
                              type="range"
                              min="0"
                              max="20"
                              step="0.5"
                              value={papDiscounts[category.papDiscountKey] * 100}
                              onChange={(e) => handlePAPDiscountChange(
                                category.papDiscountKey!,
                                parseFloat(e.target.value)
                              )}
                              className="pap-discount-slider"
                            />
                          </span>
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

        {/* Bottom Totals Section */}
        <div className="cost-breakdown-page-footer">
          <div className="cost-breakdown-totals-grid">
            <div className="cost-breakdown-total-row">
              <span>Total COGS:</span>
              <span className="cost-breakdown-total-value">{formatCurrency(pricing.totalCOGS)}</span>
            </div>
            <div className="cost-breakdown-total-row">
              <span>Retail Price:</span>
              <span className="cost-breakdown-total-value">{formatCurrency(pricing.retailPrice)}</span>
            </div>
            <div className="cost-breakdown-total-row minor">
              <span>Dig Commission ({(pricing.digCommissionRate * 100).toFixed(2)}%):</span>
              <span>{formatCurrency(pricing.digCommission)}</span>
            </div>
            <div className="cost-breakdown-total-row minor">
              <span>Admin Fee ({(pricing.adminFeeRate * 100).toFixed(2)}%):</span>
              <span>{formatCurrency(pricing.adminFee)}</span>
            </div>
            <div className="cost-breakdown-total-row minor">
              <span>Closeout Commission ({(pricing.closeoutCommissionRate * 100).toFixed(2)}%):</span>
              <span>{formatCurrency(pricing.closeoutCommission)}</span>
            </div>
            <div className="cost-breakdown-total-row highlight">
              <span>Gross Profit:</span>
              <span className="cost-breakdown-profit-value">
                {formatCurrency(pricing.grossProfit)} ({pricing.grossProfitMargin.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CostBreakdownPage;
