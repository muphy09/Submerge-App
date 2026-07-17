import { getSupabaseClient, hasSupabaseConnection, isSupabaseEnabled } from './supabaseClient';
import { isEnvFlagTrue } from './env';
import { logLedgerEventSafe } from './ledger';
import { readSession } from './session';

export type PricingModelSummary = {
  id: string;
  name: string;
  version: string;
  currentRevisionId?: string | null;
  currentRevisionNumber?: number | null;
  isDefault: boolean;
  isHiddenFromView?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type LoadedPricingModel = {
  franchiseId: string;
  pricingModelId?: string;
  pricingModelName?: string;
  isDefault?: boolean;
  isHiddenFromView?: boolean;
  version: string;
  revisionId?: string | null;
  revisionNumber?: number | null;
  pricing: any;
  updatedAt?: string;
  updatedBy?: string | null;
};

const DEFAULT_VERSION = 'v1';
const DEFAULT_FRANCHISE_ID = 'default';
const SUPABASE_REQUIRED = isEnvFlagTrue('VITE_SUPABASE_ONLY');
const PRICING_MODEL_LIST_CACHE_PREFIX = 'submerge.pricingModelList';
const PRICING_MODEL_SNAPSHOT_CACHE_PREFIX = 'submerge.pricingModelSnapshot';

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

function getPricingModelListCacheKey(franchiseId: string) {
  return `${PRICING_MODEL_LIST_CACHE_PREFIX}.${franchiseId || DEFAULT_FRANCHISE_ID}`;
}

function getPricingModelSnapshotCacheKey(
  franchiseId: string,
  pricingModelId?: string | null,
  revisionId?: string | null
) {
  return `${PRICING_MODEL_SNAPSHOT_CACHE_PREFIX}.${franchiseId || DEFAULT_FRANCHISE_ID}.${pricingModelId || 'default'}.${revisionId || 'current'}`;
}

function readCachedJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.warn('Unable to read cached pricing model data:', error);
    return null;
  }
}

function persistCachedJson<T>(key: string, value: T) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Unable to persist cached pricing model data:', error);
  }
}

function persistPricingModelListCache(franchiseId: string, rows: PricingModelSummary[]) {
  persistCachedJson(getPricingModelListCacheKey(franchiseId), rows);
}

function readPricingModelListCache(franchiseId: string): PricingModelSummary[] {
  const cached = readCachedJson<PricingModelSummary[]>(getPricingModelListCacheKey(franchiseId));
  return Array.isArray(cached) ? cached : [];
}

function persistPricingModelSnapshotCache(model: LoadedPricingModel | null) {
  if (!model?.franchiseId) return;
  persistCachedJson(
    getPricingModelSnapshotCacheKey(model.franchiseId, model.pricingModelId, model.revisionId),
    model
  );
  if (model.revisionId) {
    persistCachedJson(getPricingModelSnapshotCacheKey(model.franchiseId, model.pricingModelId), model);
  }
  if (model.isDefault) {
    persistCachedJson(getPricingModelSnapshotCacheKey(model.franchiseId), model);
  }
}

function readPricingModelSnapshotCache(
  franchiseId: string,
  pricingModelId?: string | null,
  revisionId?: string | null
): LoadedPricingModel | null {
  return readCachedJson<LoadedPricingModel>(
    getPricingModelSnapshotCacheKey(franchiseId, pricingModelId, revisionId)
  );
}

function isRevisionFoundationUnavailable(error: any) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    message.includes('franchise_pricing_model_revisions') ||
    message.includes('save_pricing_model_revision') ||
    message.includes('could not find the table') ||
    message.includes('could not find the function')
  );
}

async function loadRemotePricingRevision(options: {
  franchiseId: string;
  pricingModelId: string;
  revisionId?: string | null;
  currentRevisionId?: string | null;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const targetRevisionId = options.revisionId || options.currentRevisionId || null;
  let query = supabase
    .from('franchise_pricing_model_revisions')
    .select('id,pricing_model_id,franchise_id,revision_number,pricing_json,source_version,published_at,published_by')
    .eq('franchise_id', options.franchiseId)
    .eq('pricing_model_id', options.pricingModelId)
    .order('revision_number', { ascending: false })
    .limit(1);
  if (targetRevisionId) {
    query = supabase
      .from('franchise_pricing_model_revisions')
      .select('id,pricing_model_id,franchise_id,revision_number,pricing_json,source_version,published_at,published_by')
      .eq('franchise_id', options.franchiseId)
      .eq('pricing_model_id', options.pricingModelId)
      .eq('id', targetRevisionId)
      .limit(1);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listPricingModels(franchiseId: string): Promise<PricingModelSummary[]> {
  return withFallback<PricingModelSummary[]>(async () => {
    try {
      if (!(await hasSupabaseConnection())) {
        const cached = readPricingModelListCache(franchiseId);
        if (cached.length) return cached;
        return await window.electron.listPricingModels(franchiseId);
      }
      const supabase = getSupabaseClient();
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('franchise_pricing_models')
        .select('id,name,version,is_default,is_hidden_from_view,created_at,updated_at')
        .eq('franchise_id', franchiseId || DEFAULT_FRANCHISE_ID)
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const rows: PricingModelSummary[] = (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        version: row.version,
        isDefault: row.is_default,
        isHiddenFromView: row.is_hidden_from_view,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
      if (rows.length) {
        try {
          const { data: revisions, error: revisionError } = await supabase
            .from('franchise_pricing_model_revisions')
            .select('id,pricing_model_id,revision_number')
            .eq('franchise_id', franchiseId || DEFAULT_FRANCHISE_ID)
            .in('pricing_model_id', rows.map((row) => row.id))
            .order('revision_number', { ascending: false });
          if (revisionError) throw revisionError;
          const newestByModel = new Map<string, any>();
          (revisions || []).forEach((revision: any) => {
            if (!newestByModel.has(revision.pricing_model_id)) {
              newestByModel.set(revision.pricing_model_id, revision);
            }
          });
          rows.forEach((row) => {
            const revision = newestByModel.get(row.id);
            row.currentRevisionId = revision?.id || null;
            row.currentRevisionNumber = Number(revision?.revision_number) || null;
          });
        } catch (error) {
          if (!isRevisionFoundationUnavailable(error)) {
            console.warn('Unable to load pricing revision summaries:', error);
          }
        }
      }
      persistPricingModelListCache(franchiseId, rows);
      return rows;
    } catch (error) {
      const cached = readPricingModelListCache(franchiseId);
      if (cached.length) return cached;
      return await window.electron.listPricingModels(franchiseId);
    }
  }, async () => {
    const rows = await window.electron.listPricingModels(franchiseId);
    return rows;
  });
}

export async function loadPricingModel(
  franchiseId: string,
  pricingModelId?: string | null,
  revisionId?: string | null
): Promise<LoadedPricingModel | null> {
  return withFallback<LoadedPricingModel | null>(async () => {
    try {
      if (!(await hasSupabaseConnection())) {
        const cached = readPricingModelSnapshotCache(franchiseId, pricingModelId, revisionId);
        if (cached?.pricing) return cached;
        return await window.electron.loadPricingModel({
          franchiseId,
          pricingModelId: pricingModelId || undefined,
        });
      }
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
      let revision: any = null;
      try {
        revision = await loadRemotePricingRevision({
          franchiseId: data.franchise_id,
          pricingModelId: data.id,
          revisionId,
          currentRevisionId: data.current_revision_id,
        });
      } catch (revisionError) {
        if (!isRevisionFoundationUnavailable(revisionError)) throw revisionError;
      }
      const loaded: LoadedPricingModel = {
        franchiseId: data.franchise_id,
        pricingModelId: data.id,
        pricingModelName: data.name,
        isDefault: data.is_default,
        isHiddenFromView: data.is_hidden_from_view,
        version: revision?.source_version || data.version,
        revisionId: revision?.id || null,
        revisionNumber: Number(revision?.revision_number) || null,
        pricing: revision?.pricing_json ?? data.pricing_json,
        updatedAt: revision?.published_at || data.updated_at,
        updatedBy: revision?.published_by ?? data.updated_by,
      };
      persistPricingModelSnapshotCache(loaded);
      return loaded;
    } catch (error) {
      const cached = readPricingModelSnapshotCache(franchiseId, pricingModelId, revisionId);
      if (cached?.pricing) return cached;
      return await window.electron.loadPricingModel({
        franchiseId,
        pricingModelId: pricingModelId || undefined,
      });
    }
  }, async () => {
    return window.electron.loadPricingModel({
      franchiseId,
      pricingModelId: pricingModelId || undefined,
    });
  });
}

export async function loadInitialPricingModelRevisionId(
  franchiseId: string,
  pricingModelId: string
): Promise<string | null> {
  const cacheKey = `pricing-model-initial-revision:${franchiseId}:${pricingModelId}`;
  const readCache = () => {
    try {
      return localStorage.getItem(cacheKey);
    } catch {
      return null;
    }
  };
  const supabase = getSupabaseClient();
  if (!supabase) return readCache();
  if (!(await hasSupabaseConnection())) return readCache();
  try {
    const { data, error } = await supabase
      .from('franchise_pricing_model_revisions')
      .select('id')
      .eq('franchise_id', franchiseId || DEFAULT_FRANCHISE_ID)
      .eq('pricing_model_id', pricingModelId)
      .order('revision_number', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const revisionId = data?.id || null;
    if (revisionId) {
      try {
        localStorage.setItem(cacheKey, revisionId);
      } catch {
        // The in-memory result is still safe when storage is unavailable.
      }
    }
    return revisionId || readCache();
  } catch (error) {
    if (!isRevisionFoundationUnavailable(error)) {
      console.warn('Unable to resolve initial pricing revision:', error);
    }
    return readCache();
  }
}

export type PricingModelRevisionSummary = {
  id: string;
  pricingModelId: string;
  franchiseId: string;
  revisionNumber: number;
  sourceVersion?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
  changeSummary?: Array<Record<string, unknown>>;
};

export type SavePricingModelResult = {
  franchiseId: string;
  pricingModelId: string;
  pricingModelName?: string;
  revisionId?: string | null;
  revisionNumber?: number | null;
  updatedAt: string;
  isDefault?: boolean;
};

export async function listPricingModelRevisions(
  franchiseId: string,
  pricingModelId: string
): Promise<PricingModelRevisionSummary[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('franchise_pricing_model_revisions')
      .select(
        'id,pricing_model_id,franchise_id,revision_number,source_version,published_at,published_by,change_summary'
      )
      .eq('franchise_id', franchiseId || DEFAULT_FRANCHISE_ID)
      .eq('pricing_model_id', pricingModelId)
      .order('revision_number', { ascending: false });
    if (error) throw error;
    return (data || []).map((revision: any) => ({
      id: revision.id,
      pricingModelId: revision.pricing_model_id,
      franchiseId: revision.franchise_id,
      revisionNumber: Number(revision.revision_number) || 1,
      sourceVersion: revision.source_version || null,
      publishedAt: revision.published_at || null,
      publishedBy: revision.published_by || null,
      changeSummary: Array.isArray(revision.change_summary) ? revision.change_summary : [],
    }));
  } catch (error) {
    if (!isRevisionFoundationUnavailable(error)) throw error;
    return [];
  }
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
  changeSummary?: Array<Record<string, unknown>>;
}): Promise<SavePricingModelResult> {
  return withFallback<SavePricingModelResult>(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase not configured');
    const id = payload.createNew || !payload.pricingModelId ? crypto.randomUUID() : payload.pricingModelId;
    const now = new Date().toISOString();
    const updatedBy = getUpdatedByValue(payload.updatedBy);
    try {
      const { data: revisionResult, error: revisionError } = await supabase.rpc(
        'save_pricing_model_revision',
        {
          p_pricing_model_id: id,
          p_franchise_id: payload.franchiseId || DEFAULT_FRANCHISE_ID,
          p_name: payload.name,
          p_pricing_json: payload.pricing,
          p_source_version: payload.version || DEFAULT_VERSION,
          p_set_default: Boolean(payload.setDefault),
          p_is_hidden_from_view: Boolean(payload.isHiddenFromView),
          p_change_summary: payload.changeSummary || [],
          p_published_by: updatedBy,
          p_create_new: Boolean(payload.createNew || !payload.pricingModelId),
        }
      );
      if (revisionError) throw revisionError;
      const result = Array.isArray(revisionResult) ? revisionResult[0] : revisionResult;
      await logLedgerEventSafe({
        franchiseId: payload.franchiseId || DEFAULT_FRANCHISE_ID,
        action: payload.copiedFromPricingModelId
          ? 'Pricing model copied'
          : payload.createNew || !payload.pricingModelId
          ? 'Pricing model created'
          : 'Pricing model revision published',
        targetType: 'pricing_model',
        targetId: id,
        details: {
          pricingModelId: id,
          pricingModelName: payload.name,
          revisionId: result?.revisionId || null,
          revisionNumber: result?.revisionNumber || null,
          version: payload.version || DEFAULT_VERSION,
          setAsDefault: Boolean(payload.setDefault),
          hiddenFromView: Boolean(payload.isHiddenFromView),
          copiedFromFranchiseId: payload.copiedFromFranchiseId || null,
          copiedFromFranchiseName: payload.copiedFromFranchiseName || null,
          copiedFromPricingModelId: payload.copiedFromPricingModelId || null,
          copiedFromPricingModelName: payload.copiedFromPricingModelName || null,
        },
      });
      return {
        franchiseId: payload.franchiseId,
        pricingModelId: id,
        pricingModelName: payload.name,
        revisionId: result?.revisionId || null,
        revisionNumber: Number(result?.revisionNumber) || null,
        updatedAt: result?.publishedAt || now,
        isDefault: payload.setDefault,
      };
    } catch (revisionError) {
      if (!isRevisionFoundationUnavailable(revisionError)) throw revisionError;
    }

    // Compatibility path used until the additive migration has been applied.
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
