import pricingData from './pricingData';
import {
  loadPricingModel as loadPricingModelRemote,
  loadDefaultFranchisePricing,
  savePricingModel as savePricingModelRemote,
} from './pricingModelsAdapter';
import { ensureMasonryFacingCatalogs } from '../utils/masonryFacing';

type PricingData = typeof pricingData;
type PricingLoadState = {
  franchiseId: string;
  pricing: PricingData;
  pricingModelId: string | null;
  pricingModelName: string | null;
  pricingModelFranchiseId: string | null;
  isDefault: boolean;
};

const STORAGE_VERSION = '2025-03-interior-finish-catalog';
const LEGACY_STORAGE_KEY = `pricingDataOverrides-${STORAGE_VERSION}`;
const DEFAULT_FRANCHISE_ID = 'default';

let loadingPromise: Promise<void> | null = null;
let latestLoadRequestId = 0;
let activeFranchiseId = DEFAULT_FRANCHISE_ID;
let activePricingModelId: string | null = null;
let activePricingModelName: string | null = null;
let activePricingModelFranchiseId: string | null = null;
let activePricingModelIsDefault = true;
const defaultSnapshot: PricingData = deepClone(pricingData);
let pricingState: PricingData = deepClone(pricingData);
const listeners = new Set<(data: PricingData) => void>();

function normalizePricingState(snapshot: PricingData, source?: any): PricingData {
  const normalized = deepClone(snapshot);
  ensureMasonryFacingCatalogs(normalized, source, defaultSnapshot);
  syncLegacyFiberglassPricing(normalized, source);
  syncLegacyMiscPricing(normalized, source);
  return normalized;
}

function syncLegacyFiberglassPricing(target: PricingData, source?: any) {
  const legacyFiberglass = source?.fiberglass;
  if (!legacyFiberglass || typeof legacyFiberglass !== 'object') {
    return;
  }

  const targetFiberglass = (target as any).fiberglass;
  if (!targetFiberglass || typeof targetFiberglass !== 'object') {
    return;
  }

  const hasSourcePoolModels = ['small', 'medium', 'large'].some((size) =>
    Array.isArray(legacyFiberglass?.poolModels?.[size])
  );

  if (!hasSourcePoolModels && Array.isArray(legacyFiberglass.models)) {
    const nextPoolModels: Record<'small' | 'medium' | 'large', any[]> = {
      small: [],
      medium: [],
      large: [],
    };

    legacyFiberglass.models.forEach((model: any) => {
      const size = String(model?.size || '').trim();
      if (size !== 'small' && size !== 'medium' && size !== 'large') {
        return;
      }

      const seededDefaults = Array.isArray(targetFiberglass.poolModels?.[size]) ? targetFiberglass.poolModels[size][0] : null;
      nextPoolModels[size].push({
        name: model?.name || '',
        shellPrice: Number(model?.price) || 0,
        freight: Number(seededDefaults?.freight) || 0,
        crane: Number(seededDefaults?.crane) || 0,
        install: Number(seededDefaults?.install) || 0,
        gravel: Number(seededDefaults?.gravel) || 0,
      });
    });

    targetFiberglass.poolModels = nextPoolModels;
  }

  const hasSourceSpaOptions = Array.isArray(legacyFiberglass.spaOptions);
  if (!hasSourceSpaOptions) {
    const legacySpaOptions = Array.isArray(legacyFiberglass.spaModels)
      ? legacyFiberglass.spaModels
      : Array.isArray(legacyFiberglass.spas)
        ? legacyFiberglass.spas
        : [];

    if (legacySpaOptions.length > 0) {
      targetFiberglass.spaOptions = legacySpaOptions.map((option: any) => ({
        name: option?.name || '',
        price: Number(option?.price) || 0,
      }));
    }
  }

  if (
    (!Array.isArray(legacyFiberglass.finishUpgrades) || legacyFiberglass.finishUpgrades.length === 0) &&
    Number.isFinite(Number(legacyFiberglass.crystite))
  ) {
    targetFiberglass.finishUpgrades = [
      {
        name: 'Crystite',
        price: Number(legacyFiberglass.crystite) || 0,
      },
    ];
  }

  if (!Number.isFinite(Number(legacyFiberglass.shellTaxRate)) && Number.isFinite(Number(legacyFiberglass.taxRate))) {
    targetFiberglass.shellTaxRate = Number(legacyFiberglass.taxRate) || 0;
  }
}

function syncLegacyMiscPricing(target: PricingData, source?: any) {
  const configuredWaterTruck = source?.misc?.waterTruck;
  const legacyWaterTruck = source?.interiorFinish?.waterTruck;
  const resolvedWaterTruck = configuredWaterTruck ?? legacyWaterTruck;

  if (resolvedWaterTruck && typeof resolvedWaterTruck === 'object') {
    target.misc.waterTruck = mergeDeep(target.misc.waterTruck ?? {}, resolvedWaterTruck);
  }

  if (target.interiorFinish?.waterTruck && target.misc?.waterTruck) {
    target.interiorFinish.waterTruck = deepClone(target.misc.waterTruck);
  }

  const configuredWarranty = source?.misc?.startup?.fiveYearWarranty;
  const legacyWarranty = source?.misc?.startup?.premium;
  const resolvedWarranty =
    typeof configuredWarranty === 'number' && Number.isFinite(configuredWarranty)
      ? configuredWarranty
      : typeof legacyWarranty === 'number' && Number.isFinite(legacyWarranty)
        ? legacyWarranty
        : undefined;

  if (resolvedWarranty !== undefined) {
    target.misc.startup.fiveYearWarranty = resolvedWarranty;
    target.misc.startup.premium = resolvedWarranty;
  }
}

function getLocalStorageKey(franchiseId: string) {
  return `pricingDataOverrides-${franchiseId}-${STORAGE_VERSION}`;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function setDeep(target: any, path: (string | number)[], value: any) {
  if (!path.length) return;
  let cursor = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (cursor[key] === undefined || cursor[key] === null) {
      cursor[key] = typeof path[i + 1] === 'number' ? [] : {};
    }
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
}

function getDeep(target: any, path: (string | number)[]) {
  return path.reduce((acc, key) => (acc ? acc[key] : undefined), target);
}

function syncBaseFromSnapshot(snapshot: PricingData) {
  // Replace pricingData contents so existing references see updated values
  Object.keys(pricingData).forEach((key) => {
    // @ts-expect-error dynamic delete
    delete pricingData[key];
  });
  Object.entries(snapshot).forEach(([key, value]) => {
    // @ts-expect-error dynamic assign
    pricingData[key] = deepClone(value);
  });
}

function syncBaseFromState() {
  syncBaseFromSnapshot(pricingState);
}

function mergeDeep(target: any, source: any): any {
  if (typeof source !== 'object' || source === null) return source;
  const output = Array.isArray(target) ? [...target] : { ...target };
  Object.keys(source).forEach((key) => {
    const sourceVal = source[key];
    if (Array.isArray(sourceVal)) {
      output[key] = sourceVal.map((item: any, index: number) => {
        if (typeof item === 'object' && item !== null && Array.isArray(output[key])) {
          return mergeDeep(output[key][index], item);
        }
        return deepClone(item);
      });
    } else if (typeof sourceVal === 'object' && sourceVal !== null) {
      output[key] = mergeDeep(output[key] ?? {}, sourceVal);
    } else {
      output[key] = sourceVal;
    }
  });
  return output;
}

async function resolveTargetFranchiseId(franchiseId?: string) {
  let targetId = franchiseId || DEFAULT_FRANCHISE_ID;
  if (!franchiseId && window?.electron?.getActiveFranchise) {
    try {
      const active = await window.electron.getActiveFranchise();
      if (active?.id) {
        targetId = active.id;
      }
    } catch (error) {
      console.warn('Unable to read active franchise from database:', error);
    }
  }
  return targetId;
}

async function fetchPersistedPricing(franchiseId: string): Promise<{
  pricing: PricingData | null;
  pricingModelId: string | null;
  pricingModelName: string | null;
  pricingModelFranchiseId: string | null;
  isDefault: boolean;
}> {
  try {
    const result = await loadDefaultFranchisePricing(franchiseId);
    if (result?.pricing) {
      return {
        pricing: result.pricing as PricingData,
        pricingModelId: result.pricingModelId || null,
        pricingModelName: result.pricingModelName || null,
        pricingModelFranchiseId: result.pricingModelId ? result.franchiseId || franchiseId : null,
        isDefault: Boolean(result.isDefault),
      };
    }
  } catch (error) {
    console.warn('Unable to load franchise pricing from database:', error);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const key = getLocalStorageKey(franchiseId);
      let raw = localStorage.getItem(key);
      if (!raw && franchiseId === DEFAULT_FRANCHISE_ID) {
        raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
          localStorage.setItem(key, raw);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      }
      if (raw) {
        return {
          pricing: JSON.parse(raw),
          pricingModelId: null,
          pricingModelName: null,
          pricingModelFranchiseId: null,
          isDefault: true,
        };
      }
    }
  } catch (error) {
    console.warn('Unable to load saved pricing data overrides:', error);
  }

  return {
    pricing: null,
    pricingModelId: null,
    pricingModelName: null,
    pricingModelFranchiseId: null,
    isDefault: true,
  };
}

function notify() {
  const snapshot = getPricingDataSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

async function resolvePricingState(
  franchiseId: string,
  pricingModelId?: string,
  pricingModelFranchiseId?: string
): Promise<PricingLoadState> {
  try {
    if (pricingModelId) {
      const sourceFranchiseId = pricingModelFranchiseId || franchiseId;
      const result = await loadPricingModelRemote(sourceFranchiseId, pricingModelId);
      if (result?.pricing) {
        return {
          franchiseId,
          pricing: normalizePricingState(
            mergeDeep(defaultSnapshot, result.pricing ?? {}),
            result.pricing
          ),
          pricingModelId: result.pricingModelId || pricingModelId,
          pricingModelName: result.pricingModelName || null,
          pricingModelFranchiseId: result.franchiseId || sourceFranchiseId,
          isDefault: Boolean(result.isDefault),
        };
      }
    }
  } catch (error) {
    console.warn('Unable to load specific pricing model:', error);
  }

  const saved = await fetchPersistedPricing(franchiseId);
  return {
    franchiseId,
    pricing: normalizePricingState(mergeDeep(defaultSnapshot, saved.pricing ?? {}), saved.pricing),
    pricingModelId: saved.pricingModelId,
    pricingModelName: saved.pricingModelName,
    pricingModelFranchiseId: saved.pricingModelFranchiseId,
    isDefault: saved.isDefault,
  };
}

function applyPricingState(state: PricingLoadState) {
  pricingState = state.pricing;
  activeFranchiseId = state.franchiseId;
  activePricingModelId = state.pricingModelId;
  activePricingModelName = state.pricingModelName;
  activePricingModelFranchiseId = state.pricingModelFranchiseId;
  activePricingModelIsDefault = state.isDefault;
  syncBaseFromState();
  notify();
}

async function loadPricingForFranchise(
  franchiseId: string,
  pricingModelId?: string,
  pricingModelFranchiseId?: string
) {
  const requestId = ++latestLoadRequestId;
  const resolved = await resolvePricingState(franchiseId, pricingModelId, pricingModelFranchiseId);
  if (requestId !== latestLoadRequestId) {
    return resolved;
  }
  applyPricingState(resolved);
  return resolved;
}

export async function initPricingDataStore(
  franchiseId?: string,
  pricingModelId?: string,
  pricingModelFranchiseId?: string
) {
  if (loadingPromise && !franchiseId && !pricingModelId && !pricingModelFranchiseId) return loadingPromise;

  const currentPromise = (async () => {
    const targetId = await resolveTargetFranchiseId(franchiseId);
    await loadPricingForFranchise(targetId, pricingModelId, pricingModelFranchiseId);
  })();

  loadingPromise = currentPromise;
  try {
    await currentPromise;
  } finally {
    if (loadingPromise === currentPromise) {
      loadingPromise = null;
    }
  }
}

export function getActiveFranchiseId() {
  return activeFranchiseId;
}

export async function setActiveFranchiseId(franchiseId: string) {
  const targetId = franchiseId || DEFAULT_FRANCHISE_ID;
  if (window?.electron?.setActiveFranchise) {
    try {
      await window.electron.setActiveFranchise(targetId);
    } catch (error) {
      console.warn('Unable to set active franchise in database:', error);
    }
  }
  await loadPricingForFranchise(targetId);
}

export function getActivePricingModelMeta() {
  return {
    pricingModelId: activePricingModelId,
    pricingModelName: activePricingModelName,
    pricingModelFranchiseId: activePricingModelFranchiseId,
    isDefault: activePricingModelIsDefault,
  };
}

export async function setActivePricingModel(pricingModelId: string, pricingModelFranchiseId?: string) {
  if (!pricingModelId) return;
  await loadPricingForFranchise(activeFranchiseId, pricingModelId, pricingModelFranchiseId);
}

export async function loadPricingSnapshotForFranchise(
  franchiseId?: string,
  pricingModelId?: string,
  pricingModelFranchiseId?: string
) {
  const targetId = await resolveTargetFranchiseId(franchiseId);
  const resolved = await resolvePricingState(targetId, pricingModelId, pricingModelFranchiseId);
  return {
    ...resolved,
    pricing: deepClone(resolved.pricing),
  };
}

export function withTemporaryPricingSnapshot<T>(snapshot: PricingData, callback: () => T): T {
  const previousSnapshot = getPricingDataSnapshot();
  syncBaseFromSnapshot(snapshot);
  try {
    return callback();
  } finally {
    syncBaseFromSnapshot(previousSnapshot);
  }
}

export function clearActivePricingModelMeta() {
  activePricingModelId = null;
  activePricingModelName = null;
  activePricingModelFranchiseId = null;
  activePricingModelIsDefault = false;
}

export async function savePricingModelSnapshot(options: {
  name: string;
  setDefault?: boolean;
  isHiddenFromView?: boolean;
  updatedBy?: string | null;
  createNew?: boolean;
}) {
  return savePricingModelRemote({
    franchiseId: activeFranchiseId,
    pricing: pricingState,
    version: STORAGE_VERSION,
    name: options.name,
    pricingModelId: options.createNew ? undefined : activePricingModelId || undefined,
    setDefault: options.setDefault ?? false,
    isHiddenFromView: options.isHiddenFromView ?? false,
    updatedBy: options.updatedBy ?? null,
    createNew: options.createNew ?? false,
  });
}

export function getPricingDataSnapshot(): PricingData {
  return deepClone(pricingState);
}

export function updatePricingValue(path: (string | number)[], value: any) {
  setDeep(pricingState, path, value);
  setDeep(pricingData as any, path, deepClone(value));

  const pathKey = path.join('.');
  if (pathKey.startsWith('misc.waterTruck.')) {
    const legacyPath = ['interiorFinish', 'waterTruck', path[path.length - 1] as string];
    setDeep(pricingState, legacyPath, value);
    setDeep(pricingData as any, legacyPath, deepClone(value));
  }
  if (pathKey === 'misc.startup.fiveYearWarranty') {
    const legacyPath = ['misc', 'startup', 'premium'];
    setDeep(pricingState, legacyPath, value);
    setDeep(pricingData as any, legacyPath, deepClone(value));
  }

  notify();
}

export function updatePricingListItem(
  path: (string | number)[],
  index: number,
  key: string,
  value: any
) {
  const list = getDeep(pricingState, path);
  if (!Array.isArray(list) || !list[index]) return;
  const updated = { ...list[index], [key]: value };
  const nextList = [...list];
  nextList[index] = updated;
  setDeep(pricingState, path, nextList);
  setDeep(pricingData as any, path, deepClone(nextList));
  notify();
}

export function addPricingListItem(path: (string | number)[], item: any) {
  const list = getDeep(pricingState, path) || [];
  const nextList = [...list, item];
  setDeep(pricingState, path, nextList);
  setDeep(pricingData as any, path, deepClone(nextList));
  notify();
}

export function removePricingListItem(path: (string | number)[], index: number) {
  const list = getDeep(pricingState, path);
  if (!Array.isArray(list)) return;
  const nextList = list.filter((_: any, i: number) => i !== index);
  setDeep(pricingState, path, nextList);
  setDeep(pricingData as any, path, deepClone(nextList));
  notify();
}

export function resetPricingData() {
  pricingState = normalizePricingState(deepClone(defaultSnapshot), defaultSnapshot);
  syncBaseFromState();
  notify();
}

export function subscribeToPricingData(listener: (data: PricingData) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
