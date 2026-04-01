import { corsHeaders } from '../_shared/cors.ts';
import { getAdminClient, getRequesterProfile } from '../_shared/auth.ts';
import { insertLedgerEvent } from '../_shared/ledger.ts';

function normalizeText(value?: string | null) {
  return String(value || '').trim();
}

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
    if (targetRole !== 'designer') {
      return new Response(JSON.stringify({ error: 'Only designers can be removed here.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (requesterRole !== 'master' && target.franchise_id !== profile.franchise_id) {
      return new Response(JSON.stringify({ error: 'Cannot remove users outside your franchise.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('franchise_users')
      .update({ is_active: false, updated_at: now })
      .eq('id', userId)
      .select('id,franchise_id,role,is_active')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated || updated.is_active !== false) {
      throw new Error('User removal did not persist.');
    }

    const designerName = normalizeText(target.name) || normalizeText(target.email);
    let proposalsUpdated = 0;

    if (designerName) {
      const { data: proposals, error: proposalsError } = await supabase
        .from('franchise_proposals')
        .select('proposal_number,proposal_json,designer_name')
        .eq('franchise_id', target.franchise_id)
        .ilike('designer_name', designerName);
      if (proposalsError) throw proposalsError;

      const updates =
        proposals
          ?.map((row: any) => {
            const currentName = normalizeText(row?.designer_name) || designerName;
            const nextName = /\(deleted\)$/i.test(currentName) ? currentName : `${currentName} (Deleted)`;
            const proposalJson =
              row?.proposal_json && typeof row.proposal_json === 'object' ? row.proposal_json : {};

            return {
              proposal_number: row.proposal_number,
              franchise_id: target.franchise_id,
              designer_name: nextName,
              proposal_json: {
                ...proposalJson,
                designerName: nextName,
              },
            };
          })
          .filter((row: any) => Boolean(row?.proposal_number)) || [];

      if (updates.length > 0) {
        const { error: proposalsUpdateError } = await supabase
          .from('franchise_proposals')
          .upsert(updates, { onConflict: 'proposal_number' });
        if (proposalsUpdateError) throw proposalsUpdateError;
        proposalsUpdated = updates.length;
      }
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
        action: 'User removed',
        targetType: 'user',
        targetId: userId,
        details: {
          targetUserId: userId,
          targetName: target.name || null,
          targetEmail: target.email || null,
          targetRole,
          proposalsUpdated,
        },
      });
    } catch (ledgerError) {
      console.error('Unable to write ledger event for delete-franchise-user:', ledgerError);
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
        proposalsUpdated,
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
