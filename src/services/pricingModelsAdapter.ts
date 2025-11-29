import { getSupabaseClient, isSupabaseEnabled } from './supabaseClient';

export type PricingModelRow = {
  id: string;
  franchise_id: string;
  name: string;
  version: string;
  pricing_json: any;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
  updated_by?: string | null;
};

const DEFAULT_VERSION = 'v1';
const DEFAULT_FRANCHISE_ID = 'default';
const SUPABASE_REQUIRED = (import.meta.env.VITE_SUPABASE_ONLY || process.env.VITE_SUPABASE_ONLY || '').toString().toLowerCase() === 'true';

function withFallback<T>(supabaseFn: () => Promise<T>, fallbackFn: () => Promise<T>) {
  const enabled = isSupabaseEnabled();
  if (enabled) {
    return supabaseFn();
  }
  if (SUPABASE_REQUIRED) {
    throw new Error('Supabase is required but not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return fallbackFn();
}

export async function listPricingModels(franchiseId: string) {
  return withFallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('franchise_pricing_models')
      .select('id,name,version,is_default,created_at,updated_at')
      .eq('franchise_id', franchiseId || DEFAULT_FRANCHISE_ID)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      isDefault: row.is_default,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }, async () => {
    const rows = await window.electron.listPricingModels(franchiseId);
    return rows;
  });
}

export async function loadPricingModel(franchiseId: string, pricingModelId?: string | null) {
  return withFallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    let query = supabase
      .from('franchise_pricing_models')
      .select('*')
      .eq('franchise_id', franchiseId || DEFAULT_FRANCHISE_ID)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1);
    if (pricingModelId) {
      query = supabase
        .from('franchise_pricing_models')
        .select('*')
        .eq('franchise_id', franchiseId || DEFAULT_FRANCHISE_ID)
        .eq('id', pricingModelId)
        .limit(1);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      franchiseId: data.franchise_id,
      pricingModelId: data.id,
      pricingModelName: data.name,
      isDefault: data.is_default,
      version: data.version,
      pricing: data.pricing_json,
      updatedAt: data.updated_at,
      updatedBy: data.updated_by,
    };
  }, async () => {
    return window.electron.loadPricingModel({
      franchiseId,
      pricingModelId: pricingModelId || undefined,
    });
  });
}

export async function savePricingModel(payload: {
  franchiseId: string;
  pricing: any;
  name: string;
  pricingModelId?: string;
  setDefault?: boolean;
  version?: string;
  updatedBy?: string | null;
  createNew?: boolean;
}) {
  return withFallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase not configured');
    const id = payload.createNew || !payload.pricingModelId ? crypto.randomUUID() : payload.pricingModelId;
    const now = new Date().toISOString();
    const { error } = await supabase.from('franchise_pricing_models').upsert({
      id,
      franchise_id: payload.franchiseId || DEFAULT_FRANCHISE_ID,
      name: payload.name,
      version: payload.version || DEFAULT_VERSION,
      pricing_json: payload.pricing,
      is_default: payload.setDefault ? true : undefined,
      updated_at: now,
      updated_by: payload.updatedBy || null,
    });
    if (error) throw error;
    if (payload.setDefault) {
      await supabase
        .from('franchise_pricing_models')
        .update({ is_default: false })
        .eq('franchise_id', payload.franchiseId || DEFAULT_FRANCHISE_ID)
        .neq('id', id);
      await supabase
        .from('franchise_pricing_models')
        .update({ is_default: true, updated_at: now })
        .eq('id', id);
    }
    return { franchiseId: payload.franchiseId, pricingModelId: id, updatedAt: now, isDefault: payload.setDefault };
  }, async () => {
    return window.electron.savePricingModel(payload);
  });
}

export async function setDefaultPricingModel(payload: { franchiseId: string; pricingModelId: string }) {
  return withFallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase not configured');
    const now = new Date().toISOString();
    await supabase
      .from('franchise_pricing_models')
      .update({ is_default: false })
      .eq('franchise_id', payload.franchiseId || DEFAULT_FRANCHISE_ID);
    await supabase
      .from('franchise_pricing_models')
      .update({ is_default: true, updated_at: now })
      .eq('id', payload.pricingModelId);
    return { franchiseId: payload.franchiseId, pricingModelId: payload.pricingModelId, updatedAt: now };
  }, async () => {
    return window.electron.setDefaultPricingModel(payload);
  });
}

export async function deletePricingModel(payload: { franchiseId: string; pricingModelId: string }) {
  return withFallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase
      .from('franchise_pricing_models')
      .delete()
      .eq('franchise_id', payload.franchiseId || DEFAULT_FRANCHISE_ID)
      .eq('id', payload.pricingModelId);
    if (error) throw error;
    return payload;
  }, async () => {
    return window.electron.deletePricingModel(payload);
  });
}

export async function loadDefaultFranchisePricing(franchiseId: string) {
  const model = await loadPricingModel(franchiseId);
  return model;
}
