// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

import * as lightingUtilsModule from '../src/utils/lighting.ts';
import * as proposalWorkflowModule from '../src/services/proposalWorkflow.ts';
import * as proposalVersionsModule from '../src/utils/proposalVersions.ts';
import * as pricingDataStoreModule from '../src/services/pricingDataStore.ts';
import * as proposalDefaultsModule from '../src/utils/proposalDefaults.ts';
import * as customFeaturesUtilsModule from '../src/utils/customFeatures.ts';
import * as warrantyUtilsModule from '../src/utils/warranty.ts';
import * as masterPricingEngineModule from '../src/services/masterPricingEngine.ts';
import * as defaultPricingDataModule from '../src/services/pricingData.ts';

const lightingUtils = (lightingUtilsModule as any).default || lightingUtilsModule;
const proposalWorkflow = (proposalWorkflowModule as any).default || proposalWorkflowModule;
const proposalVersions = (proposalVersionsModule as any).default || proposalVersionsModule;
const pricingDataStore = (pricingDataStoreModule as any).default || pricingDataStoreModule;
const proposalDefaults = (proposalDefaultsModule as any).default || proposalDefaultsModule;
const customFeaturesUtils = (customFeaturesUtilsModule as any).default || customFeaturesUtilsModule;
const warrantyUtils = (warrantyUtilsModule as any).default || warrantyUtilsModule;

const { normalizeEquipmentLighting } = lightingUtils as any;
const {
  ensureProposalWorkflow,
  getWorkflowStatus,
  isVersionPermanentlyLocked,
} = proposalWorkflow as any;
const { applyActiveVersion, listAllVersions, ORIGINAL_VERSION_ID } = proposalVersions as any;
const { withTemporaryPricingSnapshot } = pricingDataStore as any;
const {
  getDefaultProposal,
  getDefaultPoolSpecs,
  getDefaultExcavation,
  getDefaultPlumbing,
  getDefaultElectrical,
  getDefaultTileCopingDecking,
  getDefaultDrainage,
  getDefaultWaterFeatures,
  getDefaultInteriorFinish,
  getDefaultManualAdjustments,
  getDefaultEquipment,
  mergeRetailAdjustments,
} = proposalDefaults as any;
const { normalizeCustomFeatures } = customFeaturesUtils as any;
const { normalizeWarrantySectionsSetting } = warrantyUtils as any;
const MasterPricingEngine =
  (masterPricingEngineModule as any).MasterPricingEngine ||
  (masterPricingEngineModule as any).default?.MasterPricingEngine ||
  (masterPricingEngineModule as any).default ||
  masterPricingEngineModule;
const defaultPricingData =
  (defaultPricingDataModule as any).default?.default ||
  (defaultPricingDataModule as any).default ||
  defaultPricingDataModule;

type AuthPayload = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user?: { email?: string | null };
};

type StoredProposalRow = {
  proposal_number: string;
  franchise_id: string;
  designer_name?: string | null;
  designer_role?: string | null;
  designer_code?: string | null;
  status?: string | null;
  pricing_model_id?: string | null;
  pricing_model_name?: string | null;
  created_date?: string | null;
  updated_at?: string | null;
  last_modified?: string | null;
  proposal_json?: any;
};

type ChangeRecord = {
  label: string;
  before: string;
  after: string;
};

type VersionPatchResult = {
  changed: boolean;
  version: any;
  changes: ChangeRecord[];
};

type ProposalPatchResult = {
  changed: boolean;
  proposal: any;
  proposalNumber: string;
  versionChanges: Array<{
    versionId: string;
    versionName: string;
    changes: ChangeRecord[];
  }>;
};

const APP_PROFILE_NAME = 'submerge-proposal-builder';
const REPORT_DIR = path.join(process.cwd(), 'scripts', 'output');
const TARGET_COPING_SIZES = new Set(['12x24']);

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, true);
      continue;
    }
    args.set(key, next);
    index += 1;
  }
  return {
    apply: Boolean(args.get('apply')),
    franchiseCode: String(args.get('franchise-code') || '5555'),
    franchiseId: args.get('franchise-id') ? String(args.get('franchise-id')) : null,
    profileDir: args.get('profile-dir') ? String(args.get('profile-dir')) : null,
    reportPath: args.get('report-path') ? String(args.get('report-path')) : null,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function formatCurrency(value: unknown): string {
  const numeric = Number(value) || 0;
  return `$${numeric.toFixed(2)}`;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeDeep(base: any, override: any): any {
  if (override === undefined) return deepClone(base);
  if (base === undefined) return deepClone(override);
  if (Array.isArray(base) || Array.isArray(override)) {
    return deepClone(override);
  }
  if (
    base &&
    override &&
    typeof base === 'object' &&
    typeof override === 'object'
  ) {
    const result: Record<string, any> = { ...deepClone(base) };
    for (const [key, overrideValue] of Object.entries(override)) {
      const baseValue = (result as any)[key];
      if (
        baseValue &&
        overrideValue &&
        typeof baseValue === 'object' &&
        typeof overrideValue === 'object' &&
        !Array.isArray(baseValue) &&
        !Array.isArray(overrideValue)
      ) {
        result[key] = mergeDeep(baseValue, overrideValue);
        continue;
      }
      result[key] = deepClone(overrideValue);
    }
    return result;
  }
  return deepClone(override);
}

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .forEach((line) => {
      const pivot = line.indexOf('=');
      const key = line.slice(0, pivot).trim();
      const value = line.slice(pivot + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    });
}

function getPrintableStrings(buffer: Buffer): string[] {
  const matches = buffer.toString('latin1').match(/[\x20-\x7e]{8,}/g);
  return matches || [];
}

function parseEmbeddedAuthPayload(candidate: string): AuthPayload | null {
  const accessToken = candidate.match(/eyJ[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+/)?.[0];
  const refreshToken = candidate.match(/refresh_token":"([^"]+)"/)?.[1];
  const expiresAtMatch = candidate.match(/expires_at":(\d+)/)?.[1];
  const email = candidate.match(/email":"([^"]+)"/)?.[1] || null;
  if (!accessToken || !refreshToken) {
    return null;
  }
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAtMatch ? Number(expiresAtMatch) : undefined,
    user: email ? { email } : undefined,
  };
}

function getLevelDbFiles(profileDir: string) {
  const levelDbDir = path.join(profileDir, 'Local Storage', 'leveldb');
  if (!fs.existsSync(levelDbDir)) {
    throw new Error(`Local Storage profile not found at ${levelDbDir}`);
  }
  return fs
    .readdirSync(levelDbDir)
    .filter((name) => name.endsWith('.log') || name.endsWith('.ldb'))
    .map((name) => path.join(levelDbDir, name));
}

function extractLocalProfileState(profileDir: string) {
  const authPayloads: AuthPayload[] = [];
  const impersonationPayloads: any[] = [];

  for (const filePath of getLevelDbFiles(profileDir)) {
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(filePath);
    } catch (error) {
      continue;
    }

    for (const candidate of getPrintableStrings(buffer)) {
      try {
        const parsed =
          candidate.startsWith('{') && candidate.endsWith('}')
            ? JSON.parse(candidate)
            : parseEmbeddedAuthPayload(candidate);
        if (parsed?.access_token && parsed?.refresh_token) {
          authPayloads.push(parsed);
          continue;
        }
        if (parsed?.franchiseCode && parsed?.franchiseId && parsed?.actingRole) {
          impersonationPayloads.push(parsed);
        }
      } catch (error) {
        continue;
      }
    }
  }

  const auth = authPayloads.sort((left, right) => (Number(right?.expires_at) || 0) - (Number(left?.expires_at) || 0))[0];
  const impersonation =
    impersonationPayloads.sort(
      (left, right) => Date.parse(right?.startedAt || '') - Date.parse(left?.startedAt || '')
    )[0] || null;

  if (!auth?.access_token || !auth?.refresh_token) {
    throw new Error(`Unable to locate a Supabase auth session in ${profileDir}`);
  }

  return { auth, impersonation };
}

async function refreshAuthSession(url: string, anonKey: string, auth: AuthPayload): Promise<AuthPayload> {
  const expiresAt = Number(auth?.expires_at) || 0;
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt > now + 120) {
    return auth;
  }

  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      refresh_token: auth.refresh_token,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token || !payload?.refresh_token) {
    throw new Error(
      `Unable to refresh Supabase auth session (${response.status}): ${payload?.error_description || payload?.msg || 'unknown error'}`
    );
  }

  return payload;
}

function buildSupabaseClient(url: string, anonKey: string, accessToken: string) {
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function resolveFranchise(
  supabase: any,
  franchiseCode: string,
  explicitFranchiseId?: string | null,
  impersonation?: any
) {
  if (explicitFranchiseId) {
    return {
      id: explicitFranchiseId,
      code: franchiseCode,
      source: 'argument',
    };
  }

  if (normalizeText(impersonation?.franchiseCode) === normalizeText(franchiseCode)) {
    return {
      id: impersonation.franchiseId,
      code: franchiseCode,
      source: 'local-profile',
    };
  }

  const { data, error } = await supabase
    .from('franchises')
    .select('id,franchise_code,name')
    .eq('franchise_code', franchiseCode)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) {
    throw new Error(`No franchise found for code ${franchiseCode}`);
  }

  return {
    id: data.id,
    code: data.franchise_code,
    name: data.name,
    source: 'supabase',
  };
}

async function fetchAllProposalsForFranchise(supabase: any, franchiseId: string): Promise<StoredProposalRow[]> {
  const pageSize = 500;
  const rows: StoredProposalRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('franchise_proposals')
      .select(
        'proposal_number,franchise_id,designer_name,designer_role,designer_code,status,pricing_model_id,pricing_model_name,created_date,updated_at,last_modified,proposal_json'
      )
      .eq('franchise_id', franchiseId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data || []) as StoredProposalRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

function hasPoolDefinition(poolSpecs: any): boolean {
  if (!poolSpecs) return false;
  const hasGuniteDimensions =
    (poolSpecs.surfaceArea ?? 0) > 0 ||
    (poolSpecs.perimeter ?? 0) > 0 ||
    ((poolSpecs.maxLength ?? 0) > 0 && (poolSpecs.maxWidth ?? 0) > 0);
  const hasFiberglassSelection =
    poolSpecs.poolType === 'fiberglass' && (!!poolSpecs.fiberglassSize || !!poolSpecs.fiberglassModelName);
  const hasSpaDefinition =
    ((poolSpecs.spaLength ?? 0) > 0 && (poolSpecs.spaWidth ?? 0) > 0) ||
    (poolSpecs.spaPerimeter ?? 0) > 0;
  return hasGuniteDimensions || hasFiberglassSelection || hasSpaDefinition;
}

function normalizeProposalForProcessing(row: StoredProposalRow) {
  const proposal = deepClone(row.proposal_json || {});
  const withMeta = {
    ...proposal,
    franchiseId: proposal.franchiseId || row.franchise_id,
    status: proposal.status || row.status || 'draft',
    pricingModelId: proposal.pricingModelId || row.pricing_model_id || undefined,
    pricingModelName: proposal.pricingModelName || row.pricing_model_name || undefined,
    designerName: proposal.designerName || row.designer_name || undefined,
    designerRole: proposal.designerRole || row.designer_role || undefined,
    designerCode: proposal.designerCode || row.designer_code || undefined,
    createdDate: proposal.createdDate || row.created_date || undefined,
    lastModified: proposal.lastModified || row.last_modified || row.updated_at || undefined,
  };

  const active = ensureProposalWorkflow(applyActiveVersion(withMeta));
  return {
    ...active,
    versions: (active.versions || []).map((entry: any) => ensureProposalWorkflow({ ...entry, versions: [] })),
  };
}

function mergeProposalWithDefaults(input: any) {
  const base = getDefaultProposal();
  const poolSpecs = { ...getDefaultPoolSpecs(), ...(input.poolSpecs || {}) };
  const mergedEquipment = normalizeEquipmentLighting(
    { ...getDefaultEquipment(), ...(input.equipment || {}) },
    {
      poolSpecs,
      hasPool: hasPoolDefinition(poolSpecs),
      hasSpa: poolSpecs.spaType !== 'none',
    }
  );

  return {
    ...base,
    ...input,
    customerInfo: { ...(base.customerInfo || {}), ...(input.customerInfo || {}) },
    poolSpecs,
    excavation: { ...getDefaultExcavation(), ...(input.excavation || {}) },
    plumbing: { ...getDefaultPlumbing(), ...(input.plumbing || {}) },
    electrical: { ...getDefaultElectrical(), ...(input.electrical || {}) },
    tileCopingDecking: { ...getDefaultTileCopingDecking(), ...(input.tileCopingDecking || {}) },
    drainage: { ...getDefaultDrainage(), ...(input.drainage || {}) },
    equipment: mergedEquipment,
    waterFeatures: { ...getDefaultWaterFeatures(), ...(input.waterFeatures || {}) },
    customFeatures: normalizeCustomFeatures(input.customFeatures),
    interiorFinish: { ...getDefaultInteriorFinish(), ...(input.interiorFinish || {}) },
    manualAdjustments: { ...getDefaultManualAdjustments(), ...(input.manualAdjustments || {}) },
    retailAdjustments: mergeRetailAdjustments(input.retailAdjustments),
    papDiscounts: input.papDiscounts || base.papDiscounts,
    contractOverrides: input.contractOverrides || base.contractOverrides || {},
    warrantySections: normalizeWarrantySectionsSetting(input.warrantySections),
  };
}

function recalculateProposal(input: any, pricingSnapshot: any) {
  return withTemporaryPricingSnapshot(pricingSnapshot, () => {
    const normalized = mergeProposalWithDefaults({ ...input, versions: [] });
    const result = MasterPricingEngine.calculateCompleteProposal(normalized, normalized.papDiscounts);
    return {
      ...normalized,
      pricing: result.pricing,
      costBreakdown: result.costBreakdown,
      subtotal: result.subtotal,
      totalCost: result.totalCost,
      versions: [],
    };
  });
}

function upsertChange(changes: ChangeRecord[], label: string, before: string, after: string) {
  if (before === after) return;
  changes.push({ label, before, after });
}

function getVersionSummary(version: any) {
  const size = normalizeText(version?.tileCopingDecking?.copingSize) || '12x12';
  const label = size === '16x16' ? '16x16 coping' : size === '12x24' ? '12x24' : '';
  const getMatchingItems = (items: any[] | undefined) =>
    (items || []).filter((item) => normalizeText(item?.description).toLowerCase() === label.toLowerCase());
  const laborAdjustmentItems = getMatchingItems(version?.costBreakdown?.copingDeckingLabor);
  const materialAdjustmentItems = getMatchingItems(version?.costBreakdown?.copingDeckingMaterial);

  return {
    size,
    laborTotal: Number(version?.costBreakdown?.totals?.copingDeckingLabor || 0),
    materialTotal: Number(version?.costBreakdown?.totals?.copingDeckingMaterial || 0),
    laborSizeAdjustment: laborAdjustmentItems.reduce((sum, item) => sum + (Number(item?.total) || 0), 0),
    materialSizeAdjustment: materialAdjustmentItems.reduce((sum, item) => sum + (Number(item?.total) || 0), 0),
    hasLaborSizeLine: laborAdjustmentItems.length > 0,
    hasMaterialSizeLine: materialAdjustmentItems.length > 0,
    totalCostsBeforeOverhead: Number(version?.pricing?.totalCostsBeforeOverhead || 0),
    retailPrice: Number(version?.pricing?.retailPrice || version?.totalCost || 0),
  };
}

function versionNeedsCopingSizeRecalc(version: any) {
  return TARGET_COPING_SIZES.has(normalizeText(version?.tileCopingDecking?.copingSize));
}

function buildVersionPatchResult(version: any, recalculated: any): VersionPatchResult {
  const before = getVersionSummary(version);
  const after = getVersionSummary(recalculated);
  const changes: ChangeRecord[] = [];

  upsertChange(changes, 'Coping size', before.size, after.size);
  upsertChange(changes, 'Coping labor size line', before.hasLaborSizeLine ? 'present' : 'missing', after.hasLaborSizeLine ? 'present' : 'missing');
  upsertChange(changes, 'Coping material size line', before.hasMaterialSizeLine ? 'present' : 'missing', after.hasMaterialSizeLine ? 'present' : 'missing');
  upsertChange(changes, 'Coping labor size adjustment', formatCurrency(before.laborSizeAdjustment), formatCurrency(after.laborSizeAdjustment));
  upsertChange(changes, 'Coping material size adjustment', formatCurrency(before.materialSizeAdjustment), formatCurrency(after.materialSizeAdjustment));
  upsertChange(changes, 'Coping/Decking labor total', formatCurrency(before.laborTotal), formatCurrency(after.laborTotal));
  upsertChange(changes, 'Coping/Decking material total', formatCurrency(before.materialTotal), formatCurrency(after.materialTotal));
  upsertChange(
    changes,
    'Total costs before overhead',
    formatCurrency(before.totalCostsBeforeOverhead),
    formatCurrency(after.totalCostsBeforeOverhead)
  );
  upsertChange(changes, 'Retail price', formatCurrency(before.retailPrice), formatCurrency(after.retailPrice));

  const changed = changes.length > 0;

  if (!changed) {
    return {
      changed: false,
      version: { ...version, versions: [] },
      changes: [],
    };
  }

  return {
    changed: true,
    version: {
      ...version,
      ...recalculated,
      createdDate: version?.createdDate || recalculated?.createdDate,
      versionSubmittedAt: version?.versionSubmittedAt ?? recalculated?.versionSubmittedAt,
      versionSubmittedBy: version?.versionSubmittedBy ?? recalculated?.versionSubmittedBy,
      versionLocked: version?.versionLocked ?? recalculated?.versionLocked,
      versionLockedAt: version?.versionLockedAt ?? recalculated?.versionLockedAt,
      versions: [],
    },
    changes,
  };
}

async function loadPricingSnapshotForVersion(
  supabase: any,
  cache: Map<string, any>,
  container: any,
  version: any
) {
  const sourceFranchiseId =
    version?.pricingModelFranchiseId ||
    version?.franchiseId ||
    container?.pricingModelFranchiseId ||
    container?.franchiseId;
  const modelId = version?.pricingModelId || container?.pricingModelId || null;
  const cacheKey = `${sourceFranchiseId || 'unknown'}::${modelId || 'default'}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  let query = supabase
    .from('franchise_pricing_models')
    .select('id,franchise_id,name,is_default,pricing_json,updated_at')
    .eq('franchise_id', sourceFranchiseId)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1);

  if (modelId) {
    query = supabase
      .from('franchise_pricing_models')
      .select('id,franchise_id,name,is_default,pricing_json,updated_at')
      .eq('franchise_id', sourceFranchiseId)
      .eq('id', modelId)
      .limit(1);
  }

  let { data, error } = await query.maybeSingle();
  if (error) throw error;

  if (!data?.pricing_json && modelId) {
    const fallback = await supabase
      .from('franchise_pricing_models')
      .select('id,franchise_id,name,is_default,pricing_json,updated_at')
      .eq('franchise_id', sourceFranchiseId)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    data = fallback.data;
  }

  if (!data?.pricing_json) {
    throw new Error(`Unable to load pricing model ${modelId || '(default)'} for franchise ${sourceFranchiseId}`);
  }

  const snapshot = mergeDeep(defaultPricingData, data.pricing_json || {});
  const result = {
    pricing: snapshot,
    pricingModelId: data.id,
    pricingModelName: data.name,
    franchiseId: data.franchise_id,
  };
  cache.set(cacheKey, result);
  return result;
}

async function patchProposalRow(
  supabase: any,
  row: StoredProposalRow,
  pricingCache: Map<string, any>,
  migrationTimestamp: string
): Promise<ProposalPatchResult> {
  const container = normalizeProposalForProcessing(row);
  const allVersions = listAllVersions(container);
  const patchedById = new Map<string, any>();
  const versionChanges: ProposalPatchResult['versionChanges'] = [];

  for (const version of allVersions) {
    const versionId = version?.versionId || ORIGINAL_VERSION_ID;
    if (isVersionPermanentlyLocked(version) || !versionNeedsCopingSizeRecalc(version)) {
      patchedById.set(versionId, { ...version, versions: [] });
      continue;
    }

    const pricingState = await loadPricingSnapshotForVersion(supabase, pricingCache, container, version);
    const recalculated = recalculateProposal(version, pricingState.pricing);
    const patchResult = buildVersionPatchResult(version, recalculated);
    patchedById.set(versionId, { ...patchResult.version, versions: [] });

    if (patchResult.changed) {
      versionChanges.push({
        versionId,
        versionName: normalizeText(version?.versionName) || (versionId === ORIGINAL_VERSION_ID ? 'Original' : 'Version'),
        changes: patchResult.changes,
      });
    }
  }

  if (!versionChanges.length) {
    return {
      changed: false,
      proposal: container,
      proposalNumber: row.proposal_number,
      versionChanges: [],
    };
  }

  const activeVersionId = normalizeText(container.activeVersionId) || normalizeText(container.versionId) || ORIGINAL_VERSION_ID;
  const activeVersion =
    patchedById.get(activeVersionId) ||
    patchedById.get(ORIGINAL_VERSION_ID) ||
    Array.from(patchedById.values())[0];
  const otherVersions = Array.from(patchedById.values()).filter(
    (entry: any) => normalizeText(entry?.versionId) !== normalizeText(activeVersion?.versionId)
  );

  const nextContainer = ensureProposalWorkflow(
    applyActiveVersion({
      ...container,
      ...activeVersion,
      status: container.status,
      workflow: container.workflow,
      activeVersionId: activeVersionId || activeVersion?.versionId || ORIGINAL_VERSION_ID,
      versions: otherVersions.map((entry: any) => ({ ...entry, versions: [] })),
      lastModified: migrationTimestamp,
    })
  );

  const normalizedContainer = {
    ...nextContainer,
    versions: (nextContainer.versions || []).map((entry: any) => ensureProposalWorkflow({ ...entry, versions: [] })),
  };

  return {
    changed: true,
    proposal: normalizedContainer,
    proposalNumber: row.proposal_number,
    versionChanges,
  };
}

async function upsertProposalRow(supabase: any, row: StoredProposalRow, proposal: any, migrationTimestamp: string) {
  const normalized = ensureProposalWorkflow(applyActiveVersion(proposal));
  const payload = {
    proposal_number: normalized.proposalNumber || row.proposal_number,
    franchise_id: normalized.franchiseId || row.franchise_id,
    designer_name: normalized.designerName || row.designer_name || null,
    designer_role: normalized.designerRole || row.designer_role || null,
    designer_code: normalized.designerCode || row.designer_code || null,
    status: getWorkflowStatus(normalized) || row.status || 'draft',
    pricing_model_id: normalized.pricingModelId || row.pricing_model_id || null,
    pricing_model_name: normalized.pricingModelName || row.pricing_model_name || null,
    last_modified: migrationTimestamp,
    created_date: normalized.createdDate || row.created_date || migrationTimestamp,
    updated_at: migrationTimestamp,
    proposal_json: {
      ...normalized,
      lastModified: migrationTimestamp,
      syncStatus: 'synced',
      syncMessage: 'Synced with cloud',
    },
  };

  const { error } = await supabase
    .from('franchise_proposals')
    .upsert(payload, { onConflict: 'proposal_number', ignoreDuplicates: false });
  if (error) throw error;
}

function ensureReportDir() {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
}

function buildDefaultReportPath(franchiseCode: string, apply: boolean) {
  ensureReportDir();
  const timestamp = nowIso().replace(/[:.]/g, '-');
  return path.join(
    REPORT_DIR,
    `coping-size-pricing-fix-${franchiseCode}-${apply ? 'apply' : 'dry-run'}-${timestamp}.json`
  );
}

function printSummary(summary: any) {
  console.log('');
  console.log(`Franchise: ${summary.franchise.code} (${summary.franchise.id})`);
  console.log(`Mode: ${summary.apply ? 'apply' : 'dry-run'}`);
  console.log(`Scanned proposals: ${summary.scannedProposals}`);
  console.log(`Updated proposals: ${summary.updatedProposals}`);
  console.log(`Updated versions: ${summary.updatedVersions}`);
  console.log(`Warnings: ${summary.warnings.length}`);
  console.log('');

  if (!summary.results.length) {
    console.log('No proposal rows required changes.');
    return;
  }

  for (const result of summary.results) {
    console.log(`${result.proposalNumber}`);
    for (const version of result.versionChanges) {
      console.log(`  ${version.versionName} (${version.versionId})`);
      for (const change of version.changes) {
        console.log(`    ${change.label}: ${change.before} -> ${change.after}`);
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(path.join(process.cwd(), '.env.local'));

  const supabaseUrl = normalizeText(process.env.VITE_SUPABASE_URL);
  const supabaseAnonKey = normalizeText(process.env.VITE_SUPABASE_ANON_KEY);
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.');
  }

  const profileDir = args.profileDir || path.join(process.env.APPDATA || '', APP_PROFILE_NAME);
  const localProfileState = extractLocalProfileState(profileDir);
  const auth = await refreshAuthSession(supabaseUrl, supabaseAnonKey, localProfileState.auth);
  const supabase = buildSupabaseClient(supabaseUrl, supabaseAnonKey, auth.access_token);

  const franchise = await resolveFranchise(
    supabase,
    args.franchiseCode,
    args.franchiseId,
    localProfileState.impersonation
  );
  const rows = await fetchAllProposalsForFranchise(supabase, franchise.id);
  const pricingCache = new Map<string, any>();
  const migrationTimestamp = nowIso();
  const warnings: string[] = [];
  const results: ProposalPatchResult[] = [];

  for (const row of rows) {
    const patched = await patchProposalRow(supabase, row, pricingCache, migrationTimestamp);
    if (!patched.changed) continue;
    results.push(patched);
  }

  if (args.apply) {
    for (const result of results) {
      const sourceRow = rows.find((row) => row.proposal_number === result.proposalNumber);
      if (!sourceRow) continue;
      await upsertProposalRow(supabase, sourceRow, result.proposal, migrationTimestamp);
    }
  }

  const summary = {
    apply: args.apply,
    migrationTimestamp,
    profileDir,
    authenticatedUser: auth?.user?.email || localProfileState.auth?.user?.email || null,
    franchise,
    scannedProposals: rows.length,
    updatedProposals: results.length,
    updatedVersions: results.reduce((sum, entry) => sum + entry.versionChanges.length, 0),
    warnings,
    results: results.map((entry) => ({
      proposalNumber: entry.proposalNumber,
      versionChanges: entry.versionChanges,
    })),
  };

  const reportPath = args.reportPath || buildDefaultReportPath(args.franchiseCode, args.apply);
  fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  printSummary(summary);
  console.log('');
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
