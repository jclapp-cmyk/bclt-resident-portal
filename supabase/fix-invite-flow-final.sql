-- FINAL FIX: Bulletproof invite + login flow
--
-- 1. Create invite_user RPC that creates profiles with the correct auth ID
-- 2. Recreate the trigger as a safety net
-- 3. Ensure link_profile_on_login is robust
--
-- Run this in Supabase SQL editor.

-- ══════════════════════════════════════════
-- 1. invite_user RPC — creates profile with correct auth ID if available
-- ══════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.invite_user(
  invite_email text,
  invite_role text,
  invite_resident_id uuid DEFAULT NULL,
  invite_display_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_id uuid;
  profile_id uuid;
  display text;
BEGIN
  -- Check if caller is admin
  IF public.current_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Only admins can invite users';
  END IF;

  -- Check if profile already exists for this email
  IF EXISTS (SELECT 1 FROM user_profiles WHERE lower(email) = lower(invite_email)) THEN
    RAISE EXCEPTION 'A profile already exists for this email';
  END IF;

  -- Check if this email already has an auth.users entry
  SELECT id INTO auth_id FROM auth.users WHERE lower(email) = lower(invite_email);

  -- Use real auth ID if available, otherwise generate placeholder
  profile_id := COALESCE(auth_id, gen_random_uuid());
  display := COALESCE(invite_display_name, split_part(invite_email, '@', 1));

  INSERT INTO user_profiles (id, email, role, resident_id, display_name)
  VALUES (profile_id, invite_email, invite_role, invite_resident_id, display);

  RETURN json_build_object(
    'id', profile_id,
    'email', invite_email,
    'role', invite_role,
    'linked', auth_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_user(text, text, uuid, text) TO authenticated;


-- ══════════════════════════════════════════
-- 2. Recreate the trigger as a safety net
-- ══════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.link_profile_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_profiles
  SET id = NEW.id
  WHERE lower(email) = lower(NEW.email)
    AND id != NEW.id;
  RETURN NEW;
END;
$$;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trg_link_profile_on_signup ON auth.users;
CREATE TRIGGER trg_link_profile_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_profile_on_signup();


-- ══════════════════════════════════════════
-- 3. Ensure link_profile_on_login works (both signatures)
-- ══════════════════════════════════════════

DROP FUNCTION IF EXISTS public.link_profile_on_login(text);
DROP FUNCTION IF EXISTS public.link_profile_on_login(uuid, text);

-- Single-param version (preferred)
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

  SELECT * INTO prof FROM user_profiles WHERE id = caller_id;

  IF prof IS NULL THEN
    SELECT * INTO prof FROM user_profiles WHERE lower(email) = lower(user_email);
    IF prof IS NOT NULL AND prof.id != caller_id THEN
      UPDATE user_profiles SET id = caller_id WHERE lower(email) = lower(user_email);
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

-- Two-param version (legacy)
CREATE OR REPLACE FUNCTION public.link_profile_on_login(user_id uuid, user_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.link_profile_on_login(user_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_profile_on_login(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_profile_on_login(uuid, text) TO authenticated;


-- ══════════════════════════════════════════
-- 4. Fix any currently mismatched profiles
-- ══════════════════════════════════════════

UPDATE user_profiles up
SET id = au.id
FROM auth.users au
WHERE lower(up.email) = lower(au.email)
  AND up.id != au.id;
