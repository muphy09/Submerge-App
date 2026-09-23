import pricingData from '../services/pricingData';

export type FiberglassCatalogSize = 'small' | 'medium' | 'large';

export interface FiberglassSpecifications {
  widthFeet?: number;
  widthInches?: number;
  lengthFeet?: number;
  lengthInches?: number;
  shallowDepthFeet?: number;
  shallowDepthInches?: number;
  deepDepthFeet?: number;
  deepDepthInches?: number;
  surfaceArea?: number;
  perimeter?: number;
  gallons?: number;
  stepsAndBench?: number;
}

const isMeasurement = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export const feetAndInches = (feet: number, inches: number): number =>
  Math.round((feet + inches / 12) * 10000) / 10000;

export const hasCompleteFiberglassSpecifications = (
  specs?: FiberglassSpecifications,
  pool = false
): specs is FiberglassSpecifications => {
  if (!specs) return false;
  const dimensions = [
    specs.widthFeet, specs.widthInches, specs.lengthFeet, specs.lengthInches,
    specs.shallowDepthFeet, specs.shallowDepthInches,
    specs.deepDepthFeet, specs.deepDepthInches,
  ];
  return dimensions.every(isMeasurement) &&
    [specs.widthInches, specs.lengthInches, specs.shallowDepthInches, specs.deepDepthInches]
      .every((value) => Number(value) < 12) &&
    feetAndInches(Number(specs.widthFeet), Number(specs.widthInches)) > 0 &&
    feetAndInches(Number(specs.lengthFeet), Number(specs.lengthInches)) > 0 &&
    feetAndInches(Number(specs.shallowDepthFeet), Number(specs.shallowDepthInches)) > 0 &&
    feetAndInches(Number(specs.deepDepthFeet), Number(specs.deepDepthInches)) > 0 &&
    isMeasurement(specs.surfaceArea) && specs.surfaceArea > 0 &&
    isMeasurement(specs.perimeter) && specs.perimeter > 0 &&
    isMeasurement(specs.gallons) && specs.gallons > 0 &&
    (!pool || isMeasurement(specs.stepsAndBench));
};

export const formatFiberglassSize = (specs?: FiberglassSpecifications): string => {
  if (!specs || !isMeasurement(specs.widthFeet) || !isMeasurement(specs.widthInches) ||
    !isMeasurement(specs.lengthFeet) || !isMeasurement(specs.lengthInches)) return '—';
  return `${specs.widthFeet}'${specs.widthInches}" × ${specs.lengthFeet}'${specs.lengthInches}"`;
};

export interface FiberglassPoolModel {
  id?: string;
  name: string;
  shellPrice: number;
  freight: number;
  crane: number;
  install: number;
  gravel: number;
  discountPercent?: number;
  specifications?: FiberglassSpecifications;
}

export interface FiberglassNamedPriceOption {
  id?: string;
  name: string;
  price: number;
  crane?: number;
  spilloverPrice?: number;
  specifications?: FiberglassSpecifications;
}

type FiberglassPricingSource = {
  fiberglass?: {
    poolModels?: Partial<Record<FiberglassCatalogSize, FiberglassPoolModel[]>>;
    spaOptions?: FiberglassNamedPriceOption[];
    tanningLedgeOptions?: FiberglassNamedPriceOption[];
    finishUpgrades?: FiberglassNamedPriceOption[];
    spillover?: number;
  };
};

export const FIBERGLASS_MODEL_SIZES: FiberglassCatalogSize[] = ['small', 'medium', 'large'];

export const normalizeFiberglassSize = (value?: string | null): FiberglassCatalogSize | undefined =>
  value === 'small' || value === 'medium' || value === 'large' ? value : undefined;

export const getFiberglassPoolModelsBySize = (
  size: FiberglassCatalogSize,
  source: FiberglassPricingSource = pricingData
): FiberglassPoolModel[] => {
  const models = source?.fiberglass?.poolModels?.[size];
  return Array.isArray(models) ? models : [];
};

export const getAllFiberglassPoolModels = (
  source: FiberglassPricingSource = pricingData
): Array<FiberglassPoolModel & { size: FiberglassCatalogSize }> =>
  FIBERGLASS_MODEL_SIZES.flatMap((size) =>
    getFiberglassPoolModelsBySize(size, source).map((model) => ({
      ...model,
      size,
    }))
  );

export const findFiberglassPoolModel = (
  modelName?: string | null,
  size?: string | null,
  source: FiberglassPricingSource = pricingData
): (FiberglassPoolModel & { size: FiberglassCatalogSize }) | undefined => {
  const normalizedSize = normalizeFiberglassSize(size);
  if (normalizedSize && modelName) {
    const scopedMatch = getFiberglassPoolModelsBySize(normalizedSize, source).find(
      (model) => model.name === modelName
    );
    if (scopedMatch) {
      return { ...scopedMatch, size: normalizedSize };
    }
  }

  if (!modelName) {
    return undefined;
  }

  return getAllFiberglassPoolModels(source).find((model) => model.name === modelName);
};

export const getFiberglassNamedOptions = (
  optionType: 'spaOptions' | 'tanningLedgeOptions' | 'finishUpgrades',
  source: FiberglassPricingSource = pricingData
): FiberglassNamedPriceOption[] => {
  const options = source?.fiberglass?.[optionType];
  return Array.isArray(options) ? options : [];
};

export const findFiberglassNamedOption = (
  optionType: 'spaOptions' | 'tanningLedgeOptions' | 'finishUpgrades',
  optionName?: string | null,
  source: FiberglassPricingSource = pricingData
): FiberglassNamedPriceOption | undefined =>
  getFiberglassNamedOptions(optionType, source).find((option) => option.name === optionName);

const hasOwnSpilloverPrice = (option?: FiberglassNamedPriceOption | null) =>
  Boolean(option) && Object.prototype.hasOwnProperty.call(option, 'spilloverPrice');

export const hasConfiguredFiberglassSpaSpilloverPricing = (
  source: FiberglassPricingSource = pricingData
): boolean => getFiberglassNamedOptions('spaOptions', source).some((option) => hasOwnSpilloverPrice(option));

export const getFiberglassSpaSpilloverSelectedPrice = (
  option?: FiberglassNamedPriceOption | null,
  source: FiberglassPricingSource = pricingData
): number | undefined => {
  if (!option) return undefined;

  if (hasOwnSpilloverPrice(option)) {
    const configured = Number(option.spilloverPrice);
    return Number.isFinite(configured) && configured > 0 ? configured : undefined;
  }

  if (hasConfiguredFiberglassSpaSpilloverPricing(source)) {
    return undefined;
  }

  const basePrice = Number(option.price);
  const legacySpillover = Number(source?.fiberglass?.spillover);
  if (!Number.isFinite(basePrice) || !Number.isFinite(legacySpillover) || legacySpillover <= 0) {
    return undefined;
  }

  return basePrice + legacySpillover;
};

export const fiberglassSpaOptionSupportsSpillover = (
  option?: FiberglassNamedPriceOption | null,
  source: FiberglassPricingSource = pricingData
): boolean => {
  const selectedPrice = getFiberglassSpaSpilloverSelectedPrice(option, source);
  return Number.isFinite(selectedPrice) && Number(selectedPrice) > 0;
};
