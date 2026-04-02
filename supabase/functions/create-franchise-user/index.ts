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
const DEFAULT_APPROVAL_MARGIN_THRESHOLD_PERCENT = 18;
const DEFAULT_DISCOUNT_ALLOWANCE_THRESHOLD_PERCENT = 18;
const MASTER_ALLOWED_ROLES = new Set(['owner', 'admin', 'bookkeeper', 'designer']);

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
    const body = await req.json();
    const franchiseId = String(body?.franchiseId || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const name = body?.name ? String(body.name).trim() : null;
    const requestedRole = String(body?.role || 'designer').trim().toLowerCase();

    if (!franchiseId || !email) {
      return new Response(JSON.stringify({ error: 'franchiseId and email are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requesterRole = String(profile.role || '').toLowerCase();
    const effectiveRole =
      requesterRole === 'master'
        ? String(body?.actingAsRole || '').trim().toLowerCase() || requesterRole
        : requesterRole;
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

    const role =
      requesterRole === 'master'
        ? MASTER_ALLOWED_ROLES.has(requestedRole)
          ? requestedRole
          : 'designer'
        : requestedRole === 'bookkeeper'
          ? 'bookkeeper'
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
    const { data: insertedUser, error: insertError } = await supabase
      .from('franchise_users')
      .insert({
        franchise_id: franchiseId,
        auth_user_id: created.user.id,
        email,
        name,
        role,
        is_active: true,
        password_reset_required: true,
        dig_commission_rate: DEFAULT_DIG_COMMISSION_RATE,
        closeout_commission_rate: DEFAULT_CLOSEOUT_COMMISSION_RATE,
        approval_margin_threshold_percent: DEFAULT_APPROVAL_MARGIN_THRESHOLD_PERCENT,
        discount_allowance_threshold_percent: DEFAULT_DISCOUNT_ALLOWANCE_THRESHOLD_PERCENT,
        always_require_approval: false,
        created_at: now,
        updated_at: now,
      })
      .select('id,auth_user_id,role,franchise_id,is_active')
      .single();
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

    let createdProfile = insertedUser;
    if (!createdProfile || String(createdProfile.role || '').toLowerCase() !== role) {
      const { data: correctedUser, error: correctedUserError } = await supabase
        .from('franchise_users')
        .update({ role, updated_at: now })
        .eq('auth_user_id', created.user.id)
        .eq('franchise_id', franchiseId)
        .select('id,auth_user_id,role,franchise_id,is_active')
        .single();
      if (correctedUserError) {
        throw correctedUserError;
      }
      createdProfile = correctedUser;
    }

    if (!createdProfile || String(createdProfile.role || '').toLowerCase() !== role) {
      throw new Error('User was created, but the selected role did not persist.');
    }

    try {
      await insertLedgerEvent(supabase, {
        franchiseId,
        actorUser: {
          id: user?.id || null,
          email: user?.email || null,
        },
        actorProfile: profile,
        effectiveRole,
        action: 'User created',
        targetType: 'user',
        targetId: createdProfile.id,
        details: {
          targetUserId: createdProfile.id,
          targetAuthUserId: created.user.id,
          targetEmail: email,
          targetName: name,
          targetRole: createdProfile.role,
          passwordResetRequired: true,
        },
      });
    } catch (ledgerError) {
      console.error('Unable to write ledger event for create-franchise-user:', ledgerError);
    }

    return new Response(
      JSON.stringify({
        tempPassword,
        userId: createdProfile.id,
        authUserId: created.user.id,
        role: createdProfile.role,
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
