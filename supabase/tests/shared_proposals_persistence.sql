-- Run against an isolated database after the shared-proposals migration.
-- No application rows are created or changed.
begin;

do $$
declare
  v_signed jsonb := '{"proposalNumber":"TEST-COLLAB-1","versionId":"original","status":"signed","versionLocked":true,"pricingModelRevisionId":"pin-1","poolSpecs":{"poolLength":28}}'::jsonb;
  v_draft jsonb := '{"proposalNumber":"TEST-COLLAB-1","versionId":"addendum","status":"draft","pricingModelRevisionId":"pin-2","poolSpecs":{"poolLength":30},"subtotal":100000}'::jsonb;
  v_container jsonb;
  v_changed jsonb;
  v_work jsonb;
  v_rejected boolean;
begin
  v_container := v_signed || jsonb_build_object('versions',jsonb_build_array(v_draft));
  v_work := v_draft || '{"poolSpecs":{"poolLength":32},"subtotal":120000,"pricingModelRevisionId":"attacker-pin","status":"signed"}'::jsonb;
  v_changed := public.collab_replace_version(v_container,'addendum',v_work);
  if v_changed->'versions'->0->'poolSpecs'->>'poolLength' <> '32'
    or v_changed->'versions'->0->>'subtotal' <> '120000' then
    raise exception 'Editable draft body was not applied';
  end if;
  if v_changed->'versions'->0->>'pricingModelRevisionId' <> 'pin-2'
    or v_changed->'versions'->0->>'status' <> 'draft'
    or v_changed->>'status' <> 'signed' then
    raise exception 'Applying a draft changed protected pricing, status or signed baseline';
  end if;
  if public.collab_content_signature(v_container) = public.collab_content_signature(v_changed) then
    raise exception 'Content revision signature missed a body change';
  end if;
  if public.collab_content_signature(v_container) <> public.collab_content_signature(
      jsonb_set(v_container,'{workflow}','{"history":[{"type":"read"}]}'::jsonb,true)) then
    raise exception 'Workflow-only change incorrectly advanced content revision';
  end if;
  v_rejected := false;
  begin
    perform public.collab_editable_version(v_container,'original');
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'Signed baseline was editable'; end if;
  v_rejected := false;
  begin
    perform public.collab_editable_version(
      jsonb_set(v_container,'{versions,0,versionLocked}','true'::jsonb),'addendum');
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'Locked draft was editable'; end if;
  if not public.collab_history_preserved(
    '{"workflow":{"history":[{"type":"signed","actor":{"userId":"original"}}]}}'::jsonb,
    '{"workflow":{"history":[{"type":"signed","actor":{"userId":"original"},"readByUserIds":["reader"]},{"type":"note"}]}}'::jsonb) then
    raise exception 'An appended event or read marker incorrectly changed history';
  end if;
  if public.collab_history_preserved(
    '{"workflow":{"history":[{"type":"signed","actor":{"userId":"original"}}]}}'::jsonb,
    '{"workflow":{"history":[{"type":"signed","actor":{"userId":"attacker"}}]}}'::jsonb) then
    raise exception 'Historical signer attribution was mutable';
  end if;
end;
$$;

rollback;
