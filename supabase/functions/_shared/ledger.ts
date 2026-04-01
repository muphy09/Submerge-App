function normalizeText(value: unknown): string | null {
  const trimmed = String(value || '').trim();
  return trimmed || null;
}

function normalizeRole(value: unknown, fallback = 'designer'): string {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || fallback;
}

function normalizeDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

async function resolveFranchiseName(
  supabase: any,
  franchiseId?: string | null,
  fallbackName?: string | null
) {
  const explicitName = normalizeText(fallbackName);
  if (explicitName) return explicitName;
  const normalizedFranchiseId = normalizeText(franchiseId);
  if (!normalizedFranchiseId) return null;

  const { data, error } = await supabase
    .from('franchises')
    .select('name')
    .eq('id', normalizedFranchiseId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return normalizeText(data?.name);
}

export type LedgerInsertInput = {
  franchiseId?: string | null;
  franchiseName?: string | null;
  actorUser?: { id?: string | null; email?: string | null } | null;
  actorProfile?: {
    id?: string | number | null;
    franchise_id?: string | null;
    role?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  effectiveRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
};

export async function insertLedgerEvent(supabase: any, input: LedgerInsertInput) {
  const franchiseId = normalizeText(input.franchiseId) || normalizeText(input.actorProfile?.franchise_id);
  const actorRole = normalizeRole(input.actorProfile?.role, 'designer');
  const effectiveRole = normalizeRole(input.effectiveRole, actorRole);
  const actorName =
    normalizeText(input.actorProfile?.name) ||
    normalizeText(input.actorProfile?.email) ||
    normalizeText(input.actorUser?.email) ||
    'Unknown User';
  const actorEmail =
    normalizeText(input.actorProfile?.email) ||
    normalizeText(input.actorUser?.email);
  const franchiseName = await resolveFranchiseName(supabase, franchiseId, input.franchiseName);

  const { error } = await supabase.from('ledger_events').insert({
    franchise_id: franchiseId,
    franchise_name: franchiseName,
    actor_auth_user_id: normalizeText(input.actorUser?.id),
    actor_profile_id: normalizeText(input.actorProfile?.id),
    actor_name: actorName,
    actor_email: actorEmail,
    actor_role: actorRole,
    effective_role: effectiveRole,
    action: normalizeText(input.action),
    target_type: normalizeText(input.targetType),
    target_id: normalizeText(input.targetId),
    details: normalizeDetails(input.details),
  });
  if (error) {
    throw error;
  }
}
