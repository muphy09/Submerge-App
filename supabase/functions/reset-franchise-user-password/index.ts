import { corsHeaders } from '../_shared/cors.ts';
import { getAdminClient, getRequesterProfile } from '../_shared/auth.ts';
import { insertLedgerEvent } from '../_shared/ledger.ts';

function generateTempPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getAdminClient();
    const { profile, user } = await getRequesterProfile(req, supabase);
    const body = await req.json();
    const userId = String(body?.userId || '').trim();
    const requesterRole = String(profile.role || '').toLowerCase();
    const effectiveRole =
      requesterRole === 'master'
        ? String(body?.actingAsRole || '').trim().toLowerCase() || requesterRole
        : requesterRole;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['master', 'owner', 'admin'].includes(requesterRole)) {
      return new Response(JSON.stringify({ error: 'Forbidden.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: target, error: targetError } = await supabase
      .from('franchise_users')
      .select('id,auth_user_id,franchise_id,role,name,email')
      .eq('id', userId)
      .maybeSingle();
    if (targetError && targetError.code !== 'PGRST116') throw targetError;
    if (!target) {
      return new Response(JSON.stringify({ error: 'User not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!target.auth_user_id) {
      return new Response(JSON.stringify({ error: 'User is missing auth linkage.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (requesterRole !== 'master' && target.franchise_id !== profile.franchise_id) {
      return new Response(JSON.stringify({ error: 'Cannot reset users outside your franchise.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tempPassword = generateTempPassword();
    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(target.auth_user_id, {
      password: tempPassword,
    });
    if (updateAuthError) throw updateAuthError;

    const now = new Date().toISOString();
    const { error: updateProfileError } = await supabase
      .from('franchise_users')
      .update({ password_reset_required: true, password_updated_at: now, updated_at: now })
      .eq('id', userId);
    if (updateProfileError) throw updateProfileError;

    try {
      await insertLedgerEvent(supabase, {
        franchiseId: target.franchise_id,
        actorUser: {
          id: user?.id || null,
          email: user?.email || null,
        },
        actorProfile: profile,
        effectiveRole,
        action: 'User password reset issued',
        targetType: 'user',
        targetId: userId,
        details: {
          targetUserId: userId,
          targetName: target.name || null,
          targetEmail: target.email || null,
          targetRole: target.role || null,
        },
      });
    } catch (ledgerError) {
      console.error('Unable to write ledger event for reset-franchise-user-password:', ledgerError);
    }

    return new Response(JSON.stringify({ tempPassword }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Unexpected error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
