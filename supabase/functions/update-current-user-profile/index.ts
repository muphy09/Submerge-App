import { corsHeaders } from '../_shared/cors.ts';
import { getAdminClient, getRequesterProfile } from '../_shared/auth.ts';
import { insertLedgerEvent } from '../_shared/ledger.ts';

function normalizeText(value?: string | null) {
  return String(value || '').trim();
}

function normalizeEmail(value?: string | null) {
  return normalizeText(value).toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isEmailConflict(error: any) {
  const code = normalizeText(error?.code);
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
    const nextName = normalizeText(body?.name);
    const nextEmail = normalizeEmail(body?.email);

    if (!nextName) {
      return new Response(JSON.stringify({ error: 'Name is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!nextEmail) {
      return new Response(JSON.stringify({ error: 'Email is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isValidEmail(nextEmail)) {
      return new Response(JSON.stringify({ error: 'Enter a valid email address.' }), {
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

    if (!target) {
      return new Response(JSON.stringify({ error: 'User profile not found.' }), {
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

    const previousName = normalizeText(target.name);
    const previousEmail = normalizeEmail(target.email);
    const nameChanged = nextName !== previousName;
    const emailChanged = nextEmail !== previousEmail;
    const action = emailChanged && nameChanged
      ? 'User email and name updated'
      : emailChanged
        ? 'User email updated'
        : 'User name updated';

    if (!nameChanged && !emailChanged) {
      return new Response(
        JSON.stringify({
          user: {
            name: previousName,
            email: previousEmail,
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (emailChanged) {
      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(target.auth_user_id, {
        email: nextEmail,
        email_confirm: true,
      });
      if (updateAuthError) {
        if (isEmailConflict(updateAuthError)) {
          return new Response(JSON.stringify({ error: 'This email is in use' }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw updateAuthError;
      }
    }

    const now = new Date().toISOString();
    const { error: updateProfileError } = await supabase
      .from('franchise_users')
      .update({
        name: nextName,
        email: nextEmail,
        updated_at: now,
      })
      .eq('auth_user_id', user.id);

    if (updateProfileError) {
      if (emailChanged && previousEmail) {
        try {
          await supabase.auth.admin.updateUserById(target.auth_user_id, {
            email: previousEmail,
            email_confirm: true,
          });
        } catch (rollbackError) {
          console.error('Unable to roll back auth email after profile update failure:', rollbackError);
        }
      }

      if (isEmailConflict(updateProfileError)) {
        return new Response(JSON.stringify({ error: 'This email is in use' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw updateProfileError;
    }

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
          previousName: previousName || null,
          nextName,
          previousEmail: previousEmail || null,
          nextEmail,
          nameChanged,
          emailChanged,
        },
      });
    } catch (ledgerError) {
      console.error('Unable to write ledger event for update-current-user-profile:', ledgerError);
    }

    return new Response(
      JSON.stringify({
        user: {
          name: nextName,
          email: nextEmail,
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
