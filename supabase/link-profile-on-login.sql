-- Creates the link_profile_on_login RPC function.
-- When a user signs in via magic link, their auth.uid() may not match
-- the placeholder UUID in user_profiles (created during invite).
-- This SECURITY DEFINER function bypasses RLS to:
--   1. Find the profile row by email
--   2. Update its id to the real auth.uid()
--   3. Return the enriched profile data
--
-- Run this in the Supabase SQL editor.

create or replace function public.link_profile_on_login(user_id uuid, user_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  prof record;
  result json;
begin
  -- First try to find by matching auth id (already linked)
  select * into prof from user_profiles where id = user_id;

  -- If not found, find by email and link
  if prof is null then
    select * into prof from user_profiles where lower(email) = lower(user_email);
    if prof is not null and prof.id != user_id then
      update user_profiles set id = user_id where email = prof.email;
      prof.id := user_id;
    end if;
  end if;

  if prof is null then
    return null;
  end if;

  -- Build enriched response with resident/property info
  select json_build_object(
    'role', prof.role,
    'email', prof.email,
    'display_name', coalesce(prof.display_name, split_part(prof.email, '@', 1)),
    'resident_id', prof.resident_id,
    'resident_slug', r.slug,
    'resident_name', r.name,
    'unit_number', r.unit_number,
    'property_slug', p.slug,
    'property_name', p.name
  ) into result
  from (select 1) dummy
  left join residents r on r.id = prof.resident_id
  left join properties p on p.id = r.property_id;

  return result;
end;
$$;

grant execute on function public.link_profile_on_login(uuid, text) to authenticated, anon;

-- Also ensure check_email_exists function exists (used on login form)
create or replace function public.check_email_exists(lookup_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from user_profiles where lower(email) = lower(lookup_email))
$$;

grant execute on function public.check_email_exists(text) to authenticated, anon;
