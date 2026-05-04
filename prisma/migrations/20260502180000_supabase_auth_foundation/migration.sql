create extension if not exists pgcrypto;

-- Existing "User" is the academic user table for this project.
alter table public."User"
  add column if not exists auth_user_id uuid,
  add column if not exists is_sso_allowed boolean not null default true,
  add column if not exists last_login_at timestamp;

create unique index if not exists "User_auth_user_id_key"
  on public."User"(auth_user_id)
  where auth_user_id is not null;

create index if not exists idx_user_email_lower
  on public."User"(lower(email));

create index if not exists idx_user_auth_user_id
  on public."User"(auth_user_id);

create index if not exists idx_user_status_aktif
  on public."User"(status_aktif);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_auth_user_id uuid,
  actor_user_id text references public."User"(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}',
  created_at timestamp not null default now()
);

create index if not exists idx_audit_logs_actor_user_id
  on public.audit_logs(actor_user_id);

create index if not exists idx_audit_logs_actor_auth_user_id
  on public.audit_logs(actor_auth_user_id);

create index if not exists idx_audit_logs_action
  on public.audit_logs(action);

create index if not exists idx_audit_logs_created_at
  on public.audit_logs(created_at);

create table if not exists public.user_security_events (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  academic_user_id text references public."User"(id) on delete cascade,
  event text not null,
  provider text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}',
  created_at timestamp not null default now()
);

create index if not exists idx_user_security_events_auth_user_id
  on public.user_security_events(auth_user_id);

create index if not exists idx_user_security_events_academic_user_id
  on public.user_security_events(academic_user_id);

create index if not exists idx_user_security_events_event
  on public.user_security_events(event);

create index if not exists idx_user_security_events_created_at
  on public.user_security_events(created_at);

create or replace function public.normalize_school_role(role_name text)
returns text
language sql
immutable
as $$
  select case role_name
    when 'Administrator' then 'ADMIN'
    when 'Kurikulum' then 'KURIKULUM'
    when 'Guru Mapel' then 'GURU'
    when 'Guru' then 'GURU'
    when 'Wali Kelas' then 'WALI_KELAS'
    when 'Siswa' then 'SISWA'
    else upper(coalesce(role_name, ''))
  end;
$$;

create or replace function public.current_academic_user_id()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select u.id
  from public."User" u
  where u.auth_user_id = auth.uid()
    and u.status_aktif = true
  limit 1;
$$;

create or replace function public.current_app_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select public.normalize_school_role(r.nama_role)
  from public."User" u
  join public."Role" r on r.id = u.role_id
  where u.auth_user_id = auth.uid()
    and u.status_aktif = true
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_app_role() = 'ADMIN';
$$;

create or replace function public.is_kurikulum()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_app_role() = 'KURIKULUM';
$$;

create or replace function public.before_user_created_check(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_email text;
  matched_user public."User"%rowtype;
begin
  requested_email := lower(event->'user'->>'email');

  select *
  into matched_user
  from public."User"
  where lower(email) = requested_email
  limit 1;

  if matched_user.id is null then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Akun belum terdaftar di sistem akademik.'
      )
    );
  end if;

  if matched_user.status_aktif = false then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Akun tidak aktif. Hubungi administrator.'
      )
    );
  end if;

  if matched_user.is_sso_allowed = false then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Akses SSO tidak diizinkan untuk akun ini.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public."User"
  set auth_user_id = new.id,
      last_login_at = now()
  where lower(email) = lower(new.email)
    and auth_user_id is null;

  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'auth'
      and table_name = 'users'
  ) then
    execute 'drop trigger if exists on_auth_user_created_link_academic_user on auth.users';
    execute 'create trigger on_auth_user_created_link_academic_user
      after insert on auth.users
      for each row
      execute function public.handle_new_auth_user()';
  end if;
end;
$$;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  user_role text;
  academic_id text;
  active_status boolean;
begin
  select u.id, public.normalize_school_role(r.nama_role), u.status_aktif
  into academic_id, user_role, active_status
  from public."User" u
  join public."Role" r on r.id = u.role_id
  where u.auth_user_id = (event->>'user_id')::uuid
  limit 1;

  claims := event->'claims';

  if academic_id is not null then
    claims := jsonb_set(claims, '{academic_user_id}', to_jsonb(academic_id));
    claims := jsonb_set(claims, '{school_role}', to_jsonb(user_role));
    claims := jsonb_set(claims, '{is_active}', to_jsonb(active_status));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

alter table public."User" enable row level security;

drop policy if exists "admin can manage users" on public."User";
create policy "admin can manage users"
on public."User"
for all
to authenticated
using (public.current_app_role() = 'ADMIN')
with check (public.current_app_role() = 'ADMIN');

drop policy if exists "users can read own profile row" on public."User";
create policy "users can read own profile row"
on public."User"
for select
to authenticated
using (id = public.current_academic_user_id());

alter table public.audit_logs enable row level security;

drop policy if exists "admin can read audit logs" on public.audit_logs;
create policy "admin can read audit logs"
on public.audit_logs
for select
to authenticated
using (public.current_app_role() = 'ADMIN');

alter table public.user_security_events enable row level security;

drop policy if exists "admin can read security events" on public.user_security_events;
create policy "admin can read security events"
on public.user_security_events
for select
to authenticated
using (public.current_app_role() = 'ADMIN');

drop policy if exists "users can read own security events" on public.user_security_events;
create policy "users can read own security events"
on public.user_security_events
for select
to authenticated
using (academic_user_id = public.current_academic_user_id());

