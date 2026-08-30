begin;

create or replace function public.advertiser_available_balance_cents(
  p_organization_id uuid
) returns integer
language sql
security definer
set search_path = ''
as $function$
  select coalesce(
    sum(
      case le.direction
        when 'credit' then le.amount_cents
        when 'debit' then -le.amount_cents
        else 0
      end
    ),
    0
  )::integer
  from public.financial_accounts fa
  left join public.ledger_entries le on le.account_id = fa.id
  where fa.organization_id = p_organization_id
    and fa.type = 'advertiser_balance'
    and fa.currency = 'USD';
$function$;

revoke all on function public.advertiser_available_balance_cents(uuid) from public, anon;
grant execute on function public.advertiser_available_balance_cents(uuid) to authenticated, service_role;

commit;
