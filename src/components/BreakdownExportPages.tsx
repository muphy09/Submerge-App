import { useMemo } from 'react';
import FranchiseLogo from './FranchiseLogo';
import { useFranchiseAppName } from '../hooks/useFranchiseAppName';
import { resolveWarrantySections } from '../utils/warranty';
import { CostBreakdown, CostLineItem, PricingCalculations, Proposal, RetailAdjustment } from '../types/proposal-new';
import './BreakdownExportPages.css';

interface CostExportProps {
  costBreakdown: CostBreakdown;
  customerName: string;
  proposal?: Partial<Proposal>;
  pricing?: PricingCalculations;
}

interface WarrantyExportProps {
  proposal?: Partial<Proposal>;
}

interface ExportRow {
  label: string;
  value: number;
}

const roundToTwo = (value: number): number =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const formatCurrency = (value: number): string =>
  `$${(Number.isFinite(value) ? value : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const normalizedRetailAdjustments = (input?: RetailAdjustment[]): RetailAdjustment[] =>
  (Array.isArray(input) ? input : []).map((adjustment) => ({
    name: typeof adjustment?.name === 'string' ? adjustment.name : '',
    amount: Number.isFinite(Number(adjustment?.amount)) ? Number(adjustment.amount) : 0,
  }));

const getRetailOverride = (item?: CostLineItem): number | null => {
  if (!item) return null;
  const override = (item.details as any)?.retailOverride;
  return Number.isFinite(override) ? Number(override) : null;
};

const toCostRows = (costBreakdown: CostBreakdown): ExportRow[] => {
  const baseTotals = costBreakdown?.totals || ({} as CostBreakdown['totals']);
  return [
    { label: 'Plans & Engineering', value: baseTotals.plansAndEngineering ?? 0 },
    { label: 'Layout', value: baseTotals.layout ?? 0 },
    { label: 'Permit', value: baseTotals.permit ?? 0 },
    { label: 'Excavation', value: baseTotals.excavation ?? 0 },
    { label: 'Plumbing', value: baseTotals.plumbing ?? 0 },
    { label: 'Gas', value: baseTotals.gas ?? 0 },
    { label: 'Steel', value: baseTotals.steel ?? 0 },
    { label: 'Electrical', value: baseTotals.electrical ?? 0 },
    { label: 'Shotcrete Labor', value: baseTotals.shotcreteLabor ?? 0 },
    { label: 'Shotcrete Material', value: baseTotals.shotcreteMaterial ?? 0 },
    { label: 'Tile Labor', value: baseTotals.tileLabor ?? 0 },
    { label: 'Tile Material', value: baseTotals.tileMaterial ?? 0 },
    { label: 'Coping/Decking Labor', value: baseTotals.copingDeckingLabor ?? 0 },
    { label: 'Coping/Decking Material', value: baseTotals.copingDeckingMaterial ?? 0 },
    {
      label: 'Stone/Rockwork',
      value: (baseTotals.stoneRockworkLabor ?? 0) + (baseTotals.stoneRockworkMaterial ?? 0),
    },
    { label: 'Drainage', value: baseTotals.drainage ?? 0 },
    { label: 'Equipment Ordered', value: baseTotals.equipmentOrdered ?? 0 },
    { label: 'Equipment Set', value: baseTotals.equipmentSet ?? 0 },
    { label: 'Water Features', value: baseTotals.waterFeatures ?? 0 },
    { label: 'Cleanup', value: baseTotals.cleanup ?? 0 },
    { label: 'Interior Finish', value: baseTotals.interiorFinish ?? 0 },
    { label: 'Water Truck', value: baseTotals.waterTruck ?? 0 },
    { label: 'Fiberglass Shell', value: baseTotals.fiberglassShell ?? 0 },
    { label: 'Fiberglass Install', value: baseTotals.fiberglassInstall ?? 0 },
    { label: 'Startup/Orientation', value: baseTotals.startupOrientation ?? 0 },
    { label: 'Custom Features', value: baseTotals.customFeatures ?? 0 },
  ];
};

const allItems = (costBreakdown: CostBreakdown): CostLineItem[] => [
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

export function BreakdownCostExportPage({ costBreakdown, customerName, proposal, pricing }: CostExportProps) {
  const franchiseId = proposal?.franchiseId;
  const rows = useMemo(() => {
    const baseRows = toCostRows(costBreakdown);
    const baseTotals = costBreakdown?.totals || ({} as CostBreakdown['totals']);
    const costBasis =
      pricing?.totalCostsBeforeOverhead ??
      proposal?.pricing?.totalCostsBeforeOverhead ??
      baseTotals.grandTotal ??
      0;

    const adjustments = normalizedRetailAdjustments(proposal?.retailAdjustments).filter(
      (adjustment) => adjustment.name.trim().length > 0 || roundToTwo(adjustment.amount) !== 0
    );
    const adjustmentsTotal = adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
    const offContractTotal =
      pricing?.offContractTotal ??
      proposal?.pricing?.offContractTotal ??
      0;

    let retailPrice =
      pricing?.retailPrice ??
      proposal?.pricing?.retailPrice ??
      proposal?.totalCost ??
      0;

    if (!retailPrice && costBasis) {
      retailPrice = costBasis;
    }

    const retailTarget = retailPrice - adjustmentsTotal - offContractTotal;
    const retailFactor = costBasis > 0 ? retailTarget / costBasis : 1;
    const overrideItems = allItems(costBreakdown).filter((item) => getRetailOverride(item) !== null);
    const overrideCostBasis = overrideItems.reduce((sum, item) => sum + (item.total ?? 0), 0);
    const overrideRetailTotal = overrideItems.reduce((sum, item) => sum + (getRetailOverride(item) || 0), 0);
    const remainingCostBasis = costBasis - overrideCostBasis;
    const adjustedRetailFactor =
      remainingCostBasis > 0
        ? (retailTarget - overrideRetailTotal) / remainingCostBasis
        : retailFactor;
    const safeAdjustedRetailFactor = Number.isFinite(adjustedRetailFactor)
      ? adjustedRetailFactor
      : retailFactor;

    let runningRetailTotal = 0;
    const retailRows = baseRows.map((row, idx) => {
      const isLastRow = idx === baseRows.length - 1;
      let retailValue = roundToTwo(row.value * safeAdjustedRetailFactor);
      if (isLastRow) {
        const targetTotal = retailTarget || runningRetailTotal + retailValue;
        const adjustment = roundToTwo(targetTotal - (runningRetailTotal + retailValue));
        retailValue = roundToTwo(retailValue + adjustment);
      }
      runningRetailTotal += retailValue;
      return {
        label: row.label,
        value: retailValue,
      };
    });

    const adjustmentRows = adjustments.map((adjustment, index) => ({
      label: adjustment.name.trim() || `Line Item ${index + 1}`,
      value: adjustment.amount,
    }));
    const offContractRows =
      roundToTwo(offContractTotal) !== 0
        ? [{ label: 'Off Contract Items', value: offContractTotal }]
        : [];
    const combined = [...retailRows, ...offContractRows, ...adjustmentRows];
    const split = Math.ceil(combined.length / 2);

    return {
      left: combined.slice(0, split),
      right: combined.slice(split),
      displayRetailPrice: roundToTwo(retailPrice || (runningRetailTotal + adjustmentsTotal + offContractTotal)),
    };
  }, [costBreakdown, pricing, proposal]);
  const maxColumnRows = Math.max(rows.left.length, rows.right.length);

  return (
    <div className="breakdown-export-cost-sheet">
      <header className="breakdown-export-cost-header">
        <div>
          <p className="breakdown-export-eyebrow">Job Cost Summary</p>
          <h2 className="breakdown-export-title">Proposal and Specifications</h2>
          <p className="breakdown-export-subtitle">
            Prepared for: <span>{customerName || 'N/A'}</span>
          </p>
        </div>
        <div className="breakdown-export-logo">
          <FranchiseLogo alt="Franchise Logo" franchiseId={franchiseId} />
        </div>
      </header>

      <div className="breakdown-export-table-grid">
        {[rows.left, rows.right].map((column, index) => (
          <div className="breakdown-export-column" key={`cost-col-${index}`}>
            {Array.from({ length: maxColumnRows }).map((_, rowIndex) => {
              const row = column[rowIndex];
              return (
                <div
                  className={`breakdown-export-row${row ? '' : ' breakdown-export-row--empty'}`}
                  key={`${index}-${row?.label || `empty-${rowIndex}`}`}
                >
                  <span className="breakdown-export-row-label">{row ? `${row.label}:` : '\u00A0'}</span>
                  <span className="breakdown-export-row-value">{row ? formatCurrency(row.value) : '\u00A0'}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="breakdown-export-total">
        <span>RETAIL PRICE:</span>
        <span>{formatCurrency(rows.displayRetailPrice)}</span>
      </div>
    </div>
  );
}

export function BreakdownWarrantyExportPage({ proposal }: WarrantyExportProps) {
  const franchiseId = proposal?.franchiseId;
  const customerName = (proposal?.customerInfo?.customerName || '').trim();
  const { displayName } = useFranchiseAppName(franchiseId);
  const sections = useMemo(
    () => resolveWarrantySections(proposal, displayName),
    [displayName, proposal]
  );

  return (
    <div className="breakdown-export-warranty-sheet">
      <header className="breakdown-export-warranty-header">
        <div>
          <p className="breakdown-export-eyebrow">Warranty &amp; Inclusions Overview</p>
          <h2 className="breakdown-export-title">Warranty &amp; Inclusions</h2>
          <p className="breakdown-export-subtitle">
            Prepared for: <span>{customerName || 'N/A'}</span>
          </p>
        </div>
        <div className="breakdown-export-logo">
          <FranchiseLogo alt="Franchise Logo" franchiseId={franchiseId} />
        </div>
      </header>

      <div className="breakdown-export-warranty-list">
        {!sections.length && (
          <section className="breakdown-export-warranty-card">
            <div className="breakdown-export-warranty-card-body">
              <div className="breakdown-export-advantage-chip muted">No warranty categories configured.</div>
            </div>
          </section>
        )}
        {sections.map((section) => {
          return (
            <section className="breakdown-export-warranty-card" key={section.id || section.title}>
              <div className="breakdown-export-warranty-card-header">
                <h3>{section.title}</h3>
                <span>Warranty Advantage</span>
              </div>
              <div className="breakdown-export-warranty-card-body">
                <ul className="breakdown-export-feature-list">
                  {section.featureItems.map((item, index) => (
                    <li key={item.id || `${section.title}-${index}`}>
                      <div className="breakdown-export-feature-label">{item.label}</div>
                      {item.detail && <div className="breakdown-export-feature-detail">{item.detail}</div>}
                    </li>
                  ))}
                </ul>
                <div className="breakdown-export-advantage-list">
                  {section.advantageItems.length > 0 ? (
                    section.advantageItems.map((item, index) => (
                      <div className="breakdown-export-advantage-chip" key={item.id || `${section.title}-adv-${index}`}>
                        {item.text}
                      </div>
                    ))
                  ) : (
                    <div className="breakdown-export-advantage-chip muted">
                      No {displayName} advantages listed.
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
