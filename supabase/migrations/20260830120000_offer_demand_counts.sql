begin;

-- Publisher demand discovery needs to know which offers actually have someone
-- buying: listing an offer with no active campaign sends a publisher down a
-- dead end. But campaigns are tenant-private — campaigns_tenant_all restricts
-- them to their own advertiser — so a publisher querying campaigns correctly
-- sees nothing, and every offer was filtered out as having no demand.
--
-- This exposes the aggregate a publisher legitimately needs (how many campaigns
-- are live on an offer) without exposing any campaign row: no advertiser
-- identity, name, bid, targeting or budget crosses the boundary. Only offers
-- that are themselves published are counted, so an unpublished offer cannot be
-- probed through the count.

create or replace function public.offer_active_campaign_counts()
returns table (offer_id uuid, active_campaigns bigint)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.offer_id, pg_catalog.count(*) as active_campaigns
  from public.campaigns c
  join public.offers o on o.id = c.offer_id
  where c.status = 'active'
    and c.offer_id is not null
    and o.status = 'published'
  group by c.offer_id;
$function$;

revoke all on function public.offer_active_campaign_counts() from public;
grant execute on function public.offer_active_campaign_counts()
  to authenticated, service_role;

commit;
