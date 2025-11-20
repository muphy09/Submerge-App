import pricingData from './pricingData';

type PricingData = typeof pricingData;

const STORAGE_KEY = 'pricingDataOverrides';

let initialized = false;
const defaultSnapshot: PricingData = deepClone(pricingData);
let pricingState: PricingData = deepClone(pricingData);
const listeners = new Set<(data: PricingData) => void>();

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

function persistState() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pricingState));
  } catch (error) {
    console.warn('Unable to persist pricing data overrides:', error);
  }
}

function notify() {
  const snapshot = getPricingDataSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

export function initPricingDataStore() {
  if (initialized) return;
  initialized = true;

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        pricingState = mergeDeep(defaultSnapshot, saved);
      }
    }
  } catch (error) {
    console.warn('Unable to load saved pricing data overrides:', error);
  }

  syncBaseFromState();
}

export function getPricingDataSnapshot(): PricingData {
  return deepClone(pricingState);
}

export function updatePricingValue(path: (string | number)[], value: any) {
  setDeep(pricingState, path, value);
  setDeep(pricingData as any, path, deepClone(value));
  persistState();
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
  persistState();
  notify();
}

export function addPricingListItem(path: (string | number)[], item: any) {
  const list = getDeep(pricingState, path) || [];
  const nextList = [...list, item];
  setDeep(pricingState, path, nextList);
  setDeep(pricingData as any, path, deepClone(nextList));
  persistState();
  notify();
}

export function removePricingListItem(path: (string | number)[], index: number) {
  const list = getDeep(pricingState, path);
  if (!Array.isArray(list)) return;
  const nextList = list.filter((_: any, i: number) => i !== index);
  setDeep(pricingState, path, nextList);
  setDeep(pricingData as any, path, deepClone(nextList));
  persistState();
  notify();
}

export function resetPricingData() {
  pricingState = deepClone(defaultSnapshot);
  syncBaseFromState();
  persistState();
  notify();
}

export function subscribeToPricingData(listener: (data: PricingData) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
