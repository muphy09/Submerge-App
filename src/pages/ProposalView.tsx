import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CostLineItem, Proposal } from '../types/proposal-new';
import CostBreakdownView from '../components/CostBreakdownView';
import SubmergeAdvantageWarranty from '../components/SubmergeAdvantageWarranty';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useToast } from '../components/Toast';
import './ProposalView.css';
import customerBreakIconImg from '../../docs/img/custbreak.png';
import cogsBreakIconImg from '../../docs/img/cogsbreak.png';
import preCogsBreakIconImg from '../../docs/img/1cogbreak.png';
import summaryIconImg from '../../docs/img/summary.png';
import submergeLogo from '../../Submerge Logo.png';
import MasterPricingEngine from '../services/masterPricingEngine';
import { getProposal as getProposalRemote } from '../services/proposalsAdapter';
import { initPricingDataStore } from '../services/pricingDataStore';
import {
  getDefaultProposal,
  getDefaultPoolSpecs,
  getDefaultExcavation,
  getDefaultPlumbing,
  getDefaultElectrical,
  getDefaultTileCopingDecking,
  getDefaultDrainage,
  getDefaultEquipment,
  getDefaultWaterFeatures,
  getDefaultCustomFeatures,
  getDefaultInteriorFinish,
  getDefaultManualAdjustments,
} from '../utils/proposalDefaults';
import { normalizeEquipmentLighting } from '../utils/lighting';

function ProposalView() {
  const navigate = useNavigate();
  const { proposalNumber } = useParams();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCustomerBreakdown, setShowCustomerBreakdown] = useState(false);
  const [showCogsBreakdown, setShowCogsBreakdown] = useState(false);
  const [showPreCogsBreakdown, setShowPreCogsBreakdown] = useState(false);
  const [showWarrantyBreakdown, setShowWarrantyBreakdown] = useState(false);
  const proposalRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const mergeProposalWithDefaults = (input: Partial<Proposal>): Partial<Proposal> => {
    const base = getDefaultProposal();
    const poolSpecs = { ...getDefaultPoolSpecs(), ...(input.poolSpecs || {}) };
    const mergedEquipment = normalizeEquipmentLighting(
      { ...getDefaultEquipment(), ...(input.equipment || {}) } as any,
      { poolSpecs, hasSpa: poolSpecs.spaType !== 'none' }
    );

    return {
      ...(base as Proposal),
      ...input,
      customerInfo: { ...(base.customerInfo || {}), ...(input.customerInfo || {}) },
      poolSpecs,
      excavation: { ...getDefaultExcavation(), ...(input.excavation || {}) },
      plumbing: { ...getDefaultPlumbing(), ...(input.plumbing || {}) },
      electrical: { ...getDefaultElectrical(), ...(input.electrical || {}) },
      tileCopingDecking: { ...getDefaultTileCopingDecking(), ...(input.tileCopingDecking || {}) },
      drainage: { ...getDefaultDrainage(), ...(input.drainage || {}) },
      equipment: mergedEquipment,
      waterFeatures: { ...getDefaultWaterFeatures(), ...(input.waterFeatures || {}) },
      customFeatures: { ...getDefaultCustomFeatures(), ...(input.customFeatures || {}) },
      interiorFinish: { ...getDefaultInteriorFinish(), ...(input.interiorFinish || {}) },
      manualAdjustments: { ...getDefaultManualAdjustments(), ...(input.manualAdjustments || {}) },
      papDiscounts: input.papDiscounts || (base as any).papDiscounts,
    };
  };

  const loadProposal = async (num: string) => {
    try {
      const data = await getProposalRemote(num);
      const merged = mergeProposalWithDefaults(data || {});
      await initPricingDataStore(merged.franchiseId, merged.pricingModelId || undefined);
      setProposal(merged as Proposal);
    } catch (error) {
      console.error('Failed to load proposal:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (proposalNumber) {
      loadProposal(proposalNumber);
    }
  }, [proposalNumber]);

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
  const digCommission = pricing?.digCommission ?? 0;
  const adminFee = pricing?.adminFee ?? 0;
  const closeoutCommission = pricing?.closeoutCommission ?? 0;
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
  const totalCOGSBeforeOverhead =
    pricing?.totalCostsBeforeOverhead ??
    (overheadMultiplier > 0 ? totalCOGS / overheadMultiplier : totalCOGS);
  const totalCOGSWithoutOverhead = Math.max(totalCOGSBeforeOverhead, 0);
  const overheadReductionFactor =
    totalCOGS > 0 ? Math.min(Math.max(totalCOGSWithoutOverhead / totalCOGS, 0), 1) : 1;
  const preOverheadGrossProfit = retailPrice - totalCOGSWithoutOverhead - digCommission - adminFee - closeoutCommission;
  const overheadDifferential = totalCOGS - totalCOGSWithoutOverhead;
  const preOverheadGrossMarginPercent =
    retailPrice > 0 ? (preOverheadGrossProfit / retailPrice) * 100 : 0;
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

  const costLineItems: { name: string; items: CostLineItem[]; subcategories?: { name: string; items: CostLineItem[] }[] }[] = costBreakdownForDisplay
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
          subcategories: [
            { name: 'Labor', items: costBreakdownForDisplay.shotcreteLabor },
            { name: 'Material', items: costBreakdownForDisplay.shotcreteMaterial },
          ].filter((sub) => sub.items.length > 0),
        },
        {
          name: 'Tile',
          items: [...costBreakdownForDisplay.tileLabor, ...costBreakdownForDisplay.tileMaterial],
          subcategories: [
            { name: 'Labor', items: costBreakdownForDisplay.tileLabor },
            { name: 'Material', items: costBreakdownForDisplay.tileMaterial },
          ].filter((sub) => sub.items.length > 0),
        },
        {
          name: 'Coping/Decking',
          items: [
            ...costBreakdownForDisplay.copingDeckingLabor,
            ...costBreakdownForDisplay.copingDeckingMaterial,
          ],
          subcategories: [
            { name: 'Labor', items: costBreakdownForDisplay.copingDeckingLabor },
            { name: 'Material', items: costBreakdownForDisplay.copingDeckingMaterial },
          ].filter((sub) => sub.items.length > 0),
        },
        {
          name: 'Stone/Rockwork',
          items: [
            ...costBreakdownForDisplay.stoneRockworkLabor,
            ...costBreakdownForDisplay.stoneRockworkMaterial,
          ],
          subcategories: [
            { name: 'Labor', items: costBreakdownForDisplay.stoneRockworkLabor },
            { name: 'Material', items: costBreakdownForDisplay.stoneRockworkMaterial },
          ].filter((sub) => sub.items.length > 0),
        },
        { name: 'Drainage', items: costBreakdownForDisplay.drainage },
        { name: 'Equipment Ordered', items: costBreakdownForDisplay.equipmentOrdered },
        { name: 'Equipment Set', items: costBreakdownForDisplay.equipmentSet },
        { name: 'Cleanup', items: costBreakdownForDisplay.cleanup },
        { name: 'Interior Finish', items: costBreakdownForDisplay.interiorFinish },
        { name: 'Water Truck', items: costBreakdownForDisplay.waterTruck },
        { name: 'Fiberglass Shell', items: costBreakdownForDisplay.fiberglassShell },
        { name: 'Fiberglass Install', items: costBreakdownForDisplay.fiberglassInstall },
        { name: 'Startup/Orientation', items: costBreakdownForDisplay.startupOrientation },
        { name: 'Custom Features', items: costBreakdownForDisplay.customFeatures },
      ].filter((category) => (category.items || []).length > 0)
    : [];

  const adjustItemForNoOverhead = (item: CostLineItem): CostLineItem => ({
    ...item,
    unitPrice: (item.unitPrice ?? 0) * overheadReductionFactor,
    total: (item.total ?? 0) * overheadReductionFactor,
  });

  const preOverheadCostLineItems = costLineItems.map((category) => ({
    ...category,
    items: category.items.map(adjustItemForNoOverhead),
    subcategories: category.subcategories?.map((sub) => ({
      ...sub,
      items: sub.items.map(adjustItemForNoOverhead),
    })),
  }));

  const categoryTotal = (items: CostLineItem[] = []): number =>
    items.reduce((sum, item) => sum + (item.total ?? 0), 0);

  const isTaxLineItem = (item: CostLineItem): boolean =>
    (item.description || '').toLowerCase().includes('tax');

  const renderQuantity = (item: CostLineItem): string => {
    if (isTaxLineItem(item)) return '';
    return (item.quantity ?? 0).toLocaleString('en-US', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  };

  const renderUnitPrice = (item: CostLineItem): string => {
    if (isTaxLineItem(item)) return '';
    return formatCurrency(item.unitPrice);
  };

  const getCategoryClassName = (categoryName: string): string => {
    const classMap: { [key: string]: string } = {
      'Plans & Engineering': 'pool-specs',
      'Excavation': 'excavation',
      'Plumbing': 'plumbing',
      'Electrical': 'electrical',
      'Tile': 'tile',
      'Coping/Decking': 'tile',
      'Drainage': 'drainage',
      'Equipment Ordered': 'equipment',
      'Equipment Set': 'equipment',
      'Interior Finish': 'interior',
      'Fiberglass Shell': 'pool-specs',
      'Fiberglass Install': 'pool-specs',
      'Custom Features': 'custom',
    };
    return classMap[categoryName] || '';
  };

  const getCategoryIcon = (categoryName: string) => {
    const iconMap: { [key: string]: JSX.Element } = {
      'Plans & Engineering': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 3h12c.6 0 1 .4 1 1v12c0 .6-.4 1-1 1H4c-.6 0-1-.4-1-1V4c0-.6.4-1 1-1z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      Layout: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      Permit: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 3h10c.6 0 1 .4 1 1v13c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1V4c0-.6.4-1 1-1z" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M7 7h6M7 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="10" cy="14" r="1.5" fill="currentColor"/>
        </svg>
      ),
      Excavation: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 15h14M5 15L7 8l3 3 3-3 2 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      Plumbing: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 10h4m4 0h4M10 4v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      Gas: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 3v6m-3 3l3-3 3 3M6 13h8v3H6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      Steel: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      Electrical: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 3L6 11h5l-1 6 5-8h-5l1-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      ),
      Shotcrete: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M7 9h6M7 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      Tile: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="11" y="3" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="3" y="11" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="11" y="11" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      'Coping/Decking': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 12h14M3 8h14M3 12v3h14v-3M3 8V5h14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      'Stone/Rockwork': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 15l3-6 4 2 5-7M3 16h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      Drainage: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 3v14m-3-3l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M6 7h8v6H6z" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      'Equipment Ordered': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="5" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M7 9h6M7 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      'Equipment Set': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10 7v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      'Water Features': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 3c-2 2-3 4-3 6 0 1.7 1.3 3 3 3s3-1.3 3-3c0-2-1-4-3-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M4 15h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      Cleanup: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 6V4h6v2M4 6h12M6 6v9c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M8 9v4M12 9v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      'Interior Finish': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 10c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M6 10h8v6H6z" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      'Water Truck': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="6" width="11" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="6" cy="15" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="12" cy="15" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M14 9h2l1 2v2h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      'Fiberglass Shell': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="10" cy="10" rx="7" ry="5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M3 10h14" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      'Fiberglass Install': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 3v6m0 0L7 6m3 3l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <rect x="4" y="11" width="12" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ),
      'Startup/Orientation': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 8l5 2-5 2V8z" fill="currentColor"/>
        </svg>
      ),
      'Custom Features': (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 3l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6l2-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      ),
    };

    return iconMap[categoryName] || (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    );
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
                <img src={summaryIconImg} alt="Proposal summary icon" className="summary-icon" />
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
                <img src={customerBreakIconImg} alt="Customer breakdown icon" className="customer-break-icon" />
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

          <button className="summary-tile cogs-tile" type="button" onClick={() => setShowCogsBreakdown(true)}>
            <div className="tile-header">
              <div className="tile-icon cogs-icon">
                <img src={cogsBreakIconImg} alt="COGS breakdown icon" className="cogs-break-icon" />
              </div>
              <div className="tile-header-text">
                <p className="tile-title">COGS<br/>Breakdown</p>
              </div>
            </div>
            <div className="tile-content-box">
              <div className="tile-metrics">
                <div className="metric-row">
                  <p className="metric-label">Dig Commission:</p>
                  <p className="metric-value">{formatCurrency(pricing?.digCommission ?? 0)}</p>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <p className="metric-label">Admin Fee:</p>
                  <p className="metric-value">{formatCurrency(pricing?.adminFee ?? 0)}</p>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <p className="metric-label">Closeout Commission:</p>
                  <p className="metric-value">{formatCurrency(pricing?.closeoutCommission ?? 0)}</p>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <p className="metric-label">Gross Profit:</p>
                  <p className="metric-value">
                    {formatCurrency(pricing?.grossProfit ?? 0)} ({Number.isFinite(grossMargin) ? `${grossMargin.toFixed(1)}%` : 'N/A'})
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

          <button className="summary-tile pre-tile" type="button" onClick={() => setShowPreCogsBreakdown(true)}>
            <div className="tile-header">
              <div className="tile-icon pre-icon">
                <img src={preCogsBreakIconImg} alt="Pre 1% COGS breakdown icon" className="pre-break-icon" />
              </div>
              <div className="tile-header-text">
                <p className="tile-title">Pre 1% COGS<br/>Breakdown</p>
              </div>
            </div>
            <div className="tile-content-box">
              <div className="tile-metrics">
                <div className="metric-row">
                  <p className="metric-label">-1% Gross Profit:</p>
                  <p className="metric-value">
                    {formatCurrency(preOverheadGrossProfit)} (
                    {Number.isFinite(preOverheadGrossMarginPercent)
                      ? `${preOverheadGrossMarginPercent.toFixed(1)}%`
                      : 'N/A'}
                    )
                  </p>
                </div>
                <div className="metric-divider"></div>
                <div className="metric-row">
                  <p className="metric-label">Overhead Differential:</p>
                  <p className="metric-value">{formatCurrency(overheadDifferential)}</p>
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
                <svg width="32" height="32" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          <div className="modal-content cogs-breakdown-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-button" onClick={() => setShowCogsBreakdown(false)} aria-label="Close COGS breakdown">
              ×
            </button>

            <div className="cogs-header-info">
              <div className="cogs-header-content">
                <div>
                  <p className="cogs-header-eyebrow">COGS Cost Breakdown</p>
                  <h2 className="cogs-header-title">Estimated Cost of Goods Sold</h2>
                  <div className="cogs-header-details">
                    <div className="cogs-header-detail-item">
                      <span className="cogs-header-detail-label">Customer:</span>
                      <span className="cogs-header-detail-value">{proposal.customerInfo.customerName}</span>
                    </div>
                    <div className="cogs-header-detail-item">
                      <span className="cogs-header-detail-label">Date:</span>
                      <span className="cogs-header-detail-value">{new Date(proposal.lastModified || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>
                </div>
                <div className="cogs-header-logo">
                  <img src={submergeLogo} alt="Submerge Logo" />
                </div>
              </div>
            </div>

            <div className="modal-body-scroll">
              {costLineItems.length === 0 ? (
                <div className="empty-state">No cost breakdown available for this proposal.</div>
              ) : (
                <div className="cogs-categories-grid">
                  {costLineItems.map((category) => (
                    <div className={`cogs-category-card ${getCategoryClassName(category.name)}`} key={category.name}>
                      <div className="cogs-category-card-header">
                        <div className="cogs-category-icon">
                          {getCategoryIcon(category.name)}
                        </div>
                        <div className="cogs-category-title-wrapper">
                          <h3 className="cogs-category-title">{category.name}</h3>
                          <div className="cogs-category-total">{formatCurrency(categoryTotal(category.items))}</div>
                        </div>
                      </div>

                      {category.subcategories && category.subcategories.length > 0 ? (
                        <div className="cogs-subcategories">
                          {category.subcategories.map((subcategory) => (
                            <div key={subcategory.name} className="cogs-subcategory">
                              <div className="cogs-subcategory-header">
                                <span className="cogs-subcategory-name">{subcategory.name}</span>
                                <span className="cogs-subcategory-total">
                                  {formatCurrency(categoryTotal(subcategory.items))}
                                </span>
                              </div>
                              <table className="cogs-category-table">
                                <colgroup>
                                  <col style={{ width: '40%' }} />
                                  <col style={{ width: '10%' }} />
                                  <col style={{ width: '25%' }} />
                                  <col style={{ width: '25%' }} />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th>Description</th>
                                    <th>Qty</th>
                                    <th>Unit Price</th>
                                    <th>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {subcategory.items.map((item, idx) => (
                                    <tr key={`${category.name}-${subcategory.name}-${idx}`}>
                                      <td>{item.description}</td>
                                      <td>{renderQuantity(item)}</td>
                                      <td>{renderUnitPrice(item)}</td>
                                      <td>{formatCurrency(item.total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <table className="cogs-category-table">
                          <colgroup>
                            <col style={{ width: '40%' }} />
                            <col style={{ width: '10%' }} />
                            <col style={{ width: '25%' }} />
                            <col style={{ width: '25%' }} />
                          </colgroup>
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
                                <td>{renderUnitPrice(item)}</td>
                                <td>{formatCurrency(item.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {costLineItems.length > 0 && (
                <div className="cogs-footer">
                  <div className="cogs-footer-text">Total COGS: {formatCurrency(totalCOGS)}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPreCogsBreakdown && (
        <div className="modal-overlay" onClick={() => setShowPreCogsBreakdown(false)}>
          <div className="modal-content cogs-breakdown-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-button" onClick={() => setShowPreCogsBreakdown(false)} aria-label="Close pre-COGS breakdown">
              A-
            </button>

            <div className="cogs-header-info">
              <div className="cogs-header-content">
                <div>
                  <p className="cogs-header-eyebrow">PRE OVERHEAD COGS COST BREAKDOWN</p>
                  <h2 className="cogs-header-title">Estimated Cost of Goods Sold (No 1% Overhead)</h2>
                  <div className="cogs-header-details">
                    <div className="cogs-header-detail-item">
                      <span className="cogs-header-detail-label">Customer:</span>
                      <span className="cogs-header-detail-value">{proposal.customerInfo.customerName}</span>
                    </div>
                    <div className="cogs-header-detail-item">
                      <span className="cogs-header-detail-label">Date:</span>
                      <span className="cogs-header-detail-value">{new Date(proposal.lastModified || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>
                </div>
                <div className="cogs-header-logo">
                  <img src={submergeLogo} alt="Submerge Logo" />
                </div>
              </div>
            </div>

            <div className="modal-body-scroll">
              {preOverheadCostLineItems.length === 0 ? (
                <div className="empty-state">No cost breakdown available for this proposal.</div>
              ) : (
                <div className="cogs-categories-grid">
                  {preOverheadCostLineItems.map((category) => (
                    <div className={`cogs-category-card ${getCategoryClassName(category.name)}`} key={category.name}>
                      <div className="cogs-category-card-header">
                        <div className="cogs-category-icon">
                          {getCategoryIcon(category.name)}
                        </div>
                        <div className="cogs-category-title-wrapper">
                          <h3 className="cogs-category-title">{category.name}</h3>
                          <div className="cogs-category-total">{formatCurrency(categoryTotal(category.items))}</div>
                        </div>
                      </div>

                      {category.subcategories && category.subcategories.length > 0 ? (
                        <div className="cogs-subcategories">
                          {category.subcategories.map((subcategory) => (
                            <div key={subcategory.name} className="cogs-subcategory">
                              <div className="cogs-subcategory-header">
                                <span className="cogs-subcategory-name">{subcategory.name}</span>
                                <span className="cogs-subcategory-total">
                                  {formatCurrency(categoryTotal(subcategory.items))}
                                </span>
                              </div>
                              <table className="cogs-category-table">
                                <colgroup>
                                  <col style={{ width: '40%' }} />
                                  <col style={{ width: '10%' }} />
                                  <col style={{ width: '25%' }} />
                                  <col style={{ width: '25%' }} />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th>Description</th>
                                    <th>Qty</th>
                                    <th>Unit Price</th>
                                    <th>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {subcategory.items.map((item, idx) => (
                                    <tr key={`${category.name}-${subcategory.name}-${idx}`}>
                                      <td>{item.description}</td>
                                      <td>{renderQuantity(item)}</td>
                                      <td>{renderUnitPrice(item)}</td>
                                      <td>{formatCurrency(item.total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <table className="cogs-category-table">
                          <colgroup>
                            <col style={{ width: '40%' }} />
                            <col style={{ width: '10%' }} />
                            <col style={{ width: '25%' }} />
                            <col style={{ width: '25%' }} />
                          </colgroup>
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
                                <td>{renderUnitPrice(item)}</td>
                                <td>{formatCurrency(item.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {preOverheadCostLineItems.length > 0 && (
                <div className="cogs-footer">
                  <div className="cogs-footer-text">TOTAL COGS (No 1% Overhead): {formatCurrency(totalCOGSWithoutOverhead)}</div>
                </div>
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
