-- Fix v2: drop ALL existing policies on user_profiles, then recreate clean ones.
-- The previous script's DROP POLICY IF EXISTS statements didn't match the
-- actual policy names in the database, so the recursive policies stayed in
-- place. This version iterates pg_policies and drops every policy on the
-- table before recreating.

-- 1. Helper function (idempotent) — SECURITY DEFINER bypasses RLS
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_profiles where id = auth.uid()
$$;

grant execute on function public.current_user_role() to authenticated, anon;

create or replace function public.current_user_resident_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select resident_id from public.user_profiles where id = auth.uid()
$$;

grant execute on function public.current_user_resident_id() to authenticated, anon;

-- 2. Drop EVERY existing policy on public.user_profiles
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles'
  loop
    execute format('drop policy if exists %I on public.user_profiles', pol.policyname);
  end loop;
end $$;

-- 3. Recreate clean, non-recursive policies
create policy "profiles_select_self"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "profiles_update_self"
  on public.user_profiles for update
  using (auth.uid() = id);

create policy "profiles_select_admin"
  on public.user_profiles for select
  using (public.current_user_role() = 'admin');

create policy "profiles_insert_admin"
  on public.user_profiles for insert
  with check (public.current_user_role() = 'admin');

create policy "profiles_update_admin"
  on public.user_profiles for update
  using (public.current_user_role() = 'admin');

create policy "profiles_delete_admin"
  on public.user_profiles for delete
  using (public.current_user_role() = 'admin');

-- 4. Sanity check — list remaining policies so you can verify in the output
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'user_profiles'
order by policyname;
