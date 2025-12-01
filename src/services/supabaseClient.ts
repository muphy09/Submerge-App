import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getEnvVar } from './env';

let client: SupabaseClient | null = null;
let loggedMissing = false;
let loggedEnabled = false;

export function isSupabaseEnabled() {
  const url = getEnvVar('VITE_SUPABASE_URL');
  const key = getEnvVar('VITE_SUPABASE_ANON_KEY');
  return Boolean(url && key);
}

export function getSupabaseClient() {
  if (client) return client;
  const url = getEnvVar('VITE_SUPABASE_URL');
  const key = getEnvVar('VITE_SUPABASE_ANON_KEY');
  if (!url || !key) {
    if (!loggedMissing) {
      console.info('Supabase not configured (missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY); falling back to local/IPC.');
      loggedMissing = true;
    }
    return null;
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!loggedEnabled) {
    console.info('Supabase client initialized with provided env vars.');
    loggedEnabled = true;
  }
  return client;
}
