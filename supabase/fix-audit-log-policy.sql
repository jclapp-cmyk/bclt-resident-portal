-- M7 fix: Tighten audit_log INSERT policy.
-- Currently: WITH CHECK (true) — allows any user to insert arbitrary audit entries.
-- Fix: Only allow inserts where changed_by matches the caller's auth.uid(),
-- so users can only create audit entries attributed to themselves.
-- The trigger (SECURITY DEFINER) still works because it runs as the function owner.

DROP POLICY IF EXISTS "audit_insert" ON audit_log;

-- Restrict direct inserts to own user ID only
CREATE POLICY "audit_insert_own" ON audit_log
  FOR INSERT WITH CHECK (changed_by = auth.uid());
