import { getSupabaseClient, isSupabaseEnabled } from './supabaseClient';
import { isEnvFlagTrue } from './env';
import { logLedgerEventSafe } from './ledger';
import { readSession } from './session';

type PricingModelSummary = {
  id: string;
  name: string;
  version: string;
  isDefault: boolean;
  isHiddenFromView?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type LoadedPricingModel = {
  franchiseId: string;
  pricingModelId?: string;
  pricingModelName?: string;
  isDefault?: boolean;
  isHiddenFromView?: boolean;
  version: string;
  pricing: any;
  updatedAt?: string;
  updatedBy?: string | null;
};

const DEFAULT_VERSION = 'v1';
const DEFAULT_FRANCHISE_ID = 'default';
const SUPABASE_REQUIRED = isEnvFlagTrue('VITE_SUPABASE_ONLY');

function getUpdatedByValue(explicit?: string | null) {
  const normalizedExplicit = String(explicit || '').trim();
  if (normalizedExplicit) return normalizedExplicit;
  const session = readSession();
  return session?.userEmail || session?.userName || null;
}

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

export async function listPricingModels(franchiseId: string): Promise<PricingModelSummary[]> {
  return withFallback<PricingModelSummary[]>(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('franchise_pricing_models')
      .select('id,name,version,is_default,is_hidden_from_view,created_at,updated_at')
      .eq('franchise_id', franchiseId || DEFAULT_FRANCHISE_ID)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      isDefault: row.is_default,
      isHiddenFromView: row.is_hidden_from_view,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }, async () => {
    const rows = await window.electron.listPricingModels(franchiseId);
    return rows;
  });
}

export async function loadPricingModel(
  franchiseId: string,
  pricingModelId?: string | null
): Promise<LoadedPricingModel | null> {
  return withFallback<LoadedPricingModel | null>(async () => {
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
      isHiddenFromView: data.is_hidden_from_view,
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
  isHiddenFromView?: boolean;
  version?: string;
  updatedBy?: string | null;
  createNew?: boolean;
  copiedFromFranchiseId?: string;
  copiedFromFranchiseName?: string | null;
  copiedFromPricingModelId?: string;
  copiedFromPricingModelName?: string | null;
}) {
  return withFallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase not configured');
    const id = payload.createNew || !payload.pricingModelId ? crypto.randomUUID() : payload.pricingModelId;
    const now = new Date().toISOString();
    const updatedBy = getUpdatedByValue(payload.updatedBy);
    const { error } = await supabase.from('franchise_pricing_models').upsert({
      id,
      franchise_id: payload.franchiseId || DEFAULT_FRANCHISE_ID,
      name: payload.name,
      version: payload.version || DEFAULT_VERSION,
      pricing_json: payload.pricing,
      is_default: payload.setDefault ? true : undefined,
      is_hidden_from_view: Boolean(payload.isHiddenFromView),
      updated_at: now,
      updated_by: updatedBy,
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
    await logLedgerEventSafe({
      franchiseId: payload.franchiseId || DEFAULT_FRANCHISE_ID,
      action: payload.copiedFromPricingModelId
        ? 'Pricing model copied'
        : payload.createNew || !payload.pricingModelId
        ? 'Pricing model created'
        : 'Pricing model updated',
      targetType: 'pricing_model',
      targetId: id,
      details: {
        pricingModelId: id,
        pricingModelName: payload.name,
        version: payload.version || DEFAULT_VERSION,
        setAsDefault: Boolean(payload.setDefault),
        hiddenFromView: Boolean(payload.isHiddenFromView),
        copiedFromFranchiseId: payload.copiedFromFranchiseId || null,
        copiedFromFranchiseName: payload.copiedFromFranchiseName || null,
        copiedFromPricingModelId: payload.copiedFromPricingModelId || null,
        copiedFromPricingModelName: payload.copiedFromPricingModelName || null,
      },
    });
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
    const { data: targetModel } = await supabase
      .from('franchise_pricing_models')
      .select('id,name')
      .eq('franchise_id', payload.franchiseId || DEFAULT_FRANCHISE_ID)
      .eq('id', payload.pricingModelId)
      .maybeSingle();
    await supabase
      .from('franchise_pricing_models')
      .update({ is_default: false })
      .eq('franchise_id', payload.franchiseId || DEFAULT_FRANCHISE_ID);
    await supabase
      .from('franchise_pricing_models')
      .update({ is_default: true, updated_at: now })
      .eq('id', payload.pricingModelId);
    await logLedgerEventSafe({
      franchiseId: payload.franchiseId || DEFAULT_FRANCHISE_ID,
      action: 'Pricing model set as default',
      targetType: 'pricing_model',
      targetId: payload.pricingModelId,
      details: {
        pricingModelId: payload.pricingModelId,
        pricingModelName: targetModel?.name || null,
      },
    });
    return { franchiseId: payload.franchiseId, pricingModelId: payload.pricingModelId, updatedAt: now };
  }, async () => {
    return window.electron.setDefaultPricingModel(payload);
  });
}

export async function deletePricingModel(payload: { franchiseId: string; pricingModelId: string }) {
  return withFallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase not configured');
    const { data: targetModel } = await supabase
      .from('franchise_pricing_models')
      .select('id,name,version,is_default')
      .eq('franchise_id', payload.franchiseId || DEFAULT_FRANCHISE_ID)
      .eq('id', payload.pricingModelId)
      .maybeSingle();
    const { error } = await supabase
      .from('franchise_pricing_models')
      .delete()
      .eq('franchise_id', payload.franchiseId || DEFAULT_FRANCHISE_ID)
      .eq('id', payload.pricingModelId);
    if (error) throw error;
    await logLedgerEventSafe({
      franchiseId: payload.franchiseId || DEFAULT_FRANCHISE_ID,
      action: 'Pricing model deleted',
      targetType: 'pricing_model',
      targetId: payload.pricingModelId,
      details: {
        pricingModelId: payload.pricingModelId,
        pricingModelName: targetModel?.name || null,
        version: targetModel?.version || null,
        wasDefault: Boolean(targetModel?.is_default),
      },
    });
    return payload;
  }, async () => {
    return window.electron.deletePricingModel(payload);
  });
}

export async function loadDefaultFranchisePricing(franchiseId: string) {
  const model = await loadPricingModel(franchiseId);
  return model;
}
