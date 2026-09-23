import type { Proposal, ProposalWorkflowActor } from '../types/proposal-new';
import { getSupabaseClient } from './supabaseClient';
import { DEFAULT_FRANCHISE_ID, getSessionFranchiseCode, getSessionFranchiseId } from './session';
import {
  type ContractTemplate,
  type ContractStaticPatch,
  type TemplateField,
} from './contractTemplates';

const CONTRACT_BUCKET = 'franchise-contract-templates';
const CONTRACT_CACHE = 'submerge-contract-template-revisions-v1';
const CONTRACT_CATALOG_CACHE = 'submerge-contract-template-catalog-v1';

type RevisionRules = {
  schemaVersion?: number;
  renderProfile?: string;
  defaultFieldValues?: Record<string, string>;
  staticPatches?: ContractStaticPatch[];
  changeNotes?: string[];
  effectivePublishedAt?: string | null;
  legacyBundledId?: string;
};

export type ContractRevisionDescriptor = {
  templateId: string;
  templateName: string;
  revisionId: string;
  revisionNumber: number;
  franchiseId: string;
  jurisdictionKey: string;
  poolType: 'shotcrete' | 'fiberglass';
  originalFileName: string;
  publishedAt?: string | null;
  publishedBy?: string | null;
  source: 'bundled' | 'remote';
  remoteRevisionId?: string;
  changeNotes?: string[];
  legacyBundledId?: string;
  contractTemplate: ContractTemplate;
};

export type ContractRevisionCheck = {
  pinned: ContractRevisionDescriptor;
  latest: ContractRevisionDescriptor;
  changeNotes: string[];
  requiresReview: boolean;
  canAdoptInitialRevisionSilently: boolean;
};

export type ContractTemplateSummary = {
  id: string;
  franchise_id: string;
  name: string;
  jurisdiction_key: string;
  pool_type: 'shotcrete' | 'fiberglass';
  current_revision_id?: string | null;
  is_active?: boolean;
  remote_client_published?: boolean;
};

type RemoteTemplateRow = ContractTemplateSummary;

type RemoteRevisionRow = {
  id: string;
  contract_template_id: string;
  franchise_id: string;
  revision_number: number;
  storage_path: string;
  original_file_name: string;
  field_layout_json?: unknown;
  autofill_rules_json?: unknown;
  file_checksum?: string;
  published_at?: string | null;
  published_by?: string | null;
};

type RemoteCatalog = { templates: RemoteTemplateRow[]; revisions: RemoteRevisionRow[] };

const schemaUnavailable = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || message.includes('does not exist') || message.includes('schema cache');
};

const normalizePoolType = (proposal: Proposal): 'shotcrete' | 'fiberglass' =>
  proposal.poolSpecs?.poolType === 'fiberglass' ? 'fiberglass' : 'shotcrete';

const normalizeJurisdiction = (proposal: Proposal) =>
  String(proposal.customerInfo?.state || '*').trim().toUpperCase() || '*';

function cachedCatalog(franchiseId: string): RemoteCatalog | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(`${CONTRACT_CATALOG_CACHE}:${franchiseId}`) || 'null');
    return Array.isArray(parsed?.templates) && Array.isArray(parsed?.revisions) ? parsed : null;
  } catch {
    return null;
  }
}

async function loadCatalog(franchiseId: string): Promise<RemoteCatalog> {
  const supabase = getSupabaseClient();
  if (supabase && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
    try {
      const { data: templates, error: templateError } = await supabase
        .from('franchise_contract_templates')
        .select('id,franchise_id,name,jurisdiction_key,pool_type,current_revision_id,is_active,remote_client_published')
        .eq('franchise_id', franchiseId);
      if (templateError) throw templateError;
      const { data: revisions, error: revisionError } = await supabase
        .from('franchise_contract_template_revisions')
        .select('id,contract_template_id,franchise_id,revision_number,storage_path,original_file_name,file_checksum,field_layout_json,autofill_rules_json,published_at,published_by')
        .eq('franchise_id', franchiseId);
      if (revisionError) throw revisionError;
      const catalog = { templates: (templates || []) as RemoteTemplateRow[], revisions: (revisions || []) as RemoteRevisionRow[] };
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`${CONTRACT_CATALOG_CACHE}:${franchiseId}`, JSON.stringify(catalog));
      }
      return catalog;
    } catch (error) {
      const cached = cachedCatalog(franchiseId);
      if (cached) return cached;
      if (schemaUnavailable(error)) return { templates: [], revisions: [] };
      throw error;
    }
  }
  const cached = cachedCatalog(franchiseId);
  if (cached) return cached;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Contracts are not cached on this device. Connect to the internet and sign in once to download them.');
  }
  return { templates: [], revisions: [] };
}

function revisionRules(revision: RemoteRevisionRow, requireVersioned: boolean): RevisionRules {
  const input = revision.autofill_rules_json;
  const rules = input && typeof input === 'object' && !Array.isArray(input) ? input as RevisionRules : {};
  if (requireVersioned) {
    if (rules.schemaVersion !== 2 || rules.renderProfile !== 'ppas-west-2026-v1' ||
        !rules.defaultFieldValues || !['3', '4'].includes(rules.defaultFieldValues.p1_36) ||
        !Array.isArray(rules.changeNotes)) {
      throw new Error('The published PPAS West contract revision is missing required revision rules.');
    }
  }
  return rules;
}

function visibleTemplate(row: RemoteTemplateRow, west: boolean) {
  return west ? row.remote_client_published === true : row.is_active === true;
}

async function isWestFranchise(franchiseId: string) {
  if (getSessionFranchiseId() === franchiseId) {
    return getSessionFranchiseCode() === '5555';
  }
  if (typeof localStorage !== 'undefined' && localStorage.getItem(`submerge-west-franchise:${franchiseId}`) === '1') {
    return true;
  }
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('franchises')
    .select('franchise_code')
    .eq('id', franchiseId)
    .maybeSingle();
  if (error) return false;
  const west = String(data?.franchise_code || '').trim() === '5555';
  if (west && typeof localStorage !== 'undefined') localStorage.setItem(`submerge-west-franchise:${franchiseId}`, '1');
  return west;
}

function cacheRequestForRevision(revisionId: string) {
  return new Request(`https://contract-cache.submerge.local/${encodeURIComponent(revisionId)}`);
}

function electronContractCacheAvailable() {
  return typeof window !== 'undefined' &&
    typeof window.electron?.getContractRevisionPdf === 'function' &&
    typeof window.electron?.saveContractRevisionPdf === 'function';
}

async function readCachedPdf(revision: RemoteRevisionRow): Promise<Response | null> {
  if (electronContractCacheAvailable()) {
    const bytes = await window.electron.getContractRevisionPdf({ franchiseId: revision.franchise_id, revisionId: revision.id });
    return bytes ? new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf' } }) : null;
  }
  if (typeof caches === 'undefined') return null;
  const cache = await caches.open(CONTRACT_CACHE);
  return (await cache.match(cacheRequestForRevision(revision.id))) || null;
}

async function saveCachedPdf(revision: RemoteRevisionRow, blob: Blob): Promise<void> {
  if (electronContractCacheAvailable()) {
    await window.electron.saveContractRevisionPdf({
      franchiseId: revision.franchise_id, revisionId: revision.id,
      bytes: new Uint8Array(await blob.arrayBuffer()),
    });
    return;
  }
  if (typeof caches !== 'undefined') {
    const cache = await caches.open(CONTRACT_CACHE);
    await cache.put(cacheRequestForRevision(revision.id), new Response(blob, { headers: { 'Content-Type': 'application/pdf' } }));
  }
}

async function verifiedPdfBlob(response: Response, revision: RemoteRevisionRow): Promise<Blob> {
  const blob = await response.blob();
  if (revisionRules(revision, false).schemaVersion === 2) {
    const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    const checksum = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (checksum.toLowerCase() !== String(revision.file_checksum || '').toLowerCase()) {
      throw new Error('Contract PDF checksum does not match its published revision.');
    }
  }
  return blob;
}

async function loadRemotePdfUrl(revision: RemoteRevisionRow): Promise<string> {
  const supabase = getSupabaseClient();
  let downloadError: unknown;

  if (supabase && typeof navigator !== 'undefined' && navigator.onLine !== false) {
    try {
      const { data, error } = await supabase.storage
        .from(CONTRACT_BUCKET)
        .createSignedUrl(revision.storage_path, 3600);
      if (error || !data?.signedUrl) throw error || new Error('No signed contract URL was returned.');
      const response = await fetch(data.signedUrl);
      if (!response.ok) throw new Error(`Contract download failed (${response.status}).`);
      const blob = await verifiedPdfBlob(response, revision);
      try {
        await saveCachedPdf(revision, blob);
      } catch (cacheError) {
        console.warn('Contract revision opened but could not be saved for offline use.', cacheError);
      }
      return URL.createObjectURL(blob);
    } catch (error) {
      downloadError = error;
      console.warn('Unable to refresh remote contract template; checking local cache.', error);
    }
  }

  const cached = await readCachedPdf(revision);
  if (cached) return URL.createObjectURL(await verifiedPdfBlob(cached, revision));
  if (downloadError instanceof Error && downloadError.message.includes('checksum')) throw downloadError;
  throw new Error('This contract revision is not cached on this device. Connect to the internet and open it once.');
}

function validFields(input: unknown): TemplateField[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const fields = input.filter((field: any) =>
    field &&
    typeof field.id === 'string' &&
    Number.isFinite(field.page) &&
    Array.isArray(field.rect) &&
    field.rect.length === 4
  ) as TemplateField[];
  // Mirrored contract cells intentionally repeat an ID on multiple pages.
  return fields.length === input.length ? fields : null;
}

function validStaticPatches(input: unknown): ContractStaticPatch[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return null;
  const patches = input.filter((patch: any) =>
    patch && Number.isInteger(patch.page) && patch.page > 0 &&
    Array.isArray(patch.rect) && patch.rect.length === 4 &&
    patch.rect.every((value: unknown) => typeof value === 'number' && Number.isFinite(value)) &&
    (patch.fill === undefined || patch.fill === 'white' || patch.fill === 'headerGray') &&
    (patch.texts === undefined || (Array.isArray(patch.texts) && patch.texts.every((overlay: any) =>
      overlay && typeof overlay.text === 'string' &&
      Number.isFinite(overlay.x) && Number.isFinite(overlay.y) && Number.isFinite(overlay.fontSize)
    )))
  ) as ContractStaticPatch[];
  return patches.length === input.length ? patches : null;
}

async function descriptorFromRemote(
  templateRow: RemoteTemplateRow,
  revisionRow: RemoteRevisionRow,
  requireVersioned: boolean,
  savedRevisionId?: string
): Promise<ContractRevisionDescriptor> {
  const rules = revisionRules(revisionRow, requireVersioned);
  const fields = validFields(revisionRow.field_layout_json);
  if (!fields) throw new Error('The published contract revision has an invalid field layout.');
  const staticPatches = validStaticPatches(rules.staticPatches);
  if (!staticPatches) throw new Error('The published contract revision has invalid rendering patches.');
  const pdfUrl = await loadRemotePdfUrl(revisionRow);
  return {
    templateId: templateRow.id,
    templateName: templateRow.name,
    revisionId: savedRevisionId || revisionRow.id,
    remoteRevisionId: revisionRow.id,
    revisionNumber: revisionRow.revision_number,
    franchiseId: templateRow.franchise_id,
    jurisdictionKey: templateRow.jurisdiction_key,
    poolType: templateRow.pool_type,
    originalFileName: revisionRow.original_file_name,
    publishedAt: rules.effectivePublishedAt || revisionRow.published_at,
    publishedBy: revisionRow.published_by,
    source: 'remote',
    changeNotes: rules.changeNotes || [],
    legacyBundledId: rules.legacyBundledId,
    contractTemplate: {
      id: templateRow.id,
      label: templateRow.name,
      pdfUrl,
      pdfPath: '',
      fields,
      staticPatches,
      defaultFieldValues: rules.defaultFieldValues,
    },
  };
}

function currentRevisionRow(catalog: RemoteCatalog, proposal: Proposal, west: boolean) {
  const poolType = normalizePoolType(proposal);
  const jurisdiction = normalizeJurisdiction(proposal);
  const rows = catalog.templates.filter((row) => row.pool_type === poolType && visibleTemplate(row, west));
  const templateRow = rows.find(
    (row) => String(row.jurisdiction_key || '*').toUpperCase() === jurisdiction
  ) || rows.find((row) => row.jurisdiction_key === '*');
  if (!templateRow?.current_revision_id) return null;
  const revision = catalog.revisions.find((row) => row.id === templateRow.current_revision_id);
  if (!revision) throw new Error('The published contract revision could not be found.');
  return { templateRow, revision };
}

function savedRevisionRow(catalog: RemoteCatalog, revisionId: string) {
  const revision = catalog.revisions.find((row) => row.id === revisionId ||
    revisionRules(row, false).legacyBundledId === revisionId);
  const template = catalog.templates.find((row) => row.id === revision?.contract_template_id);
  return revision && template ? { template, revision } : null;
}

export async function checkProposalContractRevision(proposal: Proposal): Promise<ContractRevisionCheck | null> {
  if (!proposal.franchiseId) return null;
  // Master-area proposals borrow a franchise's pricing model without changing
  // proposal ownership. Their contracts must come from that same franchise.
  // Ordinary franchise proposals always retain their own contract scope.
  const contractFranchiseId = proposal.franchiseId === DEFAULT_FRANCHISE_ID
    ? proposal.pricingModelFranchiseId || proposal.franchiseId
    : proposal.franchiseId;
  proposal = { ...proposal, franchiseId: contractFranchiseId };
  const west = await isWestFranchise(contractFranchiseId);
  const catalog = await loadCatalog(contractFranchiseId);
  const current = currentRevisionRow(catalog, proposal, west);
  if (!current && proposal.contractTemplateRevisionId) {
    throw new Error('A current contract template has not been published for this proposal type. The saved revision was not changed.');
  }
  if (!current) return null;
  const latest = await descriptorFromRemote(current.templateRow, current.revision, west);
  const createdAt = Date.parse(String(proposal.createdDate || ''));
  let saved = proposal.contractTemplateRevisionId
    ? savedRevisionRow(catalog, proposal.contractTemplateRevisionId)
    : null;
  if (!saved && !proposal.contractTemplateRevisionId && west) {
    const history = catalog.revisions
      .filter((row) => row.contract_template_id === current.templateRow.id)
      .sort((left, right) => left.revision_number - right.revision_number);
    const atCreation = history.filter((row) => {
      const publishedAt = Date.parse(String(revisionRules(row, true).effectivePublishedAt || ''));
      return Number.isFinite(createdAt) && Number.isFinite(publishedAt) && publishedAt <= createdAt;
    });
    const revision = atCreation[atCreation.length - 1] || history[0];
    if (revision) saved = { template: current.templateRow, revision };
  }
  if (!saved && proposal.contractTemplateRevisionId) {
    throw new Error('The saved contract revision could not be loaded. Reconnect and try again, or ask your administrator to check the saved revision.');
  }
  const pinned = saved
    ? saved.revision.id === latest.remoteRevisionId && !proposal.contractTemplateRevisionId
      ? latest
      : await descriptorFromRemote(saved.template, saved.revision, west, proposal.contractTemplateRevisionId || undefined)
    : latest;
  if (pinned.franchiseId !== proposal.franchiseId || latest.franchiseId !== proposal.franchiseId) {
    throw new Error('The selected contract revision does not belong to this proposal franchise.');
  }
  const changed = pinned.remoteRevisionId !== latest.remoteRevisionId;
  const silentInitial =
    !proposal.contractTemplateRevisionId &&
    !changed;
  const alreadyDeclined =
    proposal.contractRevisionReview?.decision === 'declined' &&
    (proposal.contractRevisionReview.latestRevisionId === latest.revisionId ||
      proposal.contractRevisionReview.latestRevisionId === latest.legacyBundledId);
  const changeNotes = changed && pinned.templateId === latest.templateId
    ? catalog.revisions
        .filter((row) => row.contract_template_id === latest.templateId &&
          row.revision_number > pinned.revisionNumber && row.revision_number <= latest.revisionNumber)
        .sort((left, right) => left.revision_number - right.revision_number)
        .flatMap((row) => revisionRules(row, west).changeNotes || [])
    : [];
  return {
    pinned,
    latest,
    changeNotes,
    requiresReview: changed && !silentInitial && !alreadyDeclined,
    canAdoptInitialRevisionSilently: silentInitial,
  };
}

export function adoptContractRevision(
  proposal: Proposal,
  revision: ContractRevisionDescriptor,
  actor?: ProposalWorkflowActor | null
): Proposal {
  return {
    ...proposal,
    contractTemplateId: revision.templateId,
    contractTemplateRevisionId: revision.revisionId,
    contractTemplateRevisionNumber: revision.revisionNumber,
    contractRevisionReview: {
      latestRevisionId: revision.revisionId,
      latestRevisionNumber: revision.revisionNumber,
      decision: 'upgraded',
      detectedAt: proposal.contractRevisionReview?.detectedAt || new Date().toISOString(),
      decidedAt: new Date().toISOString(),
      decidedBy: actor || null,
    },
  };
}

export function declineContractRevision(
  proposal: Proposal,
  pinned: ContractRevisionDescriptor,
  latest: ContractRevisionDescriptor,
  actor?: ProposalWorkflowActor | null
): Proposal {
  return {
    ...proposal,
    contractTemplateId: pinned.templateId,
    contractTemplateRevisionId: pinned.revisionId,
    contractTemplateRevisionNumber: pinned.revisionNumber,
    contractRevisionReview: {
      latestRevisionId: latest.revisionId,
      latestRevisionNumber: latest.revisionNumber,
      decision: 'declined',
      detectedAt: proposal.contractRevisionReview?.detectedAt || new Date().toISOString(),
      decidedAt: new Date().toISOString(),
      decidedBy: actor || null,
    },
  };
}

export async function listContractTemplatesForFranchise(franchiseId: string, franchiseCode?: string | null) {
  const west = String(franchiseCode || '').trim() === '5555' || await isWestFranchise(franchiseId);
  const catalog = await loadCatalog(franchiseId);
  return catalog.templates.filter((row) => visibleTemplate(row, west))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function loadContractTemplatePreview(
  template: ContractTemplateSummary
): Promise<{ name: string; revisionNumber: number; pdfUrl: string }> {
  if (!template.current_revision_id) throw new Error('This contract template does not have a published revision.');
  const catalog = await loadCatalog(template.franchise_id);
  const revision = catalog.revisions.find((row) => row.id === template.current_revision_id);
  if (!revision) throw new Error('The published contract revision could not be found.');
  return {
    name: template.name,
    revisionNumber: revision.revision_number,
    pdfUrl: await loadRemotePdfUrl(revision),
  };
}

export async function prefetchWestContractRevisions(franchiseId: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (!await isWestFranchise(franchiseId)) return;
  const catalog = await loadCatalog(franchiseId);
  const published = catalog.templates.filter((row) => visibleTemplate(row, true));
  if (published.length !== 4) throw new Error('PPAS West must have all four published remote contract templates.');
  for (const template of published) {
    const history = catalog.revisions.filter((row) => row.contract_template_id === template.id);
    if (!history.length || !history.some((row) => row.id === template.current_revision_id)) {
      throw new Error(`PPAS West contract ${template.name} has an incomplete revision history.`);
    }
    for (const revision of history) {
      revisionRules(revision, true);
      const cached = await readCachedPdf(revision);
      if (cached) {
        try {
          await verifiedPdfBlob(cached, revision);
          continue;
        } catch (error) {
          console.warn('Replacing invalid cached contract revision.', error);
        }
      }
      await loadRemotePdfUrl(revision);
    }
  }
}
