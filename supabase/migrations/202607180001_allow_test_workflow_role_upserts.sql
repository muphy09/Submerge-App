-- Allow authorized test workflow roles to upsert isolated test proposals that
-- were originally created by another designated test persona.

begin;

drop policy if exists "test proposal role insert" on public.franchise_test_proposals;
create policy "test proposal role insert"
  on public.franchise_test_proposals for insert to authenticated
  with check (
    public.current_user_is_test_account()
    and public.current_user_belongs_to_franchise(franchise_id)
    and (
      designer_auth_user_id = auth.uid()
      or public.current_test_account_role() in ('owner', 'admin')
      or (
        public.current_test_account_role() = 'bookkeeper'
        and lower(coalesce(status, proposal_json ->> 'status', 'draft')) <> 'draft'
      )
    )
  );

commit;
