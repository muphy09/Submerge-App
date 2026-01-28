import { getSupabaseClient, isSupabaseEnabled } from './supabaseClient';
import { isEnvFlagTrue } from './env';

const SUPABASE_REQUIRED = isEnvFlagTrue('VITE_SUPABASE_ONLY');

type FranchiseCodeUpdate = {
  franchiseId: string;
  franchiseCode: string;
  franchiseName?: string | null;
  previousCode?: string | null;
};

function requireSupabase() {
  if (SUPABASE_REQUIRED) {
    throw new Error('Supabase is required but not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
}

function normalizeCode(value: string | null | undefined) {
  return String(value || '').trim().toUpperCase();
}

async function updateSupabaseFranchiseCode(payload: { franchiseId: string; franchiseName?: string | null; franchiseCode: string }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  const { error } = await supabase
    .from('franchises')
    .upsert(
      {
        id: payload.franchiseId,
        name: payload.franchiseName || payload.franchiseId,
        franchise_code: payload.franchiseCode,
      },
      { onConflict: 'id' }
    );
  if (error) throw error;
}

async function updateLocalFranchiseCode(payload: { franchiseId: string; franchiseName?: string | null; franchiseCode: string }) {
  if (!window.electron?.upsertFranchise) {
    throw new Error('Franchise updates are unavailable in this environment.');
  }
  await window.electron.upsertFranchise({
    id: payload.franchiseId,
    name: payload.franchiseName || payload.franchiseId,
    franchiseCode: payload.franchiseCode,
  });
}

export async function saveFranchiseCode(payload: FranchiseCodeUpdate) {
  if (!payload.franchiseId) {
    throw new Error('Franchise ID is required.');
  }

  const franchiseCode = normalizeCode(payload.franchiseCode);
  if (!franchiseCode) {
    throw new Error('Franchise code is required.');
  }

  const previousCode = normalizeCode(payload.previousCode);
  const supabaseEnabled = isSupabaseEnabled();
  if (!supabaseEnabled) {
    requireSupabase();
  }

  if (supabaseEnabled) {
    await updateSupabaseFranchiseCode({
      franchiseId: payload.franchiseId,
      franchiseName: payload.franchiseName,
      franchiseCode,
    });
  }

  try {
    await updateLocalFranchiseCode({
      franchiseId: payload.franchiseId,
      franchiseName: payload.franchiseName,
      franchiseCode,
    });
  } catch (error) {
    if (supabaseEnabled && previousCode && previousCode !== franchiseCode) {
      try {
        await updateSupabaseFranchiseCode({
          franchiseId: payload.franchiseId,
          franchiseName: payload.franchiseName,
          franchiseCode: previousCode,
        });
      } catch (rollbackError) {
        console.warn('Unable to roll back Supabase franchise code after local update failure.', rollbackError);
      }
    }
    throw error;
  }

  return { franchiseId: payload.franchiseId, franchiseCode };
}
