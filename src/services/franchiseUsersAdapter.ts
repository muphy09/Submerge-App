import { getSupabaseClient } from './supabaseClient';
import { Proposal } from '../types/proposal-new';
import { isEnvFlagTrue } from './env';
import { getLedgerContextPayload, logLedgerEventSafe } from './ledger';
import { normalizeUserCommissionRates, type UserCommissionRates } from './userCommissionRates';

export type FranchiseUser = UserCommissionRates & {
  id: string;
  franchiseId: string;
  email: string;
  name?: string | null;
  role: 'owner' | 'admin' | 'bookkeeper' | 'designer';
  isActive: boolean;
  passwordResetRequired?: boolean;
  createdAt?: string;
  updatedAt?: string;
  approvalMarginThresholdPercent: number;
  discountAllowanceThresholdPercent: number;
  alwaysRequireApproval: boolean;
};

const SUPABASE_REQUIRED = isEnvFlagTrue('VITE_SUPABASE_ONLY');

function normalizeName(name?: string | null) {
  return String(name || '').trim();
}

function normalizeEmail(email?: string | null) {
  return String(email || '').trim().toLowerCase();
}

function normalizeThresholdPercent(value: unknown, fallback = 18) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function requireSupabase() {
  if (SUPABASE_REQUIRED) {
    throw new Error('Supabase is required but not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
}

async function extractFunctionErrorMessage(error: any): Promise<string | null> {
  const context = error?.context;
  if (context && typeof context.json === 'function') {
    try {
      const parsed = await context.json();
      return typeof parsed?.error === 'string' ? parsed.error : null;
    } catch (parseError) {
      // fall through
    }
  }

  const body = context?.body;
  if (!body) return null;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return typeof parsed?.error === 'string' ? parsed.error : null;
    } catch (parseError) {
      return null;
    }
  }
  if (typeof body?.error === 'string') {
    return body.error;
  }
  return null;
}

export async function listFranchiseUsers(franchiseId: string): Promise<FranchiseUser[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return [];
  }
  const { data, error } = await supabase
    .from('franchise_users')
    .select(
      'id,franchise_id,name,email,role,is_active,password_reset_required,created_at,updated_at,dig_commission_rate,closeout_commission_rate,approval_margin_threshold_percent,discount_allowance_threshold_percent,always_require_approval'
    )
    .eq('franchise_id', franchiseId)
    .order('name', { ascending: true });
  if (error) throw error;
  const rows = (data || []).map((row: any) => ({
    id: row.id,
    franchiseId: row.franchise_id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: Boolean(row.is_active),
    passwordResetRequired: Boolean(row.password_reset_required),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvalMarginThresholdPercent: normalizeThresholdPercent(row.approval_margin_threshold_percent),
    discountAllowanceThresholdPercent: normalizeThresholdPercent(row.discount_allowance_threshold_percent),
    alwaysRequireApproval: row.always_require_approval === true,
    ...normalizeUserCommissionRates({
      digCommissionRate: row.dig_commission_rate,
      closeoutCommissionRate: row.closeout_commission_rate,
    }),
  }));
  const activeRows = rows.filter((row) => row.isActive);
  const weight = { owner: 3, admin: 2, bookkeeper: 1, designer: 0 } as Record<string, number>;
  return activeRows.sort(
    (a, b) =>
      weight[b.role] - weight[a.role] ||
      normalizeName(a.name).localeCompare(normalizeName(b.name)) ||
      a.email.localeCompare(b.email)
  );
}

export async function createFranchiseUser(payload: {
  franchiseId: string;
  email: string;
  name?: string | null;
  role?: 'owner' | 'admin' | 'bookkeeper' | 'designer';
}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return null;
  }
  const email = normalizeEmail(payload.email);
  if (!email) throw new Error('Email is required');
  const displayName = normalizeName(payload.name || '') || null;

  const { data, error } = await supabase.functions.invoke('create-franchise-user', {
    body: {
      franchiseId: payload.franchiseId,
      email,
      name: displayName,
      role: payload.role || 'designer',
      ...getLedgerContextPayload(),
    },
  });
  if (error) {
    const message = await extractFunctionErrorMessage(error);
    if (message) {
      throw new Error(message);
    }
    throw error;
  }
  return data as { tempPassword?: string; userId?: string };
}

export async function updateFranchiseUserRole(
  userId: string,
  role: 'owner' | 'admin' | 'bookkeeper' | 'designer'
) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return null;
  }
  const { data, error } = await supabase.functions.invoke('update-franchise-user-role', {
    body: { userId, role, ...getLedgerContextPayload() },
  });
  if (error) {
    const message = await extractFunctionErrorMessage(error);
    if (message) {
      throw new Error(message);
    }
    throw error;
  }
  return data as { success?: boolean; user?: Pick<FranchiseUser, 'id' | 'franchiseId' | 'role' | 'isActive'> };
}

export async function updateFranchiseUserApprovalSettings(
  userId: string,
  settings: {
    approvalMarginThresholdPercent: number;
    discountAllowanceThresholdPercent: number;
    alwaysRequireApproval: boolean;
  }
) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return null;
  }

  const nextApprovalMarginThresholdPercent = normalizeThresholdPercent(
    settings.approvalMarginThresholdPercent
  );
  const nextDiscountAllowanceThresholdPercent = normalizeThresholdPercent(
    settings.discountAllowanceThresholdPercent
  );
  const nextAlwaysRequireApproval = settings.alwaysRequireApproval === true;

  const { data: currentUser, error: currentUserError } = await supabase
    .from('franchise_users')
    .select(
      'id,franchise_id,name,email,role,approval_margin_threshold_percent,discount_allowance_threshold_percent,always_require_approval'
    )
    .eq('id', userId)
    .maybeSingle();
  if (currentUserError) throw currentUserError;

  const { error } = await supabase
    .from('franchise_users')
    .update({
      approval_margin_threshold_percent: nextApprovalMarginThresholdPercent,
      discount_allowance_threshold_percent: nextDiscountAllowanceThresholdPercent,
      always_require_approval: nextAlwaysRequireApproval,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) throw error;

  await logLedgerEventSafe({
    franchiseId: currentUser?.franchise_id || null,
    action: 'User approval settings updated',
    targetType: 'user',
    targetId: userId,
    details: {
      targetUserId: userId,
      targetName: currentUser?.name || null,
      targetEmail: currentUser?.email || null,
      targetRole: currentUser?.role || null,
      previousApprovalMarginThresholdPercent: currentUser?.approval_margin_threshold_percent ?? null,
      nextApprovalMarginThresholdPercent,
      previousDiscountAllowanceThresholdPercent: currentUser?.discount_allowance_threshold_percent ?? null,
      nextDiscountAllowanceThresholdPercent,
      previousAlwaysRequireApproval: currentUser?.always_require_approval ?? null,
      nextAlwaysRequireApproval,
    },
  });

  return {
    approvalMarginThresholdPercent: nextApprovalMarginThresholdPercent,
    discountAllowanceThresholdPercent: nextDiscountAllowanceThresholdPercent,
    alwaysRequireApproval: nextAlwaysRequireApproval,
  };
}

export async function updateFranchiseUserCommissionRates(
  userId: string,
  rates: Partial<UserCommissionRates>
) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return null;
  }

  const normalizedRates = normalizeUserCommissionRates(rates);
  const { data: currentUser, error: currentUserError } = await supabase
    .from('franchise_users')
    .select('id,franchise_id,name,email,role,dig_commission_rate,closeout_commission_rate')
    .eq('id', userId)
    .maybeSingle();
  if (currentUserError) throw currentUserError;
  const { error } = await supabase
    .from('franchise_users')
    .update({
      dig_commission_rate: normalizedRates.digCommissionRate,
      closeout_commission_rate: normalizedRates.closeoutCommissionRate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) throw error;
  await logLedgerEventSafe({
    franchiseId: currentUser?.franchise_id || null,
    action: 'User commission rates updated',
    targetType: 'user',
    targetId: userId,
    details: {
      targetUserId: userId,
      targetName: currentUser?.name || null,
      targetEmail: currentUser?.email || null,
      targetRole: currentUser?.role || null,
      previousDigCommissionRate: currentUser?.dig_commission_rate ?? null,
      nextDigCommissionRate: normalizedRates.digCommissionRate,
      previousCloseoutCommissionRate: currentUser?.closeout_commission_rate ?? null,
      nextCloseoutCommissionRate: normalizedRates.closeoutCommissionRate,
    },
  });
  return normalizedRates;
}

export async function deactivateFranchiseUser(userId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return null;
  }
  const { error } = await supabase
    .from('franchise_users')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
  return true;
}

export async function setFranchiseUserActive(userId: string, isActive: boolean) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return null;
  }
  const { error } = await supabase
    .from('franchise_users')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
  return true;
}

export async function deleteFranchiseUser(userId: string, transferToUserId?: string | null) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return null;
  }
  const { data, error } = await supabase.functions.invoke('delete-franchise-user', {
    body: { userId, transferToUserId: transferToUserId || null, ...getLedgerContextPayload() },
  });
  if (error) {
    const message = await extractFunctionErrorMessage(error);
    if (message) {
      throw new Error(message);
    }
    throw error;
  }
  if (!data?.success || data?.user?.isActive !== false) {
    throw new Error('User removal did not persist.');
  }
  return data as { success?: boolean; user?: Pick<FranchiseUser, 'id' | 'franchiseId' | 'role' | 'isActive'>; proposalsUpdated?: number };
}

export async function markDesignerProposalsDeleted(franchiseId: string, name: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return null;
  }
  const cleanName = normalizeName(name);
  if (!cleanName) return null;
  // Fetch proposals for this designer
  const { data, error } = await supabase
    .from('franchise_proposals')
    .select('proposal_number, proposal_json, designer_name')
    .eq('franchise_id', franchiseId)
    .ilike('designer_name', cleanName);
  if (error) throw error;
  const updates =
    data
      ?.map((row: any) => {
        const currentName: string = row.designer_name || cleanName;
        const alreadyDeleted = /\(deleted\)$/i.test(currentName.trim());
        const newName = alreadyDeleted ? currentName : `${currentName} (Deleted)`;
        const proposalJson = row.proposal_json as Proposal;
        return {
          proposal_number: row.proposal_number,
          franchise_id: franchiseId,
          designer_name: newName,
          proposal_json: { ...proposalJson, designerName: newName },
        };
      })
      .filter(Boolean) || [];
  if (!updates.length) return null;
  const { error: upsertError } = await supabase.from('franchise_proposals').upsert(updates);
  if (upsertError) throw upsertError;
  return true;
}

export async function resetFranchiseUserPassword(userId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return null;
  }
  const { data, error } = await supabase.functions.invoke('reset-franchise-user-password', {
    body: { userId, ...getLedgerContextPayload() },
  });
  if (error) throw error;
  return data as { tempPassword?: string };
}
