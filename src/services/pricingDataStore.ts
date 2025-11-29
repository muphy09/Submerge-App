import pricingData from './pricingData';
import {
  loadPricingModel as loadPricingModelRemote,
  loadDefaultFranchisePricing,
  savePricingModel as savePricingModelRemote,
} from './pricingModelsAdapter';

type PricingData = typeof pricingData;

const STORAGE_VERSION = '2025-02-water-features-catalog';
const LEGACY_STORAGE_KEY = `pricingDataOverrides-${STORAGE_VERSION}`;
const DEFAULT_FRANCHISE_ID = 'default';

let initialized = false;
let loadingPromise: Promise<void> | null = null;
let activeFranchiseId = DEFAULT_FRANCHISE_ID;
let activePricingModelId: string | null = null;
let activePricingModelName: string | null = null;
let activePricingModelIsDefault = true;
const defaultSnapshot: PricingData = deepClone(pricingData);
let pricingState: PricingData = deepClone(pricingData);
const listeners = new Set<(data: PricingData) => void>();

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

function syncBaseFromState() {
  // Replace pricingData contents so existing references see updated values
  Object.keys(pricingData).forEach((key) => {
    // @ts-expect-error dynamic delete
    delete pricingData[key];
  });
  Object.entries(pricingState).forEach(([key, value]) => {
    // @ts-expect-error dynamic assign
    pricingData[key] = deepClone(value);
  });
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

async function fetchPersistedPricing(franchiseId: string): Promise<PricingData | null> {
  try {
    const result = await loadDefaultFranchisePricing(franchiseId);
    if (result?.pricing) {
      activePricingModelId = result.pricingModelId || null;
      activePricingModelName = result.pricingModelName || null;
      activePricingModelIsDefault = Boolean(result.isDefault);
      return result.pricing as PricingData;
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
        return JSON.parse(raw);
      }
    }
  } catch (error) {
    console.warn('Unable to load saved pricing data overrides:', error);
  }

  return null;
}

function notify() {
  const snapshot = getPricingDataSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

async function loadPricingForFranchise(franchiseId: string, pricingModelId?: string) {
  try {
    if (pricingModelId) {
      const result = await loadPricingModelRemote(franchiseId, pricingModelId);
      if (result?.pricing) {
        pricingState = mergeDeep(defaultSnapshot, result.pricing ?? {});
        activeFranchiseId = franchiseId;
        activePricingModelId = result.pricingModelId || pricingModelId;
        activePricingModelName = result.pricingModelName || null;
        activePricingModelIsDefault = Boolean(result.isDefault);
        syncBaseFromState();
        notify();
        return;
      }
    }
  } catch (error) {
    console.warn('Unable to load specific pricing model:', error);
  }

  const saved = await fetchPersistedPricing(franchiseId);
  pricingState = mergeDeep(defaultSnapshot, saved ?? {});
  activeFranchiseId = franchiseId;
  syncBaseFromState();
  notify();
}

export async function initPricingDataStore(franchiseId?: string, pricingModelId?: string) {
  if (loadingPromise && !franchiseId && !pricingModelId) return loadingPromise;
  initialized = true;

  loadingPromise = (async () => {
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
    await loadPricingForFranchise(targetId, pricingModelId);
  })();

  return loadingPromise;
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
    isDefault: activePricingModelIsDefault,
  };
}

export async function setActivePricingModel(pricingModelId: string) {
  if (!pricingModelId) return;
  await loadPricingForFranchise(activeFranchiseId, pricingModelId);
}

export function clearActivePricingModelMeta() {
  activePricingModelId = null;
  activePricingModelName = null;
  activePricingModelIsDefault = false;
}

export async function savePricingModelSnapshot(options: {
  name: string;
  setDefault?: boolean;
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
  pricingState = deepClone(defaultSnapshot);
  syncBaseFromState();
  notify();
}

export function subscribeToPricingData(listener: (data: PricingData) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
