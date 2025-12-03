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

const REACHABILITY_CACHE_MS = 5000;
const REACHABILITY_TIMEOUT_MS = 4500;

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

/**
 * Lightweight connectivity check to confirm we can talk to Supabase.
 * Uses a HEAD request against the proposals table with a short timeout.
 */
export async function hasSupabaseConnection(forceRefresh = false): Promise<boolean> {
  if (!isSupabaseEnabled()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  const now = Date.now();
  if (!forceRefresh && now - lastReachabilityCheck < REACHABILITY_CACHE_MS) {
    return lastReachabilityResult;
  }

  const url = getEnvVar('VITE_SUPABASE_URL');
  const key = getEnvVar('VITE_SUPABASE_ANON_KEY');
  if (!url || !key) {
    lastReachabilityCheck = now;
    lastReachabilityResult = false;
    return false;
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
    lastReachabilityResult = response.ok;
    return lastReachabilityResult;
  } catch (error) {
    lastReachabilityResult = false;
    return false;
  } finally {
    lastReachabilityCheck = now;
    clearTimeout(timeout);
  }
}
