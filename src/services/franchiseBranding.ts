import { getSupabaseClient } from './supabaseClient';
import { isEnvFlagTrue } from './env';

type FranchiseBrandingRecord = {
  logoUrl: string | null;
  appName: string | null;
  updatedAt?: string | null;
  fetchedAt: number;
};

type FranchiseBrandingUpdate = {
  franchiseId: string;
  logoUrl?: string | null;
  appName?: string | null;
  updatedBy?: string | null;
};

const SUPABASE_REQUIRED = isEnvFlagTrue('VITE_SUPABASE_ONLY');
const BRANDING_TABLE = 'franchise_branding';
const BRANDING_STORAGE_PREFIX = 'submerge.franchiseLogo';
const LOGO_UPDATED_EVENT = 'submerge-franchise-logo-updated';
const APP_NAME_UPDATED_EVENT = 'submerge-franchise-app-name-updated';
const BRANDING_CACHE_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_APP_NAME = 'Submerge';

const memoryCache = new Map<string, FranchiseBrandingRecord | null>();
const pendingLoads = new Map<string, Promise<FranchiseBrandingRecord | null>>();

function requireSupabase() {
  if (SUPABASE_REQUIRED) {
    throw new Error('Supabase is required but not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
}

function storageKey(franchiseId: string) {
  return `${BRANDING_STORAGE_PREFIX}.${franchiseId}`;
}

function normalizeLogoUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeAppName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function emitLogoUpdate(franchiseId: string, logoUrl: string | null) {
  if (typeof window === 'undefined' || !window.dispatchEvent) return;
  window.dispatchEvent(
    new CustomEvent(LOGO_UPDATED_EVENT, { detail: { franchiseId, logoUrl } })
  );
}

function emitAppNameUpdate(franchiseId: string, appName: string | null) {
  if (typeof window === 'undefined' || !window.dispatchEvent) return;
  window.dispatchEvent(
    new CustomEvent(APP_NAME_UPDATED_EVENT, { detail: { franchiseId, appName } })
  );
}

export function subscribeToFranchiseLogoUpdates(
  franchiseId: string,
  callback: (logoUrl: string | null) => void
) {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ franchiseId: string; logoUrl: string | null }>).detail;
    if (!detail || detail.franchiseId !== franchiseId) return;
    callback(detail.logoUrl ?? null);
  };
  window.addEventListener(LOGO_UPDATED_EVENT, handler as EventListener);
  return () => window.removeEventListener(LOGO_UPDATED_EVENT, handler as EventListener);
}

export function subscribeToFranchiseAppNameUpdates(
  franchiseId: string,
  callback: (appName: string | null) => void
) {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ franchiseId: string; appName: string | null }>).detail;
    if (!detail || detail.franchiseId !== franchiseId) return;
    callback(detail.appName ?? null);
  };
  window.addEventListener(APP_NAME_UPDATED_EVENT, handler as EventListener);
  return () => window.removeEventListener(APP_NAME_UPDATED_EVENT, handler as EventListener);
}

function persistFranchiseBrandingCache(franchiseId: string, record: FranchiseBrandingRecord | null) {
  memoryCache.set(franchiseId, record);
  if (typeof localStorage === 'undefined') return;
  const key = storageKey(franchiseId);
  try {
    if (!record) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(record));
  } catch (error) {
    console.warn('Unable to persist franchise branding cache:', error);
  }
}

function buildBrandingRecord(raw?: Partial<FranchiseBrandingRecord> | null): FranchiseBrandingRecord {
  return {
    logoUrl: normalizeLogoUrl(raw?.logoUrl),
    appName: normalizeAppName(raw?.appName),
    updatedAt: typeof raw?.updatedAt === 'string' ? raw?.updatedAt : null,
    fetchedAt: typeof raw?.fetchedAt === 'number' ? raw?.fetchedAt : 0,
  };
}

export function getCachedFranchiseBranding(
  franchiseId: string
): FranchiseBrandingRecord | null | undefined {
  if (!franchiseId) return undefined;
  if (memoryCache.has(franchiseId)) {
    return memoryCache.get(franchiseId) ?? null;
  }
  if (typeof localStorage === 'undefined') return undefined;
  const key = storageKey(franchiseId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<FranchiseBrandingRecord> | null;
    if (!parsed) return undefined;
    const record = buildBrandingRecord(parsed);
    memoryCache.set(franchiseId, record);
    return record;
  } catch (error) {
    console.warn('Unable to read franchise branding cache:', error);
    return undefined;
  }
}

export function getCachedFranchiseLogo(
  franchiseId: string
): FranchiseBrandingRecord | null | undefined {
  return getCachedFranchiseBranding(franchiseId);
}

export function getCachedFranchiseAppName(
  franchiseId: string
): string | null | undefined {
  const cached = getCachedFranchiseBranding(franchiseId);
  if (cached === undefined) return undefined;
  return cached?.appName ?? null;
}

function isCacheFresh(record: FranchiseBrandingRecord | null | undefined) {
  if (!record) return false;
  return Date.now() - record.fetchedAt < BRANDING_CACHE_TTL_MS;
}

export async function loadFranchiseBranding(
  franchiseId: string,
  options: { force?: boolean } = {}
): Promise<FranchiseBrandingRecord | null> {
  if (!franchiseId) return null;
  const cached = getCachedFranchiseBranding(franchiseId);
  if (!options.force && cached !== undefined && isCacheFresh(cached)) {
    return cached ?? null;
  }

  const pending = pendingLoads.get(franchiseId);
  if (pending) return pending;

  const loadPromise = (async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      requireSupabase();
      return cached ?? null;
    }

    const { data, error } = await supabase
      .from(BRANDING_TABLE)
      .select('franchise_id, logo_url, app_name, updated_at, updated_by')
      .eq('franchise_id', franchiseId)
      .maybeSingle();

    if (error && (error as any).code !== 'PGRST116') {
      throw error;
    }

    const record: FranchiseBrandingRecord = {
      logoUrl: normalizeLogoUrl(data?.logo_url),
      appName: normalizeAppName(data?.app_name),
      updatedAt: data?.updated_at ?? null,
      fetchedAt: Date.now(),
    };

    persistFranchiseBrandingCache(franchiseId, record);
    emitLogoUpdate(franchiseId, record.logoUrl ?? null);
    emitAppNameUpdate(franchiseId, record.appName ?? null);
    return record;
  })();

  pendingLoads.set(franchiseId, loadPromise);
  try {
    return await loadPromise;
  } finally {
    pendingLoads.delete(franchiseId);
  }
}

export async function loadFranchiseLogo(
  franchiseId: string,
  options: { force?: boolean } = {}
): Promise<FranchiseBrandingRecord | null> {
  return loadFranchiseBranding(franchiseId, options);
}

export async function loadFranchiseAppName(
  franchiseId: string,
  options: { force?: boolean } = {}
): Promise<string | null> {
  const record = await loadFranchiseBranding(franchiseId, options);
  return record?.appName ?? null;
}

function hasOwnProp<T extends object>(payload: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

export async function saveFranchiseBranding(
  payload: FranchiseBrandingUpdate
): Promise<FranchiseBrandingRecord> {
  if (!payload.franchiseId) {
    throw new Error('Franchise ID is required to save branding.');
  }

  const nowIso = new Date().toISOString();
  const supabase = getSupabaseClient();
  const hasLogo = hasOwnProp(payload, 'logoUrl');
  const hasAppName = hasOwnProp(payload, 'appName');
  const logoUrl = hasLogo ? normalizeLogoUrl(payload.logoUrl) : undefined;
  const appName = hasAppName ? normalizeAppName(payload.appName) : undefined;

  if (!supabase) {
    requireSupabase();
  } else {
    const update: Record<string, any> = {
      franchise_id: payload.franchiseId,
      updated_at: nowIso,
      updated_by: payload.updatedBy ?? null,
    };
    if (hasLogo) update.logo_url = logoUrl;
    if (hasAppName) update.app_name = appName;
    const { error } = await supabase
      .from(BRANDING_TABLE)
      .upsert(update, { onConflict: 'franchise_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  const existing = getCachedFranchiseBranding(payload.franchiseId);
  const record: FranchiseBrandingRecord = {
    logoUrl: hasLogo ? (logoUrl ?? null) : existing?.logoUrl ?? null,
    appName: hasAppName ? (appName ?? null) : existing?.appName ?? null,
    updatedAt: nowIso,
    fetchedAt: Date.now(),
  };

  persistFranchiseBrandingCache(payload.franchiseId, record);
  if (hasLogo) {
    emitLogoUpdate(payload.franchiseId, record.logoUrl ?? null);
  }
  if (hasAppName) {
    emitAppNameUpdate(payload.franchiseId, record.appName ?? null);
  }
  return record;
}

export async function saveFranchiseLogo(
  payload: { franchiseId: string; logoUrl: string | null; updatedBy?: string | null }
): Promise<FranchiseBrandingRecord> {
  return saveFranchiseBranding(payload);
}

export async function saveFranchiseAppName(
  payload: { franchiseId: string; appName: string | null; updatedBy?: string | null }
): Promise<FranchiseBrandingRecord> {
  return saveFranchiseBranding(payload);
}
