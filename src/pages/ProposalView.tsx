import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CostLineItem, Proposal } from '../types/proposal-new';
import CostBreakdownView from '../components/CostBreakdownView';
import SubmergeAdvantageWarranty from '../components/SubmergeAdvantageWarranty';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useToast } from '../components/Toast';
import './ProposalView.css';
import MasterPricingEngine from '../services/masterPricingEngine';
import { getProposal as getProposalRemote } from '../services/proposalsAdapter';

function ProposalView() {
  const navigate = useNavigate();
  const { proposalNumber } = useParams();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCustomerBreakdown, setShowCustomerBreakdown] = useState(false);
  const [showCogsBreakdown, setShowCogsBreakdown] = useState(false);
  const [showWarrantyBreakdown, setShowWarrantyBreakdown] = useState(false);
  const proposalRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (proposalNumber) {
      loadProposal(proposalNumber);
    }
  }, [proposalNumber]);

  const loadProposal = async (num: string) => {
    try {
      const data = await getProposalRemote(num);
      setProposal(data);
    } catch (error) {
      console.error('Failed to load proposal:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    navigate(`/proposal/edit/${proposalNumber}`);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    if (!proposalRef.current || !proposal) return;

    try {
      const canvas = await html2canvas(proposalRef.current, {
        scale: 2,
        logging: false,
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 10;

      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`Pool_Proposal_${proposal.proposalNumber}.pdf`);
    } catch (error) {
      console.error('Failed to export PDF:', error);
      showToast({ type: 'error', message: 'Failed to export PDF. Please try again.' });
    }
  };

  const handleBuildComparison = () => {
    showToast({ type: 'info', message: 'Build Comparison will be available soon.' });
  };

  const handleBuildForCustomer = () => {
    showToast({ type: 'info', message: 'Build for Customer will be available soon.' });
  };

  const formatCurrency = (value: number): string =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);

  const formatNumber = (value: number | undefined, suffix?: string): string => {
    if (!Number.isFinite(value)) return 'N/A';
    const num = value ?? 0;
    const formatted = num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return suffix ? `${formatted} ${suffix}` : formatted;
  };

  if (loading) {
    return (
      <div className="proposal-view">
        <div className="loading-container">Loading proposal...</div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="proposal-view">
        <div className="error-container">
          <h2>Proposal not found</h2>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  let calculated: ReturnType<typeof MasterPricingEngine.calculateCompleteProposal> | null = null;
  try {
    calculated = MasterPricingEngine.calculateCompleteProposal(proposal, proposal.papDiscounts);
  } catch (error) {
    console.error('Failed to recalculate proposal for view:', error);
  }

  const costBreakdownForDisplay = calculated?.costBreakdown || proposal.costBreakdown;
  const subtotal = calculated?.subtotal ?? proposal.subtotal ?? 0;
  const totalCost = calculated?.totalCost ?? proposal.totalCost ?? 0;
  const pricing = calculated?.pricing ?? proposal.pricing;
  const retailPrice = pricing?.retailPrice ?? totalCost ?? subtotal ?? 0;
  const totalCOGS =
    pricing?.totalCOGS ??
    costBreakdownForDisplay?.totals?.grandTotal ??
    totalCost ??
    subtotal ??
    0;
  const grossMargin =
    pricing?.grossProfitMargin ??
    (retailPrice > 0 ? ((retailPrice - totalCOGS) / retailPrice) * 100 : 0);
  const papDiscountTotal = costBreakdownForDisplay
    ? Object.entries(costBreakdownForDisplay).reduce((sum, [key, value]) => {
        if (key === 'totals') return sum;
        if (Array.isArray(value)) {
          const papSum = value.reduce((innerSum, item) => {
            const description = (item.description || '').toString().toLowerCase();
            return description.includes('pap discount') ? innerSum + (item.total ?? 0) : innerSum;
          }, 0);
          return sum + papSum;
        }
        return sum;
      }, 0)
    : 0;

  const overheadMultiplier = pricing?.overheadMultiplier ?? 1.01;
  const targetMargin = pricing?.targetMargin ?? 0.7;
  const costsBeforePapDiscounts = (pricing?.totalCostsBeforeOverhead ?? subtotal ?? 0) - papDiscountTotal;
  const baseRetailPriceBeforePap =
    Math.ceil(((costsBeforePapDiscounts * overheadMultiplier) / targetMargin) / 10) * 10;
  const g3UpgradeCost = pricing?.g3UpgradeCost ?? 1250;
  const retailPriceBeforeDiscounts = baseRetailPriceBeforePap + g3UpgradeCost;
  const retailSalePrice = retailPrice;
  const totalSavings = retailPriceBeforeDiscounts - retailSalePrice;
  const totalSavingsPercent = retailPriceBeforeDiscounts > 0 ? (totalSavings / retailPriceBeforeDiscounts) * 100 : 0;

  const displayNumber = proposal.proposalNumber.replace('PROP-', '');
  const submissionDate = new Date(
    proposal.createdDate || proposal.lastModified || Date.now()
  ).toLocaleDateString();

  const customerLocation = proposal.customerInfo.city
    ? `${proposal.customerInfo.customerName} (${proposal.customerInfo.city})`
    : proposal.customerInfo.customerName;

  const proposalStatus = proposal.status ? proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1) : 'Draft';
  const dateModified = new Date(proposal.lastModified || Date.now()).toLocaleDateString();

  // Designer name - using a placeholder for now, update with actual field when available
  const designerName = 'Design Team';

  // Get the pricing model used for this proposal
  const priceModel = proposal.pricingModelName || 'No Pricing Model';
  const isPriceModelActive = proposal.pricingModelIsDefault ?? false;
  const isPriceModelRemoved = (proposal.pricingModelName || '').toLowerCase().includes('removed');
  const priceModelStatus = isPriceModelRemoved ? 'removed' : isPriceModelActive ? 'active' : 'inactive';

  const poolTypeLabel =
    proposal.poolSpecs.poolType === 'gunite'
      ? 'Gunite (Custom)'
      : proposal.poolSpecs.fiberglassModelName
      ? `Fiberglass - ${proposal.poolSpecs.fiberglassModelName}`
      : 'Fiberglass';

  const approximateGallons = Number.isFinite(proposal.poolSpecs.approximateGallons)
    ? proposal.poolSpecs.approximateGallons.toLocaleString('en-US')
    : 'N/A';

  const maxWidth = formatNumber(proposal.poolSpecs.maxWidth, 'ft');
  const maxLength = formatNumber(proposal.poolSpecs.maxLength, 'ft');
  const shallowDepth = formatNumber(proposal.poolSpecs.shallowDepth, 'ft');
  const endDepth = formatNumber(proposal.poolSpecs.endDepth, 'ft');
  const spaLength = formatNumber(proposal.poolSpecs.spaLength, 'ft');
  const spaWidth = formatNumber(proposal.poolSpecs.spaWidth, 'ft');

  const costLineItems: { name: string; items: CostLineItem[] }[] = costBreakdownForDisplay
    ? [
        { name: 'Plans & Engineering', items: costBreakdownForDisplay.plansAndEngineering },
        { name: 'Layout', items: costBreakdownForDisplay.layout },
        { name: 'Permit', items: costBreakdownForDisplay.permit },
        { name: 'Excavation', items: costBreakdownForDisplay.excavation },
        { name: 'Plumbing', items: costBreakdownForDisplay.plumbing },
        { name: 'Gas', items: costBreakdownForDisplay.gas },
        { name: 'Steel', items: costBreakdownForDisplay.steel },
        { name: 'Electrical', items: costBreakdownForDisplay.electrical },
        {
          name: 'Shotcrete',
          items: [...costBreakdownForDisplay.shotcreteLabor, ...costBreakdownForDisplay.shotcreteMaterial],
        },
        {
          name: 'Tile',
          items: [...costBreakdownForDisplay.tileLabor, ...costBreakdownForDisplay.tileMaterial],
        },
        {
          name: 'Coping/Decking',
          items: [
            ...costBreakdownForDisplay.copingDeckingLabor,
            ...costBreakdownForDisplay.copingDeckingMaterial,
          ],
        },
        {
          name: 'Stone/Rockwork',
          items: [
            ...costBreakdownForDisplay.stoneRockworkLabor,
            ...costBreakdownForDisplay.stoneRockworkMaterial,
          ],
        },
        { name: 'Drainage', items: costBreakdownForDisplay.drainage },
        { name: 'Equipment Ordered', items: costBreakdownForDisplay.equipmentOrdered },
        { name: 'Equipment Set', items: costBreakdownForDisplay.equipmentSet },
        { name: 'Water Features', items: costBreakdownForDisplay.waterFeatures },
        { name: 'Cleanup', items: costBreakdownForDisplay.cleanup },
        { name: 'Interior Finish', items: costBreakdownForDisplay.interiorFinish },
        { name: 'Water Truck', items: costBreakdownForDisplay.waterTruck },
        { name: 'Fiberglass Shell', items: costBreakdownForDisplay.fiberglassShell },
        { name: 'Fiberglass Install', items: costBreakdownForDisplay.fiberglassInstall },
        { name: 'Startup/Orientation', items: costBreakdownForDisplay.startupOrientation },
        { name: 'Custom Features', items: costBreakdownForDisplay.customFeatures },
      ].filter((category) => (category.items || []).length > 0)
    : [];

  const categoryTotal = (items: CostLineItem[] = []): number =>
    items.reduce((sum, item) => sum + (item.total ?? 0), 0);

  const renderQuantity = (item: CostLineItem): string => {
    const isTaxLine = (item.description || '').toLowerCase().includes('tax');
    if (isTaxLine) return '';
    return (item.quantity ?? 0).toLocaleString('en-US', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  };

  return (
    <div className="proposal-view">
      <div className="view-actions no-print">
        <div className="action-bar">
          <div className="action-bar-left">
            <button className="action-button" onClick={() => navigate('/')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 13L5 8L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back to Home
            </button>
            <button className="action-button" onClick={handleEdit}>
              Edit Proposal
            </button>
          </div>
          <div className="action-bar-right">
            <button className="action-button" onClick={handlePrint}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6V2h8v4M4 11H2V7h12v4h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="4" y="10" width="8" height="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Print
            </button>
            <button className="action-button" onClick={handleExportPDF}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 2H3v12h10V6M9 2v4h4M9 2l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Export PDF
            </button>
            <button className="action-button dropdown">
              Multi-select Quick Export
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button className="action-button primary" onClick={handleBuildComparison}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="9" y="2" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              Build Comparison
            </button>
            <button className="action-button primary" onClick={handleBuildForCustomer}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M3 13c0-2.5 2-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Build for Customer
            </button>
          </div>
        </div>
      </div>

      <div ref={proposalRef} className="proposal-summary-page">
        <h1 className="page-title">Proposal Summary</h1>

        <div className="hero-card">
          <div className="hero-header">
            <div className="hero-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2.5c-1.5 0-3 1.5-4 3.5-1 2-2 4-2 6 0 3.3 2.7 6 6 6s6-2.7 6-6c0-2-1-4-2-6-1-2-2.5-3.5-4-3.5z" fill="currentColor"/>
              </svg>
            </div>
            <div className="hero-header-text">
              <h2 className="hero-title">
                {customerLocation} - {proposalStatus} {dateModified}
              </h2>
            </div>
            <div
              className={`hero-price-model ${priceModelStatus}`}
              data-tooltip={
                priceModelStatus === 'active'
                  ? 'Pricing Model is Current'
                  : priceModelStatus === 'removed'
                  ? 'Pricing Model was removed; please select another'
                  : 'Pricing Model is not active, consider changing'
              }
              aria-label={
                priceModelStatus === 'active'
                  ? 'Pricing Model is Current'
                  : priceModelStatus === 'removed'
                  ? 'Pricing Model was removed; please select another'
                  : 'Pricing Model is not active, consider changing'
              }
            >
              {priceModel}{priceModelStatus === 'active' ? ' (Active)' : ''}
            </div>
          </div>

          <div className="hero-grid">
            <div className="hero-line">
              <span className="hero-label">Pool Type:</span>
              <span>{poolTypeLabel}</span>
            </div>
            <div className="hero-line">
              <span className="hero-label">Approximate Gallons:</span>
              <span>{approximateGallons}</span>
            </div>
            <div className="hero-line">
              <span className="hero-label">Max Width:</span>
              <span>{maxWidth}</span>
            </div>
            <div className="hero-line">
              <span className="hero-label">Max Length:</span>
              <span>{maxLength}</span>
            </div>
            <div className="hero-line">
              <span className="hero-label">Shallow Depth:</span>
              <span>{shallowDepth}</span>
            </div>
            <div className="hero-line">
              <span className="hero-label">End Depth:</span>
              <span>{endDepth}</span>
            </div>
            <div className="hero-line">
              <span className="hero-label">Spa Length:</span>
              <span>{spaLength}</span>
            </div>
            <div className="hero-line">
              <span className="hero-label">Spa Width:</span>
              <span>{spaWidth}</span>
            </div>
          </div>

          <div className="hero-total">
            <strong>Total Retail Value:</strong> {formatCurrency(retailPrice || subtotal || totalCost)}
          </div>
        </div>

        <div className="tiles-grid">
          <button className="summary-tile customer-tile" type="button" onClick={() => setShowCustomerBreakdown(true)}>
            <div className="tile-header">
              <div className="tile-icon customer-icon">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M4 16c0-3 2.5-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="tile-header-text">
                <p className="tile-title">Customer<br/>Breakdown</p>
              </div>
            </div>
            <div className="tile-content-box">
              <div className="tile-metrics">
                <div className="metric-row">
                  <p className="metric-label">Retail Price:</p>
                  <p className="metric-value">{formatCurrency(retailPriceBeforeDiscounts)}</p>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <p className="metric-label">Retail Sale Price:</p>
                  <p className="metric-value">{formatCurrency(retailSalePrice)}</p>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <p className="metric-label">Total Savings:</p>
                  <p className="metric-value">{formatCurrency(totalSavings)}</p>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <p className="metric-label">Total Savings %:</p>
                  <p className="metric-value">
                    {Number.isFinite(totalSavingsPercent) ? `${totalSavingsPercent.toFixed(1)}%` : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
            <span className="tile-link">
              View Detailed Breakdown
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 11L11 3M11 3H5M11 3V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>

          <button className="summary-tile" type="button" onClick={() => setShowCogsBreakdown(true)}>
            <div className="tile-header">
              <div className="tile-icon cogs-icon">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 3h8M7 7h6M7 13h6M6 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M10 3v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </div>
              <div className="tile-header-text">
                <p className="tile-title">COGS Breakdown</p>
              </div>
            </div>
            <div className="tile-content-box">
              <div className="tile-metrics">
                <div className="metric-row">
                  <p className="metric-label">Total Cost:</p>
                  <p className="metric-value">{formatCurrency(totalCOGS)}</p>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <p className="metric-label">Gross Margin:</p>
                  <p className="metric-value">
                    {Number.isFinite(grossMargin) ? `${grossMargin.toFixed(1)}%` : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
            <span className="tile-link">
              View Detailed Breakdown
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 11L11 3M11 3H5M11 3V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>

          <button className="summary-tile" type="button" onClick={() => setShowCogsBreakdown(true)}>
            <div className="tile-header">
              <div className="tile-icon pre-icon">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7 10h6M10 7v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M15 5l2-2M3 17l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="tile-header-text">
                <p className="tile-title">Pre 1% COGS<br/>Breakdown</p>
              </div>
            </div>
            <div className="tile-content-box">
              <div className="tile-metrics">
                <div className="metric-row">
                  <p className="metric-label">Starting Cost:</p>
                  <p className="metric-value">{formatCurrency(totalCOGS * 0.99)}</p>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <p className="metric-label">Pre-1% Margin:</p>
                  <p className="metric-value">
                    {Number.isFinite(grossMargin) ? `${(grossMargin + 1).toFixed(1)}%` : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
            <span className="tile-link">
              View Detailed Breakdown
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 11L11 3M11 3H5M11 3V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>

          <button className="summary-tile warranty-tile" type="button" onClick={() => setShowWarrantyBreakdown(true)}>
            <div className="tile-header">
              <div className="tile-icon warranty-icon">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 2L3 5v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V5l-7-3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="tile-header-text">
                <p className="tile-title">Warranty<br/>Breakdown</p>
              </div>
            </div>
            <div className="tile-content-box">
              <div className="tile-metrics">
                <div className="metric-row">
                  <p className="metric-label">Coverage:</p>
                  <p className="metric-value">Premier Advantage</p>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <p className="metric-label">Status:</p>
                  <p className="metric-value">Active</p>
                </div>
              </div>
            </div>
            <span className="tile-link">
              View Detailed Breakdown
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 11L11 3M11 3H5M11 3V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>
        </div>
      </div>

      {showCustomerBreakdown && (
        <div className="modal-overlay" onClick={() => setShowCustomerBreakdown(false)}>
          <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Customer Breakdown</p>
                <h2>Job Cost Summary</h2>
              </div>
              <button className="modal-close" onClick={() => setShowCustomerBreakdown(false)} aria-label="Close customer breakdown">
                x
              </button>
            </div>
            <div className="modal-body-scroll">
              <CostBreakdownView
                costBreakdown={costBreakdownForDisplay}
                customerName={proposal.customerInfo.customerName}
                proposal={proposal}
                pricing={pricing}
                showWarranty={false}
                showZoomControl={false}
              />
            </div>
          </div>
        </div>
      )}

      {showCogsBreakdown && (
        <div className="modal-overlay" onClick={() => setShowCogsBreakdown(false)}>
          <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">COGS Breakdown</p>
                <h2>Cost of Goods Detail</h2>
              </div>
              <button className="modal-close" onClick={() => setShowCogsBreakdown(false)} aria-label="Close COGS breakdown">
                x
              </button>
            </div>
            <div className="modal-body-scroll">
              {costLineItems.length === 0 ? (
                <div className="empty-state">No cost breakdown available for this proposal.</div>
              ) : (
                <>
                  {costLineItems.map((category) => (
                    <div className="cogs-category" key={category.name}>
                      <div className="cogs-category-header">
                        <span>{category.name}</span>
                        <span>{formatCurrency(categoryTotal(category.items))}</span>
                      </div>
                      <table className="cogs-table">
                        <thead>
                          <tr>
                            <th>Description</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {category.items.map((item, idx) => (
                            <tr key={`${category.name}-${idx}`}>
                              <td>{item.description}</td>
                              <td>{renderQuantity(item)}</td>
                              <td>{formatCurrency(item.unitPrice)}</td>
                              <td>{formatCurrency(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  <div className="cogs-total">Total COGS: {formatCurrency(totalCOGS)}</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showWarrantyBreakdown && (
        <div className="modal-overlay" onClick={() => setShowWarrantyBreakdown(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Warranty Breakdown</p>
                <h2>Warranty & Inclusions</h2>
              </div>
              <button className="modal-close" onClick={() => setShowWarrantyBreakdown(false)} aria-label="Close warranty breakdown">
                x
              </button>
            </div>
            <div className="modal-body-scroll">
              <SubmergeAdvantageWarranty proposal={proposal} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProposalView;
