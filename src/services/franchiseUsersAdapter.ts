import { getSupabaseClient, isSupabaseEnabled } from './supabaseClient';
import { Proposal } from '../types/proposal-new';

type FranchiseUser = {
  id: string;
  franchiseId: string;
  name: string;
  role: 'admin' | 'designer';
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const SUPABASE_REQUIRED =
  (import.meta.env.VITE_SUPABASE_ONLY || process.env.VITE_SUPABASE_ONLY || '')
    .toString()
    .toLowerCase() === 'true';

function normalizeName(name: string) {
  return name?.trim();
}

function requireSupabase() {
  if (SUPABASE_REQUIRED) {
    throw new Error('Supabase is required but not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
}

export async function listFranchiseUsers(franchiseId: string): Promise<FranchiseUser[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return [];
  }
  const { data, error } = await supabase
    .from('franchise_users')
    .select('id,franchise_id,name,role,is_active,created_at,updated_at')
    .eq('franchise_id', franchiseId)
    .order('role', { ascending: false })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    franchiseId: row.franchise_id,
    name: row.name,
    role: row.role,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function addFranchiseUser(payload: {
  franchiseId: string;
  name: string;
  role?: 'admin' | 'designer';
  isActive?: boolean;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return null;
  }
  const name = normalizeName(payload.name);
  if (!name) throw new Error('Name is required');
  const { error } = await supabase.from('franchise_users').upsert({
    franchise_id: payload.franchiseId,
    name,
    role: payload.role || 'designer',
    is_active: payload.isActive ?? true,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return true;
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

export async function deleteFranchiseUser(userId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return null;
  }
  const { error } = await supabase.from('franchise_users').delete().eq('id', userId);
  if (error) throw error;
  return true;
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

export async function ensureAdminUser(franchiseId: string, name: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return null;
  }
  const cleanName = normalizeName(name);
  const { data, error } = await supabase
    .from('franchise_users')
    .select('id,is_active,role')
    .eq('franchise_id', franchiseId)
    .ilike('name', cleanName)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) {
    await addFranchiseUser({ franchiseId, name: cleanName, role: 'admin', isActive: true });
    return;
  }
  if (!data.is_active || data.role !== 'admin') {
    await supabase
      .from('franchise_users')
      .update({ is_active: true, role: 'admin', updated_at: new Date().toISOString() })
      .eq('id', data.id);
  }
}

export async function assertDesignerAllowed(franchiseId: string, name: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    requireSupabase();
    return;
  }
  const cleanName = normalizeName(name);
  const { data, error } = await supabase
    .from('franchise_users')
    .select('id,is_active,role')
    .eq('franchise_id', franchiseId)
    .ilike('name', cleanName)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data || !data.is_active || data.role !== 'designer') {
    const err: any = new Error('Username not valid');
    err.code = 'USERNAME_INVALID';
    throw err;
  }
}
