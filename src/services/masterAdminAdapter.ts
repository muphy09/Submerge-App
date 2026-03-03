import { getSupabaseClient, isSupabaseEnabled } from './supabaseClient';

export type MasterFranchise = {
  id: string;
  name?: string | null;
  franchiseCode?: string | null;
  isActive?: boolean;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type MasterUser = {
  id: string;
  franchiseId?: string | null;
  email: string;
  name?: string | null;
  role: 'master' | 'owner' | 'admin' | 'designer';
  isActive: boolean;
  passwordResetRequired?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

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

function requireSupabase() {
  if (!isSupabaseEnabled()) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
}

export async function listAllFranchises(): Promise<MasterFranchise[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return [];
  }
  const { data, error } = await supabase
    .from('franchises')
    .select('id,name,franchise_code,is_active,deleted_at,created_at,updated_at')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    franchiseCode: row.franchise_code,
    isActive: row.is_active !== false,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function listAllFranchiseUsers(): Promise<MasterUser[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return [];
  }
  const { data, error } = await supabase
    .from('franchise_users')
    .select('id,franchise_id,email,name,role,is_active,password_reset_required,created_at,updated_at')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    franchiseId: row.franchise_id,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: row.is_active !== false,
    passwordResetRequired: Boolean(row.password_reset_required),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createFranchiseWithOwner(payload: {
  franchiseName: string;
  franchiseCode: string;
  ownerEmail: string;
  ownerName?: string | null;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return null;
  }
  const { data, error } = await supabase.functions.invoke('create-franchise-with-owner', {
    body: {
      franchiseName: payload.franchiseName,
      franchiseCode: String(payload.franchiseCode || '').trim().toUpperCase(),
      ownerEmail: String(payload.ownerEmail || '').trim().toLowerCase(),
      ownerName: payload.ownerName || null,
    },
  });
  if (error) {
    const message = await extractFunctionErrorMessage(error);
    if (message) {
      throw new Error(message);
    }
    throw error;
  }
  return data as { franchiseId?: string; tempPassword?: string };
}

export async function softDeleteFranchise(franchiseId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return null;
  }
  const { data, error } = await supabase.functions.invoke('delete-franchise', {
    body: { franchiseId },
  });
  if (error) throw error;
  return data as { success?: boolean };
}
