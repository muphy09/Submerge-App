import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function getAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getRequesterProfile(req: Request, supabase: ReturnType<typeof getAdminClient>) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    throw new Error('Missing authorization token.');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    throw new Error('Unauthorized.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('franchise_users')
    .select('id,franchise_id,role,is_active')
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
