// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

import * as equipmentPackagesModule from '../src/utils/equipmentPackages.ts';
import * as lightingUtilsModule from '../src/utils/lighting.ts';
import * as proposalWorkflowModule from '../src/services/proposalWorkflow.ts';
import * as proposalVersionsModule from '../src/utils/proposalVersions.ts';
import * as pricingDataStoreModule from '../src/services/pricingDataStore.ts';
import * as proposalDefaultsModule from '../src/utils/proposalDefaults.ts';
import * as customFeaturesUtilsModule from '../src/utils/customFeatures.ts';
import * as warrantyUtilsModule from '../src/utils/warranty.ts';
import * as masterPricingEngineModule from '../src/services/masterPricingEngine.ts';
import * as retiredEquipmentUtilsModule from '../src/utils/retiredEquipment.ts';
import * as defaultPricingDataModule from '../src/services/pricingData.ts';

const equipmentPackages = (equipmentPackagesModule as any).default || equipmentPackagesModule;
const lightingUtils = (lightingUtilsModule as any).default || lightingUtilsModule;
const proposalWorkflow = (proposalWorkflowModule as any).default || proposalWorkflowModule;
const proposalVersions = (proposalVersionsModule as any).default || proposalVersionsModule;
const pricingDataStore = (pricingDataStoreModule as any).default || pricingDataStoreModule;
const proposalDefaults = (proposalDefaultsModule as any).default || proposalDefaultsModule;
const customFeaturesUtils = (customFeaturesUtilsModule as any).default || customFeaturesUtilsModule;
const warrantyUtils = (warrantyUtilsModule as any).default || warrantyUtilsModule;
const retiredEquipmentUtils = (retiredEquipmentUtilsModule as any).default || retiredEquipmentUtilsModule;

const {
  createFreshEquipmentForPackage,
  getEquipmentPackageById,
  isFixedEquipmentPackage,
} = equipmentPackages as any;
const { normalizeEquipmentLighting } = lightingUtils as any;
const {
  ensureProposalWorkflow,
  isVersionPermanentlyLocked,
  getWorkflowStatus,
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
const { getRetiredEquipmentFlags } = retiredEquipmentUtils as any;
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
  remainingRetiredFlags: any;
};

type ProposalPatchResult = {
  changed: boolean;
  proposal: any;
  proposalNumber: string;
  versionChanges: Array<{
    versionId: string;
    versionName: string;
    changes: ChangeRecord[];
    remainingRetiredFlags: any;
  }>;
};

const NONE = 'None';
const APP_PROFILE_NAME = 'submerge-proposal-builder';
const REPORT_DIR = path.join(process.cwd(), 'scripts', 'output');

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith('--')) continue;
    const key = raw.slice(2);
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
    franchiseId: String(args.get('franchise-id') || '').trim() || null,
    profileDir: String(args.get('profile-dir') || '').trim() || null,
    reportPath: String(args.get('report-path') || '').trim() || null,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function lower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function qty(value: unknown) {
  return Math.max(Number(value) || 0, 0);
}

function deepClone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function mergeDeep(base: any, overrides: any): any {
  if (Array.isArray(overrides)) return deepClone(overrides);
  if (!overrides || typeof overrides !== 'object') return overrides ?? deepClone(base);
  if (!base || typeof base !== 'object' || Array.isArray(base)) return deepClone(overrides);

  const result: Record<string, any> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(overrides)]);
  for (const key of keys) {
    const baseValue = base[key];
    const overrideValue = overrides[key];
    if (overrideValue === undefined) {
      result[key] = deepClone(baseValue);
      continue;
    }
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
  const sessionPayloads: any[] = [];
  const impersonationPayloads: any[] = [];

  for (const filePath of getLevelDbFiles(profileDir)) {
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(filePath);
    } catch (error) {
      continue;
    }

    for (const candidate of getPrintableStrings(buffer)) {
      if (!candidate.startsWith('{') || !candidate.endsWith('}')) continue;
      try {
        const parsed = JSON.parse(candidate);
        if (parsed?.access_token && parsed?.refresh_token) {
          authPayloads.push(parsed);
          continue;
        }
        if (parsed?.appSessionLeaseToken && parsed?.appSessionId) {
          sessionPayloads.push(parsed);
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
  const session = sessionPayloads[sessionPayloads.length - 1] || null;
  const impersonation =
    impersonationPayloads.sort(
      (left, right) => Date.parse(right?.startedAt || '') - Date.parse(left?.startedAt || '')
    )[0] || null;

  if (!auth?.access_token || !auth?.refresh_token) {
    throw new Error(`Unable to locate a Supabase auth session in ${profileDir}`);
  }

  return { auth, session, impersonation };
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

function selectionLabel(name: string | undefined | null, quantity?: unknown) {
  const normalizedName = normalizeText(name) || NONE;
  const normalizedQuantity = qty(quantity);
  return normalizedQuantity > 0 ? `${normalizedName} x${normalizedQuantity}` : normalizedName;
}

function namesDiffer(currentName: unknown, nextName: unknown) {
  return lower(currentName) !== lower(nextName);
}

function upsertChange(changes: ChangeRecord[], label: string, before: string, after: string) {
  if (before === after) return;
  changes.push({ label, before, after });
}

function hasNameInCatalog(list: any[] | undefined, name: unknown) {
  const target = lower(name);
  if (!target || target === 'none') return false;
  return (list || []).some((entry) => lower(entry?.name) === target);
}

function getCurrentLightFallback(snapshot: any, type: 'pool' | 'spa') {
  const list =
    type === 'pool'
      ? snapshot?.equipment?.lights?.poolLights || []
      : snapshot?.equipment?.lights?.spaLights || [];
  return list.find((entry: any) => entry?.defaultLightChoice) || list[0] || null;
}

function buildLightReplacement(option: any, type: 'pool' | 'spa') {
  if (!option?.name) return null;
  return {
    type,
    name: option.name,
    basePrice: option.basePrice,
    addCost1: option.addCost1,
    addCost2: option.addCost2,
    price: option.price,
  };
}

function patchLights(
  equipment: any,
  canonical: any,
  snapshot: any,
  type: 'pool' | 'spa',
  includedQuantity: number,
  changes: ChangeRecord[]
) {
  const labelPrefix = type === 'pool' ? 'Pool Light' : 'Spa Light';
  const key = type === 'pool' ? 'poolLights' : 'spaLights';
  const includeKey = type === 'pool' ? 'includePoolLights' : 'includeSpaLights';
  const existing = Array.isArray(equipment[key]) ? equipment[key].map((entry: any) => ({ ...entry })) : [];
  const canonicalLights = Array.isArray(canonical[key]) ? canonical[key].map((entry: any) => ({ ...entry })) : [];
  const next = existing.slice();
  const required = Math.max(includedQuantity, 0);

  for (let index = 0; index < required; index += 1) {
    const before = existing[index]?.name || NONE;
    const replacement = canonicalLights[index] || canonicalLights[0] || null;
    if (!replacement) continue;
    next[index] = { ...replacement };
    upsertChange(changes, `${labelPrefix} ${index + 1}`, before, replacement.name || NONE);
  }

  const fallback = canonicalLights[0] || buildLightReplacement(getCurrentLightFallback(snapshot, type), type);
  for (let index = required; index < next.length; index += 1) {
    const current = next[index];
    if (hasNameInCatalog(snapshot?.equipment?.lights?.[type === 'pool' ? 'poolLights' : 'spaLights'], current?.name)) {
      continue;
    }
    if (!fallback?.name) continue;
    const before = current?.name || NONE;
    next[index] = { ...fallback };
    upsertChange(changes, `${labelPrefix} ${index + 1}`, before, fallback.name || NONE);
  }

  equipment[key] = next;
  if (required > 0) {
    equipment[includeKey] = true;
  }
  if (type === 'pool') {
    equipment.numberOfLights = equipment[includeKey] ? Math.max(next.length - 1, 0) : 0;
  } else {
    equipment.hasSpaLight = equipment[includeKey] && next.length > 0;
  }
}

function patchVersionAgainstPackage(version: any, pricingSnapshot: any, migrationTimestamp: string): VersionPatchResult {
  return withTemporaryPricingSnapshot(pricingSnapshot, () => {
    const packageId = normalizeText(version?.equipment?.packageSelectionId);
    if (!packageId) {
      return {
        changed: false,
        version,
        changes: [],
        remainingRetiredFlags: getRetiredEquipmentFlags(version?.equipment),
      };
    }

    const selectedPackage = getEquipmentPackageById(packageId);
    if (!selectedPackage || !isFixedEquipmentPackage(selectedPackage)) {
      return {
        changed: false,
        version,
        changes: [],
        remainingRetiredFlags: getRetiredEquipmentFlags(version?.equipment),
      };
    }

    const hasSpa = (version?.poolSpecs?.spaType || 'none') !== 'none';
    const hasPool = hasPoolDefinition(version?.poolSpecs);
    const canonicalEquipment = createFreshEquipmentForPackage(selectedPackage, { hasPool, hasSpa });
    const beforeVersion = deepClone(version);
    const nextEquipment = deepClone(version?.equipment || {});
    const changes: ChangeRecord[] = [];

    if (qty(selectedPackage.includedPumpQuantity) > 0 && namesDiffer(nextEquipment?.pump?.name, canonicalEquipment?.pump?.name)) {
      upsertChange(
        changes,
        'Pump',
        selectionLabel(nextEquipment?.pump?.name, nextEquipment?.pumpQuantity),
        selectionLabel(canonicalEquipment?.pump?.name, selectedPackage.includedPumpQuantity)
      );
      nextEquipment.pump = deepClone(canonicalEquipment.pump);
      nextEquipment.pumpQuantity = qty(selectedPackage.includedPumpQuantity);
    }

    if (qty(selectedPackage.includedFilterQuantity) > 0 && namesDiffer(nextEquipment?.filter?.name, canonicalEquipment?.filter?.name)) {
      upsertChange(
        changes,
        'Filter',
        selectionLabel(nextEquipment?.filter?.name, nextEquipment?.filterQuantity),
        selectionLabel(canonicalEquipment?.filter?.name, selectedPackage.includedFilterQuantity)
      );
      nextEquipment.filter = deepClone(canonicalEquipment.filter);
      nextEquipment.filterQuantity = qty(selectedPackage.includedFilterQuantity);
    }

    if (qty(selectedPackage.includedHeaterQuantity) > 0 && namesDiffer(nextEquipment?.heater?.name, canonicalEquipment?.heater?.name)) {
      upsertChange(
        changes,
        'Heater',
        selectionLabel(nextEquipment?.heater?.name, nextEquipment?.heaterQuantity),
        selectionLabel(canonicalEquipment?.heater?.name, selectedPackage.includedHeaterQuantity)
      );
      nextEquipment.heater = deepClone(canonicalEquipment.heater);
      nextEquipment.heaterQuantity = qty(selectedPackage.includedHeaterQuantity);
    }

    if (
      qty(selectedPackage.includedAutomationQuantity) > 0 &&
      namesDiffer(nextEquipment?.automation?.name, canonicalEquipment?.automation?.name)
    ) {
      upsertChange(
        changes,
        'Automation',
        selectionLabel(nextEquipment?.automation?.name, nextEquipment?.automationQuantity),
        selectionLabel(canonicalEquipment?.automation?.name, selectedPackage.includedAutomationQuantity)
      );
      nextEquipment.automation = deepClone(canonicalEquipment.automation);
      nextEquipment.automationQuantity = qty(selectedPackage.includedAutomationQuantity);
    }

    if (namesDiffer(nextEquipment?.saltSystem?.name, canonicalEquipment?.saltSystem?.name)) {
      upsertChange(
        changes,
        'Primary Sanitation',
        selectionLabel(nextEquipment?.saltSystem?.name, nextEquipment?.saltSystemQuantity),
        selectionLabel(canonicalEquipment?.saltSystem?.name, canonicalEquipment?.saltSystemQuantity)
      );
      nextEquipment.saltSystem = deepClone(canonicalEquipment.saltSystem);
      nextEquipment.saltSystemQuantity = qty(canonicalEquipment?.saltSystemQuantity);
    }

    if (
      qty(selectedPackage.includedSanitationAccessoryQuantity) > 0 &&
      namesDiffer(nextEquipment?.sanitationAccessory?.name, canonicalEquipment?.sanitationAccessory?.name)
    ) {
      upsertChange(
        changes,
        'Sanitation Accessory',
        selectionLabel(nextEquipment?.sanitationAccessory?.name, nextEquipment?.sanitationAccessoryQuantity),
        selectionLabel(canonicalEquipment?.sanitationAccessory?.name, selectedPackage.includedSanitationAccessoryQuantity)
      );
      nextEquipment.sanitationAccessory = deepClone(canonicalEquipment.sanitationAccessory);
      nextEquipment.sanitationAccessoryQuantity = qty(selectedPackage.includedSanitationAccessoryQuantity);
    } else if (
      selectedPackage.defaultSanitationAccessoryName &&
      nextEquipment?.sanitationAccessory?.name &&
      !hasNameInCatalog(pricingSnapshot?.equipment?.sanitationAccessories, nextEquipment?.sanitationAccessory?.name)
    ) {
      upsertChange(
        changes,
        'Sanitation Accessory',
        selectionLabel(nextEquipment?.sanitationAccessory?.name, nextEquipment?.sanitationAccessoryQuantity),
        selectionLabel(canonicalEquipment?.sanitationAccessory?.name, canonicalEquipment?.sanitationAccessoryQuantity)
      );
      nextEquipment.sanitationAccessory = deepClone(canonicalEquipment.sanitationAccessory);
      nextEquipment.sanitationAccessoryQuantity = qty(canonicalEquipment?.sanitationAccessoryQuantity);
    }

    if (
      qty(selectedPackage.includedAutoFillSystemQuantity) > 0 &&
      namesDiffer(nextEquipment?.autoFillSystem?.name, canonicalEquipment?.autoFillSystem?.name)
    ) {
      upsertChange(
        changes,
        'Auto-Fill',
        selectionLabel(nextEquipment?.autoFillSystem?.name, nextEquipment?.autoFillSystemQuantity),
        selectionLabel(canonicalEquipment?.autoFillSystem?.name, selectedPackage.includedAutoFillSystemQuantity)
      );
      nextEquipment.autoFillSystem = deepClone(canonicalEquipment.autoFillSystem);
      nextEquipment.autoFillSystemQuantity = qty(selectedPackage.includedAutoFillSystemQuantity);
    } else if (
      selectedPackage.defaultAutoFillSystemName &&
      nextEquipment?.autoFillSystem?.name &&
      !hasNameInCatalog(pricingSnapshot?.equipment?.autoFillSystem, nextEquipment?.autoFillSystem?.name)
    ) {
      upsertChange(
        changes,
        'Auto-Fill',
        selectionLabel(nextEquipment?.autoFillSystem?.name, nextEquipment?.autoFillSystemQuantity),
        selectionLabel(canonicalEquipment?.autoFillSystem?.name, canonicalEquipment?.autoFillSystemQuantity)
      );
      nextEquipment.autoFillSystem = deepClone(canonicalEquipment.autoFillSystem);
      nextEquipment.autoFillSystemQuantity = qty(canonicalEquipment?.autoFillSystemQuantity);
    }

    patchLights(nextEquipment, canonicalEquipment, pricingSnapshot, 'pool', qty(selectedPackage.includedPoolLightQuantity), changes);
    patchLights(nextEquipment, canonicalEquipment, pricingSnapshot, 'spa', qty(selectedPackage.includedSpaLightQuantity), changes);

    if (
      selectedPackage.defaultCleanerName &&
      nextEquipment?.cleaner?.name &&
      !hasNameInCatalog(pricingSnapshot?.equipment?.cleaners, nextEquipment?.cleaner?.name)
    ) {
      upsertChange(
        changes,
        'Cleaner',
        selectionLabel(nextEquipment?.cleaner?.name, nextEquipment?.cleanerQuantity),
        selectionLabel(canonicalEquipment?.cleaner?.name, canonicalEquipment?.cleanerQuantity)
      );
      nextEquipment.cleaner = deepClone(canonicalEquipment.cleaner);
      nextEquipment.cleanerQuantity = qty(canonicalEquipment?.cleanerQuantity);
    }

    const normalizedEquipment = normalizeEquipmentLighting(nextEquipment, {
      poolSpecs: version?.poolSpecs || {},
      hasPool,
      hasSpa,
    });
    normalizedEquipment.hasBeenEdited = true;

    const recalculated = recalculateProposal(
      {
        ...version,
        equipment: normalizedEquipment,
        versions: [],
        lastModified: changes.length ? migrationTimestamp : version?.lastModified,
      },
      pricingSnapshot
    );
    const remainingRetiredFlags = getRetiredEquipmentFlags(recalculated?.equipment);

    return {
      changed: changes.length > 0,
      version:
        changes.length > 0
          ? {
              ...recalculated,
              createdDate: version?.createdDate || recalculated?.createdDate,
              versionSubmittedAt: version?.versionSubmittedAt ?? recalculated?.versionSubmittedAt,
              versionSubmittedBy: version?.versionSubmittedBy ?? recalculated?.versionSubmittedBy,
              versionLocked: version?.versionLocked ?? recalculated?.versionLocked,
              versionLockedAt: version?.versionLockedAt ?? recalculated?.versionLockedAt,
            }
          : beforeVersion,
      changes,
      remainingRetiredFlags,
    };
  });
}

async function loadPricingSnapshotForVersion(
  supabase: any,
  cache: Map<string, any>,
  container: any,
  version: any
) {
  const sourceFranchiseId =
    normalizeText(version?.pricingModelFranchiseId) ||
    normalizeText(version?.franchiseId) ||
    normalizeText(container?.franchiseId);
  const modelId =
    normalizeText(version?.pricingModelId) ||
    normalizeText(container?.pricingModelId) ||
    '';
  const cacheKey = `${sourceFranchiseId}::${modelId || 'default'}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

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
    if (isVersionPermanentlyLocked(version)) {
      patchedById.set(versionId, { ...version, versions: [] });
      continue;
    }

    const pricingState = await loadPricingSnapshotForVersion(supabase, pricingCache, container, version);
    const patchResult = patchVersionAgainstPackage(version, pricingState.pricing, migrationTimestamp);
    patchedById.set(versionId, { ...patchResult.version, versions: [] });

    if (patchResult.changed) {
      versionChanges.push({
        versionId,
        versionName: normalizeText(version?.versionName) || (versionId === ORIGINAL_VERSION_ID ? 'Original' : 'Version'),
        changes: patchResult.changes,
        remainingRetiredFlags: patchResult.remainingRetiredFlags,
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
    `package-equipment-migration-${franchiseCode}-${apply ? 'apply' : 'dry-run'}-${timestamp}.json`
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
