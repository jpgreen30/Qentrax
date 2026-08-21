create or replace function public.oauth_register_client(p_client_id text, p_client_data jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.oauth_clients (client_id, client_data)
  values (p_client_id, p_client_data);
$$;

create or replace function public.oauth_get_client(p_client_id text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select client_data from public.oauth_clients where client_id = p_client_id;
$$;

create or replace function public.oauth_save_authorization_code(
  p_code_hash text,
  p_code_data jsonb,
  p_expires_at timestamptz
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.oauth_authorization_codes (code_hash, code_data, expires_at)
  values (p_code_hash, p_code_data, p_expires_at);
$$;

create or replace function public.oauth_consume_authorization_code(p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  delete from public.oauth_authorization_codes
  where code_hash = p_code_hash and expires_at > now()
  returning code_data into result;
  return result;
end;
$$;

create or replace function public.oauth_revoke_jti(p_jti text, p_expires_at timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.oauth_revoked_tokens (jti, expires_at)
  values (p_jti, p_expires_at)
  on conflict (jti) do update set expires_at = excluded.expires_at;
$$;

create or replace function public.oauth_is_jti_revoked(p_jti text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.oauth_revoked_tokens
    where jti = p_jti and expires_at > now()
  );
$$;

revoke all on function public.oauth_register_client(text, jsonb) from public;
revoke all on function public.oauth_get_client(text) from public;
revoke all on function public.oauth_save_authorization_code(text, jsonb, timestamptz) from public;
revoke all on function public.oauth_consume_authorization_code(text) from public;
revoke all on function public.oauth_revoke_jti(text, timestamptz) from public;
revoke all on function public.oauth_is_jti_revoked(text) from public;

grant execute on function public.oauth_register_client(text, jsonb) to anon;
grant execute on function public.oauth_get_client(text) to anon;
grant execute on function public.oauth_save_authorization_code(text, jsonb, timestamptz) to anon;
grant execute on function public.oauth_consume_authorization_code(text) to anon;
grant execute on function public.oauth_revoke_jti(text, timestamptz) to anon;
grant execute on function public.oauth_is_jti_revoked(text) to anon;
