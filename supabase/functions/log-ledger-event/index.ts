import { corsHeaders } from '../_shared/cors.ts';
import { getAdminClient, getRequesterProfile } from '../_shared/auth.ts';
import { insertLedgerEvent } from '../_shared/ledger.ts';

function normalizeText(value: unknown): string | null {
  const trimmed = String(value || '').trim();
  return trimmed || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getAdminClient();
    const { profile, user } = await getRequesterProfile(req, supabase);
    const requesterRole = String(profile.role || '').trim().toLowerCase();

    if (!['master', 'owner', 'admin', 'designer'].includes(requesterRole)) {
      return new Response(JSON.stringify({ error: 'Forbidden.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const requestedFranchiseId = normalizeText(body?.franchiseId);
    const actingAsRole =
      requesterRole === 'master' ? normalizeText(body?.actingAsRole)?.toLowerCase() : null;
    const actingAsFranchiseId =
      requesterRole === 'master' ? normalizeText(body?.actingAsFranchiseId) : null;
    const franchiseId =
      requesterRole === 'master'
        ? actingAsFranchiseId || requestedFranchiseId || normalizeText(profile.franchise_id)
        : requestedFranchiseId || normalizeText(profile.franchise_id);

    if (
      requesterRole !== 'master' &&
      requestedFranchiseId &&
      requestedFranchiseId !== normalizeText(profile.franchise_id)
    ) {
      return new Response(JSON.stringify({ error: 'Cannot write ledger events for another franchise.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const action = normalizeText(body?.action);
    if (!action) {
      return new Response(JSON.stringify({ error: 'action is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await insertLedgerEvent(supabase, {
      franchiseId,
      franchiseName:
        normalizeText(body?.franchiseName) ||
        (requesterRole === 'master' ? normalizeText(body?.actingAsFranchiseName) : null),
      actorUser: {
        id: user?.id || null,
        email: user?.email || null,
      },
      actorProfile: profile,
      effectiveRole: requesterRole === 'master' && actingAsRole ? actingAsRole : requesterRole,
      action,
      targetType: normalizeText(body?.targetType),
      targetId: normalizeText(body?.targetId),
      details: body?.details && typeof body.details === 'object' && !Array.isArray(body.details)
        ? body.details
        : {},
    });

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
