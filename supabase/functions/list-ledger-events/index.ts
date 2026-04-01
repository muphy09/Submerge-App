import { corsHeaders } from '../_shared/cors.ts';
import { getAdminClient, getRequesterProfile } from '../_shared/auth.ts';

function toSafeLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 200;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getAdminClient();
    const { profile } = await getRequesterProfile(req, supabase);
    const requesterRole = String(profile.role || '').trim().toLowerCase();

    if (requesterRole !== 'master') {
      return new Response(JSON.stringify({ error: 'Forbidden.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const limit = toSafeLimit(body?.limit);

    const { data, error } = await supabase
      .from('ledger_events')
      .select(
        'id,created_at,franchise_id,franchise_name,actor_name,actor_email,actor_role,effective_role,action,target_type,target_id,details'
      )
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    return new Response(JSON.stringify({ events: data || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Unexpected error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
