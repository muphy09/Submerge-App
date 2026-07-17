import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getEnvVar } from './env';

let client: SupabaseClient | null = null;
let loggedMissing = false;
let loggedEnabled = false;

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

  const instance = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
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
 * Uses the public Auth health endpoint so this remains valid before login and
 * after logout without probing a protected application table.
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
    const response = await fetch(`${url}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: key },
      signal: controller.signal,
    });
    const reachable = response.ok;
    return cacheReachability(reachable, reachable ? null : 'server-issue');
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
