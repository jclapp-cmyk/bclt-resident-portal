-- C5 fix: Revoke anon access to functions that should only be callable by authenticated users.
-- current_user_role() and current_user_resident_id() rely on auth.uid() and are meaningless for anon.
-- check_email_exists() leaks email existence to unauthenticated callers.

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_resident_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_email_exists(text) FROM anon;
