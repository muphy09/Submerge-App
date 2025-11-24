import { useState, useEffect, useRef } from 'react';
import { CostBreakdown, CostLineItem } from '../types/proposal-new';
import './LiveCostBreakdown.css';

interface Props {
  costBreakdown: CostBreakdown;
  onToggle?: () => void;
}

interface HighlightedItem {
  categoryName: string;
  itemIndex: number;
  timestamp: number;
}

function LiveCostBreakdown({ costBreakdown, onToggle }: Props) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [highlightedItems, setHighlightedItems] = useState<HighlightedItem[]>([]);
  const [highlightedCategories, setHighlightedCategories] = useState<Set<string>>(new Set());
  const previousBreakdownRef = useRef<CostBreakdown | null>(null);

  // Track changes in cost breakdown
  useEffect(() => {
    if (!previousBreakdownRef.current) {
      previousBreakdownRef.current = costBreakdown;
      return;
    }

    const prev = previousBreakdownRef.current;
    const newHighlights: HighlightedItem[] = [];
    const newCategories = new Set<string>();
    const timestamp = Date.now();

    const checkCategory = (
      categoryName: string,
      prevItems: CostLineItem[] | undefined,
      currentItems: CostLineItem[] | undefined
    ) => {
      const prevSafe = prevItems || [];
      const currentSafe = currentItems || [];

      const prevFiltered = prevSafe.filter(
        (item) => (item.quantity ?? 0) > 0 || (item.total ?? 0) !== 0
      );
      const currentFiltered = currentSafe.filter(
        (item) => (item.quantity ?? 0) > 0 || (item.total ?? 0) !== 0
      );

      // Calculate category totals
      const prevTotal = prevSafe.reduce((sum, item) => sum + (item.total ?? 0), 0);
      const currentTotal = currentSafe.reduce((sum, item) => sum + (item.total ?? 0), 0);

      // Track if category total increased
      if (currentTotal > prevTotal) {
        newCategories.add(categoryName);
      }

      // Check individual items for changes (only increases)
      currentFiltered.forEach((currentItem, index) => {
        const prevItem = prevFiltered[index];

        // Check if this is a new item or changed item with increased total
        if (!prevItem ||
            prevItem.description !== currentItem.description ||
            prevItem.quantity !== currentItem.quantity ||
            prevItem.total !== currentItem.total) {

          // Only highlight if it's an increase
          const prevItemTotal = prevItem?.total ?? 0;
          const currentItemTotal = currentItem.total ?? 0;

          if (currentItemTotal > prevItemTotal) {
            newHighlights.push({
              categoryName,
              itemIndex: index,
              timestamp,
            });
          }
        }
      });
    };

    // Check all categories
    checkCategory('Plans & Engineering', prev.plansAndEngineering, costBreakdown.plansAndEngineering);
    checkCategory('Layout', prev.layout, costBreakdown.layout);
    checkCategory('Permit', prev.permit, costBreakdown.permit);
    checkCategory('Excavation', prev.excavation, costBreakdown.excavation);
    checkCategory('Plumbing', prev.plumbing, costBreakdown.plumbing);
    checkCategory('Gas', prev.gas, costBreakdown.gas);
    checkCategory('Steel', prev.steel, costBreakdown.steel);
    checkCategory('Electrical', prev.electrical, costBreakdown.electrical);
    checkCategory('Shotcrete Labor', prev.shotcreteLabor, costBreakdown.shotcreteLabor);
    checkCategory('Shotcrete Material', prev.shotcreteMaterial, costBreakdown.shotcreteMaterial);
    checkCategory('Tile Labor', prev.tileLabor, costBreakdown.tileLabor);
    checkCategory('Tile Material', prev.tileMaterial, costBreakdown.tileMaterial);
    checkCategory('Coping/Decking Labor', prev.copingDeckingLabor, costBreakdown.copingDeckingLabor);
    checkCategory('Coping/Decking Material', prev.copingDeckingMaterial, costBreakdown.copingDeckingMaterial);
    checkCategory('Stone/Rockwork', prev.stoneRockworkLabor, costBreakdown.stoneRockworkLabor);
    checkCategory('Drainage', prev.drainage, costBreakdown.drainage);
    checkCategory('Equipment Ordered', prev.equipmentOrdered, costBreakdown.equipmentOrdered);
    checkCategory('Equipment Set', prev.equipmentSet, costBreakdown.equipmentSet);
    checkCategory('Water Features', prev.waterFeatures, costBreakdown.waterFeatures);
    checkCategory('Cleanup', prev.cleanup, costBreakdown.cleanup);
    checkCategory('Interior Finish', prev.interiorFinish, costBreakdown.interiorFinish);
    checkCategory('Water Truck', prev.waterTruck, costBreakdown.waterTruck);
    checkCategory('Fiberglass Shell', prev.fiberglassShell, costBreakdown.fiberglassShell);
    checkCategory('Fiberglass Install', prev.fiberglassInstall, costBreakdown.fiberglassInstall);
    checkCategory('Custom Features', prev.customFeatures, costBreakdown.customFeatures);

    if (newHighlights.length > 0 || newCategories.size > 0) {
      // Merge with existing highlights instead of replacing
      setHighlightedItems(prev => {
        // Remove old highlights for the same items, keep others
        const filtered = prev.filter(h => {
          const isReplaced = newHighlights.some(nh =>
            nh.categoryName === h.categoryName && nh.itemIndex === h.itemIndex
          );
          return !isReplaced;
        });
        return [...filtered, ...newHighlights];
      });

      setHighlightedCategories(prev => {
        const updated = new Set(prev);
        newCategories.forEach(cat => updated.add(cat));
        return updated;
      });

      // Clear highlights after 5 seconds
      const timer = setTimeout(() => {
        const cutoffTime = Date.now() - 5000;
        setHighlightedItems(prev => prev.filter(h => h.timestamp > cutoffTime));
        setHighlightedCategories(new Set());
      }, 5000);

      return () => clearTimeout(timer);
    }

    previousBreakdownRef.current = costBreakdown;
  }, [costBreakdown]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const isItemHighlighted = (categoryName: string, itemIndex: number): boolean => {
    return highlightedItems.some(
      (h) => h.categoryName === categoryName && h.itemIndex === itemIndex
    );
  };

  const isCategoryHighlighted = (categoryName: string): boolean => {
    return highlightedCategories.has(categoryName);
  };

  const renderLineItems = (items: CostLineItem[] | undefined, categoryName: string) => {
    const safeItems = items || [];
    const displayItems = safeItems.filter(
      (item) => (item.quantity ?? 0) > 0 || (item.total ?? 0) !== 0
    );
    const isExpanded = expandedSections.has(categoryName);
    const categoryTotal = safeItems.reduce((sum, item) => sum + (item.total ?? 0), 0);
    const categoryHasHighlight = isCategoryHighlighted(categoryName);

    return (
      <div className="live-cost-category">
        <div
          className="live-category-header"
          onClick={() => toggleSection(categoryName)}
        >
          <span className="live-expand-icon">{isExpanded ? '▼' : '▶'}</span>
          <span className="live-category-name">{categoryName}</span>
          <span className="live-category-total">
            {categoryHasHighlight && (
              <span className="live-up-arrow">▲</span>
            )}
            ${categoryTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {isExpanded && displayItems.length > 0 && (
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
                {displayItems.map((item, index) => {
                  const isHighlighted = isItemHighlighted(categoryName, index);
                  return (
                    <tr key={index} className={isHighlighted ? 'highlighted' : ''}>
                      <td>{item.description}</td>
                      <td>{item.quantity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                      <td>${item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {isExpanded && displayItems.length === 0 && (
          <div className="live-line-items empty">
            <div className="live-empty-state">No line items yet</div>
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
        {renderLineItems(costBreakdown.fiberglassInstall, 'Fiberglass Install')}
        {renderLineItems(costBreakdown.customFeatures, 'Custom Features')}
      </div>

      <div className="live-grand-total">
        <span>GRAND TOTAL:</span>
        <span>${costBreakdown.totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    </div>
  );
}

export default LiveCostBreakdown;
