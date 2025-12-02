import { useState, useEffect, useRef } from 'react';
import { CostBreakdown, CostLineItem } from '../types/proposal-new';
import './LiveCostBreakdown.css';

interface Props {
  costBreakdown: CostBreakdown;
  totalCOGS?: number;
  onToggle?: () => void;
}

interface HighlightedItem {
  categoryName: string;
  itemIndex: number;
  timestamp: number;
}

function LiveCostBreakdown({ costBreakdown, totalCOGS, onToggle }: Props) {
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
    const prevShotcreteCombined = [
      ...(prev.shotcreteLabor || []),
      ...(prev.shotcreteMaterial || []),
    ];
    const prevTileCombined = [
      ...(prev.tileLabor || []),
      ...(prev.tileMaterial || []),
    ];
    const prevCopingDeckCombined = [
      ...(prev.copingDeckingLabor || []),
      ...(prev.copingDeckingMaterial || []),
    ];
    const prevStone = [
      ...(prev.stoneRockworkLabor || []),
      ...(prev.stoneRockworkMaterial || []),
    ];

    checkCategory('Shotcrete', prevShotcreteCombined, shotcreteCombined);
    checkCategory('Tile', prevTileCombined, tileCombined);
    checkCategory('Coping/Decking', prevCopingDeckCombined, copingDeckCombined);
    checkCategory('Stone/Rockwork', prevStone, stoneRockworkItems);
    checkCategory('Drainage', prev.drainage, costBreakdown.drainage);
    checkCategory('Equipment Ordered', prev.equipmentOrdered, costBreakdown.equipmentOrdered);
    checkCategory('Equipment Set', prev.equipmentSet, costBreakdown.equipmentSet);
    checkCategory('Water Features', prev.waterFeatures, costBreakdown.waterFeatures);
    checkCategory('Cleanup', prev.cleanup, costBreakdown.cleanup);
    checkCategory('Interior Finish', prev.interiorFinish, costBreakdown.interiorFinish);
    checkCategory('Water Truck', prev.waterTruck, costBreakdown.waterTruck);
    checkCategory('Fiberglass Shell', prev.fiberglassShell, costBreakdown.fiberglassShell);
    checkCategory('Fiberglass Install', prev.fiberglassInstall, costBreakdown.fiberglassInstall);
    checkCategory('Startup/Orientation', prev.startupOrientation, costBreakdown.startupOrientation);
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

  const shotcreteCombined = [
    ...(costBreakdown.shotcreteLabor || []),
    ...(costBreakdown.shotcreteMaterial || []),
  ];
  const tileCombined = [
    ...(costBreakdown.tileLabor || []),
    ...(costBreakdown.tileMaterial || []),
  ];
  const copingDeckCombined = [
    ...(costBreakdown.copingDeckingLabor || []),
    ...(costBreakdown.copingDeckingMaterial || []),
  ];
  const stoneRockworkItems = [
    ...(costBreakdown.stoneRockworkLabor || []),
    ...(costBreakdown.stoneRockworkMaterial || []),
  ];
  const startupItems = costBreakdown.startupOrientation || [];

  const shotcreteSubcategories = [
    { name: 'Labor', items: costBreakdown.shotcreteLabor || [] },
    { name: 'Material', items: costBreakdown.shotcreteMaterial || [] },
  ];

  const tileSubcategories = [
    { name: 'Labor', items: costBreakdown.tileLabor || [] },
    { name: 'Material', items: costBreakdown.tileMaterial || [] },
  ];

  const copingDeckSubcategories = [
    { name: 'Labor', items: costBreakdown.copingDeckingLabor || [] },
    { name: 'Material', items: costBreakdown.copingDeckingMaterial || [] },
  ];

  const stoneSubcategories = [
    { name: 'Labor', items: costBreakdown.stoneRockworkLabor || [] },
    { name: 'Material', items: costBreakdown.stoneRockworkMaterial || [] },
  ];

  const allItemGroups: CostLineItem[][] = [
    costBreakdown.plansAndEngineering || [],
    costBreakdown.layout || [],
    costBreakdown.permit || [],
    costBreakdown.excavation || [],
    costBreakdown.plumbing || [],
    costBreakdown.gas || [],
    costBreakdown.steel || [],
    costBreakdown.electrical || [],
    costBreakdown.shotcreteLabor || [],
    costBreakdown.shotcreteMaterial || [],
    costBreakdown.tileLabor || [],
    costBreakdown.tileMaterial || [],
    costBreakdown.copingDeckingLabor || [],
    costBreakdown.copingDeckingMaterial || [],
    costBreakdown.stoneRockworkLabor || [],
    costBreakdown.stoneRockworkMaterial || [],
    costBreakdown.drainage || [],
    costBreakdown.equipmentOrdered || [],
    costBreakdown.equipmentSet || [],
    costBreakdown.waterFeatures || [],
    costBreakdown.cleanup || [],
    costBreakdown.interiorFinish || [],
    costBreakdown.waterTruck || [],
    costBreakdown.fiberglassShell || [],
    costBreakdown.fiberglassInstall || [],
    costBreakdown.startupOrientation || [],
    costBreakdown.customFeatures || [],
  ];

  const computedGrandTotal = allItemGroups.reduce(
    (sum, group) => sum + group.reduce((gSum, item) => gSum + (item.total ?? 0), 0),
    0
  );
  const providedGrandTotal = costBreakdown.totals?.grandTotal ?? 0;
  const displayedGrandTotal = Number.isFinite(totalCOGS ?? NaN)
    ? totalCOGS!
    : Number.isFinite(providedGrandTotal)
    ? providedGrandTotal
    : computedGrandTotal;

  const renderLineItems = (
    items: CostLineItem[] | undefined,
    categoryName: string,
    subcategories?: { name: string; items: CostLineItem[] }[]
  ) => {
    const safeItems = items || [];
    const displayItems = safeItems.filter(
      (item) => (item.quantity ?? 0) > 0 || (item.total ?? 0) !== 0
    );
    const isExpanded = expandedSections.has(categoryName);
    const categoryTotal = safeItems.reduce((sum, item) => sum + (item.total ?? 0), 0);
    const categoryHasHighlight = isCategoryHighlighted(categoryName);
    const subcategoryDisplays =
      subcategories?.map((sub) => ({
        name: sub.name,
        items: (sub.items || []).filter((item) => (item.quantity ?? 0) > 0 || (item.total ?? 0) !== 0),
      })) || [];
    const hasSubcategories = subcategoryDisplays.some((s) => s.items.length > 0);

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

        {isExpanded && !hasSubcategories && displayItems.length > 0 && (
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

        {isExpanded && hasSubcategories && (
          <div className="live-subcategories">
            {subcategoryDisplays.map((sub, subIdx) => {
              if (!sub.items.length) return null;
              let rowOffset = 0;
              subcategoryDisplays.slice(0, subIdx).forEach((prev) => {
                rowOffset += prev.items.length;
              });
              return (
                <div key={sub.name} className="live-subcategory-block">
                  <div className="live-subcategory-title">{sub.name}</div>
                  <table className="live-line-items-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Qty</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sub.items.map((item, index) => {
                        const globalIndex = rowOffset + index;
                        const isHighlighted = isItemHighlighted(categoryName, globalIndex);
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
              );
            })}
          </div>
        )}

        {isExpanded && displayItems.length === 0 && !hasSubcategories && (
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
      </div>
      {onToggle && (
        <button
          className="sidebar-toggle right-toggle"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          title="Hide cost breakdown"
          aria-label="Hide cost breakdown"
        >
          {'>'}
        </button>
      )}

      <div className="live-breakdown-content">
        {renderLineItems(costBreakdown.plansAndEngineering, 'Plans & Engineering')}
        {renderLineItems(costBreakdown.layout, 'Layout')}
        {renderLineItems(costBreakdown.permit, 'Permit')}
        {renderLineItems(costBreakdown.excavation, 'Excavation')}
        {renderLineItems(costBreakdown.plumbing, 'Plumbing')}
        {renderLineItems(costBreakdown.gas, 'Gas')}
        {renderLineItems(costBreakdown.steel, 'Steel')}
        {renderLineItems(costBreakdown.electrical, 'Electrical')}
        {renderLineItems(shotcreteCombined, 'Shotcrete', shotcreteSubcategories)}
        {renderLineItems(tileCombined, 'Tile', tileSubcategories)}
        {renderLineItems(copingDeckCombined, 'Coping/Decking', copingDeckSubcategories)}
        {renderLineItems(stoneRockworkItems, 'Stone/Rockwork', stoneSubcategories)}
        {renderLineItems(costBreakdown.drainage, 'Drainage')}
        {renderLineItems(costBreakdown.equipmentOrdered, 'Equipment Ordered')}
        {renderLineItems(costBreakdown.equipmentSet, 'Equipment Set')}
        {renderLineItems(costBreakdown.waterFeatures, 'Water Features')}
        {renderLineItems(costBreakdown.cleanup, 'Cleanup')}
        {renderLineItems(costBreakdown.interiorFinish, 'Interior Finish')}
        {renderLineItems(costBreakdown.waterTruck, 'Water Truck')}
        {renderLineItems(costBreakdown.fiberglassShell, 'Fiberglass Shell')}
        {renderLineItems(costBreakdown.fiberglassInstall, 'Fiberglass Install')}
        {renderLineItems(startupItems, 'Startup/Orientation')}
        {renderLineItems(costBreakdown.customFeatures, 'Custom Features')}
      </div>

      <div className="live-grand-total">
        <span>GRAND TOTAL (COGS):</span>
        <span>${displayedGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    </div>
  );
}

export default LiveCostBreakdown;
