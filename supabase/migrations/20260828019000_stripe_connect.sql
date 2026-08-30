-- Stripe Connect foundation for Qentrax marketplace
-- Applied live via Supabase MCP on 2026-08-15; kept here for env parity.

alter table public.organizations
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_status text not null default 'not_started'
    check (stripe_connect_status in ('not_started','pending','restricted','enabled','disabled')),
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false,
  add column if not exists stripe_connect_updated_at timestamptz;

create unique index if not exists organizations_stripe_customer_id_uidx
  on public.organizations (stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists organizations_stripe_connect_account_id_uidx
  on public.organizations (stripe_connect_account_id) where stripe_connect_account_id is not null;

create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  livemode boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  process_status text not null default 'received'
    check (process_status in ('received','processed','ignored','error')),
  process_message text,
  created_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

create or replace function public.record_stripe_funding(
  p_organization_id uuid,
  p_amount_cents integer,
  p_idempotency_key text,
  p_description text default 'Stripe advertiser funding',
  p_stripe_payment_intent_id text default null,
  p_stripe_checkout_session_id text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_adv_acct uuid;
  v_cash_acct uuid;
  v_journal uuid;
  v_org_type public.organization_type;
begin
  if p_amount_cents is null or p_amount_cents < 100 then
    raise exception 'Minimum Stripe funding is 100 cents ($1)';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'Idempotency key required';
  end if;

  select type into v_org_type from public.organizations where id = p_organization_id;
  if v_org_type is distinct from 'advertiser' then
    raise exception 'Funding only applies to advertiser organizations';
  end if;

  select id into v_journal from public.journals where idempotency_key = p_idempotency_key;
  if v_journal is not null then
    return jsonb_build_object(
      'journal_id', v_journal,
      'amount_cents', p_amount_cents,
      'currency', 'USD',
      'duplicate', true
    );
  end if;

  select id into v_adv_acct from public.financial_accounts
  where organization_id = p_organization_id and type = 'advertiser_balance' and currency = 'USD';
  if v_adv_acct is null then
    insert into public.financial_accounts (organization_id, type, currency)
    values (p_organization_id, 'advertiser_balance', 'USD')
    returning id into v_adv_acct;
  end if;

  v_cash_acct := public.ensure_platform_clearing();

  v_journal := public.post_balanced_journal(
    'advertiser_funding',
    p_idempotency_key,
    p_description,
    null,
    v_cash_acct,
    v_adv_acct,
    p_amount_cents,
    'USD',
    'funding',
    'organization',
    p_organization_id
  );

  insert into public.audit_events (
    actor_user_id, actor_org_id, action, resource_type, resource_id, reason, request_id, after_redacted
  ) values (
    null,
    p_organization_id,
    'funding.stripe_posted',
    'journal',
    v_journal,
    'stripe_webhook',
    p_idempotency_key,
    jsonb_build_object(
      'amount_cents', p_amount_cents,
      'journal_id', v_journal,
      'stripe_payment_intent_id', p_stripe_payment_intent_id,
      'stripe_checkout_session_id', p_stripe_checkout_session_id
    )
  );

  return jsonb_build_object(
    'journal_id', v_journal,
    'amount_cents', p_amount_cents,
    'currency', 'USD',
    'duplicate', false
  );
end;
$function$;

revoke all on function public.record_stripe_funding(uuid, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_stripe_funding(uuid, integer, text, text, text, text) to service_role;

alter table public.payout_batches
  add column if not exists stripe_transfer_group text,
  add column if not exists transfer_status text not null default 'none'
    check (transfer_status in ('none','pending','partial','complete','failed'));

alter table public.payout_items
  add column if not exists stripe_transfer_id text,
  add column if not exists transfer_status text not null default 'none'
    check (transfer_status in ('none','pending','paid','failed','skipped'));
