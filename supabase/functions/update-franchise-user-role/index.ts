import { corsHeaders } from '../_shared/cors.ts';
import { getAdminClient, getRequesterProfile } from '../_shared/auth.ts';
import { insertLedgerEvent } from '../_shared/ledger.ts';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'designer']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getAdminClient();
    const { profile, user } = await getRequesterProfile(req, supabase);
    const requesterRole = String(profile.role || '').toLowerCase();

    if (!['master', 'owner', 'admin'].includes(requesterRole)) {
      return new Response(JSON.stringify({ error: 'Forbidden.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const userId = String(body?.userId || '').trim();
    const nextRole = String(body?.role || '').trim().toLowerCase();
    const effectiveRole =
      requesterRole === 'master'
        ? String(body?.actingAsRole || '').trim().toLowerCase() || requesterRole
        : requesterRole;

    if (!userId || !nextRole) {
      return new Response(JSON.stringify({ error: 'userId and role are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!ALLOWED_ROLES.has(nextRole)) {
      return new Response(JSON.stringify({ error: 'Invalid role.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: target, error: targetError } = await supabase
      .from('franchise_users')
      .select('id,franchise_id,role,is_active,name,email')
      .eq('id', userId)
      .maybeSingle();
    if (targetError && targetError.code !== 'PGRST116') throw targetError;
    if (!target) {
      return new Response(JSON.stringify({ error: 'User not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetRole = String(target.role || '').toLowerCase();
    if (targetRole === 'master') {
      return new Response(JSON.stringify({ error: 'Master users cannot be changed here.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (requesterRole !== 'master') {
      if (!profile.franchise_id || target.franchise_id !== profile.franchise_id) {
        return new Response(JSON.stringify({ error: 'Cannot update users outside your franchise.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (nextRole !== 'admin' || targetRole !== 'designer') {
        return new Response(JSON.stringify({ error: 'Only master can change owner or admin assignments.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('franchise_users')
      .update({ role: nextRole, updated_at: now })
      .eq('id', userId)
      .select('id,franchise_id,role,is_active')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated || String(updated.role || '').toLowerCase() !== nextRole) {
      throw new Error('Role update did not persist.');
    }

    try {
      await insertLedgerEvent(supabase, {
        franchiseId: updated.franchise_id,
        actorUser: {
          id: user?.id || null,
          email: user?.email || null,
        },
        actorProfile: profile,
        effectiveRole,
        action: 'User role changed',
        targetType: 'user',
        targetId: userId,
        details: {
          targetUserId: userId,
          targetName: target.name || null,
          targetEmail: target.email || null,
          previousRole: targetRole,
          nextRole,
        },
      });
    } catch (ledgerError) {
      console.error('Unable to write ledger event for update-franchise-user-role:', ledgerError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: updated.id,
          franchiseId: updated.franchise_id,
          role: updated.role,
          isActive: updated.is_active !== false,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Unexpected error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
