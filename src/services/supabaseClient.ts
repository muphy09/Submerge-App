import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getEnvVar } from './env';

let client: SupabaseClient | null = null;
let loggedMissing = false;
let loggedEnabled = false;

type SupabaseContext = {
  franchiseId?: string;
  franchiseCode?: string;
  userName?: string;
  role?: 'owner' | 'admin' | 'designer';
};

let currentContext: SupabaseContext = {};

// Cache Supabase reachability checks so we do not spam the endpoint
let lastReachabilityCheck = 0;
let lastReachabilityResult = false;
let lastReachabilityReason: SupabaseReachabilityReason = null;

const REACHABILITY_CACHE_MS = 5000;
const REACHABILITY_TIMEOUT_MS = 4500;

export type SupabaseReachabilityReason = 'no-internet' | 'server-issue' | 'disabled' | null;

export type SupabaseReachability = {
  reachable: boolean;
  reason: SupabaseReachabilityReason;
};

function buildHeaders(context: SupabaseContext) {
  const headers: Record<string, string> = {};
  if (context.franchiseId) headers['x-submerge-franchise-id'] = context.franchiseId;
  if (context.franchiseCode) headers['x-submerge-franchise-code'] = context.franchiseCode;
  if (context.userName) headers['x-submerge-user-name'] = context.userName;
  if (context.role) headers['x-submerge-role'] = context.role;
  return headers;
}

export function isSupabaseEnabled() {
  const url = getEnvVar('VITE_SUPABASE_URL');
  const key = getEnvVar('VITE_SUPABASE_ANON_KEY');
  return Boolean(url && key);
}

function createSupabaseClient() {
  const url = getEnvVar('VITE_SUPABASE_URL');
  const key = getEnvVar('VITE_SUPABASE_ANON_KEY');
  if (!url || !key) {
    if (!loggedMissing) {
      console.info('Supabase not configured (missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY); falling back to local/IPC.');
      loggedMissing = true;
    }
    return null;
  }

  // Attach headers dynamically so we don't need to recreate the client (which was triggering
  // multiple GoTrueClient warnings) every time the context changes.
  const fetchWithContext: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers || {});
    Object.entries(buildHeaders(currentContext)).forEach(([k, v]) => headers.set(k, v));
    return fetch(input, { ...init, headers });
  };

  const instance = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithContext },
  });
  if (!loggedEnabled) {
    console.info('Supabase client initialized with provided env vars.');
    loggedEnabled = true;
  }
  return instance;
}

export function getSupabaseClient() {
  if (client) return client;
  client = createSupabaseClient();
  return client;
}

export function setSupabaseContext(context: SupabaseContext) {
  currentContext = { ...context };
}

function cacheReachability(
  reachable: boolean,
  reason: SupabaseReachabilityReason,
  timestamp = Date.now()
): SupabaseReachability {
  lastReachabilityCheck = timestamp;
  lastReachabilityResult = reachable;
  lastReachabilityReason = reason;
  return { reachable, reason };
}

/**
 * Lightweight connectivity check to confirm we can talk to Supabase.
 * Uses a HEAD request against the proposals table with a short timeout.
 */
export async function getSupabaseReachability(forceRefresh = false): Promise<SupabaseReachability> {
  const now = Date.now();
  if (!isSupabaseEnabled()) return cacheReachability(false, 'disabled', now);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return cacheReachability(false, 'no-internet', now);
  }
  if (!forceRefresh && now - lastReachabilityCheck < REACHABILITY_CACHE_MS) {
    return { reachable: lastReachabilityResult, reason: lastReachabilityReason };
  }

  const url = getEnvVar('VITE_SUPABASE_URL');
  const key = getEnvVar('VITE_SUPABASE_ANON_KEY');
  if (!url || !key) {
    return cacheReachability(false, 'disabled', now);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${url}/rest/v1/franchise_proposals?select=proposal_number&limit=1`,
      {
        method: 'HEAD',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          ...buildHeaders(currentContext),
        },
        signal: controller.signal,
      }
    );
    return cacheReachability(response.ok, response.ok ? null : 'server-issue');
  } catch (error) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return cacheReachability(false, offline ? 'no-internet' : 'server-issue');
  } finally {
    clearTimeout(timeout);
  }
}

export async function hasSupabaseConnection(forceRefresh = false): Promise<boolean> {
  const result = await getSupabaseReachability(forceRefresh);
  return result.reachable;
}
