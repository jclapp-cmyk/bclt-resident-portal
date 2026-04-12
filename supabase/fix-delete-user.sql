-- RPC function to fully delete a user (profile + auth.users entry).
-- Must be run by a database admin / migration runner with superuser privileges.
-- Requires the current_user_role() helper that already exists in the schema.

CREATE OR REPLACE FUNCTION public.delete_user_complete(profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Only admins may delete users
  caller_role := current_user_role();
  IF caller_role IS DISTINCT FROM 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only admins can delete users');
  END IF;

  -- Delete the user_profiles row first (FK-safe order)
  DELETE FROM public.user_profiles WHERE id = profile_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  -- Delete the auth.users row (requires SECURITY DEFINER / superuser)
  DELETE FROM auth.users WHERE id = profile_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Restrict execute to authenticated users (RLS + the admin check inside handle the rest)
REVOKE ALL ON FUNCTION public.delete_user_complete(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_complete(UUID) TO authenticated;
