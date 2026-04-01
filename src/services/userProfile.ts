import { getSupabaseClient, hasSupabaseConnection, isSupabaseEnabled } from './supabaseClient';

function normalizeText(value?: string | null) {
  return String(value || '').trim();
}

function normalizeEmail(value?: string | null) {
  return normalizeText(value).toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

export async function updateCurrentUserProfile(payload: { name: string; email: string }) {
  const name = normalizeText(payload.name);
  const email = normalizeEmail(payload.email);

  if (!name) {
    throw new Error('Name is required.');
  }

  if (!email) {
    throw new Error('Email is required.');
  }

  if (!isValidEmail(email)) {
    throw new Error('Enter a valid email address.');
  }

  const supabase = assertSupabaseReady();
  const online = await hasSupabaseConnection(true);
  if (!online) {
    throw new Error('No internet connection. Please reconnect to continue.');
  }

  const { data, error } = await supabase.functions.invoke('update-current-user-profile', {
    body: { name, email },
  });

  if (error) {
    const message = await extractFunctionErrorMessage(error);
    throw new Error(message || error.message || 'Unable to update profile.');
  }

  return {
    name: normalizeText(data?.user?.name || name),
    email: normalizeEmail(data?.user?.email || email),
  };
}
