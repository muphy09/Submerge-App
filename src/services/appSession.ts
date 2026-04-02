import { getSupabaseClient, isSupabaseEnabled } from './supabaseClient';

export const APP_SESSION_HEARTBEAT_INTERVAL_MS = 10000;

const DEVICE_ID_STORAGE_KEY = 'submerge-device-id';

type AppSessionAction = 'claim' | 'heartbeat' | 'release';

type AppSessionFunctionResponse = {
  status: 'claimed' | 'conflict' | 'active' | 'displaced' | 'released';
  staleWindowMs?: number;
  error?: string;
};

function normalizeText(value?: string | null) {
  return String(value || '').trim();
}

function createRandomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function extractFunctionErrorMessage(error: any): Promise<string | null> {
  const context = error?.context;
  if (context && typeof context.json === 'function') {
    try {
      const parsed = await context.json();
      return typeof parsed?.error === 'string' ? parsed.error : null;
    } catch (parseError) {
      return null;
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

  return typeof body?.error === 'string' ? body.error : null;
}

function getDeviceLabel() {
  return 'Submerge desktop app';
}

export function getOrCreateDeviceId() {
  if (typeof localStorage === 'undefined') {
    return createRandomId();
  }

  const existing = normalizeText(localStorage.getItem(DEVICE_ID_STORAGE_KEY));
  if (existing) return existing;

  const next = createRandomId();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
  return next;
}

export function createAppSessionCredentials() {
  return {
    appSessionId: createRandomId(),
    appSessionLeaseToken: createRandomId(),
  };
}

async function invokeAppSessionAction(payload: {
  action: AppSessionAction;
  appSessionId: string;
  leaseToken: string;
  deviceId?: string;
  deviceLabel?: string;
  takeover?: boolean;
}): Promise<AppSessionFunctionResponse> {
  if (!isSupabaseEnabled()) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  const { data, error } = await supabase.functions.invoke('manage-user-app-session', {
    body: payload,
  });

  if (error) {
    const message = await extractFunctionErrorMessage(error);
    throw new Error(message || error.message || 'Unable to verify app session.');
  }

  return (data || {}) as AppSessionFunctionResponse;
}

export async function claimUserAppSession(options: {
  appSessionId: string;
  appSessionLeaseToken: string;
  takeover?: boolean;
}) {
  return await invokeAppSessionAction({
    action: 'claim',
    appSessionId: options.appSessionId,
    leaseToken: options.appSessionLeaseToken,
    deviceId: getOrCreateDeviceId(),
    deviceLabel: getDeviceLabel(),
    takeover: Boolean(options.takeover),
  });
}

export async function heartbeatUserAppSession(options: {
  appSessionId: string;
  appSessionLeaseToken: string;
}) {
  return await invokeAppSessionAction({
    action: 'heartbeat',
    appSessionId: options.appSessionId,
    leaseToken: options.appSessionLeaseToken,
  });
}

export async function releaseUserAppSession(options: {
  appSessionId: string;
  appSessionLeaseToken: string;
}) {
  try {
    await invokeAppSessionAction({
      action: 'release',
      appSessionId: options.appSessionId,
      leaseToken: options.appSessionLeaseToken,
    });
  } catch (error) {
    console.warn('Unable to release app session:', error);
  }
}
