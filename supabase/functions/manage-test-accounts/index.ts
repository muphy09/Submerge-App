import { corsHeaders } from '../_shared/cors.ts';
import { getAdminClient, getRequesterProfile } from '../_shared/auth.ts';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'bookkeeper', 'designer']);
const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%';

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function generateTempPassword(length = 18) {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => PASSWORD_CHARS[value % PASSWORD_CHARS.length]).join('');
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isEmailConflict(error: any) {
  const code = String(error?.code || '').trim();
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return code === '23505' || message.includes('already registered') || message.includes('already been registered') ||
    (message.includes('email') && (message.includes('duplicate') || message.includes('unique')));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = getAdminClient();
    const { profile } = await getRequesterProfile(req, supabase);
    if (String(profile.role || '').toLowerCase() !== 'master') {
      return json({ error: 'Master access required.' }, 403);
    }

    const body = await req.json();
    const action = normalizeText(body?.action).toLowerCase();

    if (action === 'list') {
      const { data, error } = await supabase
        .from('app_test_accounts')
        .select('id,auth_user_id,email,name,role,is_active,password_reset_required,created_at,updated_at')
        .order('role');
      if (error) throw error;
      return json({ accounts: data || [] });
    }

    if (action === 'create') {
      const email = normalizeEmail(body?.email);
      const role = normalizeText(body?.role).toLowerCase();
      const name = normalizeText(body?.name) || `${role} test`;
      if (!email || !ALLOWED_ROLES.has(role)) {
        return json({ error: 'A valid email and test role are required.' }, 400);
      }

      const existing = await supabase
        .from('app_test_accounts')
        .select('id,email,role,is_active')
        .eq('role', role)
        .maybeSingle();
      if (existing.error && existing.error.code !== 'PGRST116') throw existing.error;
      if (existing.data) {
        return json({ error: `A ${role} testing account already exists.` }, 409);
      }

      const tempPassword = generateTempPassword();
      const created = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });
      if (created.error || !created.data?.user) {
        if (isEmailConflict(created.error)) return json({ error: 'This email is already in use.' }, 409);
        throw created.error || new Error('Unable to create the test identity.');
      }

      const now = new Date().toISOString();
      const inserted = await supabase
        .from('app_test_accounts')
        .insert({
          auth_user_id: created.data.user.id,
          email,
          name,
          role,
          is_active: true,
          password_reset_required: true,
          created_at: now,
          updated_at: now,
        })
        .select('id,auth_user_id,email,name,role,is_active,password_reset_required,created_at,updated_at')
        .single();
      if (inserted.error) {
        await supabase.auth.admin.deleteUser(created.data.user.id);
        throw inserted.error;
      }

      return json({ account: inserted.data, tempPassword });
    }

    if (action === 'reset-password') {
      const accountId = normalizeText(body?.accountId);
      const target = await supabase
        .from('app_test_accounts')
        .select('id,auth_user_id,email,role')
        .eq('id', accountId)
        .maybeSingle();
      if (target.error && target.error.code !== 'PGRST116') throw target.error;
      if (!target.data?.auth_user_id) return json({ error: 'Testing account not found.' }, 404);

      const tempPassword = generateTempPassword();
      const authUpdate = await supabase.auth.admin.updateUserById(target.data.auth_user_id, {
        password: tempPassword,
      });
      if (authUpdate.error) throw authUpdate.error;
      const profileUpdate = await supabase
        .from('app_test_accounts')
        .update({ password_reset_required: true, updated_at: new Date().toISOString() })
        .eq('id', accountId);
      if (profileUpdate.error) throw profileUpdate.error;
      return json({ tempPassword });
    }

    if (action === 'set-active') {
      const accountId = normalizeText(body?.accountId);
      const isActive = body?.isActive === true;
      const updated = await supabase
        .from('app_test_accounts')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', accountId)
        .select('id,auth_user_id,email,name,role,is_active,password_reset_required,created_at,updated_at')
        .maybeSingle();
      if (updated.error && updated.error.code !== 'PGRST116') throw updated.error;
      if (!updated.data) return json({ error: 'Testing account not found.' }, 404);
      return json({ account: updated.data });
    }

    if (action === 'clear-proposals') {
      const franchiseId = normalizeText(body?.franchiseId);
      let query = supabase.from('franchise_test_proposals').delete().neq('proposal_number', '');
      if (franchiseId) query = query.eq('franchise_id', franchiseId);
      const cleared = await query.select('proposal_number');
      if (cleared.error) throw cleared.error;
      return json({ cleared: (cleared.data || []).length });
    }

    return json({ error: 'Unsupported testing-account action.' }, 400);
  } catch (error: any) {
    return json({ error: error?.message || 'Unexpected error.' }, 500);
  }
});
