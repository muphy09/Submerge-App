import { getSupabaseClient } from './supabaseClient';
import { readMasterImpersonation, readSession } from './session';

export type LedgerEvent = {
  id: string;
  createdAt: string;
  franchiseId?: string | null;
  franchiseName?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole: string;
  effectiveRole: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details: Record<string, any>;
};

export type LedgerLogInput = {
  franchiseId?: string | null;
  franchiseName?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, any>;
};

function normalizeRole(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function toTitleCase(value?: string | null) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return 'Unknown';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function getActingContext() {
  const session = readSession();
  const sessionRole = normalizeRole(session?.role);
  if (sessionRole !== 'master') {
    return {};
  }

  const impersonation = readMasterImpersonation();
  if (!impersonation?.franchiseId) {
    return {};
  }

  return {
    actingAsRole: impersonation.actingRole || 'owner',
    actingAsFranchiseId: impersonation.franchiseId,
    actingAsFranchiseName: impersonation.franchiseName || null,
  };
}

export function getLedgerContextPayload() {
  return getActingContext();
}

function normalizeEvent(row: any): LedgerEvent {
  return {
    id: row.id,
    createdAt: row.created_at,
    franchiseId: row.franchise_id,
    franchiseName: row.franchise_name,
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    actorRole: normalizeRole(row.actor_role) || 'designer',
    effectiveRole: normalizeRole(row.effective_role) || normalizeRole(row.actor_role) || 'designer',
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: row.details && typeof row.details === 'object' ? row.details : {},
  };
}

export function getLedgerRoleLabel(event: Pick<LedgerEvent, 'actorRole' | 'effectiveRole'>) {
  if (normalizeRole(event.actorRole) === 'master' && normalizeRole(event.effectiveRole) !== 'master') {
    return `Master acting as ${toTitleCase(event.effectiveRole)}`;
  }
  return toTitleCase(event.effectiveRole || event.actorRole);
}

export async function logLedgerEvent(payload: LedgerLogInput) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase.functions.invoke('log-ledger-event', {
    body: {
      ...payload,
      ...getActingContext(),
    },
  });
  if (error) throw error;
  return true;
}

export async function logLedgerEventSafe(payload: LedgerLogInput) {
  try {
    await logLedgerEvent(payload);
  } catch (error) {
    console.warn('Unable to write ledger event:', error);
  }
}

export async function listLedgerEvents(limit = 200): Promise<LedgerEvent[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase.functions.invoke('list-ledger-events', {
    body: { limit },
  });
  if (error) throw error;

  const rows = Array.isArray(data?.events) ? data.events : [];
  return rows.map(normalizeEvent);
}
