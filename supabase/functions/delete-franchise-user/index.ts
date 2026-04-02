import { corsHeaders } from '../_shared/cors.ts';
import { getAdminClient, getRequesterProfile } from '../_shared/auth.ts';
import { insertLedgerEvent } from '../_shared/ledger.ts';

function normalizeText(value?: string | null) {
  return String(value || '').trim();
}

function normalizeComparableText(value?: string | null) {
  return normalizeText(value).toLowerCase();
}

function buildDesignerIdentifiers(user: { name?: string | null; email?: string | null }) {
  return new Set(
    [normalizeComparableText(user.name), normalizeComparableText(user.email)].filter(Boolean)
  );
}

function proposalMatchesDesigner(
  row: { designer_name?: string | null; proposal_json?: Record<string, unknown> | null },
  identifiers: Set<string>
) {
  const rowDesignerName = normalizeComparableText(row.designer_name);
  const jsonDesignerName = normalizeComparableText(
    typeof row.proposal_json === 'object' && row.proposal_json
      ? String((row.proposal_json as Record<string, unknown>).designerName || '')
      : ''
  );
  return identifiers.has(rowDesignerName) || identifiers.has(jsonDesignerName);
}

function canOwnTransferredProposals(role?: string | null) {
  const normalized = normalizeComparableText(role);
  return normalized === 'owner' || normalized === 'admin' || normalized === 'designer';
}

function applyDesignerTransferToProposal(
  proposal: Record<string, unknown>,
  nextDesigner: {
    name: string;
    role: string;
  }
): Record<string, unknown> {
  const walk = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    const versions = Array.isArray(record.versions)
      ? record.versions.map((entry) => walk(entry) as Record<string, unknown>)
      : record.versions;

    return {
      ...record,
      designerName: nextDesigner.name,
      designerRole: nextDesigner.role,
      versions,
    };
  };

  return walk(proposal) as Record<string, unknown>;
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
    const userId = normalizeText(body?.userId);
    const transferToUserId = normalizeText(body?.transferToUserId);
    const effectiveRole =
      requesterRole === 'master'
        ? normalizeComparableText(body?.actingAsRole) || requesterRole
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

    const targetRole = normalizeComparableText(target.role);
    if (!['designer', 'bookkeeper'].includes(targetRole)) {
      return new Response(JSON.stringify({ error: 'Only designers and bookkeepers can be removed here.' }), {
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

    const { data: proposalRows, error: proposalsError } = await supabase
      .from('franchise_proposals')
      .select('proposal_number,proposal_json,designer_name,designer_role,designer_code')
      .eq('franchise_id', target.franchise_id);
    if (proposalsError) throw proposalsError;

    const designerIdentifiers = buildDesignerIdentifiers(target);
    const matchedProposals =
      (proposalRows || []).filter((row: any) => proposalMatchesDesigner(row, designerIdentifiers)) || [];

    let transferUser:
      | {
          id: string;
          franchise_id: string;
          role: string;
          is_active: boolean;
          name?: string | null;
          email?: string | null;
        }
      | null = null;

    if (matchedProposals.length > 0) {
      if (!transferToUserId) {
        return new Response(
          JSON.stringify({ error: 'This designer has proposals. Transfer them before removing the user.' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (transferToUserId === userId) {
        return new Response(JSON.stringify({ error: 'Transfer user must be different from the designer being removed.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: nextUser, error: transferUserError } = await supabase
        .from('franchise_users')
        .select('id,franchise_id,role,is_active,name,email')
        .eq('id', transferToUserId)
        .maybeSingle();
      if (transferUserError && transferUserError.code !== 'PGRST116') throw transferUserError;
      if (!nextUser) {
        return new Response(JSON.stringify({ error: 'Transfer user not found.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (nextUser.franchise_id !== target.franchise_id) {
        return new Response(JSON.stringify({ error: 'Transfer user must belong to the same franchise.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (nextUser.is_active === false) {
        return new Response(JSON.stringify({ error: 'Transfer user must be active.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!canOwnTransferredProposals(nextUser.role)) {
        return new Response(JSON.stringify({ error: 'Transfer user must be an owner, admin, or designer.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      transferUser = nextUser;
    }

    let proposalsUpdated = 0;
    if (matchedProposals.length > 0 && transferUser) {
      const nextDesignerName = normalizeText(transferUser.name) || normalizeText(transferUser.email);
      const nextDesignerRole = normalizeComparableText(transferUser.role) || 'designer';
      const updates = matchedProposals
        .map((row: any) => {
          const proposalJson =
            row?.proposal_json && typeof row.proposal_json === 'object'
              ? row.proposal_json as Record<string, unknown>
              : {};

          return {
            proposal_number: row.proposal_number,
            franchise_id: target.franchise_id,
            designer_name: nextDesignerName,
            designer_role: nextDesignerRole,
            designer_code: row?.designer_code || null,
            proposal_json: applyDesignerTransferToProposal(proposalJson, {
              name: nextDesignerName,
              role: nextDesignerRole,
            }),
          };
        })
        .filter((row: any) => Boolean(row?.proposal_number));

      if (updates.length > 0) {
        const { error: transferError } = await supabase
          .from('franchise_proposals')
          .upsert(updates, { onConflict: 'proposal_number' });
        if (transferError) throw transferError;
        proposalsUpdated = updates.length;
      }
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
          transferredToUserId: transferUser?.id || null,
          transferredToName: transferUser?.name || null,
          transferredToEmail: transferUser?.email || null,
          transferredToRole: transferUser?.role || null,
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
