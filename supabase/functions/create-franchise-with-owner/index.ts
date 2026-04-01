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

const DEFAULT_DIG_COMMISSION_RATE = 0.0275;
const DEFAULT_CLOSEOUT_COMMISSION_RATE = 0.0275;

function isFranchiseCodeConflict(error: any) {
  const code = String(error?.code || '').trim();
  if (code === '23505') return true;
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return (
    message.includes('franchise_code') &&
    (message.includes('duplicate') || message.includes('unique') || message.includes('already exists'))
  ) || message.includes('franchises_code');
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
    const { profile, user } = await getRequesterProfile(req, supabase);
    const requesterRole = String(profile.role || '').toLowerCase();
    if (requesterRole !== 'master') {
      return new Response(JSON.stringify({ error: 'Forbidden.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const franchiseName = String(body?.franchiseName || '').trim();
    const franchiseCode = String(body?.franchiseCode || '').trim().toUpperCase();
    const ownerEmail = String(body?.ownerEmail || '').trim().toLowerCase();
    const ownerName = body?.ownerName ? String(body.ownerName).trim() : null;

    if (!franchiseName || !franchiseCode || !ownerEmail) {
      return new Response(JSON.stringify({ error: 'franchiseName, franchiseCode, and ownerEmail are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const franchiseId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error: franchiseError } = await supabase.from('franchises').insert({
      id: franchiseId,
      name: franchiseName,
      franchise_code: franchiseCode,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    if (franchiseError) {
      if (isFranchiseCodeConflict(franchiseError)) {
        return new Response(JSON.stringify({ error: 'This franchise code is in use' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw franchiseError;
    }

    const { error: brandingError } = await supabase.from('franchise_branding').insert({
      franchise_id: franchiseId,
      app_name: franchiseName,
      updated_at: now,
      updated_by: user?.email || null,
    });
    if (brandingError) {
      await supabase.from('franchises').delete().eq('id', franchiseId);
      throw brandingError;
    }

    const tempPassword = generateTempPassword();
    const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
      email: ownerEmail,
      password: tempPassword,
      email_confirm: true,
    });
    if (createError || !createdUser?.user) {
      if (isEmailConflict(createError)) {
        await supabase.from('franchises').delete().eq('id', franchiseId);
        return new Response(JSON.stringify({ error: 'This email is in use' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await supabase.from('franchises').delete().eq('id', franchiseId);
      throw createError || new Error('Failed to create owner account.');
    }

    const { error: userError } = await supabase.from('franchise_users').insert({
      franchise_id: franchiseId,
      auth_user_id: createdUser.user.id,
      email: ownerEmail,
      name: ownerName,
      role: 'owner',
      is_active: true,
      password_reset_required: true,
      dig_commission_rate: DEFAULT_DIG_COMMISSION_RATE,
      closeout_commission_rate: DEFAULT_CLOSEOUT_COMMISSION_RATE,
      created_at: now,
      updated_at: now,
    });
    if (userError) {
      await supabase.auth.admin.deleteUser(createdUser.user.id);
      await supabase.from('franchises').delete().eq('id', franchiseId);
      if (isEmailConflict(userError)) {
        return new Response(JSON.stringify({ error: 'This email is in use' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw userError;
    }

    try {
      await insertLedgerEvent(supabase, {
        franchiseId,
        franchiseName,
        actorUser: {
          id: user?.id || null,
          email: user?.email || null,
        },
        actorProfile: profile,
        effectiveRole: requesterRole,
        action: 'Franchise created',
        targetType: 'franchise',
        targetId: franchiseId,
        details: {
          franchiseId,
          franchiseName,
          franchiseCode,
          ownerEmail,
          ownerName,
        },
      });
    } catch (ledgerError) {
      console.error('Unable to write ledger event for create-franchise-with-owner:', ledgerError);
    }

    return new Response(JSON.stringify({ franchiseId, tempPassword }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Unexpected error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
