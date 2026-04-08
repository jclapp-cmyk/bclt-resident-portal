-- Fix: infinite recursion in user_profiles RLS policies
--
-- Problem: policies on user_profiles referenced user_profiles itself
-- (to check admin role), causing infinite recursion during policy evaluation.
--
-- Solution: use a SECURITY DEFINER helper function that bypasses RLS when
-- checking the current user's role. Policies then call the function instead
-- of issuing a recursive SELECT against user_profiles.
--
-- Run this in the Supabase SQL editor.

-- 1. Helper function — SECURITY DEFINER bypasses RLS on user_profiles
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

-- Optional: resident_id helper for other policies that need it
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

-- 2. Drop the recursive policies on user_profiles
drop policy if exists "Users can view own profile" on public.user_profiles;
drop policy if exists "Admins can view all profiles" on public.user_profiles;
drop policy if exists "Admins can insert profiles" on public.user_profiles;
drop policy if exists "Admins can update profiles" on public.user_profiles;
drop policy if exists "profiles_login_check" on public.user_profiles;

-- 3. Recreate policies WITHOUT self-referencing subqueries
-- Self-access: any authenticated user can read/update their own row
create policy "profiles_select_self"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "profiles_update_self"
  on public.user_profiles for update
  using (auth.uid() = id);

-- Admin access: uses SECURITY DEFINER function (no recursion)
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

-- 4. (Optional but recommended) Update other tables' policies to use the
-- helper function as well, so they don't silently break if RLS is tightened
-- on user_profiles in the future. Examples — uncomment/adapt as needed:
--
-- drop policy if exists "<old policy>" on public.household_members;
-- create policy "household_admin" on public.household_members
--   using (public.current_user_role() = 'admin');
-- create policy "household_self" on public.household_members
--   using (resident_id = public.current_user_resident_id());
