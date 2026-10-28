begin;
drop policy if exists "requests visible to participants" on public.proposal_collaboration_requests;
create policy "requests visible to participants" on public.proposal_collaboration_requests
  for select to authenticated using (
    public.collab_actor_active(franchise_id,is_test,auth.uid()) and (
      (public.collab_current_owner(proposal_number,is_test)=auth.uid()
        and status in ('submitted','revision_requested','applied','declined','withdrawn'))
      or (contributor_id=auth.uid() and exists(select 1 from public.proposal_collaboration_shares s
        where s.proposal_number=proposal_collaboration_requests.proposal_number
          and s.is_test=proposal_collaboration_requests.is_test
          and s.recipient_id=auth.uid() and s.ended_at is null))
    )
  );
commit;
notify pgrst, 'reload schema';
