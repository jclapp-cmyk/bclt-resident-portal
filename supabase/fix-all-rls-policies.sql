-- ══════════════════════════════════════════════════════════════════
-- COMPREHENSIVE RLS POLICY AUDIT AND FIX
--
-- This script:
--   1. Re-enables RLS on user_profiles (reverting auth-fix.sql)
--   2. Drops ALL existing policies on every application table
--   3. Recreates proper role-based policies using current_user_role()
--
-- Run this in the Supabase SQL editor AFTER link-profile-on-login.sql
-- ══════════════════════════════════════════════════════════════════

-- ── Helper functions (idempotent) ──

CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS TEXT AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_user_resident_id() RETURNS UUID AS $$
  SELECT resident_id FROM public.user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;


-- ══════════════════════════════════════════════════════════════════
-- STEP 1: Re-enable RLS on user_profiles (auth-fix.sql disabled it)
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════
-- STEP 2: Drop ALL existing policies on every application table
-- Uses DO blocks to iterate pg_policies so we catch everything
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _table TEXT;
  _tables TEXT[] := ARRAY[
    'user_profiles',
    'properties',
    'units',
    'residents',
    'leases',
    'lease_documents',
    'rent_payments',
    'maintenance_requests',
    'vendors',
    'unit_inspections',
    'reg_inspections',
    'message_threads',
    'messages',
    'comm_templates',
    'compliance_docs',
    'onboarding_workflows',
    'admin_notes',
    'staff_members',
    'household_members',
    'income_certifications',
    'tic_household_members',
    'tic_income_entries',
    'tic_asset_entries',
    'ami_rent_limits'
  ];
  _pol RECORD;
BEGIN
  FOREACH _table IN ARRAY _tables LOOP
    -- Only process tables that actually exist
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = _table) THEN
      FOR _pol IN
        SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = _table
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', _pol.policyname, _table);
      END LOOP;
    END IF;
  END LOOP;
END $$;


-- ══════════════════════════════════════════════════════════════════
-- STEP 3: Recreate proper role-based policies
-- ══════════════════════════════════════════════════════════════════

-- ── USER PROFILES ──
-- Users can read their own profile; admins can read/write all

CREATE POLICY "profiles_self_select" ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_admin_select" ON user_profiles FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "profiles_admin_insert" ON user_profiles FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "profiles_admin_update" ON user_profiles FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "profiles_admin_delete" ON user_profiles FOR DELETE
  USING (public.current_user_role() = 'admin');

-- Allow anon to check email existence (needed for login flow, via check_email_exists RPC)
-- No direct table SELECT for anon -- the RPC uses SECURITY DEFINER


-- ── PROPERTIES ──
-- Everyone authenticated can read; only admins can write

CREATE POLICY "properties_select" ON properties FOR SELECT
  USING (true);

CREATE POLICY "properties_admin_insert" ON properties FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "properties_admin_update" ON properties FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "properties_admin_delete" ON properties FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── UNITS ──
-- Everyone authenticated can read; only admins can write

CREATE POLICY "units_select" ON units FOR SELECT
  USING (true);

CREATE POLICY "units_admin_insert" ON units FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "units_admin_update" ON units FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "units_admin_delete" ON units FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── RESIDENTS ──
-- Admins + maintenance see all; residents see only themselves

CREATE POLICY "residents_admin_maint_select" ON residents FOR SELECT
  USING (public.current_user_role() IN ('admin', 'maintenance'));

CREATE POLICY "residents_self_select" ON residents FOR SELECT
  USING (id = public.current_user_resident_id());

CREATE POLICY "residents_admin_insert" ON residents FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "residents_admin_update" ON residents FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "residents_admin_delete" ON residents FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── LEASES ──
-- Admins see all; residents see own lease

CREATE POLICY "leases_admin_select" ON leases FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "leases_self_select" ON leases FOR SELECT
  USING (resident_id = public.current_user_resident_id());

CREATE POLICY "leases_admin_insert" ON leases FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "leases_admin_update" ON leases FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "leases_admin_delete" ON leases FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── LEASE DOCUMENTS ──
-- Admins see all; residents see own docs

CREATE POLICY "lease_docs_admin_select" ON lease_documents FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "lease_docs_self_select" ON lease_documents FOR SELECT
  USING (resident_id = public.current_user_resident_id());

CREATE POLICY "lease_docs_admin_insert" ON lease_documents FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "lease_docs_admin_update" ON lease_documents FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "lease_docs_admin_delete" ON lease_documents FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── RENT PAYMENTS ──
-- Admins full access; residents see own payments only

CREATE POLICY "rent_payments_admin_select" ON rent_payments FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "rent_payments_admin_insert" ON rent_payments FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "rent_payments_admin_update" ON rent_payments FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "rent_payments_admin_delete" ON rent_payments FOR DELETE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "rent_payments_self_select" ON rent_payments FOR SELECT
  USING (resident_id = public.current_user_resident_id());


-- ── MAINTENANCE REQUESTS ──
-- Admins + maintenance staff full access; residents see own + can submit

CREATE POLICY "maintenance_admin_staff_select" ON maintenance_requests FOR SELECT
  USING (public.current_user_role() IN ('admin', 'maintenance'));

CREATE POLICY "maintenance_admin_staff_insert" ON maintenance_requests FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'maintenance'));

CREATE POLICY "maintenance_admin_staff_update" ON maintenance_requests FOR UPDATE
  USING (public.current_user_role() IN ('admin', 'maintenance'));

CREATE POLICY "maintenance_admin_staff_delete" ON maintenance_requests FOR DELETE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "maintenance_self_select" ON maintenance_requests FOR SELECT
  USING (resident_id = public.current_user_resident_id());

CREATE POLICY "maintenance_resident_insert" ON maintenance_requests FOR INSERT
  WITH CHECK (resident_id = public.current_user_resident_id());


-- ── VENDORS ──
-- Admins + maintenance can read/write

CREATE POLICY "vendors_admin_staff_select" ON vendors FOR SELECT
  USING (public.current_user_role() IN ('admin', 'maintenance'));

CREATE POLICY "vendors_admin_staff_insert" ON vendors FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'maintenance'));

CREATE POLICY "vendors_admin_staff_update" ON vendors FOR UPDATE
  USING (public.current_user_role() IN ('admin', 'maintenance'));

CREATE POLICY "vendors_admin_delete" ON vendors FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── UNIT INSPECTIONS ──
-- Admins + maintenance can read/write; residents see own unit

CREATE POLICY "unit_insp_admin_staff_select" ON unit_inspections FOR SELECT
  USING (public.current_user_role() IN ('admin', 'maintenance'));

CREATE POLICY "unit_insp_admin_staff_insert" ON unit_inspections FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'maintenance'));

CREATE POLICY "unit_insp_admin_staff_update" ON unit_inspections FOR UPDATE
  USING (public.current_user_role() IN ('admin', 'maintenance'));

CREATE POLICY "unit_insp_admin_delete" ON unit_inspections FOR DELETE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "unit_insp_self_select" ON unit_inspections FOR SELECT
  USING (unit_id = (SELECT unit_id FROM residents WHERE id = public.current_user_resident_id()));


-- ── REGULATORY INSPECTIONS ──
-- Admins + maintenance can read/write

CREATE POLICY "reg_insp_admin_staff_select" ON reg_inspections FOR SELECT
  USING (public.current_user_role() IN ('admin', 'maintenance'));

CREATE POLICY "reg_insp_admin_staff_insert" ON reg_inspections FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'maintenance'));

CREATE POLICY "reg_insp_admin_staff_update" ON reg_inspections FOR UPDATE
  USING (public.current_user_role() IN ('admin', 'maintenance'));

CREATE POLICY "reg_insp_admin_delete" ON reg_inspections FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── MESSAGE THREADS ──
-- Admins full access; maintenance sees broadcasts + relevant threads; residents see own + broadcasts

CREATE POLICY "threads_admin_select" ON message_threads FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "threads_admin_insert" ON message_threads FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "threads_admin_update" ON message_threads FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "threads_admin_delete" ON message_threads FOR DELETE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "threads_staff_select" ON message_threads FOR SELECT
  USING (
    public.current_user_role() = 'maintenance'
    AND (type = 'broadcast' OR participants::text LIKE '%maintenance%')
  );

CREATE POLICY "threads_resident_select" ON message_threads FOR SELECT
  USING (
    public.current_user_role() = 'resident'
    AND (
      type = 'broadcast'
      OR participants::jsonb @> to_jsonb((SELECT slug FROM residents WHERE id = public.current_user_resident_id()))
    )
  );


-- ── MESSAGES ──
-- Admins full access; others can see messages in threads they can access; residents + maintenance can insert

CREATE POLICY "messages_admin_select" ON messages FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "messages_admin_insert" ON messages FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "messages_admin_update" ON messages FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "messages_admin_delete" ON messages FOR DELETE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "messages_thread_select" ON messages FOR SELECT
  USING (
    public.current_user_role() IN ('maintenance', 'resident')
    AND EXISTS (
      SELECT 1 FROM message_threads t WHERE t.id = thread_id
      AND (
        t.type = 'broadcast'
        OR t.participants::jsonb @> to_jsonb((SELECT slug FROM residents WHERE id = public.current_user_resident_id()))
      )
    )
  );

CREATE POLICY "messages_resident_maint_insert" ON messages FOR INSERT
  WITH CHECK (public.current_user_role() IN ('resident', 'maintenance'));


-- ── COMM TEMPLATES ──
-- Admins only

CREATE POLICY "templates_admin_select" ON comm_templates FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "templates_admin_insert" ON comm_templates FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "templates_admin_update" ON comm_templates FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "templates_admin_delete" ON comm_templates FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── COMPLIANCE DOCS ──
-- Admins only

CREATE POLICY "compliance_admin_select" ON compliance_docs FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "compliance_admin_insert" ON compliance_docs FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "compliance_admin_update" ON compliance_docs FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "compliance_admin_delete" ON compliance_docs FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── ONBOARDING WORKFLOWS ──
-- Admins only

CREATE POLICY "onboarding_admin_select" ON onboarding_workflows FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "onboarding_admin_insert" ON onboarding_workflows FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "onboarding_admin_update" ON onboarding_workflows FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "onboarding_admin_delete" ON onboarding_workflows FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── ADMIN NOTES ──
-- Admins only

CREATE POLICY "admin_notes_admin_select" ON admin_notes FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "admin_notes_admin_insert" ON admin_notes FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "admin_notes_admin_update" ON admin_notes FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "admin_notes_admin_delete" ON admin_notes FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── STAFF MEMBERS ──
-- Admins full access; everyone authenticated can read (for display purposes)

CREATE POLICY "staff_admin_select" ON staff_members FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "staff_authenticated_select" ON staff_members FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "staff_admin_insert" ON staff_members FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "staff_admin_update" ON staff_members FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "staff_admin_delete" ON staff_members FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── HOUSEHOLD MEMBERS ──
-- Admins full access; residents see own household

CREATE POLICY "household_admin_select" ON household_members FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "household_admin_insert" ON household_members FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "household_admin_update" ON household_members FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "household_admin_delete" ON household_members FOR DELETE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "household_self_select" ON household_members FOR SELECT
  USING (resident_id = public.current_user_resident_id());


-- ── INCOME CERTIFICATIONS ──
-- Admins full access; residents can view own certs

CREATE POLICY "income_certs_admin_select" ON income_certifications FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "income_certs_admin_insert" ON income_certifications FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "income_certs_admin_update" ON income_certifications FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "income_certs_admin_delete" ON income_certifications FOR DELETE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "income_certs_self_select" ON income_certifications FOR SELECT
  USING (resident_id = public.current_user_resident_id());


-- ── TIC HOUSEHOLD MEMBERS ──
-- Admins full access (these are snapshots within certifications)

CREATE POLICY "tic_members_admin_select" ON tic_household_members FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "tic_members_admin_insert" ON tic_household_members FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "tic_members_admin_update" ON tic_household_members FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "tic_members_admin_delete" ON tic_household_members FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── TIC INCOME ENTRIES ──
-- Admins full access

CREATE POLICY "tic_income_admin_select" ON tic_income_entries FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "tic_income_admin_insert" ON tic_income_entries FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "tic_income_admin_update" ON tic_income_entries FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "tic_income_admin_delete" ON tic_income_entries FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── TIC ASSET ENTRIES ──
-- Admins full access

CREATE POLICY "tic_assets_admin_select" ON tic_asset_entries FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "tic_assets_admin_insert" ON tic_asset_entries FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "tic_assets_admin_update" ON tic_asset_entries FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "tic_assets_admin_delete" ON tic_asset_entries FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ── AMI RENT LIMITS ──
-- Public reference data, read-only for everyone; admins can write

CREATE POLICY "ami_limits_select" ON ami_rent_limits FOR SELECT
  USING (true);

CREATE POLICY "ami_limits_admin_insert" ON ami_rent_limits FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "ami_limits_admin_update" ON ami_rent_limits FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "ami_limits_admin_delete" ON ami_rent_limits FOR DELETE
  USING (public.current_user_role() = 'admin');


-- ══════════════════════════════════════════════════════════════════
-- VERIFICATION: List all policies to confirm
-- ══════════════════════════════════════════════════════════════════
-- SELECT tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
