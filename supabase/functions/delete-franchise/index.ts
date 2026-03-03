import { corsHeaders } from '../_shared/cors.ts';
import { getAdminClient, getRequesterProfile } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getAdminClient();
    const { profile } = await getRequesterProfile(req, supabase);
    const requesterRole = String(profile.role || '').toLowerCase();
    if (requesterRole !== 'master') {
      return new Response(JSON.stringify({ error: 'Forbidden.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const franchiseId = String(body?.franchiseId || '').trim();
    if (!franchiseId) {
      return new Response(JSON.stringify({ error: 'franchiseId is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date().toISOString();
    const { error: updateFranchiseError } = await supabase
      .from('franchises')
      .update({ is_active: false, deleted_at: now, updated_at: now })
      .eq('id', franchiseId);
    if (updateFranchiseError) throw updateFranchiseError;

    await supabase
      .from('franchise_users')
      .update({ is_active: false, updated_at: now })
      .eq('franchise_id', franchiseId);

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
