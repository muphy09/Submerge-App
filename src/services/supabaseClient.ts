import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let loggedMissing = false;
let loggedEnabled = false;

export function isSupabaseEnabled() {
  const url = import.meta.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

export function getSupabaseClient() {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
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
