-- ══════════════════════════════════════════════════════
-- RESIDENT HOUSEHOLD SELF-EDIT
-- The original household_members policy only let residents SELECT their
-- own household rows. This adds INSERT / UPDATE / DELETE policies so
-- residents can also add, edit, and remove members of their own
-- household from the resident-side portal (My Profile → Household).
--
-- Run once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════

-- Insert: a resident can add a member whose resident_id matches one
-- of their linked resident records.
DROP POLICY IF EXISTS "resident_own_household_insert" ON household_members;
CREATE POLICY "resident_own_household_insert"
  ON household_members
  FOR INSERT
  WITH CHECK (
    resident_id IN (SELECT resident_id FROM user_profiles WHERE id = auth.uid())
  );

-- Update: a resident can edit any household_member tied to their resident_id.
DROP POLICY IF EXISTS "resident_own_household_update" ON household_members;
CREATE POLICY "resident_own_household_update"
  ON household_members
  FOR UPDATE
  USING (
    resident_id IN (SELECT resident_id FROM user_profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    resident_id IN (SELECT resident_id FROM user_profiles WHERE id = auth.uid())
  );

-- Delete: same scope as update.
DROP POLICY IF EXISTS "resident_own_household_delete" ON household_members;
CREATE POLICY "resident_own_household_delete"
  ON household_members
  FOR DELETE
  USING (
    resident_id IN (SELECT resident_id FROM user_profiles WHERE id = auth.uid())
  );

-- Admin policies (if not already present) — full access for admin role.
DROP POLICY IF EXISTS "admin_full_household" ON household_members;
CREATE POLICY "admin_full_household"
  ON household_members
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Quick verify
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'household_members'
ORDER BY cmd, policyname;
