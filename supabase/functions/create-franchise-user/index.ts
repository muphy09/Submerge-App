import { corsHeaders } from '../_shared/cors.ts';
import { getAdminClient, getRequesterProfile } from '../_shared/auth.ts';

function generateTempPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function isEmailConflict(error: any) {
  const code = String(error?.code || '').trim();
  if (code === '23505') return true;
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return (
    (message.includes('email') &&
      (message.includes('duplicate') || message.includes('unique') || message.includes('already'))) ||
    message.includes('already registered') ||
    message.includes('users_email_key')
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = getAdminClient();
    const { profile } = await getRequesterProfile(req, supabase);
    const body = await req.json();
    const franchiseId = String(body?.franchiseId || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const name = body?.name ? String(body.name).trim() : null;
    const requestedRole = String(body?.role || 'designer').trim();

    if (!franchiseId || !email) {
      return new Response(JSON.stringify({ error: 'franchiseId and email are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requesterRole = String(profile.role || '').toLowerCase();
    if (!['master', 'owner', 'admin'].includes(requesterRole)) {
      return new Response(JSON.stringify({ error: 'Forbidden.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (requesterRole !== 'master' && profile.franchise_id !== franchiseId) {
      return new Response(JSON.stringify({ error: 'Cannot add users to another franchise.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const role = requesterRole === 'master'
      ? (requestedRole === 'owner' || requestedRole === 'admin' ? requestedRole : 'designer')
      : 'designer';

    const tempPassword = generateTempPassword();
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (createError || !created?.user) {
      if (isEmailConflict(createError)) {
        return new Response(JSON.stringify({ error: 'This email is in use' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw createError || new Error('Failed to create auth user.');
    }

    const now = new Date().toISOString();
    const { error: insertError } = await supabase.from('franchise_users').insert({
      franchise_id: franchiseId,
      auth_user_id: created.user.id,
      email,
      name,
      role,
      is_active: true,
      password_reset_required: true,
      created_at: now,
      updated_at: now,
    });
    if (insertError) {
      await supabase.auth.admin.deleteUser(created.user.id);
      if (isEmailConflict(insertError)) {
        return new Response(JSON.stringify({ error: 'This email is in use' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw insertError;
    }

    return new Response(JSON.stringify({ tempPassword, userId: created.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Unexpected error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
