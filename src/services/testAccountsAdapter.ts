import { getSupabaseClient, isSupabaseEnabled } from './supabaseClient';
import type { UserRole } from './session';

export type TestAccountRole = Exclude<UserRole, 'master'>;

export type TestAccount = {
  id: string;
  authUserId: string;
  email: string;
  name: string;
  role: TestAccountRole;
  isActive: boolean;
  passwordResetRequired: boolean;
  createdAt?: string;
  updatedAt?: string;
};

function requireSupabase() {
  if (!isSupabaseEnabled()) throw new Error('Supabase is not configured.');
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

async function extractFunctionError(error: any) {
  const context = error?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (body?.error) return String(body.error);
    } catch {
      // Fall through to the generic function error.
    }
  }
  return String(error?.message || 'Unable to manage testing accounts.');
}

function normalizeAccount(row: any): TestAccount {
  return {
    id: String(row?.id || ''),
    authUserId: String(row?.auth_user_id || ''),
    email: String(row?.email || ''),
    name: String(row?.name || ''),
    role: row?.role as TestAccountRole,
    isActive: row?.is_active !== false,
    passwordResetRequired: row?.password_reset_required === true,
    createdAt: row?.created_at,
    updatedAt: row?.updated_at,
  };
}

async function invoke(body: Record<string, unknown>) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke('manage-test-accounts', { body });
  if (error) throw new Error(await extractFunctionError(error));
  if (data?.error) throw new Error(String(data.error));
  return data || {};
}

export async function listTestAccounts(): Promise<TestAccount[]> {
  const data = await invoke({ action: 'list' });
  return (Array.isArray(data.accounts) ? data.accounts : []).map(normalizeAccount);
}

export async function createTestAccount(payload: {
  email: string;
  name: string;
  role: TestAccountRole;
}) {
  const data = await invoke({ action: 'create', ...payload });
  return {
    account: normalizeAccount(data.account),
    tempPassword: String(data.tempPassword || ''),
  };
}

export async function resetTestAccountPassword(accountId: string) {
  const data = await invoke({ action: 'reset-password', accountId });
  return String(data.tempPassword || '');
}

export async function setTestAccountActive(accountId: string, isActive: boolean) {
  const data = await invoke({ action: 'set-active', accountId, isActive });
  return normalizeAccount(data.account);
}

export async function clearTestProposals(franchiseId?: string | null) {
  const data = await invoke({ action: 'clear-proposals', franchiseId: franchiseId || null });
  return Number(data.cleared || 0);
}
