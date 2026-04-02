import pricingData from '../services/pricingData';

export type FiberglassCatalogSize = 'small' | 'medium' | 'large';

export interface FiberglassPoolModel {
  id?: string;
  name: string;
  shellPrice: number;
  freight: number;
  crane: number;
  install: number;
  gravel: number;
}

export interface FiberglassNamedPriceOption {
  id?: string;
  name: string;
  price: number;
}

type FiberglassPricingSource = {
  fiberglass?: {
    poolModels?: Partial<Record<FiberglassCatalogSize, FiberglassPoolModel[]>>;
    spaOptions?: FiberglassNamedPriceOption[];
    tanningLedgeOptions?: FiberglassNamedPriceOption[];
    finishUpgrades?: FiberglassNamedPriceOption[];
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
