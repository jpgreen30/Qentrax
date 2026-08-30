-- Allow advertisers to read opportunity rows for their own purchased transactions.
--
-- The advertiser opportunity pages display the public_transaction_id from the
-- originating opportunity, but the existing opportunities RLS only exposes rows
-- to the publisher org. Once a transaction exists, the advertiser needs read
-- access to that opportunity so the UI can show the purchased lead label and
-- the resulting spend/billing history.

drop policy if exists opportunities_advertiser_select on public.opportunities;
create policy opportunities_advertiser_select on public.opportunities
  for select to authenticated
  using (
    exists (
      select 1
      from public.transactions t
      where t.opportunity_id = public.opportunities.id
        and t.advertiser_org_id = public.org_id_from_auth()
    )
    or exists (
      select 1
      from public.auction_runs ar
      join public.campaigns c on c.id = ar.winning_campaign_id
      where ar.opportunity_id = public.opportunities.id
        and c.advertiser_org_id = public.org_id_from_auth()
    )
  );
