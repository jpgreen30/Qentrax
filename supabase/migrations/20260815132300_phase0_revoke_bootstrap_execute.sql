-- Bootstrap helpers are trigger-only; revoke direct RPC access
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_login() from public, anon, authenticated;
grant execute on function public.handle_new_user() to postgres, supabase_auth_admin;
grant execute on function public.handle_user_login() to postgres, supabase_auth_admin;
