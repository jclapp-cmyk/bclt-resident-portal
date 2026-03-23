-- ══════════════════════════════════════════════════════
-- RLS POLICIES — Role-Based Access Control
--
-- Roles: admin (full access), maintenance (work orders + inspections),
--        resident (own data only)
--
-- Helper: get current user's role
-- ══════════════════════════════════════════════════════

-- Helper function to get current user's role (cached per transaction)
CREATE OR REPLACE FUNCTION current_user_role() RETURNS TEXT AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to get current user's resident_id
CREATE OR REPLACE FUNCTION current_user_resident_id() RETURNS UUID AS $$
  SELECT resident_id FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ══════════════════════════════════════════════════════
-- PROPERTIES — everyone can read, only admins can write
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all properties" ON properties;

CREATE POLICY "properties_select" ON properties FOR SELECT USING (true);
CREATE POLICY "properties_admin_write" ON properties FOR ALL
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ══════════════════════════════════════════════════════
-- UNITS — everyone can read, only admins can write
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all units" ON units;

CREATE POLICY "units_select" ON units FOR SELECT USING (true);
CREATE POLICY "units_admin_write" ON units FOR ALL
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ══════════════════════════════════════════════════════
-- RESIDENTS — admins see all, residents see only themselves
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all residents" ON residents;

CREATE POLICY "residents_admin_select" ON residents FOR SELECT
  USING (current_user_role() IN ('admin', 'maintenance'));
CREATE POLICY "residents_self_select" ON residents FOR SELECT
  USING (id = current_user_resident_id());
CREATE POLICY "residents_admin_write" ON residents FOR ALL
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ══════════════════════════════════════════════════════
-- LEASES — admins see all, residents see own lease
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all leases" ON leases;

CREATE POLICY "leases_admin_select" ON leases FOR SELECT
  USING (current_user_role() = 'admin');
CREATE POLICY "leases_self_select" ON leases FOR SELECT
  USING (resident_id = current_user_resident_id());
CREATE POLICY "leases_admin_write" ON leases FOR ALL
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ══════════════════════════════════════════════════════
-- LEASE DOCUMENTS — admins see all, residents see own docs
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all lease_documents" ON lease_documents;

CREATE POLICY "lease_docs_admin_select" ON lease_documents FOR SELECT
  USING (current_user_role() = 'admin');
CREATE POLICY "lease_docs_self_select" ON lease_documents FOR SELECT
  USING (resident_id = current_user_resident_id());
CREATE POLICY "lease_docs_admin_write" ON lease_documents FOR ALL
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ══════════════════════════════════════════════════════
-- RENT PAYMENTS — admins see all, residents see own payments
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all rent_payments" ON rent_payments;

CREATE POLICY "rent_payments_admin" ON rent_payments FOR ALL
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');
CREATE POLICY "rent_payments_self_select" ON rent_payments FOR SELECT
  USING (resident_id = current_user_resident_id());

-- ══════════════════════════════════════════════════════
-- MAINTENANCE REQUESTS — admins + staff see all, residents see own
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all maintenance_requests" ON maintenance_requests;

CREATE POLICY "maintenance_admin_staff" ON maintenance_requests FOR ALL
  USING (current_user_role() IN ('admin', 'maintenance'))
  WITH CHECK (current_user_role() IN ('admin', 'maintenance'));
CREATE POLICY "maintenance_self_select" ON maintenance_requests FOR SELECT
  USING (resident_id = current_user_resident_id());
CREATE POLICY "maintenance_resident_insert" ON maintenance_requests FOR INSERT
  WITH CHECK (resident_id = current_user_resident_id());

-- ══════════════════════════════════════════════════════
-- VENDORS — admins + staff can read/write
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all vendors" ON vendors;

CREATE POLICY "vendors_admin_staff" ON vendors FOR ALL
  USING (current_user_role() IN ('admin', 'maintenance'))
  WITH CHECK (current_user_role() IN ('admin', 'maintenance'));

-- ══════════════════════════════════════════════════════
-- UNIT INSPECTIONS — admins + staff can read/write, residents see own unit
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all unit_inspections" ON unit_inspections;

CREATE POLICY "unit_insp_admin_staff" ON unit_inspections FOR ALL
  USING (current_user_role() IN ('admin', 'maintenance'))
  WITH CHECK (current_user_role() IN ('admin', 'maintenance'));
CREATE POLICY "unit_insp_self_select" ON unit_inspections FOR SELECT
  USING (unit_id = (SELECT unit_id FROM residents WHERE id = current_user_resident_id()));

-- ══════════════════════════════════════════════════════
-- REGULATORY INSPECTIONS — admins + staff can read/write
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all reg_inspections" ON reg_inspections;

CREATE POLICY "reg_insp_admin_staff" ON reg_inspections FOR ALL
  USING (current_user_role() IN ('admin', 'maintenance'))
  WITH CHECK (current_user_role() IN ('admin', 'maintenance'));

-- ══════════════════════════════════════════════════════
-- MESSAGE THREADS — admins see all, residents see own + broadcasts
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all message_threads" ON message_threads;

CREATE POLICY "threads_admin" ON message_threads FOR ALL
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');
CREATE POLICY "threads_staff_select" ON message_threads FOR SELECT
  USING (current_user_role() = 'maintenance' AND (type = 'broadcast' OR participants::text LIKE '%maintenance%'));
CREATE POLICY "threads_self_select" ON message_threads FOR SELECT
  USING (
    type = 'broadcast'
    OR participants::jsonb @> to_jsonb((SELECT slug FROM residents WHERE id = current_user_resident_id()))
  );

-- ══════════════════════════════════════════════════════
-- MESSAGES — same as threads (follow thread access)
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all messages" ON messages;

CREATE POLICY "messages_admin" ON messages FOR ALL
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');
CREATE POLICY "messages_select" ON messages FOR SELECT
  USING (
    current_user_role() IN ('maintenance', 'resident')
    AND EXISTS (
      SELECT 1 FROM message_threads t WHERE t.id = thread_id
      AND (t.type = 'broadcast'
        OR t.participants::jsonb @> to_jsonb((SELECT slug FROM residents WHERE id = current_user_resident_id()))
      )
    )
  );
CREATE POLICY "messages_resident_insert" ON messages FOR INSERT
  WITH CHECK (current_user_role() IN ('resident', 'maintenance'));

-- ══════════════════════════════════════════════════════
-- COMM TEMPLATES — admins only
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all comm_templates" ON comm_templates;

CREATE POLICY "templates_admin" ON comm_templates FOR ALL
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ══════════════════════════════════════════════════════
-- COMPLIANCE DOCS — admins only
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all compliance_docs" ON compliance_docs;

CREATE POLICY "compliance_admin" ON compliance_docs FOR ALL
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ══════════════════════════════════════════════════════
-- ONBOARDING WORKFLOWS — admins only
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all onboarding_workflows" ON onboarding_workflows;

CREATE POLICY "onboarding_admin" ON onboarding_workflows FOR ALL
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ══════════════════════════════════════════════════════
-- USER PROFILES — already has RLS from auth-schema.sql
-- Just need to allow anon/pre-auth SELECT by email for login check
-- ══════════════════════════════════════════════════════
CREATE POLICY "profiles_login_check" ON user_profiles FOR SELECT
  USING (true);  -- allow email existence check before auth
