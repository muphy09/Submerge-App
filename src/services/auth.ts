import { getSupabaseClient, hasSupabaseConnection, isSupabaseEnabled } from './supabaseClient';
import {
  DEFAULT_FRANCHISE_ID,
  clearSession,
  clearMasterImpersonation,
  saveSession,
  type UserRole,
  type UserSession,
} from './session';

type FranchiseRow = {
  id: string;
  name?: string | null;
  franchise_code?: string | null;
};

type FranchiseUserRow = {
  id: string;
  franchise_id?: string | null;
  auth_user_id?: string | null;
  email?: string | null;
  name?: string | null;
  role?: UserRole | null;
  is_active?: boolean | null;
  password_reset_required?: boolean | null;
};

function normalizeCode(code?: string | null) {
  return String(code || '').trim().toUpperCase();
}

function normalizeEmailAddress(email?: string | null) {
  return String(email || '').trim().toLowerCase();
}

function normalizeDisplayName(name?: string | null) {
  return String(name || '').trim();
}

function assertSupabaseReady() {
  if (!isSupabaseEnabled()) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

async function getFranchiseById(franchiseId: string): Promise<FranchiseRow | null> {
  const supabase = assertSupabaseReady();
  const { data, error } = await supabase
    .from('franchises')
    .select('id,name,franchise_code')
    .eq('id', franchiseId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function getFranchiseByCode(franchiseCode: string): Promise<FranchiseRow | null> {
  const supabase = assertSupabaseReady();
  const { data, error } = await supabase
    .from('franchises')
    .select('id,name,franchise_code')
    .eq('franchise_code', franchiseCode)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function getUserProfileByAuthId(authUserId: string, email?: string | null): Promise<FranchiseUserRow | null> {
  const supabase = assertSupabaseReady();
  const { data, error } = await supabase
    .from('franchise_users')
    .select('id,franchise_id,auth_user_id,email,name,role,is_active,password_reset_required')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  if (data) return data as FranchiseUserRow;

  const fallbackEmail = normalizeEmailAddress(email);
  if (!fallbackEmail) return null;

  const fallback = await supabase
    .from('franchise_users')
    .select('id,franchise_id,auth_user_id,email,name,role,is_active,password_reset_required')
    .eq('email', fallbackEmail)
    .maybeSingle();
  if (fallback.error && fallback.error.code !== 'PGRST116') throw fallback.error;
  return (fallback.data as FranchiseUserRow) || null;
}

async function updateLastLogin(userId: string) {
  const supabase = assertSupabaseReady();
  const now = new Date().toISOString();
  await supabase
    .from('franchise_users')
    .update({ last_login_at: now })
    .eq('id', userId);
}

function buildSessionFromProfile(options: {
  authUserId: string;
  email: string;
  profile: FranchiseUserRow;
  franchise?: FranchiseRow | null;
}): UserSession {
  const displayName = normalizeDisplayName(options.profile.name) || options.email || 'User';
  const role = (options.profile.role || 'designer') as UserRole;
  const franchise = options.franchise;
  return {
    userId: options.authUserId,
    userEmail: options.email,
    userName: displayName,
    franchiseId: franchise?.id || options.profile.franchise_id || DEFAULT_FRANCHISE_ID,
    franchiseName: franchise?.name || undefined,
    franchiseCode: franchise?.franchise_code || undefined,
    role,
    passwordResetRequired: Boolean(options.profile.password_reset_required),
  };
}

export async function signInWithEmail(payload: {
  email: string;
  password: string;
  franchiseCode?: string | null;
}) {
  const supabase = assertSupabaseReady();
  const online = await hasSupabaseConnection(true);
  if (!online) {
    throw new Error('No internet connection. Please reconnect to log in.');
  }

  const email = normalizeEmailAddress(payload.email);
  const password = String(payload.password || '');
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.user) {
    throw error || new Error('Unable to sign in.');
  }

  const authUser = data.user;
  const profile = await getUserProfileByAuthId(authUser.id, authUser.email);
  if (!profile) {
    await supabase.auth.signOut();
    throw new Error('This account is not linked to a franchise.');
  }

  const role = (profile.role || 'designer') as UserRole;
  const normalizedRole = String(role || '').toLowerCase();
  const allowedRoles = ['master', 'owner', 'admin', 'designer'];
  const isActive = profile.is_active !== false;
  if (!allowedRoles.includes(normalizedRole) || !isActive) {
    await supabase.auth.signOut();
    throw new Error('This account is not active.');
  }

  let franchise: FranchiseRow | null = null;
  if (normalizedRole !== 'master') {
    clearMasterImpersonation();
    const inputCode = normalizeCode(payload.franchiseCode);
    if (!inputCode) {
      await supabase.auth.signOut();
      throw new Error('Franchise code is required for this account.');
    }
    franchise = await getFranchiseByCode(inputCode);
    if (!franchise) {
      await supabase.auth.signOut();
      throw new Error('Invalid franchise code.');
    }
    if (!profile.franchise_id || franchise.id !== profile.franchise_id) {
      await supabase.auth.signOut();
      throw new Error('Invalid franchise code.');
    }
  } else if (profile.franchise_id) {
    franchise = await getFranchiseById(profile.franchise_id);
  }

  const session = buildSessionFromProfile({
    authUserId: authUser.id,
    email: normalizeEmailAddress(authUser.email || email),
    profile,
    franchise,
  });
  saveSession(session);
  if (profile.id) {
    void updateLastLogin(profile.id);
  }

  return {
    session,
    passwordResetRequired: Boolean(profile.password_reset_required),
  };
}

export async function loadSessionFromSupabase(): Promise<{ session: UserSession; passwordResetRequired: boolean } | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const authSession = data?.session;
  if (!authSession?.user) return null;

  const profile = await getUserProfileByAuthId(authSession.user.id, authSession.user.email);
  if (!profile) return null;

  const role = (profile.role || 'designer') as UserRole;
  const normalizedRole = String(role || '').toLowerCase();
  const allowedRoles = ['master', 'owner', 'admin', 'designer'];
  if (!allowedRoles.includes(normalizedRole) || profile.is_active === false) {
    return null;
  }
  if (normalizedRole !== 'master') {
    clearMasterImpersonation();
  }
  let franchise: FranchiseRow | null = null;
  if (normalizedRole !== 'master') {
    if (!profile.franchise_id) {
      return null;
    }
    franchise = await getFranchiseById(profile.franchise_id);
  } else if (profile.franchise_id) {
    franchise = await getFranchiseById(profile.franchise_id);
  }

  const session = buildSessionFromProfile({
    authUserId: authSession.user.id,
    email: normalizeEmailAddress(authSession.user.email || ''),
    profile,
    franchise,
  });
  saveSession(session);
  return { session, passwordResetRequired: Boolean(profile.password_reset_required) };
}

export async function completePasswordReset(newPassword: string) {
  const supabase = assertSupabaseReady();
  const trimmed = String(newPassword || '').trim();
  if (!trimmed) {
    throw new Error('New password is required.');
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    throw userError || new Error('Unable to load user session.');
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: trimmed });
  if (updateError) {
    throw updateError;
  }

  const now = new Date().toISOString();
  await supabase
    .from('franchise_users')
    .update({ password_reset_required: false, password_updated_at: now })
    .eq('auth_user_id', userData.user.id);
}

export async function signOut() {
  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  clearMasterImpersonation();
  clearSession();
}
