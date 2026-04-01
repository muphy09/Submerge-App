import { getSupabaseClient, hasSupabaseConnection, isSupabaseEnabled } from './supabaseClient';
import {
  claimUserAppSession,
  createAppSessionCredentials,
  heartbeatUserAppSession,
  releaseUserAppSession,
} from './appSession';
import {
  DEFAULT_FRANCHISE_ID,
  clearSession,
  clearMasterImpersonation,
  readSession,
  saveSession,
  type UserRole,
  type UserSession,
} from './session';
import { logLedgerEventSafe } from './ledger';
import { normalizeUserCommissionRates } from './userCommissionRates';

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
  dig_commission_rate?: number | null;
  closeout_commission_rate?: number | null;
};

type SignInSuccessResult = {
  status: 'signed-in';
  session: UserSession;
  passwordResetRequired: boolean;
};

type SignInConflictResult = {
  status: 'conflict';
  session: UserSession;
  passwordResetRequired: boolean;
};

export type SignInWithEmailResult = SignInSuccessResult | SignInConflictResult;

function normalizeCode(code?: string | null) {
  return String(code || '').trim().toUpperCase();
}

function normalizeEmailAddress(email?: string | null) {
  return String(email || '').trim().toLowerCase();
}

function normalizeText(value?: string | null) {
  return String(value || '').trim();
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
    .select(
      'id,franchise_id,auth_user_id,email,name,role,is_active,password_reset_required,dig_commission_rate,closeout_commission_rate'
    )
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  if (data) return data as FranchiseUserRow;

  const fallbackEmail = normalizeEmailAddress(email);
  if (!fallbackEmail) return null;

  const fallback = await supabase
    .from('franchise_users')
    .select(
      'id,franchise_id,auth_user_id,email,name,role,is_active,password_reset_required,dig_commission_rate,closeout_commission_rate'
    )
    .eq('email', fallbackEmail)
    .maybeSingle();
  if (fallback.error && fallback.error.code !== 'PGRST116') throw fallback.error;
  return (fallback.data as FranchiseUserRow) || null;
}

async function updateLastLogin(authUserId: string) {
  const supabase = assertSupabaseReady();
  const now = new Date().toISOString();
  await supabase
    .from('franchise_users')
    .update({ last_login_at: now })
    .eq('auth_user_id', authUserId);
}

function buildSessionFromProfile(options: {
  authUserId: string;
  email: string;
  profile: FranchiseUserRow;
  franchise?: FranchiseRow | null;
  appSession?: {
    appSessionId: string;
    appSessionLeaseToken: string;
  };
}): UserSession {
  const displayName = normalizeDisplayName(options.profile.name) || options.email || 'User';
  const role = (options.profile.role || 'designer') as UserRole;
  const franchise = options.franchise;
  const commissionRates = normalizeUserCommissionRates({
    digCommissionRate: options.profile.dig_commission_rate,
    closeoutCommissionRate: options.profile.closeout_commission_rate,
  });
  return {
    userId: options.authUserId,
    userEmail: options.email,
    userName: displayName,
    franchiseId: franchise?.id || options.profile.franchise_id || DEFAULT_FRANCHISE_ID,
    franchiseName: franchise?.name || undefined,
    franchiseCode: franchise?.franchise_code || undefined,
    role,
    passwordResetRequired: Boolean(options.profile.password_reset_required),
    appSessionId: options.appSession?.appSessionId,
    appSessionLeaseToken: options.appSession?.appSessionLeaseToken,
    ...commissionRates,
  };
}

export async function signInWithEmail(payload: {
  email: string;
  password: string;
  franchiseCode?: string | null;
}): Promise<SignInWithEmailResult> {
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
    await supabase.auth.signOut({ scope: 'local' });
    throw new Error('This account is not linked to a franchise.');
  }

  const role = (profile.role || 'designer') as UserRole;
  const normalizedRole = String(role || '').toLowerCase();
  const allowedRoles = ['master', 'owner', 'admin', 'designer'];
  const isActive = profile.is_active !== false;
  if (!allowedRoles.includes(normalizedRole) || !isActive) {
    await supabase.auth.signOut({ scope: 'local' });
    throw new Error('This account is not active.');
  }

  let franchise: FranchiseRow | null = null;
  if (normalizedRole !== 'master') {
    clearMasterImpersonation();
    const inputCode = normalizeCode(payload.franchiseCode);
    if (!inputCode) {
      await supabase.auth.signOut({ scope: 'local' });
      throw new Error('Franchise code is required for this account.');
    }
    franchise = await getFranchiseByCode(inputCode);
    if (!franchise) {
      await supabase.auth.signOut({ scope: 'local' });
      throw new Error('Invalid franchise code.');
    }
    if (!profile.franchise_id || franchise.id !== profile.franchise_id) {
      await supabase.auth.signOut({ scope: 'local' });
      throw new Error('Invalid franchise code.');
    }
  } else if (profile.franchise_id) {
    franchise = await getFranchiseById(profile.franchise_id);
  }

  const appSession = createAppSessionCredentials();
  const session = buildSessionFromProfile({
    authUserId: authUser.id,
    email: normalizeEmailAddress(authUser.email || email),
    profile,
    franchise,
    appSession,
  });

  const claimResult = await claimUserAppSession({
    appSessionId: appSession.appSessionId,
    appSessionLeaseToken: appSession.appSessionLeaseToken,
    takeover: false,
  });

  if (claimResult.status === 'conflict') {
    return {
      status: 'conflict',
      session,
      passwordResetRequired: Boolean(profile.password_reset_required),
    };
  }

  saveSession(session);
  if (session.userId) {
    void updateLastLogin(session.userId);
  }

  return {
    status: 'signed-in',
    session,
    passwordResetRequired: Boolean(profile.password_reset_required),
  };
}

export async function confirmSessionTakeover(session: UserSession) {
  const appSessionId = normalizeText(session.appSessionId);
  const appSessionLeaseToken = normalizeText(session.appSessionLeaseToken);
  if (!appSessionId || !appSessionLeaseToken) {
    throw new Error('Unable to continue this login attempt. Please try signing in again.');
  }

  const claimResult = await claimUserAppSession({
    appSessionId,
    appSessionLeaseToken,
    takeover: true,
  });
  if (claimResult.status !== 'claimed') {
    throw new Error('Unable to take over the existing session. Please try again.');
  }

  saveSession(session);
  if (session.userId) {
    void updateLastLogin(session.userId);
  }

  return {
    session,
    passwordResetRequired: Boolean(session.passwordResetRequired),
  };
}

export async function loadSessionFromSupabase(): Promise<{ session: UserSession; passwordResetRequired: boolean } | null> {
  const savedSession = readSession();
  if (!savedSession) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    await supabase.auth.signOut({ scope: 'local' });
    clearMasterImpersonation();
    clearSession();
    return null;
  }
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

  let appSession = {
    appSessionId: normalizeText(savedSession.appSessionId),
    appSessionLeaseToken: normalizeText(savedSession.appSessionLeaseToken),
  };

  if (appSession.appSessionId && appSession.appSessionLeaseToken) {
    const heartbeat = await heartbeatUserAppSession({
      appSessionId: appSession.appSessionId,
      appSessionLeaseToken: appSession.appSessionLeaseToken,
    });
    if (heartbeat.status !== 'active') {
      await supabase.auth.signOut({ scope: 'local' });
      clearMasterImpersonation();
      clearSession();
      return null;
    }
  } else {
    appSession = createAppSessionCredentials();
    const claimResult = await claimUserAppSession({
      appSessionId: appSession.appSessionId,
      appSessionLeaseToken: appSession.appSessionLeaseToken,
      takeover: false,
    });
    if (claimResult.status !== 'claimed') {
      await supabase.auth.signOut({ scope: 'local' });
      clearMasterImpersonation();
      clearSession();
      return null;
    }
  }

  const session = buildSessionFromProfile({
    authUserId: authSession.user.id,
    email: normalizeEmailAddress(authSession.user.email || ''),
    profile,
    franchise,
    appSession,
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

  const session = readSession();
  await logLedgerEventSafe({
    franchiseId: session?.franchiseId || DEFAULT_FRANCHISE_ID,
    action: 'Password reset completed',
    targetType: 'user',
    targetId: userData.user.id,
    details: {
      targetUserId: userData.user.id,
      targetEmail: userData.user.email || null,
    },
  });
}

export async function signOut() {
  const currentSession = readSession();
  const appSessionId = normalizeText(currentSession?.appSessionId);
  const appSessionLeaseToken = normalizeText(currentSession?.appSessionLeaseToken);
  if (appSessionId && appSessionLeaseToken) {
    await releaseUserAppSession({
      appSessionId,
      appSessionLeaseToken,
    });
  }
  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut({ scope: 'local' });
  }
  clearMasterImpersonation();
  clearSession();
}
