// Customer Information
export interface CustomerInfo {
  customerName: string;
  city: string;
  address?: string;
  phone?: string;
  email?: string;
}

// Pool Specifications
export interface PoolSpecs {
  poolType: 'fiberglass' | 'concrete' | 'vinyl';
  poolModel?: string; // e.g., "Small Fiberglass Caesar"
  length: number;
  width: number;
  depth: number;
  shape?: string;
  basePrice: number;
}

// Excavation
export interface Excavation {
  excavationType: string;
  difficulty: 'easy' | 'medium' | 'hard';
  accessConcerns: string[];
  cost: number;
}

// Plumbing
export interface Plumbing {
  pipeType: string;
  pipeLength: number;
  fittings: string[];
  laborHours: number;
  cost: number;
}

// Tile, Coping, and Decking
export interface TileCopingDecking {
  tileType?: string;
  tileArea?: number;
  copingType: string;
  copingLength: number;
  deckingType: string;
  deckingArea: number;
  cost: number;
}

// Drainage
export interface Drainage {
  drainType: string;
  drainCount: number;
  pipingLength: number;
  cost: number;
}

// Equipment Item
export interface EquipmentItem {
  category: 'pump' | 'filter' | 'cleaner' | 'heater' | 'other';
  name: string;
  model: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// Equipment
export interface Equipment {
  items: EquipmentItem[];
  totalCost: number;
}

// Water Features
export interface WaterFeature {
  type: 'deck-jet' | 'bubbler' | 'wok-pot' | 'waterfall' | 'fountain' | 'other';
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface WaterFeatures {
  features: WaterFeature[];
  totalCost: number;
}

// Custom Features
export interface CustomFeature {
  name: string;
  description: string;
  cost: number;
}

export interface CustomFeatures {
  features: CustomFeature[];
  totalCost: number;
}

// Masonry
export interface Masonry {
  wallType?: string;
  wallArea?: number;
  fireplaceIncluded: boolean;
  outdoorKitchen: boolean;
  cost: number;
}

// Interior Finish
export interface InteriorFinish {
  finishType: string; // plaster, pebble, tile, etc.
  color: string;
  area: number;
  cost: number;
}

// Complete Proposal
export interface Proposal {
  id?: number;
  proposalNumber: string;
  createdDate: string;
  lastModified: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';

  customerInfo: CustomerInfo;
  poolSpecs: PoolSpecs;
  excavation: Excavation;
  plumbing: Plumbing;
  tileCopingDecking: TileCopingDecking;
  drainage: Drainage;
  equipment: Equipment;
  waterFeatures: WaterFeatures;
  customFeatures: CustomFeatures;
  masonry: Masonry;
  interiorFinish: InteriorFinish;

  // Calculated fields
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalCost: number;

  notes?: string;
}

// Database reference tables types
export interface PoolModel {
  id: number;
  type: string;
  model: string;
  length: number;
  width: number;
  depth: number;
  basePrice: number;
}

export interface ExcavationRate {
  id: number;
  difficulty: string;
  pricePerCubicYard: number;
}

export interface PlumbingRate {
  id: number;
  pipeType: string;
  pricePerFoot: number;
}

export interface TileRate {
  id: number;
  type: string;
  pricePerSquareFoot: number;
}

export interface CopingRate {
  id: number;
  type: string;
  pricePerLinearFoot: number;
}

export interface DeckingRate {
  id: number;
  type: string;
  pricePerSquareFoot: number;
}

export interface EquipmentCatalog {
  id: number;
  category: string;
  name: string;
  model: string;
  price: number;
}

export interface WaterFeatureCatalog {
  id: number;
  type: string;
  name: string;
  price: number;
}

export interface FinishRate {
  id: number;
  type: string;
  pricePerSquareFoot: number;
}
