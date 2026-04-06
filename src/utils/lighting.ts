import pricingData from '../services/pricingData';
import { Equipment, LightSelection, PoolSpecs } from '../types/proposal-new';

type LightType = 'pool' | 'spa';

const getLightOptions = (type: LightType) =>
  (type === 'pool' ? pricingData.equipment.lights.poolLights : pricingData.equipment.lights.spaLights) || [];

const getDefaultLightOption = (type: LightType) => {
  const options = getLightOptions(type);
  if (!options.length) return null;
  return options.find(option => (option as any)?.defaultLightChoice) || options[0];
};

const buildLightSelection = (option: any, type: LightType): LightSelection => ({
  type,
  name: option?.name || '',
  basePrice: (option as any)?.basePrice ?? 0,
  addCost1: (option as any)?.addCost1 ?? 0,
  addCost2: (option as any)?.addCost2 ?? 0,
  price: (option as any)?.price,
});

const hydrateLight = (light: Partial<LightSelection> | undefined, type: LightType): LightSelection | null => {
  const options = getLightOptions(type);
  if (!options.length) return null;
  const match = light?.name ? options.find(opt => opt.name === light.name) : undefined;
  const option = match || getDefaultLightOption(type);
  if (!option) return null;
  return buildLightSelection({ ...option, ...light }, type);
};

const hydrateLightList = (list: Partial<LightSelection>[] | undefined, type: LightType): LightSelection[] =>
  (list || [])
    .map(light => hydrateLight(light, type))
    .filter(Boolean) as LightSelection[];

const hasPoolDefinition = (poolSpecs?: PoolSpecs): boolean => {
  if (!poolSpecs) return false;
  const hasGuniteDimensions =
    (poolSpecs.surfaceArea ?? 0) > 0 ||
    (poolSpecs.perimeter ?? 0) > 0 ||
    ((poolSpecs.maxLength ?? 0) > 0 && (poolSpecs.maxWidth ?? 0) > 0);
  const hasFiberglassSelection =
    poolSpecs.poolType === 'fiberglass' && (!!poolSpecs.fiberglassSize || !!poolSpecs.fiberglassModelName);
  return hasGuniteDimensions || hasFiberglassSelection;
};

export const normalizeEquipmentLighting = (
  equipment: Equipment,
  opts?: { hasPool?: boolean; hasSpa?: boolean; preserveEmpty?: boolean; poolSpecs?: PoolSpecs }
): Equipment => {
  const hasPool = opts?.hasPool ?? hasPoolDefinition(opts?.poolSpecs);
  const hasSpa = opts?.hasSpa ?? (opts?.poolSpecs?.spaType !== 'none');
  const preserveEmpty = opts?.preserveEmpty ?? false;

  const includePoolLightsFlag =
    typeof equipment.includePoolLights === 'boolean'
      ? equipment.includePoolLights
      : (Array.isArray(equipment.poolLights) && equipment.poolLights.length > 0) ||
        Math.max(equipment.numberOfLights ?? 0, 0) > 0;
  const includeSpaLightsFlag =
    typeof equipment.includeSpaLights === 'boolean'
      ? equipment.includeSpaLights
      : (Array.isArray(equipment.spaLights) && equipment.spaLights.length > 0) ||
        Boolean(equipment.hasSpaLight);
  const allowPoolLights = includePoolLightsFlag && hasPool;
  const allowSpaLights = includeSpaLightsFlag && hasSpa;

  let poolLights = hydrateLightList(equipment.poolLights as any, 'pool');
  let spaLights = hydrateLightList(equipment.spaLights as any, 'spa');

  const legacyExtras = Math.max(equipment.numberOfLights ?? 0, 0);
  const needPoolDefaults = allowPoolLights && poolLights.length === 0 && !preserveEmpty;

  if (allowPoolLights && needPoolDefaults) {
    const defaultPoolLight = hydrateLight(undefined, 'pool');
    const total = hasPool ? Math.max(2, legacyExtras + 1) : legacyExtras;
    if (defaultPoolLight && total > 0) {
      poolLights = Array.from({ length: total }, () => ({ ...defaultPoolLight }));
    }
  }

  if (allowPoolLights && legacyExtras > 0 && poolLights.length < legacyExtras + 1) {
    const defaultPoolLight = hydrateLight(undefined, 'pool');
    while (defaultPoolLight && poolLights.length < legacyExtras + 1) {
      poolLights.push({ ...defaultPoolLight });
    }
  }

  if (!allowPoolLights) {
    poolLights = [];
  }

  if (allowSpaLights && spaLights.length === 0 && !preserveEmpty) {
    const defaultSpaLight = hydrateLight(undefined, 'spa');
    if (defaultSpaLight) {
      spaLights = [defaultSpaLight];
    }
  }

  if (!allowSpaLights) {
    spaLights = [];
  }

  return {
    ...equipment,
    includePoolLights: includePoolLightsFlag,
    includeSpaLights: includeSpaLightsFlag,
    poolLights,
    spaLights,
    numberOfLights: allowPoolLights ? Math.max(poolLights.length - 1, 0) : 0,
    hasSpaLight: allowSpaLights && spaLights.length > 0,
  };
};

export const getLightCounts = (equipment?: Equipment) => {
  const poolLights = equipment?.poolLights?.length ?? 0;
  const spaLights = equipment?.spaLights?.length ?? 0;
  return { poolLights, spaLights, total: poolLights + spaLights };
};
