import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SESSION_STALE_MS = 3 * 60 * 1000;
const ALLOWED_ROLES = new Set(['master', 'owner', 'admin', 'bookkeeper', 'designer']);
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SessionRow = {
  auth_user_id: string;
  device_id?: string | null;
  device_label?: string | null;
  active_app_session_id?: string | null;
  active_lease_token?: string | null;
  claimed_at?: string | null;
  last_seen_at?: string | null;
};

function getAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getRequesterProfile(req: Request, supabase: ReturnType<typeof getAdminClient>) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    throw new Error('Missing authorization token.');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    throw new Error('Unauthorized.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('franchise_users')
    .select('id,franchise_id,role,is_active,name,email')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();

  if (profileError && profileError.code !== 'PGRST116') {
    throw profileError;
  }
  if (!profile) {
    throw new Error('No franchise profile found.');
  }

  return { user: userData.user, profile };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function isFresh(row: SessionRow | null) {
  const activeSessionId = normalizeText(row?.active_app_session_id);
  const activeLeaseToken = normalizeText(row?.active_lease_token);
  const lastSeenAt = normalizeText(row?.last_seen_at);
  if (!activeSessionId || !activeLeaseToken || !lastSeenAt) return false;
  const lastSeenMs = Date.parse(lastSeenAt);
  if (Number.isNaN(lastSeenMs)) return false;
  return Date.now() - lastSeenMs <= SESSION_STALE_MS;
}

async function getCurrentSessionRow(
  supabase: ReturnType<typeof getAdminClient>,
  authUserId: string
): Promise<SessionRow | null> {
  const { data, error } = await supabase
    .from('user_app_sessions')
    .select('auth_user_id,device_id,device_label,active_app_session_id,active_lease_token,claimed_at,last_seen_at')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return (data as SessionRow | null) || null;
}

async function claimSession(options: {
  supabase: ReturnType<typeof getAdminClient>;
  authUserId: string;
  authToken: string;
  appSessionId: string;
  leaseToken: string;
  deviceId: string;
  deviceLabel: string;
  takeover: boolean;
}) {
  const current = await getCurrentSessionRow(options.supabase, options.authUserId);
  const now = new Date().toISOString();
  const fresh = isFresh(current);
  const currentSessionId = normalizeText(current?.active_app_session_id);
  const currentLeaseToken = normalizeText(current?.active_lease_token);
  const currentDeviceId = normalizeText(current?.device_id);
  const isSameSession =
    currentSessionId === options.appSessionId && currentLeaseToken === options.leaseToken;
  const isSameDevice = currentDeviceId && currentDeviceId === options.deviceId;
  const shouldReplaceFreshSession = fresh && !isSameSession && (options.takeover || isSameDevice);

  if (fresh && !isSameSession && !shouldReplaceFreshSession) {
    return json({ status: 'conflict', staleWindowMs: SESSION_STALE_MS });
  }

  if (shouldReplaceFreshSession) {
    const { error: signOutError } = await options.supabase.auth.admin.signOut(options.authToken, 'others');
    if (signOutError) {
      throw signOutError;
    }
  }

  const { error: upsertError } = await options.supabase.from('user_app_sessions').upsert({
    auth_user_id: options.authUserId,
    device_id: options.deviceId,
    device_label: options.deviceLabel,
    active_app_session_id: options.appSessionId,
    active_lease_token: options.leaseToken,
    claimed_at: isSameSession ? current?.claimed_at || now : now,
    last_seen_at: now,
    updated_at: now,
  });

  if (upsertError) {
    throw upsertError;
  }

  return json({ status: 'claimed', staleWindowMs: SESSION_STALE_MS });
}

async function heartbeatSession(options: {
  supabase: ReturnType<typeof getAdminClient>;
  authUserId: string;
  appSessionId: string;
  leaseToken: string;
}) {
  const current = await getCurrentSessionRow(options.supabase, options.authUserId);
  const currentSessionId = normalizeText(current?.active_app_session_id);
  const currentLeaseToken = normalizeText(current?.active_lease_token);

  if (!current || currentSessionId !== options.appSessionId || currentLeaseToken !== options.leaseToken) {
    return json({ status: 'displaced', staleWindowMs: SESSION_STALE_MS });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await options.supabase
    .from('user_app_sessions')
    .update({
      last_seen_at: now,
      updated_at: now,
    })
    .eq('auth_user_id', options.authUserId)
    .eq('active_app_session_id', options.appSessionId)
    .eq('active_lease_token', options.leaseToken);

  if (updateError) {
    throw updateError;
  }

  return json({ status: 'active', staleWindowMs: SESSION_STALE_MS });
}

async function releaseSession(options: {
  supabase: ReturnType<typeof getAdminClient>;
  authUserId: string;
  appSessionId: string;
  leaseToken: string;
}) {
  const current = await getCurrentSessionRow(options.supabase, options.authUserId);
  const currentSessionId = normalizeText(current?.active_app_session_id);
  const currentLeaseToken = normalizeText(current?.active_lease_token);

  if (!current || currentSessionId !== options.appSessionId || currentLeaseToken !== options.leaseToken) {
    return json({ status: 'released', staleWindowMs: SESSION_STALE_MS });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await options.supabase
    .from('user_app_sessions')
    .update({
      active_app_session_id: null,
      active_lease_token: crypto.randomUUID(),
      claimed_at: null,
      last_seen_at: now,
      updated_at: now,
    })
    .eq('auth_user_id', options.authUserId)
    .eq('active_app_session_id', options.appSessionId)
    .eq('active_lease_token', options.leaseToken);

  if (updateError) {
    throw updateError;
  }

  return json({ status: 'released', staleWindowMs: SESSION_STALE_MS });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getAdminClient();
    const authHeader = req.headers.get('Authorization') || '';
    const authToken = authHeader.replace('Bearer ', '').trim();
    if (!authToken) {
      return json({ error: 'Missing authorization token.' }, 401);
    }

    const { profile, user } = await getRequesterProfile(req, supabase);
    const role = normalizeText(profile?.role).toLowerCase();
    if (!profile || profile.is_active === false || !ALLOWED_ROLES.has(role)) {
      return json({ error: 'Forbidden.' }, 403);
    }

    const body = await req.json();
    const action = normalizeText(body?.action).toLowerCase();
    const appSessionId = normalizeText(body?.appSessionId);
    const leaseToken = normalizeText(body?.leaseToken);

    if (!['claim', 'heartbeat', 'release'].includes(action)) {
      return json({ error: 'Invalid action.' }, 400);
    }

    if (!appSessionId || !leaseToken) {
      return json({ error: 'appSessionId and leaseToken are required.' }, 400);
    }

    const authUserId = normalizeText(user?.id);
    if (!authUserId) {
      return json({ error: 'Unauthorized.' }, 401);
    }

    if (action === 'claim') {
      const deviceId = normalizeText(body?.deviceId);
      const deviceLabel = normalizeText(body?.deviceLabel) || 'Submerge desktop app';
      const takeover = Boolean(body?.takeover);
      if (!deviceId) {
        return json({ error: 'deviceId is required when claiming a session.' }, 400);
      }
      return await claimSession({
        supabase,
        authUserId,
        authToken,
        appSessionId,
        leaseToken,
        deviceId,
        deviceLabel,
        takeover,
      });
    }

    if (action === 'heartbeat') {
      return await heartbeatSession({
        supabase,
        authUserId,
        appSessionId,
        leaseToken,
      });
    }

    return await releaseSession({
      supabase,
      authUserId,
      appSessionId,
      leaseToken,
    });
  } catch (error: any) {
    return json({ error: error?.message || 'Unexpected error.' }, 500);
  }
});
