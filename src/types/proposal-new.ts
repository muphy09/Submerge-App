// ============================================================================
// ENHANCED PROPOSAL TYPES - Matching Excel Functionality
// ============================================================================

// Customer Information
export interface CustomerInfo {
  customerName: string;
  city: string;
  address?: string;
  phone?: string;
  email?: string;
  county?: 'MECK' | 'NC' | string; // For tax rate calculations (MECK: 2.5%, NC other: 4.75%)
}

// ============================================================================
// POOL SPECIFICATIONS
// ============================================================================

export type PoolType = 'gunite' | 'fiberglass';
export type FiberglassSize = 'small' | 'medium' | 'large' | 'crystite';
export type SpaType = 'none' | 'gunite' | 'fiberglass';
export type SpaShape = 'round' | 'square';
export type FiberglassModelSize = 'small' | 'medium' | 'large';
export type FiberglassCraneOption = 'no-crane' | 'crane-small' | 'crane-medium' | 'crane-large';

export interface PoolSpecs {
  // Pool Type
  poolType: PoolType;

  // Fiberglass specific
  fiberglassSize?: FiberglassSize;
  fiberglassModelName?: string;
  fiberglassModelPrice?: number;
  fiberglassPerimeter?: number;
  fiberglassCraneOption?: FiberglassCraneOption;

  // Gunite pool dimensions
  perimeter: number; // LNFT
  surfaceArea: number; // SQFT
  shallowDepth: number; // FT
  endDepth: number; // FT
  maxWidth: number; // FT
  maxLength: number; // FT

  // Features
  totalStepsAndBench: number; // LNFT
  hasTanningShelf: boolean;

  // Spa
  spaType: SpaType;
  spaLength: number;
  spaWidth: number;
  spaShape: SpaShape;
  spaPerimeter: number; // Auto-calculated
  spaFiberglassModelName?: string;
  spaFiberglassModelPrice?: number;
  isRaisedSpa: boolean; // +18"
  raisedSpaFacing: 'none' | 'tile' | 'ledgestone' | 'stacked-stone';
  hasSpillover: boolean;

  // Decking
  deckingArea: number; // SQFT

  // Travel
  travelDistance: number; // MILES
  poolToStreetDistance: number; // 0, 1 (251-300ft), 2 (300-350ft)

  // Options
  hasSiltFence: boolean;
  hasAutomaticCover: boolean;
  waterfallCount?: number;

  // Calculated
  approximateGallons: number; // Auto-calculated
}

// ============================================================================
// EXCAVATION
// ============================================================================

export interface RBBLevel {
  height: 6 | 12 | 18 | 24 | 30 | 36;
  length: number; // LNFT
  facing: 'none' | 'tile' | 'panel-ledge' | 'stacked-stone';
}

export interface ColumnSpec {
  count: number;
  width: number; // FT
  depth: number; // FT
  height: number; // FT
  facing: 'none' | 'tile' | 'panel-ledge' | 'stacked-stone';
}

export interface Excavation {
  // RBB (Raised Bond Beam)
  rbbLevels: RBBLevel[];
  totalRBBSqft: number; // Auto-calculated

  // Columns
  columns: ColumnSpec;

  // Additional work
  additionalSitePrepHours: number;
  hasGravelInstall: boolean;
  hasDirtHaul: boolean;
  additionalBench: number; // Auto-calculated from steps > 20

  // Double curtain
  doubleCurtainLength: number; // LNFT

  // Soil/Engineering
  needsSoilSampleEngineer: boolean;

  // Retaining walls
  retainingWallType?: string;
  retainingWallLength?: number; // LNFT

  // Calculated costs
  cost: number;
}

// ============================================================================
// PLUMBING
// ============================================================================

export interface PlumbingRuns {
  // Core runs
  skimmerRun: number; // Total all skimmers (LNFT)
  additionalSkimmers: number; // (1) is included
  mainDrainRun: number; // Main drain to EQ (LNFT)
  cleanerRun: number; // Pool center to EQ (LNFT)
  autoFillRun: number; // Hose bibb to AWL (LNFT)

  // Water features
  waterFeature1Run: number; // LNFT
  waterFeature2Run: number; // LNFT
  waterFeature3Run: number; // LNFT
  waterFeature4Run: number; // LNFT

  // In-floor cleaning
  infloorValveToEQ: number; // LNFT
  infloorValveToPool: number; // LNFT

  // Gas and Spa
  gasRun: number; // Meter to heater (LNFT)
  spaRun: number; // Spa to EQ (LNFT)

  // Electrical (shared run lengths injected from electrical section)
  electricalRun?: number; // House panel to EQ (LNFT)
  lightRun?: number; // Lights to EQ (LNFT)
}

export interface Plumbing {
  runs: PlumbingRuns;
  cost: number; // Auto-calculated
}

// ============================================================================
// ELECTRICAL
// ============================================================================

export interface ElectricalRuns {
  electricalRun: number; // House panel to EQ (LNFT)
  lightRun: number; // All lights to EQ (LNFT)
  heatPumpElectricalRun: number; // Total run (LNFT)
}

export interface Electrical {
  runs: ElectricalRuns;
  cost: number; // Auto-calculated
}

// ============================================================================
// TILE, COPING, DECKING
// ============================================================================

export type TileLevel = 1 | 2 | 3;
export type CopingType = 'cantilever' | 'flagstone' | 'paver' | 'travertine-level1' | 'travertine-level2' | 'concrete';
export type DeckingType = 'paver' | 'travertine-level1' | 'travertine-level2' | 'concrete';

export interface TileCopingDecking {
  // Tile
  tileLevel: TileLevel;
  additionalTileLength: number; // LNFT for spillway or infinity edge
  hasTrimTileOnSteps: boolean; // Gunite pools only

  // Coping
  copingType: CopingType;
  copingLength: number; // Auto-calculated from perimeter

  // Decking
  deckingType: DeckingType;
  deckingArea: number; // SQFT
  concreteStepsLength: number; // LNFT

  // Specialty details
  bullnoseLnft?: number; // Regular bullnose (single)
  doubleBullnoseLnft?: number; // Double bullnose travertine (treated same rate as bullnose)
  spillwayLnft?: number;
  rockworkPanelLedgeSqft?: number;
  rockworkPanelLedgeMaterialSqft?: number; // Allow explicit material overage entry
  rockworkStackedStoneSqft?: number;
  rockworkTileSqft?: number;

  // Options
  hasRoughGrading: boolean; // Keep unless deck is off contract

  // Calculated
  cost: number;
}

// ============================================================================
// DRAINAGE
// ============================================================================

export interface Drainage {
  downspoutTotalLF: number;
  deckDrainTotalLF: number;
  frenchDrainTotalLF: number;
  boxDrainTotalLF: number;
  cost: number; // Auto-calculated
}

// ============================================================================
// EQUIPMENT
// ============================================================================

export interface PumpSelection {
  name: string;
  model: string;
  price: number;
}

export interface FilterSelection {
  name: string;
  sqft: number;
  price: number;
}

export interface CleanerSelection {
  name: string;
  price: number;
}

export interface HeaterSelection {
  name: string;
  btu: number;
  price: number;
  isVersaFlo: boolean;
}

export interface AutomationSelection {
  name: string;
  price: number;
  zones: number; // Additional zones beyond base
  hasChemistry: boolean;
}

export interface SaltSystemSelection {
  name: string;
  model: string;
  price: number;
}

export interface Equipment {
  // Main equipment
  pump: PumpSelection;
  auxiliaryPump?: PumpSelection; // Deprecated: use auxiliaryPumps
  auxiliaryPumps?: PumpSelection[]; // Optional auxiliary pumps (up to 2)
  filter: FilterSelection;
  filterQuantity?: number;
  cleaner: CleanerSelection;
  cleanerQuantity?: number; // Excel NEW POOL B119 qty (0 to exclude cleaner)
  heater: HeaterSelection;
  heaterQuantity?: number;
  upgradeToVersaFlo: boolean;

  // Lights
  numberOfLights: number; // Base 2 included
  hasSpaLight: boolean;

  // Automation
  automation: AutomationSelection;
  automationQuantity?: number;

  // Salt system
  saltSystem?: SaltSystemSelection;

  // Accessories
  hasBlanketReel: boolean;
  hasSolarBlanket: boolean;
  hasAutoFill: boolean;
  hasHandrail: boolean;
  hasStartupChemicals: boolean;

  // Calculated
  totalCost: number;
  hasBeenEdited?: boolean;
}

// ============================================================================
// WATER FEATURES
// ============================================================================

export interface WaterFeatureSelection {
  featureId: string;
  quantity: number;
}

export interface WaterFeatures {
  selections: WaterFeatureSelection[];

  // Calculated
  totalCost: number;
}

// ============================================================================
// CUSTOM FEATURES
// ============================================================================

export interface CustomFeature {
  name: string;
  description: string;
  laborCost: number;
  materialCost: number;
  totalCost: number;
}

export interface CustomFeatures {
  features: CustomFeature[]; // Up to 7 custom features
  totalCost: number;
}

// ============================================================================
// MASONRY
// ============================================================================

export interface Masonry {
  // From excavation column data
  columnCost: number;

  // RBB facing costs
  rbbFacingCost: number;

  // Raised spa facing cost
  raisedSpaFacingCost: number;

  // Calculated
  totalCost: number;
}

// ============================================================================
// INTERIOR FINISH
// ============================================================================

export type InteriorFinishType =
  | 'pebble-tec-l1'
  | 'pebble-tec-l2'
  | 'pebble-tec-l3'
  | 'pebble-sheen-l1'
  | 'pebble-sheen-l2'
  | 'pebble-sheen-l3'
  | 'pebble-fina-l1'
  | 'pebble-fina-l2'
  | 'pebble-brilliance'
  | 'pebble-breeze';

export interface InteriorFinish {
  finishType: InteriorFinishType;
  color: string;
  surfaceArea: number; // Auto-calculated from pool specs
  hasSpa: boolean;
  hasWaterproofing?: boolean; // Optional waterproofing line item
  cost: number; // Auto-calculated
}

// ============================================================================
// DETAILED COST BREAKDOWN
// ============================================================================

export interface CostLineItem {
  category: string;
  description: string;
  unitPrice: number;
  quantity: number;
  total: number;
  notes?: string;
}

export interface CostBreakdown {
  plansAndEngineering: CostLineItem[];
  layout: CostLineItem[];
  permit: CostLineItem[];
  excavation: CostLineItem[];
  plumbing: CostLineItem[];
  gas: CostLineItem[];
  steel: CostLineItem[];
  electrical: CostLineItem[];
  shotcreteLabor: CostLineItem[];
  shotcreteMaterial: CostLineItem[];
  tileLabor: CostLineItem[];
  tileMaterial: CostLineItem[];
  copingDeckingLabor: CostLineItem[];
  copingDeckingMaterial: CostLineItem[];
  stoneRockworkLabor: CostLineItem[];
  stoneRockworkMaterial: CostLineItem[];
  drainage: CostLineItem[];
  equipmentOrdered: CostLineItem[];
  equipmentSet: CostLineItem[];
  waterFeatures: CostLineItem[];
  cleanup: CostLineItem[];
  interiorFinish: CostLineItem[];
  waterTruck: CostLineItem[];
  fiberglassShell: CostLineItem[];
  fiberglassInstall: CostLineItem[];
  startupOrientation: CostLineItem[]; // NEW
  customFeatures: CostLineItem[]; // NEW

  // Totals by category
  totals: {
    plansAndEngineering: number;
    layout: number;
    permit: number;
    excavation: number;
    plumbing: number;
    gas: number;
    steel: number;
    electrical: number;
    shotcreteLabor: number;
    shotcreteMaterial: number;
    tileLabor: number;
    tileMaterial: number;
    copingDeckingLabor: number;
    copingDeckingMaterial: number;
    stoneRockworkLabor: number;
    stoneRockworkMaterial: number;
    drainage: number;
    equipmentOrdered: number;
    equipmentSet: number;
    waterFeatures: number;
    cleanup: number;
    interiorFinish: number;
    waterTruck: number;
    fiberglassShell: number;
    fiberglassInstall: number;
    customFeatures: number; // NEW - custom features total
    startupOrientation: number; // NEW - startup/orientation total
    grandTotal: number;
  };
}

// ============================================================================
// PAP DISCOUNT CONFIGURATION
// ============================================================================

export interface PAPDiscounts {
  excavation: number; // percentage (e.g., 0.10 for 10%)
  plumbing: number;
  steel: number;
  electrical: number;
  shotcrete: number;
  tileCopingLabor: number;
  tileCopingMaterial: number;
  equipment: number;
  interiorFinish: number;
  startup: number;
}

// ============================================================================
// PRICING & PROFIT CALCULATIONS
// ============================================================================

export interface PricingCalculations {
  // Cost calculations
  totalCostsBeforeOverhead: number; // Sum of all cost sections
  overheadMultiplier: number; // Default 1.01 (1% overhead)
  totalCOGS: number; // totalCostsBeforeOverhead × overheadMultiplier

  // Retail price calculation
  targetMargin: number; // Default 0.70 (70% - meaning 30% profit)
  baseRetailPrice: number; // CEILING(totalCOGS / targetMargin, 10)
  g3UpgradeCost: number; // $1,250 if Crystite G3 selected, else $0
  discountAmount: number; // Manual discount (negative number)
  retailPrice: number; // baseRetailPrice + g3UpgradeCost + discountAmount

  // Commissions & Fees (calculated from retailPrice)
  digCommissionRate: number; // Default 0.0275 (2.75%)
  digCommission: number; // retailPrice × digCommissionRate
  adminFeeRate: number; // Default 0.029 (2.9%)
  adminFee: number; // retailPrice × adminFeeRate
  closeoutCommissionRate: number; // Default 0.0275 (2.75%)
  closeoutCommission: number; // retailPrice × closeoutCommissionRate

  // Final profit
  grossProfit: number; // retailPrice - totalCOGS - digCommission - adminFee - closeoutCommission
  grossProfitMargin: number; // grossProfit / retailPrice (as percentage)
}

// ============================================================================
// COMPLETE PROPOSAL
// ============================================================================

export interface Proposal {
  id?: number;
  proposalNumber: string;
  createdDate: string;
  lastModified: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';

  // Main sections
  customerInfo: CustomerInfo;
  poolSpecs: PoolSpecs;
  excavation: Excavation;
  plumbing: Plumbing;
  electrical: Electrical;
  tileCopingDecking: TileCopingDecking;
  drainage: Drainage;
  equipment: Equipment;
  waterFeatures: WaterFeatures;
  customFeatures: CustomFeatures;
  masonry: Masonry;
  interiorFinish: InteriorFinish;

  // Detailed breakdown (like COST - NEW sheet)
  costBreakdown: CostBreakdown;

  // PAP Discount Configuration
  papDiscounts?: PAPDiscounts;

  // Pricing & Profit Calculations (NEW - matching Excel)
  pricing: PricingCalculations;

  // Legacy fields (for backward compatibility)
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalCost: number;

  notes?: string;
}
