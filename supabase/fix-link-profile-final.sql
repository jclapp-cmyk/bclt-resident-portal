-- FINAL FIX: Ensure link_profile_on_login works reliably.
-- Drop ALL versions and recreate both signatures so the code works
-- regardless of which version the client calls.
--
-- Run this in Supabase SQL editor.

-- Drop all existing versions
DROP FUNCTION IF EXISTS public.link_profile_on_login(uuid, text);
DROP FUNCTION IF EXISTS public.link_profile_on_login(text);

-- Single-param version (preferred — uses auth.uid() for security)
CREATE OR REPLACE FUNCTION public.link_profile_on_login(user_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  prof record;
  result json;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- First try by auth id (already linked)
  SELECT * INTO prof FROM user_profiles WHERE id = caller_id;

  -- If not found, find by email and link
  IF prof IS NULL THEN
    SELECT * INTO prof FROM user_profiles WHERE lower(email) = lower(user_email);
    IF prof IS NOT NULL AND prof.id != caller_id THEN
      UPDATE user_profiles SET id = caller_id WHERE email = prof.email;
      prof.id := caller_id;
    END IF;
  END IF;

  IF prof IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'role', prof.role,
    'email', prof.email,
    'display_name', coalesce(prof.display_name, split_part(prof.email, '@', 1)),
    'resident_id', prof.resident_id,
    'resident_slug', r.slug,
    'resident_name', r.name,
    'unit_number', u.number,
    'property_slug', p.slug,
    'property_name', p.name
  ) INTO result
  FROM (SELECT 1) dummy
  LEFT JOIN residents r ON r.id = prof.resident_id
  LEFT JOIN units u ON u.id = r.unit_id
  LEFT JOIN properties p ON p.id = r.property_id;

  RETURN result;
END;
$$;

-- Two-param version (legacy fallback — ignores user_id, uses auth.uid())
CREATE OR REPLACE FUNCTION public.link_profile_on_login(user_id uuid, user_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delegate to the single-param version (which uses auth.uid())
  RETURN public.link_profile_on_login(user_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_profile_on_login(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_profile_on_login(uuid, text) TO authenticated;

-- Also fix any admin profiles that have mismatched IDs right now
UPDATE user_profiles up
SET id = au.id
FROM auth.users au
WHERE lower(up.email) = lower(au.email)
  AND up.id != au.id;
