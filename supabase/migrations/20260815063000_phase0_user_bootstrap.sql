-- Phase 0: bootstrap public.users from auth.users on first sign-in
-- Keeps application identity table in sync without requiring service-role from the browser path.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (auth_subject, email, display_name, status, last_login_at)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@unknown.local'),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    'active',
    now()
  )
  on conflict (auth_subject) do update
    set email = excluded.email,
        last_login_at = now(),
        updated_at = now(),
        version = public.users.version + 1;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Also refresh last_login on subsequent sign-ins when email is confirmed
create or replace function public.handle_user_login()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
  set last_login_at = now(),
      updated_at = now(),
      version = version + 1
  where auth_subject = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row
  when (old.last_sign_in_at is distinct from new.last_sign_in_at)
  execute function public.handle_user_login();

-- Allow authenticated users to insert their own row as a safety net if trigger was missed
create policy users_self_insert on public.users
  for insert to authenticated
  with check (auth_subject = (select auth.uid()));

create policy users_self_update on public.users
  for update to authenticated
  using (auth_subject = (select auth.uid()))
  with check (auth_subject = (select auth.uid()));

commit;
