create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default 'Usuario',
  role text not null default 'Alumno' check (role in ('Alumno', 'Administrador')),
  study text not null default '',
  active_semester_id uuid,
  selected_subject_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.semestres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asignaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  semester_id uuid not null references public.semestres(id) on delete cascade,
  name text not null,
  presentation_percent numeric not null default 60,
  exam_percent numeric not null default 40,
  approval_grade numeric not null default 4.0,
  exemption_enabled boolean not null default false,
  exemption_grade numeric not null default 5.5,
  exam_grade numeric,
  simulation_exam_grade numeric not null default 4.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evaluaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.asignaturas(id) on delete cascade,
  name text not null,
  type text not null default 'Teorico',
  weight numeric not null default 0,
  grade numeric not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'Administrador'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, study)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'Alumno'),
    coalesce(new.raw_user_meta_data->>'study', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists prevent_profile_role_escalation on public.profiles;
create trigger prevent_profile_role_escalation
before update on public.profiles
for each row execute function public.prevent_profile_role_escalation();

alter table public.profiles enable row level security;
alter table public.semestres enable row level security;
alter table public.asignaturas enable row level security;
alter table public.evaluaciones enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check (id = auth.uid());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
on public.profiles for update
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "semestres_crud_own" on public.semestres;
create policy "semestres_crud_own"
on public.semestres for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "asignaturas_crud_own" on public.asignaturas;
create policy "asignaturas_crud_own"
on public.asignaturas for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "evaluaciones_crud_own" on public.evaluaciones;
create policy "evaluaciones_crud_own"
on public.evaluaciones for all
using (user_id = auth.uid())
with check (user_id = auth.uid());
