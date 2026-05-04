-- Run after applying migrations against Supabase/PostgreSQL:
-- psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/rls_tests.sql

begin;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'current_academic_user_id'
  ) then
    raise exception 'Missing helper function current_academic_user_id';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'current_app_role'
  ) then
    raise exception 'Missing helper function current_app_role';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'User'
      and c.relrowsecurity = true
  ) then
    raise exception 'RLS is not enabled on public."User"';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'audit_logs'
      and c.relrowsecurity = true
  ) then
    raise exception 'RLS is not enabled on public.audit_logs';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'User'
      and policyname = 'admin can manage users'
  ) then
    raise exception 'Missing admin can manage users policy';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'User'
      and policyname = 'users can read own profile row'
  ) then
    raise exception 'Missing users can read own profile row policy';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'admin can read audit logs'
  ) then
    raise exception 'Missing admin can read audit logs policy';
  end if;
end;
$$;

rollback;

