import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getAdminClient, getRequesterProfile } from '../_shared/auth.ts';
import { insertLedgerEvent } from '../_shared/ledger.ts';

function normalizeText(value?: string | null) {
  return String(value || '').trim();
}

function getPublicClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY.');
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function verifyCurrentPassword(email: string, oldPassword: string, expectedAuthUserId: string) {
  const publicClient = getPublicClient();
  const { data, error } = await publicClient.auth.signInWithPassword({
    email,
    password: oldPassword,
  });

  if (error || !data?.user || data.user.id !== expectedAuthUserId) {
    throw new Error('Current password is incorrect.');
  }

  try {
    await publicClient.auth.signOut();
  } catch (signOutError) {
    console.warn('Unable to clear temporary password verification session:', signOutError);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getAdminClient();
    const { profile, user } = await getRequesterProfile(req, supabase);
    const body = await req.json();
    const newPassword = normalizeText(body?.newPassword);
    const oldPassword = normalizeText(body?.oldPassword);
    const mode = normalizeText(body?.mode).toLowerCase();
    const action = mode === 'reset' ? 'Password reset completed' : 'Password updated';

    if (!newPassword) {
      return new Response(JSON.stringify({ error: 'New password is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode !== 'reset' && !oldPassword) {
      return new Response(JSON.stringify({ error: 'Current password is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: target, error: targetError } = await supabase
      .from('franchise_users')
      .select('id,auth_user_id,franchise_id,role,name,email')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (targetError && targetError.code !== 'PGRST116') throw targetError;

    if (!target?.auth_user_id) {
      return new Response(JSON.stringify({ error: 'User profile not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode !== 'reset') {
      await verifyCurrentPassword(String(target.email || user.email || '').trim().toLowerCase(), oldPassword, target.auth_user_id);
    }

    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(target.auth_user_id, {
      password: newPassword,
    });
    if (updateAuthError) throw updateAuthError;

    const now = new Date().toISOString();
    const { error: updateProfileError } = await supabase
      .from('franchise_users')
      .update({
        password_reset_required: false,
        password_updated_at: now,
        updated_at: now,
      })
      .eq('auth_user_id', user.id);
    if (updateProfileError) throw updateProfileError;

    try {
      await insertLedgerEvent(supabase, {
        franchiseId: target.franchise_id,
        actorUser: {
          id: user?.id || null,
          email: user?.email || null,
        },
        actorProfile: profile,
        effectiveRole: String(profile.role || '').toLowerCase() || 'designer',
        action,
        targetType: 'user',
        targetId: target.id,
        details: {
          targetUserId: target.id,
          targetAuthUserId: target.auth_user_id,
          targetRole: target.role || null,
          targetName: target.name || null,
          targetEmail: target.email || null,
        },
      });
    } catch (ledgerError) {
      console.error('Unable to write ledger event for change-current-user-password:', ledgerError);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Unexpected error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
