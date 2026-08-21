create table if not exists public.oauth_clients (
  client_id text primary key,
  client_data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.oauth_authorization_codes (
  code_hash text primary key,
  code_data jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.oauth_revoked_tokens (
  jti text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.oauth_clients enable row level security;
alter table public.oauth_authorization_codes enable row level security;
alter table public.oauth_revoked_tokens enable row level security;

revoke all on public.oauth_clients from anon, authenticated;
revoke all on public.oauth_authorization_codes from anon, authenticated;
revoke all on public.oauth_revoked_tokens from anon, authenticated;

create index if not exists oauth_authorization_codes_expires_at_idx
  on public.oauth_authorization_codes (expires_at);
create index if not exists oauth_revoked_tokens_expires_at_idx
  on public.oauth_revoked_tokens (expires_at);
